-- =====================================================================
-- Migration: Fix search_path security vulnerabilities
-- Purpose: Add secure search_path configuration to existing functions
-- Created: 2025-12-31 13:00:00 UTC
-- =====================================================================
-- This migration addresses security warnings by setting search_path = ''
-- on functions that were missing this important security configuration.
-- 
-- Affected functions:
-- 1. public.call_edge_function - security definer function for cron jobs
-- 2. public.update_updated_at_column - trigger function for timestamp updates
--
-- Why this matters:
-- Functions without an explicit search_path setting are vulnerable to
-- search path attacks where malicious schemas could be injected into
-- the search path to override function behavior. Setting search_path = ''
-- ensures functions only use fully-qualified object references.
-- =====================================================================

-- =====================================================================
-- Fix 1: Update call_edge_function with secure search_path
-- =====================================================================
-- This function is marked as SECURITY DEFINER, which means it runs with
-- elevated privileges. Without search_path = '', it's vulnerable to attacks.

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

-- Re-add documentation comment
comment on function public.call_edge_function is
  'Helper function to invoke Supabase Edge Functions from pg_cron jobs. Uses pg_net for HTTP calls. Secured with search_path = ''''.';

-- =====================================================================
-- Fix 2: Update update_updated_at_column with secure search_path
-- =====================================================================
-- This trigger function updates the updated_at timestamp on row updates.
-- While not SECURITY DEFINER, it's still best practice to set search_path
-- to prevent any potential schema manipulation attacks.

create or replace function public.update_updated_at_column()
returns trigger
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Re-add documentation comment
comment on function public.update_updated_at_column is
  'Trigger function to automatically update updated_at column. Secured with search_path = ''''.';

-- =====================================================================
-- Verification
-- =====================================================================
-- After running this migration, you can verify the fix by checking:
-- 
-- SELECT proname, prosecdef, proconfig 
-- FROM pg_proc 
-- WHERE proname IN ('call_edge_function', 'update_updated_at_column');
--
-- Expected output should show proconfig = '{search_path=}' for both functions
-- =====================================================================

