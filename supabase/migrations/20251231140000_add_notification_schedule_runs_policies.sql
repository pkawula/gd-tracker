-- =====================================================================
-- Migration: Add RLS policies for notification_schedule_runs table
-- Purpose: Fix RLS warning by adding explicit deny-all policies for 
--          non-service-role access to notification_schedule_runs
-- Created: 2025-12-31 14:00:00 UTC
-- =====================================================================
-- Background:
-- The notification_schedule_runs table tracks weekly scheduler executions
-- and is purely for system observability. It should only be accessible
-- by the service role (Edge Functions), not by regular users.
--
-- This migration adds explicit RLS policies that deny all user access,
-- making the security model explicit rather than implicit.
-- =====================================================================

-- =====================================================================
-- RLS Policies for notification_schedule_runs
-- Security Model: Admin/Service-Role only (no user access)
-- Rationale: This table is purely for system observability and should
--            not be exposed to end users (authenticated or anonymous)
-- =====================================================================

-- Policy: Authenticated users cannot select notification schedule runs
-- Rationale: This is system data for observability, not user-facing information
create policy "Authenticated users cannot select notification schedule runs"
  on public.notification_schedule_runs
  for select
  to authenticated
  using (false);

-- Policy: Anonymous users cannot select notification schedule runs  
-- Rationale: This is system data for observability, not user-facing information
create policy "Anonymous users cannot select notification schedule runs"
  on public.notification_schedule_runs
  for select
  to anon
  using (false);

-- Policy: Authenticated users cannot insert notification schedule runs
-- Rationale: Only Edge Functions with service role can create schedule run records
create policy "Authenticated users cannot insert notification schedule runs"
  on public.notification_schedule_runs
  for insert
  to authenticated
  with check (false);

-- Policy: Anonymous users cannot insert notification schedule runs
-- Rationale: Only Edge Functions with service role can create schedule run records
create policy "Anonymous users cannot insert notification schedule runs"
  on public.notification_schedule_runs
  for insert
  to anon
  with check (false);

-- Policy: Authenticated users cannot update notification schedule runs
-- Rationale: Only Edge Functions with service role can update schedule run records
create policy "Authenticated users cannot update notification schedule runs"
  on public.notification_schedule_runs
  for update
  to authenticated
  using (false);

-- Policy: Anonymous users cannot update notification schedule runs
-- Rationale: Only Edge Functions with service role can update schedule run records
create policy "Anonymous users cannot update notification schedule runs"
  on public.notification_schedule_runs
  for update
  to anon
  using (false);

-- Policy: Authenticated users cannot delete notification schedule runs
-- Rationale: Schedule run records should be permanent audit logs
create policy "Authenticated users cannot delete notification schedule runs"
  on public.notification_schedule_runs
  for delete
  to authenticated
  using (false);

-- Policy: Anonymous users cannot delete notification schedule runs
-- Rationale: Schedule run records should be permanent audit logs
create policy "Anonymous users cannot delete notification schedule runs"
  on public.notification_schedule_runs
  for delete
  to anon
  using (false);

-- =====================================================================
-- Result: Table now has explicit RLS policies that deny all user access
-- Only the service role (used by Edge Functions) can access this table
-- =====================================================================

