-- =====================================================================
-- Migration: Fix cron helper to use Supabase Vault for secrets
-- Purpose: Remove hardcoded secrets and app.settings dependency
-- Created: 2025-12-31 14:00:00 UTC
-- =====================================================================
-- This migration replaces the call_edge_function helper to:
-- 1. Use Supabase Vault for secure secret storage (no hardcoded values)
-- 2. Auto-detect local vs production environment
-- 3. Remove dependency on app.settings (no superuser config needed)
--
-- IMPORTANT: After applying this migration, you must store secrets in Vault:
-- SELECT vault.create_secret('your-secret-here', 'cron_secret');
-- 
-- For production, optionally override the URL:
-- SELECT vault.create_secret('https://your-project.supabase.co', 'supabase_url');
-- =====================================================================

-- Drop existing function (with old signature that required secret parameter)
drop function if exists public.call_edge_function(text, text);

-- Create new version that reads secrets from Vault
create or replace function public.call_edge_function(
  function_name text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  function_url text;
  supabase_url text;
  cron_secret text;
begin
  -- Get Supabase URL from vault, or use local default
  -- Local Supabase uses 'kong' as internal service name
  begin
    select decrypted_secret into supabase_url
    from vault.decrypted_secrets
    where name = 'supabase_url';
  exception
    when others then
      -- Default to local development (internal kong service)
      supabase_url := 'http://kong:8000';
  end;
  
  -- Get cron secret from vault (REQUIRED)
  begin
    select decrypted_secret into cron_secret
    from vault.decrypted_secrets
    where name = 'cron_secret';
  exception
    when others then
      -- If no secret found, log error and exit
      raise warning 'cron_secret not found in Vault. Create it with: SELECT vault.create_secret(''your-secret'', ''cron_secret'');';
      return;
  end;
  
  -- Validate secret exists
  if cron_secret is null or cron_secret = '' then
    raise warning 'cron_secret is empty in Vault';
    return;
  end if;
  
  -- Build Edge Function URL
  function_url := supabase_url || '/functions/v1/' || function_name;
  
  -- Make HTTP POST request using pg_net (asynchronous)
  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb
  );
  
  raise log 'Queued Edge Function call: % to %', function_name, function_url;
  
exception
  when others then
    raise warning 'Failed to call Edge Function %: %', function_name, sqlerrm;
end;
$$;

comment on function public.call_edge_function is
  'Invoke Supabase Edge Functions from pg_cron. Reads secrets from Vault for security. Requires cron_secret in Vault.';

-- =====================================================================
-- Update cron jobs to use new function signature (no secret parameter)
-- =====================================================================

-- Unschedule old jobs
select cron.unschedule('weekly-reminder-scheduler');
select cron.unschedule('frequent-reminder-dispatcher');

-- Re-schedule with new function signature
select cron.schedule(
  'weekly-reminder-scheduler',
  '0 1 * * 0',  -- 01:00 UTC on Sundays (~02:00 Warsaw time)
  $$
  select public.call_edge_function('schedule-weekly-reminders');
  $$
);

select cron.schedule(
  'frequent-reminder-dispatcher',
  '*/5 * * * *',  -- Every 5 minutes
  $$
  select public.call_edge_function('dispatch-due-reminders');
  $$
);

-- =====================================================================
-- Instructions for setting up secrets (run these manually in SQL Editor)
-- =====================================================================

-- Step 1: Generate a strong secret locally
-- In terminal: openssl rand -hex 32

-- Step 2: Store the cron secret in Vault (REQUIRED)
-- Copy the generated secret and run:
-- SELECT vault.create_secret('paste-your-secret-here', 'cron_secret');

-- Step 3: (Optional) Override Supabase URL for production
-- For production deployment only:
-- SELECT vault.create_secret('https://your-project-ref.supabase.co', 'supabase_url');

-- Step 4: Verify secrets are stored
-- SELECT name, description FROM vault.secrets WHERE name IN ('cron_secret', 'supabase_url');

-- Step 5: Set the same secret as Edge Function environment variable
-- In Supabase Dashboard → Edge Functions → Secrets:
-- CRON_EDGE_FUNCTION_SECRET = same-value-as-cron_secret

-- =====================================================================
-- Verification queries
-- =====================================================================

-- Check that cron jobs are updated
-- SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;

-- Test the helper function (will log warning if secret not set)
-- SELECT public.call_edge_function('schedule-weekly-reminders');

-- Check pg_net request queue
-- SELECT * FROM net.http_request_queue ORDER BY id DESC LIMIT 5;

