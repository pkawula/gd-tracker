-- =====================================================================
-- Migration: Fix cron authentication to use custom header
-- Purpose: Avoid Kong Authorization header conflict
-- Created: 2025-12-31 14:50:00 UTC
-- =====================================================================
-- The previous implementation used Authorization header which conflicts
-- with Kong's API gateway authentication. This migration switches to
-- a custom X-Cron-Secret header instead.
-- =====================================================================

-- Replace the call_edge_function helper to use X-Cron-Secret header
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
  -- Use custom X-Cron-Secret header to avoid Kong Authorization conflict
  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', cron_secret
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
  'Invoke Supabase Edge Functions from pg_cron. Uses X-Cron-Secret header to avoid Kong auth conflicts. Requires cron_secret in Vault.';

