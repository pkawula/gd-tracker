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
import { toZonedTime, fromZonedTime } from 'npm:date-fns-tz@3.1.3';

const TIMEZONE = 'Europe/Warsaw';
/**
 * Get Monday of next week (for scheduling target week)
 * Returns UTC timestamp for Monday 00:00:00 in Warsaw timezone
 * @param fromDate Optional date to calculate from (for manual runs)
 */
function getNextMondayUTC(fromDate) {
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
/**
 * Calculate median of an array of numbers
 */ function median(values) {
  if (values.length === 0) return 0;
  const sorted = [
    ...values
  ].sort((a, b)=>a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}
/**
 * Cluster readings into 15-minute bins and find top bins
 */ function clusterReadings(minutesOfDay, binSizeMinutes = 15) {
  if (minutesOfDay.length === 0) return [];
  // Create bins
  const bins = new Map();
  for (const minute of minutesOfDay){
    const binKey = Math.floor(minute / binSizeMinutes) * binSizeMinutes;
    bins.set(binKey, (bins.get(binKey) || 0) + 1);
  }
  // Sort bins by frequency (descending)
  const sortedBins = Array.from(bins.entries()).sort((a, b)=>b[1] - a[1]).map(([binKey])=>binKey);
  return sortedBins;
}
/**
 * Compute scheduled times for a user's measurement type + day-of-week
 */
function computeScheduleTimes(patterns, nextMondayUTC) {
  const schedules = [];
  
  // Group by user, type, and day-of-week
  const grouped = new Map();
  for (const pattern of patterns) {
    const key = `${pattern.user_id}|${pattern.measurement_type}|${pattern.day_of_week}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(pattern);
  }
  
  // For each group, compute reminder times
  for (const [key, groupPatterns] of grouped.entries()) {
    const [userId, measurementType, dowStr] = key.split('|');
    const dayOfWeek = parseInt(dowStr);
    
    // Collect all minutes and track unique dates
    const allMinutes = [];
    const uniqueDates = new Set();
    for (const p of groupPatterns) {
      allMinutes.push(...p.minutes_of_day);
      if (p.date) {
        uniqueDates.add(p.date);
      }
    }
    
    if (allMinutes.length === 0) continue;
    
    // Find top bins
    const topBins = clusterReadings(allMinutes, 15);
    
    // Calculate average readings per day (based on actual day occurrences)
    const numDaysWithReadings = uniqueDates.size > 0 ? uniqueDates.size : Math.max(1, Math.ceil(allMinutes.length / 6));
    const avgPerDay = Math.round(allMinutes.length / numDaysWithReadings);
    
    // Cap reminders: max 6 per day, min 1
    const remindersCount = Math.min(Math.max(1, avgPerDay), 6, topBins.length);
    
    // Create schedules for top bins
    for (let i = 0; i < remindersCount; i++) {
      const binStart = topBins[i];
      
      // Find readings in this bin
      const binEnd = binStart + 15;
      const binReadings = allMinutes.filter((m) => m >= binStart && m < binEnd);
      
      // Compute median + 5 minutes
      const targetMinute = Math.round(median(binReadings)) + 5;
      
      // Create timestamp for next week's day in Warsaw timezone
      // Start with next Monday in Warsaw time
      const warsawMonday = toZonedTime(nextMondayUTC, TIMEZONE);
      const daysToAdd = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust for Monday=0 base
      
      // Create the target date in Warsaw timezone
      const warsawTargetDate = new Date(warsawMonday);
      warsawTargetDate.setDate(warsawMonday.getDate() + daysToAdd);
      warsawTargetDate.setHours(Math.floor(targetMinute / 60), targetMinute % 60, 0, 0);
      
      // Convert Warsaw local time to UTC
      const utcTimestamp = fromZonedTime(warsawTargetDate, TIMEZONE);
      
      schedules.push({
        user_id: userId,
        measurement_type: measurementType,
        scheduled_at: utcTimestamp.toISOString()
      });
    }
  }
  
  return schedules;
}
Deno.serve(async (req)=>{
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST'
      }
    });
  }
  try {
    // Validate authorization
    if (!validateCronSecret(req)) {
      return new Response(JSON.stringify({
        error: 'Unauthorized'
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Check for week parameter (current or next)
    const url = new URL(req.url);
    const weekParam = url.searchParams.get('week') || 'next'; // 'current' or 'next'
    
    const supabase = createServiceClient();
    const targetMonday = weekParam === 'current' ? getCurrentMondayUTC() : getNextMondayUTC();
    const targetMondayStr = targetMonday.toISOString().split('T')[0];
    
    // Check if this week was already processed
    const { data: existingRun } = await supabase.from('notification_schedule_runs').select('id').eq('run_week_start_date', targetMondayStr).single();
    if (existingRun) {
      return new Response(JSON.stringify({
        message: 'Week already scheduled',
        week: targetMondayStr,
        hint: weekParam === 'next' ? 'Use ?week=current to schedule current week' : 'Delete the run record to re-schedule'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    // Create run record
    const { data: runRecord, error: runError } = await supabase.from('notification_schedule_runs').insert({
      run_week_start_date: targetMondayStr,
      status: 'running'
    }).select('id').single();
    if (runError) throw runError;
    try {
      // Fetch eligible users (notifications enabled, has at least 7 days of activity)
      const { data: eligibleUsers, error: usersError } = await supabase.from('user_settings').select('user_id').eq('push_notifications_enabled', true);
      if (usersError) throw usersError;
      if (!eligibleUsers || eligibleUsers.length === 0) {
        await supabase.from('notification_schedule_runs').update({
          status: 'completed',
          finished_at: new Date().toISOString(),
          users_processed: 0,
          schedules_created: 0
        }).eq('id', runRecord.id);
        return new Response(JSON.stringify({
          message: 'No eligible users',
          users_processed: 0,
          schedules_created: 0
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }
      const patterns = [];
      let processedUsers = 0;
      // Fetch readings for each user and analyze patterns
      for (const user of eligibleUsers){
        // Check if user has been scheduled before (first-time vs returning)
        const { data: previousSchedules } = await supabase
          .from('notification_schedules')
          .select('id')
          .eq('user_id', user.user_id)
          .limit(1);
        
        const isFirstTime = !previousSchedules || previousSchedules.length === 0;
        
        // First-time users: 60-day lookback for accuracy
        // Returning users: 7-day lookback for recent pattern adaptation
        const lookbackDays = isFirstTime ? 60 : 7;
        const lookbackDate = new Date();
        lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);
        
        const { data: readings, error: readingsError } = await supabase.from('glucose_readings').select('measured_at, measurement_type').eq('user_id', user.user_id).gte('measured_at', lookbackDate.toISOString()).order('measured_at', {
          ascending: true
        });
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
          // Convert UTC to Warsaw time to extract local time components
          const warsawDate = toZonedTime(utcDate, TIMEZONE);
          const dayOfWeek = warsawDate.getDay();
          const minuteOfDay = warsawDate.getHours() * 60 + warsawDate.getMinutes();
          const dateStr = warsawDate.toISOString().split('T')[0]; // YYYY-MM-DD
          
          patterns.push({
            user_id: user.user_id,
            measurement_type: reading.measurement_type,
            day_of_week: dayOfWeek,
            date: dateStr, // Track the actual date
            minutes_of_day: [minuteOfDay]
          });
        }
      }
      // Compute schedules
      const schedules = computeScheduleTimes(patterns, targetMonday);
      // Delete existing schedules for target week (idempotency)
      const weekEnd = new Date(targetMonday);
      weekEnd.setDate(weekEnd.getDate() + 7);
      await supabase.from('notification_schedules').delete().gte('scheduled_at', targetMonday.toISOString()).lt('scheduled_at', weekEnd.toISOString());
      // Insert new schedules (batch insert)
      if (schedules.length > 0) {
        const { error: insertError } = await supabase.from('notification_schedules').insert(schedules);
        if (insertError) throw insertError;
      }
      // Update run record
      await supabase.from('notification_schedule_runs').update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        users_processed: processedUsers,
        schedules_created: schedules.length
      }).eq('id', runRecord.id);
      return new Response(JSON.stringify({
        message: 'Successfully scheduled reminders',
        week: targetMondayStr,
        users_processed: processedUsers,
        schedules_created: schedules.length
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      // Mark run as failed
      await supabase.from('notification_schedule_runs').update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }).eq('id', runRecord.id);
      throw error;
    }
  } catch (error) {
    console.error('Scheduler error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
});
