-- Migration: Create user_meal_windows table
-- Purpose: Allow users to define typical meal time windows for filtering invalid measurements
-- Affected: New table user_meal_windows, new function seed_user_meal_windows_for_user
-- Date: 2026-01-01

-- Create table to store user-configurable meal time windows
create table user_meal_windows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  measurement_type text not null check (measurement_type in ('fasting', '1hr_after_meal')),
  meal_number int check (meal_number between 1 and 6),
  time_start time not null,
  time_end time not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- Ensure unique constraint: one window per user/day/type/meal combination
  unique(user_id, day_of_week, measurement_type, meal_number)
);

-- Enable Row Level Security
alter table user_meal_windows enable row level security;

-- RLS Policy: Users can view their own meal windows
create policy "Users can view their own meal windows"
  on user_meal_windows
  for select
  to authenticated
  using (auth.uid() = user_id);

-- RLS Policy: Users can insert their own meal windows
create policy "Users can insert their own meal windows"
  on user_meal_windows
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- RLS Policy: Users can update their own meal windows
create policy "Users can update their own meal windows"
  on user_meal_windows
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- RLS Policy: Users can delete their own meal windows
create policy "Users can delete their own meal windows"
  on user_meal_windows
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- RLS Policy: Service role can view all meal windows (for scheduled tasks)
create policy "Service role can view all meal windows"
  on user_meal_windows
  for select
  to service_role
  using (true);

-- Create function to seed default meal windows for a user
-- This function populates typical meal time windows based on common patterns
create or replace function seed_user_meal_windows_for_user(target_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  dow int; -- day of week (0=Sunday, 6=Saturday)
begin
  -- Loop through all days of the week (0-6)
  for dow in 0..6 loop
    -- Fasting window: 07:30-09:00
    insert into user_meal_windows (user_id, day_of_week, measurement_type, meal_number, time_start, time_end)
    values (target_user_id, dow, 'fasting', null, '07:30'::time, '09:00'::time)
    on conflict (user_id, day_of_week, measurement_type, meal_number) do nothing;
    
    -- Meal 1: 10:00-11:00 (1hr after 9-10 meal)
    insert into user_meal_windows (user_id, day_of_week, measurement_type, meal_number, time_start, time_end)
    values (target_user_id, dow, '1hr_after_meal', 1, '10:00'::time, '11:00'::time)
    on conflict (user_id, day_of_week, measurement_type, meal_number) do nothing;
    
    -- Meal 2: 12:00-13:30 (1hr after 11-12:30 meal)
    insert into user_meal_windows (user_id, day_of_week, measurement_type, meal_number, time_start, time_end)
    values (target_user_id, dow, '1hr_after_meal', 2, '12:00'::time, '13:30'::time)
    on conflict (user_id, day_of_week, measurement_type, meal_number) do nothing;
    
    -- Meal 3: 15:00-16:00 (1hr after 14-15 meal)
    insert into user_meal_windows (user_id, day_of_week, measurement_type, meal_number, time_start, time_end)
    values (target_user_id, dow, '1hr_after_meal', 3, '15:00'::time, '16:00'::time)
    on conflict (user_id, day_of_week, measurement_type, meal_number) do nothing;
    
    -- Meal 4: 17:30-19:00 (1hr after 16:30-18 meal)
    insert into user_meal_windows (user_id, day_of_week, measurement_type, meal_number, time_start, time_end)
    values (target_user_id, dow, '1hr_after_meal', 4, '17:30'::time, '19:00'::time)
    on conflict (user_id, day_of_week, measurement_type, meal_number) do nothing;
    
    -- Meal 5: 20:00-21:00 (1hr after 19-20 meal)
    insert into user_meal_windows (user_id, day_of_week, measurement_type, meal_number, time_start, time_end)
    values (target_user_id, dow, '1hr_after_meal', 5, '20:00'::time, '21:00'::time)
    on conflict (user_id, day_of_week, measurement_type, meal_number) do nothing;
  end loop;
end;
$$;

-- Add updated_at trigger (uses existing function from notification_system migration)
create trigger update_user_meal_windows_updated_at
  before update on public.user_meal_windows
  for each row
  execute function public.update_updated_at_column();

-- Create index for faster lookups by user_id and day_of_week
create index idx_user_meal_windows_user_day
  on user_meal_windows(user_id, day_of_week);

-- Seed default meal windows for all existing users with notifications enabled
do $$
declare
  user_record record;
begin
  for user_record in
    select user_id from user_settings where push_notifications_enabled = true
  loop
    perform seed_user_meal_windows_for_user(user_record.user_id);
  end loop;
end;
$$;

