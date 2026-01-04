-- =====================================================================
-- Migration: Add Reading Context Tracking and Schedule Analytics
-- =====================================================================
-- Purpose: Enable differentiation between organic and prompted readings,
--          add schedule metadata for analytics, and helper functions
-- 
-- Affected tables:
--   - glucose_readings: Add reading_context column
--   - notification_schedules: Add analytics metadata columns
--
-- New functions:
--   - tag_scheduled_reading(): Auto-classify readings based on schedule timing
--   - count_scheduled_weeks(): Count historical scheduling runs per user
--
-- Special considerations:
--   - Trigger checks 30-minute window before/after scheduled time
--   - Default reading_context is 'organic' for backward compatibility
--   - meal_window_id enables tracing schedules back to user preferences
-- =====================================================================

-- =====================================================================
-- 1. Add Reading Context Column
-- =====================================================================

-- tag readings by quality/source
alter table glucose_readings 
add column reading_context text default 'organic'
check (reading_context in ('organic', 'scheduled_prompt', 'manual_entry'));

comment on column glucose_readings.reading_context is 
  'Context: organic (unprompted), scheduled_prompt (within 30min of schedule), manual_entry';

-- index for quick filtering by context
create index idx_readings_context 
  on glucose_readings(user_id, reading_context, measured_at desc);

-- =====================================================================
-- 2. Auto-Tag Scheduled Readings (Trigger)
-- =====================================================================

create or replace function tag_scheduled_reading()
returns trigger
set search_path = ''
as $$
begin
  -- check if reading occurred within 30min of a scheduled notification
  -- this helps identify readings likely influenced by our reminders
  if exists (
    select 1 
    from public.notification_schedules ns
    where ns.user_id = new.user_id
      and ns.measurement_type = new.measurement_type
      -- 30-minute window before and after scheduled time
      and ns.scheduled_at between 
          new.measured_at - interval '30 minutes'
          and new.measured_at + interval '30 minutes'
      -- only check schedules from last 7 days to keep query fast
      and ns.scheduled_at >= current_date - interval '7 days'
  ) then
    new.reading_context = 'scheduled_prompt';
  end if;
  
  return new;
end;
$$ language plpgsql;

comment on function tag_scheduled_reading is
  'Automatically tags readings as scheduled_prompt if they occur within 30min of a notification schedule';

create trigger trg_tag_scheduled_reading
  before insert on glucose_readings
  for each row
  execute function tag_scheduled_reading();

-- =====================================================================
-- 3. Add Metadata to Schedules Table
-- =====================================================================

-- add analytics columns to track schedule quality and source
alter table notification_schedules 
add column meal_window_id uuid references user_meal_windows(id) on delete set null,
add column confidence numeric(3,2) check (confidence between 0 and 1),
add column source text check (source in ('history', 'default_window', 'manual')),
add column readings_count integer check (readings_count >= 0);

comment on column notification_schedules.meal_window_id is 
  'Links schedule to the user_meal_windows row used to generate it. null for fasting schedules.';

comment on column notification_schedules.confidence is 
  'Confidence score 0.0-1.0 indicating schedule quality based on historical data consistency';
  
comment on column notification_schedules.source is 
  'Source: history (data-driven from past readings), default_window (fallback), manual (user-created)';

comment on column notification_schedules.readings_count is 
  'Number of historical readings used to generate this schedule. higher = more reliable.';

-- index for filtering schedules by source and confidence
create index idx_schedules_source_confidence 
  on notification_schedules(user_id, source, confidence desc)
  where status = 'scheduled';

-- =====================================================================
-- 4. Helper Function: Count Scheduled Weeks
-- =====================================================================

create or replace function count_scheduled_weeks(
  p_user_id uuid,
  p_target_monday date
) 
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- count distinct weeks where user had schedules created
  -- used to determine if user has enough history for data-driven scheduling
  select count(distinct nsr.run_week_start_date)
  into v_count
  from public.notification_schedule_runs nsr
  where nsr.status = 'completed'
    and nsr.run_week_start_date < p_target_monday
    and exists (
      select 1 
      from public.notification_schedules ns
      where ns.user_id = p_user_id
        and ns.scheduled_at >= nsr.run_week_start_date
        and ns.scheduled_at < nsr.run_week_start_date + interval '7 days'
    );
    
  return coalesce(v_count, 0);
end;
$$;

comment on function count_scheduled_weeks is
  'Returns number of completed scheduling runs for a user before target_monday. used to assess user scheduling history.';