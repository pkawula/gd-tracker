-- =====================================================================
-- Migration: Setup pg_cron jobs for notification system
-- Purpose: Schedule weekly reminder computation and frequent dispatch
-- Created: 2025-12-31
-- =====================================================================
-- This migration creates two cron jobs:
-- 1. Weekly scheduler: Sundays at 02:00 Europe/Warsaw (analyze patterns, schedule week)
-- 2. Frequent dispatcher: Every 5 minutes (send due notifications)
-- 
-- IMPORTANT: Before applying this migration, ensure these secrets are set:
-- - CRON_EDGE_FUNCTION_SECRET (for authenticating cron -> Edge Function calls)
-- - ONESIGNAL_APP_ID (for sending push notifications)
-- - ONESIGNAL_REST_API_KEY (for sending push notifications)
-- =====================================================================

-- Helper function to call Edge Functions via pg_net
-- Returns the HTTP response status for monitoring
create or replace function public.call_edge_function(
  function_name text,
  secret text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  function_url text;
  response_status int;
  response_body text;
begin
  -- Build Edge Function URL
  -- For local development: http://localhost:54321/functions/v1/{function_name}
  -- For production: https://{project-ref}.supabase.co/functions/v1/{function_name}
  function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/' || function_name;
  
  -- Make HTTP POST request using pg_net
  -- Note: pg_net executes asynchronously, so we can't get immediate response here
  -- The actual implementation will vary based on Supabase setup
  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || secret
    ),
    body := '{}'::jsonb
  );
  
  return jsonb_build_object(
    'status', 'queued',
    'function', function_name,
    'timestamp', now()
  );
exception
  when others then
    raise warning 'Failed to call Edge Function %: %', function_name, sqlerrm;
    return jsonb_build_object(
      'status', 'error',
      'function', function_name,
      'error', sqlerrm
    );
end;
$$;

-- Comment for documentation
comment on function public.call_edge_function is
  'Helper function to invoke Supabase Edge Functions from pg_cron jobs. Uses pg_net for HTTP calls.';

-- =====================================================================
-- Cron Job 1: Weekly Reminder Scheduler
-- Runs: Every Sunday at 02:00 Europe/Warsaw
-- UTC equivalent: Sunday 01:00 (winter) or 00:00 (summer, DST)
-- Using 01:00 UTC as compromise (covers most of year)
-- =====================================================================

-- Note: In production, you'll need to manually set this up or use a more
-- sophisticated approach to handle DST correctly
-- For now, we'll schedule at 01:00 UTC every Sunday
select cron.schedule(
  'weekly-reminder-scheduler',           -- job name
  '0 1 * * 0',                          -- cron expression: 01:00 UTC on Sundays
  $$
  select public.call_edge_function(
    'schedule-weekly-reminders',
    current_setting('app.settings.cron_secret', true)
  );
  $$
);

comment on extension pg_cron is 
  'Cron-based job scheduler. Used for weekly reminder scheduling and frequent dispatch.';

-- =====================================================================
-- Cron Job 2: Frequent Reminder Dispatcher  
-- Runs: Every 5 minutes
-- =====================================================================

select cron.schedule(
  'frequent-reminder-dispatcher',       -- job name
  '*/5 * * * *',                       -- cron expression: every 5 minutes
  $$
  select public.call_edge_function(
    'dispatch-due-reminders',
    current_setting('app.settings.cron_secret', true)
  );
  $$
);

-- =====================================================================
-- Verification queries (run these after migration to confirm setup)
-- =====================================================================

-- View all scheduled cron jobs
-- SELECT * FROM cron.job ORDER BY jobname;

-- View cron job execution history
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Check if required settings are configured
-- SELECT current_setting('app.settings.cron_secret', true) as cron_secret_set;
-- SELECT current_setting('app.settings.supabase_url', true) as supabase_url;

-- =====================================================================
-- Notes for local development
-- =====================================================================
-- 
-- 1. Ensure supabase/config.toml includes pg_cron and pg_net:
--    [postgres]
--    enabled_extensions = ["pg_cron", "pg_net"]
--
-- 2. Set required configuration (via Supabase Dashboard or SQL):
--    ALTER DATABASE postgres SET app.settings.supabase_url = 'http://localhost:54321';
--    ALTER DATABASE postgres SET app.settings.cron_secret = 'your-secret-here';
--
-- 3. For production, use your project URL:
--    ALTER DATABASE postgres SET app.settings.supabase_url = 'https://your-project.supabase.co';
--
-- 4. Restart Supabase after config changes:
--    supabase stop && supabase start
--

