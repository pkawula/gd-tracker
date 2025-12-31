/**
 * Edge Function: schedule-weekly-reminders
 * 
 * Purpose: Analyze users' glucose reading patterns from the last 14 days
 * and schedule personalized reminder notifications for the upcoming week.
 * 
 * Runs: Once per week (Sunday 02:00 Europe/Warsaw)
 * Triggered by: pg_cron job via HTTP POST
 */

import { createServiceClient, validateCronSecret } from '../_shared/db.ts';

interface ReadingPattern {
  user_id: string;
  measurement_type: 'fasting' | '1hr_after_meal';
  day_of_week: number; // 0=Sunday, 6=Saturday
  minutes_of_day: number[]; // Local time minutes since midnight
}

interface ScheduleEntry {
  user_id: string;
  measurement_type: 'fasting' | '1hr_after_meal';
  scheduled_at: string; // UTC ISO timestamp
}

/**
 * Convert UTC timestamp to Europe/Warsaw local time
 */
function toWarsawTime(utcDate: Date): Date {
  return new Date(utcDate.toLocaleString('en-US', { timeZone: 'Europe/Warsaw' }));
}

/**
 * Convert Europe/Warsaw local time to UTC
 */
function toUTC(warsawDate: Date): Date {
  const localStr = warsawDate.toLocaleString('en-US', { timeZone: 'Europe/Warsaw' });
  const utcStr = new Date(localStr).toISOString();
  return new Date(utcStr);
}

/**
 * Get Monday of next week (for scheduling target week)
 */
function getNextMondayUTC(): Date {
  const now = new Date();
  const warsaw = toWarsawTime(now);
  const dayOfWeek = warsaw.getDay();
  const daysUntilNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  
  const nextMonday = new Date(warsaw);
  nextMonday.setDate(warsaw.getDate() + daysUntilNextMonday);
  nextMonday.setHours(0, 0, 0, 0);
  
  return toUTC(nextMonday);
}

/**
 * Calculate median of an array of numbers
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Cluster readings into 15-minute bins and find top bins
 */
function clusterReadings(minutesOfDay: number[], binSizeMinutes = 15): number[] {
  if (minutesOfDay.length === 0) return [];
  
  // Create bins
  const bins = new Map<number, number>();
  for (const minute of minutesOfDay) {
    const binKey = Math.floor(minute / binSizeMinutes) * binSizeMinutes;
    bins.set(binKey, (bins.get(binKey) || 0) + 1);
  }
  
  // Sort bins by frequency (descending)
  const sortedBins = Array.from(bins.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([binKey]) => binKey);
  
  return sortedBins;
}

/**
 * Compute scheduled times for a user's measurement type + day-of-week
 */
function computeScheduleTimes(
  patterns: ReadingPattern[],
  nextMondayUTC: Date
): ScheduleEntry[] {
  const schedules: ScheduleEntry[] = [];
  
  // Group by user, type, and day-of-week
  const grouped = new Map<string, ReadingPattern[]>();
  
  for (const pattern of patterns) {
    const key = `${pattern.user_id}|${pattern.measurement_type}|${pattern.day_of_week}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(pattern);
  }
  
  // For each group, compute reminder times
  for (const [key, groupPatterns] of grouped.entries()) {
    const [userId, measurementType, dowStr] = key.split('|');
    const dayOfWeek = parseInt(dowStr);
    
    // Collect all minutes
    const allMinutes: number[] = [];
    for (const p of groupPatterns) {
      allMinutes.push(...p.minutes_of_day);
    }
    
    if (allMinutes.length === 0) continue;
    
    // Find top bins
    const topBins = clusterReadings(allMinutes, 15);
    
    // Determine number of reminders (use average count per day)
    const avgPerDay = Math.round(allMinutes.length / 2); // 2 weeks of data
    const remindersCount = Math.min(Math.max(1, avgPerDay), topBins.length);
    
    // Create schedules for top bins
    for (let i = 0; i < remindersCount; i++) {
      const binStart = topBins[i];
      
      // Find readings in this bin
      const binEnd = binStart + 15;
      const binReadings = allMinutes.filter(m => m >= binStart && m < binEnd);
      
      // Compute median + 5 minutes
      const targetMinute = Math.round(median(binReadings)) + 5;
      
      // Create timestamp for next week's day
      const targetDate = new Date(nextMondayUTC);
      const daysToAdd = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust for Monday=0 base
      targetDate.setDate(targetDate.getDate() + daysToAdd);
      
      // Set time in Warsaw timezone
      const warsawDate = toWarsawTime(targetDate);
      warsawDate.setHours(Math.floor(targetMinute / 60), targetMinute % 60, 0, 0);
      
      // Convert back to UTC
      const utcTimestamp = toUTC(warsawDate);
      
      schedules.push({
        user_id: userId,
        measurement_type: measurementType as 'fasting' | '1hr_after_meal',
        scheduled_at: utcTimestamp.toISOString(),
      });
    }
  }
  
  return schedules;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST' },
    });
  }
  
  try {
    // Validate authorization
    if (!validateCronSecret(req)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const supabase = createServiceClient();
    const nextMonday = getNextMondayUTC();
    const nextMondayStr = nextMonday.toISOString().split('T')[0];
    
    // Check if this week was already processed
    const { data: existingRun } = await supabase
      .from('notification_schedule_runs')
      .select('id')
      .eq('run_week_start_date', nextMondayStr)
      .single();
    
    if (existingRun) {
      return new Response(JSON.stringify({
        message: 'Week already scheduled',
        week: nextMondayStr,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Create run record
    const { data: runRecord, error: runError } = await supabase
      .from('notification_schedule_runs')
      .insert({
        run_week_start_date: nextMondayStr,
        status: 'running',
      })
      .select('id')
      .single();
    
    if (runError) throw runError;
    
    try {
      // Fetch eligible users (notifications enabled, has at least 7 days of activity)
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      
      const { data: eligibleUsers, error: usersError } = await supabase
        .from('user_settings')
        .select('user_id')
        .eq('push_notifications_enabled', true);
      
      if (usersError) throw usersError;
      
      if (!eligibleUsers || eligibleUsers.length === 0) {
        await supabase
          .from('notification_schedule_runs')
          .update({
            status: 'completed',
            finished_at: new Date().toISOString(),
            users_processed: 0,
            schedules_created: 0,
          })
          .eq('id', runRecord.id);
        
        return new Response(JSON.stringify({
          message: 'No eligible users',
          users_processed: 0,
          schedules_created: 0,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      const patterns: ReadingPattern[] = [];
      let processedUsers = 0;
      
      // Fetch readings for each user and analyze patterns
      for (const user of eligibleUsers) {
        const { data: readings, error: readingsError } = await supabase
          .from('glucose_readings')
          .select('measured_at, measurement_type')
          .eq('user_id', user.user_id)
          .gte('measured_at', twoWeeksAgo.toISOString())
          .order('measured_at', { ascending: true });
        
        if (readingsError || !readings || readings.length === 0) continue;
        
        // Check eligibility: at least 7 days span
        const firstReading = new Date(readings[0].measured_at);
        const lastReading = new Date(readings[readings.length - 1].measured_at);
        const daySpan = (lastReading.getTime() - firstReading.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daySpan < 7) continue;
        
        processedUsers++;
        
        // Extract patterns
        for (const reading of readings) {
          const utcDate = new Date(reading.measured_at);
          const warsawDate = toWarsawTime(utcDate);
          
          const dayOfWeek = warsawDate.getDay();
          const minuteOfDay = warsawDate.getHours() * 60 + warsawDate.getMinutes();
          
          patterns.push({
            user_id: user.user_id,
            measurement_type: reading.measurement_type as 'fasting' | '1hr_after_meal',
            day_of_week: dayOfWeek,
            minutes_of_day: [minuteOfDay],
          });
        }
      }
      
      // Compute schedules
      const schedules = computeScheduleTimes(patterns, nextMonday);
      
      // Delete existing schedules for next week (idempotency)
      const weekEnd = new Date(nextMonday);
      weekEnd.setDate(weekEnd.getDate() + 7);
      
      await supabase
        .from('notification_schedules')
        .delete()
        .gte('scheduled_at', nextMonday.toISOString())
        .lt('scheduled_at', weekEnd.toISOString());
      
      // Insert new schedules (batch insert)
      if (schedules.length > 0) {
        const { error: insertError } = await supabase
          .from('notification_schedules')
          .insert(schedules);
        
        if (insertError) throw insertError;
      }
      
      // Update run record
      await supabase
        .from('notification_schedule_runs')
        .update({
          status: 'completed',
          finished_at: new Date().toISOString(),
          users_processed: processedUsers,
          schedules_created: schedules.length,
        })
        .eq('id', runRecord.id);
      
      return new Response(JSON.stringify({
        message: 'Successfully scheduled reminders',
        week: nextMondayStr,
        users_processed: processedUsers,
        schedules_created: schedules.length,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      
    } catch (error) {
      // Mark run as failed
      await supabase
        .from('notification_schedule_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', runRecord.id);
      
      throw error;
    }
    
  } catch (error) {
    console.error('Scheduler error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

