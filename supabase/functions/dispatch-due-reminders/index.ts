/**
 * Edge Function: dispatch-due-reminders
 * 
 * Purpose: Fetch due notification schedules, check if user already recorded
 * a measurement, and send OneSignal push notifications accordingly.
 * 
 * Runs: Every 5 minutes via pg_cron
 * Triggered by: pg_cron job via HTTP POST
 */

import { createServiceClient, validateCronSecret } from '../_shared/db.ts';
import { sendPushNotification, getNotificationMessages } from '../_shared/onesignal.ts';

interface DueSchedule {
  id: string;
  user_id: string;
  measurement_type: 'fasting' | '1hr_after_meal';
  scheduled_at: string;
  language: 'en' | 'pl';
}

interface DispatchResult {
  schedule_id: string;
  status: 'sent' | 'cancelled' | 'failed';
  reason: string;
  onesignal_notification_id?: string;
}

/**
 * Check if user already recorded a measurement within the skip window
 * Skip window: [scheduled_at - 45m, scheduled_at + 90m], clipped to <= now
 */
async function hasExistingReading(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  measurementType: string,
  scheduledAt: Date
): Promise<boolean> {
  const windowStart = new Date(scheduledAt);
  windowStart.setMinutes(windowStart.getMinutes() - 45);
  
  const windowEnd = new Date(scheduledAt);
  windowEnd.setMinutes(windowEnd.getMinutes() + 90);
  
  // Clip to now
  const now = new Date();
  if (windowEnd > now) {
    windowEnd.setTime(now.getTime());
  }
  
  const { data, error } = await supabase
    .from('glucose_readings')
    .select('id')
    .eq('user_id', userId)
    .eq('measurement_type', measurementType)
    .gte('measured_at', windowStart.toISOString())
    .lte('measured_at', windowEnd.toISOString())
    .limit(1);
  
  if (error) {
    console.error('Error checking existing reading:', error);
    return false;
  }
  
  return data && data.length > 0;
}

/**
 * Process a single due schedule
 */
async function processSchedule(
  supabase: ReturnType<typeof createServiceClient>,
  schedule: DueSchedule,
  oneSignalConfig: { appId: string; restApiKey: string }
): Promise<DispatchResult> {
  const scheduledAt = new Date(schedule.scheduled_at);
  
  // Check if user already recorded measurement
  const hasReading = await hasExistingReading(
    supabase,
    schedule.user_id,
    schedule.measurement_type,
    scheduledAt
  );
  
  if (hasReading) {
    return {
      schedule_id: schedule.id,
      status: 'cancelled',
      reason: 'skipped_reading_exists',
    };
  }
  
  // Send OneSignal notification
  try {
    const messages = getNotificationMessages(
      schedule.measurement_type,
      schedule.language
    );
    
    const notificationId = await sendPushNotification(oneSignalConfig, {
      externalUserId: schedule.user_id,
      headings: messages.headings,
      contents: messages.contents,
      data: {
        measurement_type: schedule.measurement_type,
        scheduled_at: schedule.scheduled_at,
      },
    });
    
    return {
      schedule_id: schedule.id,
      status: 'sent',
      reason: 'sent_onesignal_ok',
      onesignal_notification_id: notificationId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to send notification for schedule ${schedule.id}:`, errorMessage);
    
    return {
      schedule_id: schedule.id,
      status: 'failed',
      reason: `onesignal_error: ${errorMessage}`,
    };
  }
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
    
    // Get OneSignal config
    const oneSignalAppId = Deno.env.get('ONESIGNAL_APP_ID');
    const oneSignalRestApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
    
    if (!oneSignalAppId || !oneSignalRestApiKey) {
      throw new Error('OneSignal configuration missing');
    }
    
    const oneSignalConfig = {
      appId: oneSignalAppId,
      restApiKey: oneSignalRestApiKey,
    };
    
    const supabase = createServiceClient();
    
    // Fetch due schedules
    // Grace window: process schedules due now or up to 15 minutes ago (to handle delays)
    const now = new Date();
    const graceStart = new Date(now);
    graceStart.setMinutes(graceStart.getMinutes() - 15);
    
    const { data: dueSchedules, error: fetchError } = await supabase
      .from('notification_schedules')
      .select('id, user_id, measurement_type, scheduled_at')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now.toISOString())
      .gte('scheduled_at', graceStart.toISOString())
      .limit(500); // Process max 500 per run to avoid timeouts
    
    if (fetchError) throw fetchError;
    
    if (!dueSchedules || dueSchedules.length === 0) {
      return new Response(JSON.stringify({
        message: 'No due schedules',
        processed: 0,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Fetch user settings for all unique user_ids
    const uniqueUserIds = [...new Set(dueSchedules.map(s => s.user_id))];
    const { data: userSettings, error: settingsError } = await supabase
      .from('user_settings')
      .select('user_id, language')
      .in('user_id', uniqueUserIds);
    
    if (settingsError) throw settingsError;
    
    // Create a map for quick language lookup
    const languageMap = new Map<string, 'en' | 'pl'>();
    if (userSettings) {
      for (const setting of userSettings) {
        languageMap.set(setting.user_id, setting.language || 'en');
      }
    }
    
    // Transform data structure with language from map
    const schedules: DueSchedule[] = dueSchedules.map((s) => ({
      id: s.id,
      user_id: s.user_id,
      measurement_type: s.measurement_type,
      scheduled_at: s.scheduled_at,
      language: languageMap.get(s.user_id) || 'en',
    }));
    
    // Process each schedule
    const results: DispatchResult[] = [];
    
    for (const schedule of schedules) {
      const result = await processSchedule(supabase, schedule, oneSignalConfig);
      results.push(result);
      
      // Update schedule status
      await supabase
        .from('notification_schedules')
        .update({
          status: result.status,
          decision_reason: result.reason,
          onesignal_notification_id: result.onesignal_notification_id || null,
        })
        .eq('id', result.schedule_id);
    }
    
    // Summarize results
    const summary = {
      processed: results.length,
      sent: results.filter(r => r.status === 'sent').length,
      cancelled: results.filter(r => r.status === 'cancelled').length,
      failed: results.filter(r => r.status === 'failed').length,
    };
    
    return new Response(JSON.stringify({
      message: 'Successfully processed due reminders',
      ...summary,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Dispatcher error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

