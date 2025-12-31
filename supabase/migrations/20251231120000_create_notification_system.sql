-- =====================================================================
-- Migration: Create notification scheduling system
-- Purpose: Add tables and infrastructure for weekly scheduled reminders
--          based on users' glucose reading patterns
-- Created: 2025-12-31
-- =====================================================================
-- This migration creates:
-- 1. notification_schedules - stores individual reminder events
-- 2. notification_schedule_runs - tracks weekly scheduler execution
-- 3. Enables pg_cron and pg_net extensions for scheduled jobs
-- 4. RLS policies for secure access
-- =====================================================================

-- Enable required extensions for cron scheduling and HTTP requests
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- =====================================================================
-- Table: notification_schedules
-- Purpose: Store individual reminder events with their delivery status
-- Each row represents "at time T, remind user U to take measurement type M"
-- =====================================================================

create table if not exists public.notification_schedules (
  -- Primary key
  id uuid primary key default gen_random_uuid(),
  
  -- User reference with cascade delete to clean up when user is deleted
  user_id uuid not null references auth.users(id) on delete cascade,
  
  -- Type of glucose measurement this reminder is for
  measurement_type text not null 
    check (measurement_type in ('fasting', '1hr_after_meal')),
  
  -- When to send the reminder (stored in UTC)
  scheduled_at timestamptz not null,
  
  -- Current status of this reminder
  status text not null 
    check (status in ('scheduled', 'sent', 'cancelled', 'failed'))
    default 'scheduled',
  
  -- OneSignal notification ID after successful send
  onesignal_notification_id text,
  
  -- Human-readable reason for the current status
  -- Examples: 'sent_onesignal_ok', 'skipped_reading_exists', 'onesignal_error_401'
  decision_reason text,
  
  -- Audit timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prevent duplicate schedules for same user/type/time combination
create unique index notification_schedules_user_type_time_idx 
  on public.notification_schedules(user_id, measurement_type, scheduled_at);

-- Optimize dispatcher queries that fetch due reminders to send
create index notification_schedules_status_scheduled_at_idx 
  on public.notification_schedules(status, scheduled_at)
  where status = 'scheduled';

-- Optimize user-specific queries for debugging/auditing
create index notification_schedules_user_scheduled_at_idx 
  on public.notification_schedules(user_id, scheduled_at desc);

-- Add updated_at trigger to automatically track modifications
create or replace function public.update_updated_at_column()
returns trigger
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_notification_schedules_updated_at
  before update on public.notification_schedules
  for each row
  execute function public.update_updated_at_column();

-- =====================================================================
-- Table: notification_schedule_runs
-- Purpose: Track weekly scheduler executions for observability and idempotency
-- Prevents duplicate scheduling and provides audit trail
-- =====================================================================

create table if not exists public.notification_schedule_runs (
  -- Primary key
  id uuid primary key default gen_random_uuid(),
  
  -- Week identifier (e.g., '2025-12-29' for week starting Dec 29)
  -- Used to prevent duplicate scheduling for the same week
  run_week_start_date date not null unique,
  
  -- Execution tracking
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  
  -- Execution outcome
  status text not null 
    check (status in ('running', 'completed', 'failed'))
    default 'running',
  
  -- Error details if status = 'failed'
  error text,
  
  -- Statistics about the run
  users_processed integer,
  schedules_created integer
);

-- Index for finding recent runs
create index notification_schedule_runs_started_at_idx 
  on public.notification_schedule_runs(started_at desc);

-- =====================================================================
-- Row Level Security (RLS) Policies
-- Security model:
-- - Users can READ their own notification schedules (for UI/debugging)
-- - All WRITES happen via service role within Edge Functions
-- - notification_schedule_runs is admin-only (no user access needed)
-- =====================================================================

-- Enable RLS on both tables
alter table public.notification_schedules enable row level security;
alter table public.notification_schedule_runs enable row level security;

-- Policy: Users can view their own notification schedules
-- Rationale: Allows users to see upcoming reminders in the app UI
create policy "Users can select their own notification schedules"
  on public.notification_schedules
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Policy: Anonymous users cannot access notification schedules
-- Rationale: Notification data is personal and requires authentication
create policy "Anonymous users cannot select notification schedules"
  on public.notification_schedules
  for select
  to anon
  using (false);

-- Note: No INSERT, UPDATE, or DELETE policies for users
-- All modifications happen via service role in Edge Functions

-- Policy: notification_schedule_runs is admin/service-role only
-- Rationale: This table is purely for system observability, not user-facing
-- No policies needed - RLS enabled but only service role can access

-- =====================================================================
-- Comments for database documentation
-- =====================================================================

comment on table public.notification_schedules is 
  'Stores scheduled reminder notifications for glucose measurements. Populated weekly by scheduler Edge Function, consumed by dispatcher Edge Function.';

comment on column public.notification_schedules.scheduled_at is 
  'UTC timestamp when reminder should be sent. Computed from user''s historical measurement patterns in Europe/Warsaw timezone.';

comment on column public.notification_schedules.decision_reason is 
  'Human-readable explanation of why reminder was sent/cancelled/failed. Used for debugging and analytics.';

comment on table public.notification_schedule_runs is 
  'Audit log of weekly scheduler executions. Ensures idempotency via unique constraint on run_week_start_date.';

comment on column public.notification_schedule_runs.run_week_start_date is 
  'Monday date of the week being scheduled (format: YYYY-MM-DD). Enforces one scheduling run per week.';

