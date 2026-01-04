/**
 * Edge Function: schedule-weekly-reminders
 *
 * Purpose: Analyze users' glucose reading patterns and schedule personalized
 * reminder notifications for the upcoming week using an Adaptive Coverage-First algorithm.
 *
 * Runs: Once per week (Sunday 02:00 Europe/Warsaw)
 * Triggered by: pg_cron job via HTTP POST
 */
import { createServiceClient, validateCronSecret } from "../_shared/db.ts";
import { fromZonedTime, toZonedTime } from "npm:date-fns-tz@3.1.3";
import { MealWindow } from "./filtering.ts";
import {
  determineLookbackStrategy,
  fetchReadingsWithContext,
} from "./adaptive-lookback.ts";
import {
  enforceSpacingByConfidence,
  generateScheduleForWindow,
  ScheduleCandidate,
} from "./schedule-generator.ts";

const TIMEZONE = "Europe/Warsaw";

/**
 * Get Monday of next week (for scheduling target week)
 * Returns UTC timestamp for Monday 00:00:00 in Warsaw timezone
 * @param fromDate Optional date to calculate from (for manual runs)
 */
function getNextMondayUTC(fromDate?: Date) {
  const now = fromDate || new Date();
  // Convert UTC to Warsaw time to determine day of week
  const warsaw = toZonedTime(now, TIMEZONE);
  const dayOfWeek = warsaw.getDay();
  const daysUntilNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;

  // Calculate next Monday in Warsaw timezone
  const nextMonday = new Date(warsaw);
  nextMonday.setDate(warsaw.getDate() + daysUntilNextMonday);
  nextMonday.setHours(0, 0, 0, 0);

  // Convert Warsaw local time back to UTC
  return fromZonedTime(nextMonday, TIMEZONE);
}

/**
 * Get the Monday of the current week (for mid-week manual runs)
 * Returns UTC timestamp for Monday 00:00:00 in Warsaw timezone
 */
function getCurrentMondayUTC() {
  const now = new Date();
  // Convert UTC to Warsaw time to determine day of week
  const warsaw = toZonedTime(now, TIMEZONE);
  const dayOfWeek = warsaw.getDay();
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 6 days back, Monday = 0, etc.

  // Calculate current Monday in Warsaw timezone
  const currentMonday = new Date(warsaw);
  currentMonday.setDate(warsaw.getDate() - daysToSubtract);
  currentMonday.setHours(0, 0, 0, 0);

  // Convert Warsaw local time back to UTC
  return fromZonedTime(currentMonday, TIMEZONE);
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
      },
    });
  }

  try {
    // Validate authorization
    if (!validateCronSecret(req)) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Check for week parameter (current or next)
    const url = new URL(req.url);
    const weekParam = url.searchParams.get("week") || "next"; // 'current' or 'next'

    const supabase = createServiceClient();
    const targetMonday = weekParam === "current"
      ? getCurrentMondayUTC()
      : getNextMondayUTC();
    const targetMondayStr = targetMonday.toISOString().split("T")[0];

    // Check if this week was already processed
    const { data: existingRun } = await supabase
      .from("notification_schedule_runs")
      .select("id")
      .eq("run_week_start_date", targetMondayStr)
      .single();

    if (existingRun) {
      return new Response(
        JSON.stringify({
          message: "Week already scheduled",
          week: targetMondayStr,
          hint: weekParam === "next"
            ? "Use ?week=current to schedule current week"
            : "Delete the run record to re-schedule",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Create run record
    const { data: runRecord, error: runError } = await supabase
      .from("notification_schedule_runs")
      .insert({
        run_week_start_date: targetMondayStr,
        status: "running",
      })
      .select("id")
      .single();

    if (runError) throw runError;

    try {
      // Fetch eligible users (notifications enabled)
      // Note: We no longer strictly enforce 7 days of activity here, because the algorithm handles bootstrap mode.
      // However, we still only want users who have opted in.
      const { data: eligibleUsers, error: usersError } = await supabase
        .from("user_settings")
        .select("user_id")
        .eq("push_notifications_enabled", true);

      if (usersError) throw usersError;

      if (!eligibleUsers || eligibleUsers.length === 0) {
        await supabase.from("notification_schedule_runs").update({
          status: "completed",
          finished_at: new Date().toISOString(),
          users_processed: 0,
          schedules_created: 0,
        }).eq("id", runRecord.id);

        return new Response(
          JSON.stringify({
            message: "No eligible users",
            users_processed: 0,
            schedules_created: 0,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      let processedUsers = 0;
      let totalSchedulesCreated = 0;

      const weekEnd = new Date(targetMonday);
      weekEnd.setDate(weekEnd.getDate() + 7);

      // Iterate users
      for (const user of eligibleUsers) {
        // Fetch meal windows
        const { data: userWindows } = await supabase
          .from("user_meal_windows")
          .select("*")
          .eq("user_id", user.user_id);

        // If no windows defined, skip user (cannot schedule without windows)
        if (!userWindows || userWindows.length === 0) continue;

        processedUsers++;

        // 1. Determine local strategy
        const strategy = await determineLookbackStrategy(
          supabase,
          user.user_id,
          targetMonday,
        );

        // 2. Fetch weighted readings
        const readings = await fetchReadingsWithContext(
          supabase,
          user.user_id,
          strategy,
          targetMonday,
        );

        // 3. Generate per-window schedules
        const candidates: ScheduleCandidate[] = [];
        for (const window of (userWindows as MealWindow[])) {
          const candidate = await generateScheduleForWindow(
            supabase,
            window,
            readings,
            strategy,
            targetMonday,
          );
          candidates.push(candidate);
        }

        // 4. Resolve conflicts
        const finalSchedules = enforceSpacingByConfidence(candidates, 90);

        // 5. Commit to DB
        // Delete existing for this user in this week first
        await supabase.from("notification_schedules")
          .delete()
          .eq("user_id", user.user_id)
          .gte("scheduled_at", targetMonday.toISOString())
          .lt("scheduled_at", weekEnd.toISOString());

        if (finalSchedules.length > 0) {
          const dbPayload = finalSchedules.map((s) => ({
            user_id: s.user_id,
            measurement_type: s.measurement_type,
            scheduled_at: s.scheduled_at,
            meal_window_id: s.meal_window_id,
            confidence: s.confidence,
            source: s.source,
            readings_count: s.readings_count,
          }));

          const { error: insertError } = await supabase
            .from("notification_schedules")
            .insert(dbPayload);

          if (insertError) {
            console.error(
              `Error inserting schedules for user ${user.user_id}:`,
              insertError,
            );
            // Continue to next user
          } else {
            totalSchedulesCreated += finalSchedules.length;
          }
        }
      }

      // Update run record
      await supabase.from("notification_schedule_runs").update({
        status: "completed",
        finished_at: new Date().toISOString(),
        users_processed: processedUsers,
        schedules_created: totalSchedulesCreated,
      }).eq("id", runRecord.id);

      return new Response(
        JSON.stringify({
          message: "Successfully scheduled reminders",
          week: targetMondayStr,
          users_processed: processedUsers,
          schedules_created: totalSchedulesCreated,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error) {
      // Mark run as failed
      await supabase.from("notification_schedule_runs").update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      }).eq("id", runRecord.id);
      throw error;
    }
  } catch (error) {
    console.error("Scheduler error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
});
