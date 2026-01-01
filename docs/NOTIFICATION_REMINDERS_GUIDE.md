# Notification Reminders System - Setup & Operations Guide

## Overview

This system sends personalized glucose measurement reminders to users based on their historical reading patterns. It consists of:

1. **Weekly Scheduler**: Analyzes past 2 weeks of readings and schedules upcoming week's reminders
2. **Frequent Dispatcher**: Sends OneSignal push notifications every 5 minutes for due reminders
3. **Database Tables**: Stores schedules, tracks execution, and maintains audit trail

## Architecture

```
┌─────────────────┐      ┌──────────────────────────┐
│   pg_cron       │─────▶│ schedule-weekly-reminders│
│   (Sun 02:00)   │      │   (Edge Function)        │
└─────────────────┘      └──────────────────────────┘
                                     │
                                     ▼
┌─────────────────┐         ┌────────────────────┐
│   pg_cron       │         │ notification_      │
│  (Every 5 min)  │◀───────▶│   schedules        │
└─────────────────┘         └────────────────────┘
         │
         ▼
┌──────────────────────────┐
│ dispatch-due-reminders   │
│   (Edge Function)        │
└──────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│   OneSignal REST API     │
└──────────────────────────┘
```

## Required Secrets

### Supabase Project Secrets

Set these in your Supabase Dashboard under Settings → Secrets (or via CLI):

#### 1. **CRON_EDGE_FUNCTION_SECRET**

- **Purpose**: Authenticates pg_cron → Edge Function calls
- **Generate**: `openssl rand -hex 32`
- **Example**: `a1b2c3d4e5f6...` (64 chars)

#### 2. **ONESIGNAL_APP_ID**

- **Purpose**: OneSignal application identifier
- **Source**: OneSignal Dashboard → Settings → Keys & IDs
- **Example**: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

#### 3. **ONESIGNAL_REST_API_KEY**

- **Purpose**: OneSignal REST API authentication
- **Source**: OneSignal Dashboard → Settings → Keys & IDs
- **Example**: `YzA3MWE2...` (long base64 string)

### Setting Secrets Locally

For local development, create `.env.local` in your project root (already gitignored):

```bash
CRON_EDGE_FUNCTION_SECRET=your-secret-here
ONESIGNAL_APP_ID=your-app-id
ONESIGNAL_REST_API_KEY=your-rest-api-key
```

Then link to Supabase:

```bash
supabase secrets set --env-file .env.local
```

### Setting Secrets in Production

Via Supabase Dashboard:

1. Go to Project Settings → Edge Functions → Secrets
2. Add each secret with its value

Or via CLI:

```bash
supabase secrets set CRON_EDGE_FUNCTION_SECRET=xxx
supabase secrets set ONESIGNAL_APP_ID=xxx
supabase secrets set ONESIGNAL_REST_API_KEY=xxx
```

## Database Configuration (Supabase Vault)

### Store Cron Secret in Vault

The cron jobs need to authenticate when calling Edge Functions. Store this secret securely in Supabase Vault:

**Step 1: Generate a strong secret**

```bash
openssl rand -hex 32
```

**Step 2: Store in Vault (SQL Editor)**

```sql
-- Store the cron secret (REQUIRED)
SELECT vault.create_secret('paste-your-generated-secret-here', 'cron_secret');

-- For production, optionally override the Supabase URL
-- (Local development uses http://kong:8000 by default)
SELECT vault.create_secret('https://eojeckblbwzgydeqzonw.supabase.co', 'supabase_url');
```

**Step 3: Set same secret for Edge Functions**

The Edge Functions validate incoming cron requests using this secret. Set it as an environment variable:

```bash
# Use the SAME value you stored in Vault
supabase secrets set CRON_EDGE_FUNCTION_SECRET=same-value-as-cron_secret
```

**Step 4: Verify**

```sql
-- Check secrets are stored (won't show values, just names)
SELECT name, description FROM vault.secrets
WHERE name IN ('cron_secret', 'supabase_url');
```

## Installation Steps

### 1. Apply Migrations

```bash
# Reset database to apply all migrations
supabase db reset

# Or push migrations to remote
supabase db push
```

This will create:

- `notification_schedules` table
- `notification_schedule_runs` table
- `user_settings.language` column
- pg_cron jobs
- Helper functions

### 2. Deploy Edge Functions

```bash
# Deploy both functions
supabase functions deploy schedule-weekly-reminders
supabase functions deploy dispatch-due-reminders
```

### 3. Configure Vault Secrets

**Generate and store the cron secret:**

```bash
# Generate a strong secret
openssl rand -hex 32
```

**Store in Vault (via SQL Editor):**

```sql
-- Store the cron secret (REQUIRED) - use the value from above
SELECT vault.create_secret('paste-generated-secret-here', 'cron_secret');

-- Optional: For production, override the Supabase URL
SELECT vault.create_secret('https://your-project-ref.supabase.co', 'supabase_url');
```

**Set the same secret for Edge Functions:**

```bash
# Use the SAME value you stored in Vault
supabase secrets set CRON_EDGE_FUNCTION_SECRET=same-value-as-cron_secret
```

### 4. Verify Setup

```sql
-- Check that extensions are enabled
SELECT extname, extversion
FROM pg_extension
WHERE extname IN ('pg_cron', 'pg_net');

-- Check cron jobs are scheduled
SELECT * FROM cron.job ORDER BY jobname;

-- Verify secrets are stored in Vault
SELECT name, description FROM vault.secrets
WHERE name IN ('cron_secret', 'supabase_url');
```

### 5. Test Manually

When testing manually, you need to provide both authentication layers:

- **Supabase anon key** in `Authorization` header (for Kong API gateway)
- **Cron secret** in `X-Cron-Secret` header (for Edge Function validation)

```bash
# Get your local anon key
supabase status | grep "Publishable key"

# Get your cron secret (the value you stored in Vault)
# This should match CRON_EDGE_FUNCTION_SECRET

# Test weekly scheduler
curl -X POST http://localhost:54321/functions/v1/schedule-weekly-reminders \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "X-Cron-Secret: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"

# Test dispatcher
curl -X POST http://localhost:54321/functions/v1/dispatch-due-reminders \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "X-Cron-Secret: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

**Example:**

```bash
curl -X POST http://localhost:54321/functions/v1/schedule-weekly-reminders \
  -H "Authorization: Bearer sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH" \
  -H "X-Cron-Secret: a1b2c3d4e5f6..." \
  -H "Content-Type: application/json"
```

## System Behavior

### Weekly Scheduler (Sundays 02:00 Warsaw Time)

**What it does:**

1. Fetches all users with `push_notifications_enabled = true`
2. Analyzes last 14 days of glucose readings per user
3. Filters users with at least 7 days of reading activity
4. **Applies meal time window filtering** (removes readings outside defined windows)
5. **Applies statistical outlier detection** (removes anomalous late/early entries)
6. Groups readings by measurement type + day-of-week
7. Clusters readings into 15-minute bins
8. Computes median time + 5 minutes for each cluster
9. **Enforces minimum 90-minute spacing** between reminders
10. **Validates schedules fall within meal windows**
11. Inserts schedules for upcoming week into `notification_schedules`

**Eligibility:**

- User must have notifications enabled
- Must have readings spanning ≥7 days in past 14 days

**Output:**

- One schedule row per computed reminder time
- Status: `scheduled`

**Filtering Pipeline:**

The scheduler uses a multi-stage filtering system to ensure accurate reminders:

1. **Meal Window Filtering**: Only readings within user-defined time windows are considered (e.g., fasting: 7:30-9:00)
2. **Statistical Outlier Detection**: Removes readings beyond 2 standard deviations from median per day/type group
3. **Minimum Spacing Enforcement**: Ensures reminders are at least 90 minutes apart
4. **Final Validation**: Confirms all scheduled times fall within valid meal windows

### Frequent Dispatcher (Every 5 Minutes)

**What it does:**

1. Fetches schedules where `status = 'scheduled'` and `scheduled_at <= now()`
2. For each schedule:
   - Checks if user already recorded a measurement in skip window:
     - Window: `[scheduled_at - 45min, scheduled_at + 90min]`
   - If reading exists: marks schedule as `cancelled`
   - If no reading: sends OneSignal notification to user
3. Updates schedule status: `sent`, `cancelled`, or `failed`

**Skip Logic:**
Prevents annoying users who already took their measurement.

**Localization:**
Sends notifications in both English and Polish. OneSignal will display the user's device language version.

## Monitoring & Troubleshooting

### View Scheduled Reminders

```sql
-- See upcoming scheduled reminders
SELECT
  ns.scheduled_at,
  ns.measurement_type,
  ns.status,
  us.language,
  u.email
FROM notification_schedules ns
JOIN auth.users u ON u.id = ns.user_id
JOIN user_settings us ON us.user_id = ns.user_id
WHERE ns.status = 'scheduled'
  AND ns.scheduled_at > now()
ORDER BY ns.scheduled_at
LIMIT 20;
```

### Check Scheduler Execution History

```sql
-- View weekly scheduler runs
SELECT
  run_week_start_date,
  status,
  users_processed,
  schedules_created,
  started_at,
  finished_at,
  error
FROM notification_schedule_runs
ORDER BY started_at DESC
LIMIT 10;
```

### Check Dispatcher Results

```sql
-- View recently dispatched notifications
SELECT
  scheduled_at,
  measurement_type,
  status,
  decision_reason,
  onesignal_notification_id,
  updated_at
FROM notification_schedules
WHERE status IN ('sent', 'cancelled', 'failed')
ORDER BY updated_at DESC
LIMIT 50;
```

### Check Cron Job Execution

```sql
-- View cron job run history
SELECT
  jobname,
  start_time,
  end_time,
  status,
  return_message
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;
```

### Common Issues

#### Issue: Cron jobs not running

**Check:**

```sql
SELECT * FROM cron.job;
```

**Fix:**

- Ensure `pg_cron` extension is enabled: `CREATE EXTENSION IF NOT EXISTS pg_cron;`
- Restart Supabase: `supabase stop && supabase start`
- Verify database settings are set (see "Required Settings")

#### Issue: Edge Functions returning 401

**Cause:** Cron secret mismatch

**Fix:**

```sql
-- Check current setting
SELECT current_setting('app.settings.cron_secret', true);

-- Update if needed
ALTER DATABASE postgres SET app.settings.cron_secret = 'your-secret-here';
```

#### Issue: No schedules being created

**Check:**

1. Users have notifications enabled:

   ```sql
   SELECT COUNT(*) FROM user_settings WHERE push_notifications_enabled = true;
   ```

2. Users have enough readings:
   ```sql
   SELECT
     user_id,
     COUNT(*) as reading_count,
     MIN(measured_at) as first_reading,
     MAX(measured_at) as last_reading
   FROM glucose_readings
   WHERE measured_at >= NOW() - INTERVAL '14 days'
   GROUP BY user_id;
   ```

#### Issue: Notifications not being sent

**Check:**

1. OneSignal secrets are set:

   ```bash
   supabase secrets list
   ```

2. User has OneSignal subscription:

   - Verify user clicked "Allow Notifications" in the app
   - Check OneSignal Dashboard → Audience → All Users

3. Check dispatcher logs:
   ```bash
   supabase functions logs dispatch-due-reminders
   ```

## Customization Parameters

You can adjust these values in the Edge Function code:

### Weekly Scheduler (`schedule-weekly-reminders/index.ts`)

- **Bin size**: `15` minutes (line ~116) - clustering granularity
- **Reminder offset**: `+5` minutes after median (line ~133) - buffer time
- **Minimum spacing**: `90` minutes (line ~175) - gap between reminders

### Filtering (`schedule-weekly-reminders/filtering.ts`)

- **Outlier threshold**: `2` standard deviations (line ~137) - statistical sensitivity
- **Minimum spacing**: `90` minutes (line ~191) - enforced gap between schedules
- **Minimum readings for outlier detection**: `3` readings (line ~110) - statistical significance

### Dispatcher (`dispatch-due-reminders/index.ts`)

- **Skip window before**: `-45` minutes (line ~36)
- **Skip window after**: `+90` minutes (line ~39)
- **Grace period**: `15` minutes (line ~134) - how old schedules to process
- **Batch size**: `500` schedules (line ~138)

### Cron Schedule (`20251231122000_setup_pg_cron_jobs.sql`)

- **Weekly run**: `0 1 * * 0` (01:00 UTC Sunday)
- **Dispatch frequency**: `*/5 * * * *` (every 5 minutes)

## Timezone Handling

**User timezone assumption**: Europe/Warsaw (UTC+1 / UTC+2 with DST)

**Data storage**: All timestamps stored as UTC in database

**Conversion flow**:

1. User's historical readings stored as UTC
2. Scheduler converts to Warsaw time for pattern analysis
3. Computed schedule times converted back to UTC for storage
4. Dispatcher sends at UTC time (user receives at their local time)

**DST handling**: The weekly cron job runs at 01:00 UTC, which approximates 02:00 Warsaw time year-round (exact during winter, 03:00 during summer DST).

## Meal Time Validation System

### Overview

The Meal Time Validation System filters glucose readings based on user-configurable time windows to ensure accurate reminder scheduling and filter out invalid measurements (e.g., late entries, forgotten measurements).

### Database Schema

**Table: `user_meal_windows`**

```sql
CREATE TABLE user_meal_windows (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
  measurement_type TEXT CHECK (measurement_type IN ('fasting', '1hr_after_meal')),
  meal_number INT CHECK (meal_number BETWEEN 1 AND 6), -- NULL for fasting
  time_start TIME NOT NULL,
  time_end TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, day_of_week, measurement_type, meal_number)
);
```

### Default Meal Windows

When a user enables notifications, the system automatically seeds these default windows (applied to all 7 days):

| Measurement Type | Meal # | Time Window | Purpose                             |
| ---------------- | ------ | ----------- | ----------------------------------- |
| Fasting          | NULL   | 07:30-09:00 | Morning fasting measurement         |
| 1hr After Meal   | 1      | 10:00-11:00 | 1hr after breakfast (9-10 AM meal)  |
| 1hr After Meal   | 2      | 12:00-13:30 | 1hr after lunch (11-12:30 PM meal)  |
| 1hr After Meal   | 3      | 15:00-16:00 | 1hr after snack (14-15 PM meal)     |
| 1hr After Meal   | 4      | 17:30-19:00 | 1hr after dinner (16:30-18 PM meal) |
| 1hr After Meal   | 5      | 20:00-21:00 | 1hr after evening snack (19-20 PM)  |

### User Interface

Users can customize their meal windows via Settings → Meal Times:

**Features:**

- Select day of week to view/edit windows
- Adjust start and end times for each meal window
- Reset to defaults button
- Visual time pickers (HTML5 time input)
- Bilingual support (English/Polish)

**Frontend Components:**

- `MealWindowsSettings.tsx` - Main settings component
- `useMealWindows.ts` - React hook for CRUD operations
- Integrated into `SettingsDialog.tsx` with tab navigation

### Filtering Logic

The scheduler applies a 4-stage filtering pipeline:

#### Stage 1: Meal Window Filtering

**Function:** `filterReadingsByMealWindows(readings, mealWindows)`

**Purpose:** Remove readings outside defined time windows

**Algorithm:**

1. For each reading, find applicable windows (matching day_of_week + measurement_type)
2. Check if reading's time falls within any applicable window
3. Exclude reading if no matching window exists

**Example:**

```typescript
// Reading at 23:00 (late night) - EXCLUDED
// Reading at 08:15 in fasting window (07:30-09:00) - INCLUDED
// Reading at 12:30 in meal 2 window (12:00-13:30) - INCLUDED
```

**Impact:** In real data testing, this removed ~27% of readings (84/311 readings)

#### Stage 2: Statistical Outlier Detection

**Function:** `detectStatisticalOutliers(minutesOfDay, threshold=2)`

**Purpose:** Remove anomalous readings that deviate significantly from the cluster

**Algorithm:**

1. Calculate median and standard deviation per user/day/type group
2. Remove readings beyond 2 standard deviations from median
3. Requires minimum 3 readings for statistical significance

**Example:**

```
Normal cluster: [475, 480, 485, 478, 482] (around 8:00 AM)
Outlier: [1380] (23:00 - 11 hours later)
Result: Outlier removed, cluster intact
```

**Impact:** In real data testing, this removed ~1 additional reading after window filtering

#### Stage 3: Minimum Spacing Enforcement

**Function:** `enforceMinimumSpacing(schedules, minSpacing=90)`

**Purpose:** Prevent reminder fatigue by ensuring adequate gaps between notifications

**Algorithm:**

1. Sort schedules by time
2. Compare each schedule to the previous kept schedule
3. If gap < 90 minutes, keep the one with higher frequency/confidence
4. Otherwise, keep both

**Example:**

```
Schedule A: 08:30 (frequency: 5)
Schedule B: 09:45 (frequency: 4) - Gap: 75 min → TOO CLOSE
Schedule C: 11:00 (frequency: 3) - Gap: 90 min → OK

Result: Keep A and C, remove B
```

#### Stage 4: Final Validation

**Function:** `validateSchedulesAgainstWindows(schedules, mealWindows)`

**Purpose:** Ensure all scheduled times fall within valid meal windows

**Algorithm:**

1. For each schedule, check if scheduled time falls within any applicable window
2. Remove schedules that fall outside all windows
3. Provides safety net against edge cases

### Testing

**Unit Tests:** `filtering.test.ts`

- 12 comprehensive tests covering all filtering functions
- Edge cases: small datasets, zero variance, boundary conditions
- All tests passing ✅

**Fixture Validation:** `fixture-validation.test.ts`

- Real-world data validation using 311 actual glucose readings
- Validates filtering accuracy, time ranges, type distribution
- 4 integration tests, all passing ✅

**Test Results:**

```
Original readings: 311
After window filtering: 227 (27% filtered)
After outlier detection: 226 (<1% filtered)
Late night readings (after 21:00): 0 ✅
Early morning readings (before 7:30): 0 ✅
```

### Seeding Function

**SQL Function:** `seed_user_meal_windows_for_user(target_user_id UUID)`

**Purpose:** Populate default meal windows for a user

**Usage:**

```sql
-- Seed for specific user
SELECT seed_user_meal_windows_for_user('user-id-here');

-- Seed for all users with notifications enabled
DO $$
DECLARE
  user_record record;
BEGIN
  FOR user_record IN
    SELECT user_id FROM user_settings WHERE push_notifications_enabled = true
  LOOP
    PERFORM seed_user_meal_windows_for_user(user_record.user_id);
  END LOOP;
END;
$$;
```

**Behavior:**

- Creates 6 windows per day (1 fasting + 5 meals) × 7 days = 42 total windows
- Uses `ON CONFLICT DO NOTHING` to avoid duplicates
- Automatically called when user enables notifications

### API Integration

**Hook:** `useMealWindows()`

**Methods:**

- `mealWindows` - Current meal windows array
- `loading` - Loading state
- `error` - Error state
- `updateMealWindow(window)` - Update single window (optimistic UI)
- `updateMealWindows(windows)` - Batch update multiple windows
- `seedDefaultWindows()` - Reset to defaults

**Example Usage:**

```typescript
const { mealWindows, updateMealWindow, seedDefaultWindows } = useMealWindows();

// Update a single window
await updateMealWindow({
	id: window.id,
	time_start: "08:00:00",
	time_end: "09:30:00",
});

// Reset to defaults
await seedDefaultWindows();
```

### Performance Impact

**Scheduler Performance:**

- Minimal overhead (<100ms for typical user with 200-300 readings)
- Filtering reduces data volume by ~27%, improving clustering performance
- Additional benefit: More accurate reminder times

**Database Impact:**

- Indexed lookups on `user_id` + `day_of_week`
- 42 rows per user (negligible storage)
- No impact on read operations

### Monitoring

**Check user's meal windows:**

```sql
SELECT
  day_of_week,
  measurement_type,
  meal_number,
  time_start,
  time_end
FROM user_meal_windows
WHERE user_id = 'user-id-here'
ORDER BY day_of_week, measurement_type, meal_number;
```

**Find users without meal windows:**

```sql
SELECT us.user_id, u.email
FROM user_settings us
JOIN auth.users u ON u.id = us.user_id
LEFT JOIN user_meal_windows mw ON mw.user_id = us.user_id
WHERE us.push_notifications_enabled = true
  AND mw.id IS NULL;
```

**Analyze filtering effectiveness:**

```sql
WITH reading_counts AS (
  SELECT
    user_id,
    COUNT(*) as total_readings,
    COUNT(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM user_meal_windows mw
        WHERE mw.user_id = gr.user_id
          AND mw.day_of_week = EXTRACT(DOW FROM gr.measured_at)
          AND mw.measurement_type = gr.measurement_type
          AND EXTRACT(HOUR FROM gr.measured_at) * 60 + EXTRACT(MINUTE FROM gr.measured_at)
              BETWEEN EXTRACT(HOUR FROM mw.time_start) * 60 + EXTRACT(MINUTE FROM mw.time_start)
              AND EXTRACT(HOUR FROM mw.time_end) * 60 + EXTRACT(MINUTE FROM mw.time_end)
      )
    ) as valid_readings
  FROM glucose_readings gr
  WHERE measured_at >= NOW() - INTERVAL '14 days'
  GROUP BY user_id
)
SELECT
  user_id,
  total_readings,
  valid_readings,
  total_readings - valid_readings as filtered_out,
  ROUND(100.0 * (total_readings - valid_readings) / total_readings, 1) as filter_percentage
FROM reading_counts;
```

### Troubleshooting

**Issue: No meal windows created for user**

Check if user has notifications enabled:

```sql
SELECT push_notifications_enabled
FROM user_settings
WHERE user_id = 'user-id';
```

Manually seed:

```sql
SELECT seed_user_meal_windows_for_user('user-id');
```

**Issue: User wants different windows per day**

The UI allows per-day customization. Users can select each day and set different windows.

**Issue: Reminders not matching user's schedule**

1. Check user's meal windows are correctly set
2. Verify readings fall within windows
3. Ensure user has enough readings (≥7 days span)
4. Check scheduler logs for filtering statistics

### Best Practices

1. **Default Windows Work Well**: Most users can use defaults without changes
2. **Gradual Adoption**: System works with or without meal windows (backward compatible)
3. **User Education**: Settings UI includes help text explaining the purpose
4. **Testing**: Validate with fixture data before deploying to production
5. **Monitoring**: Track filtering percentages to detect anomalies

## Performance Considerations

- **Weekly scheduler**: Processes all eligible users, may take 1-5 minutes depending on user count
- **Dispatcher**: Batched to 500 schedules per run, each run typically <30 seconds
- **Database indexes**: Optimized for frequent queries (see migration file)
- **Edge Function timeout**: 60 seconds (Supabase default)

## Data Retention

Schedule rows are kept indefinitely for audit purposes. Consider periodic cleanup:

```sql
-- Delete schedules older than 90 days
DELETE FROM notification_schedules
WHERE scheduled_at < NOW() - INTERVAL '90 days';

-- Delete old scheduler runs
DELETE FROM notification_schedule_runs
WHERE started_at < NOW() - INTERVAL '90 days';
```

Add this as a monthly cron job if desired.
