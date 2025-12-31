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
4. Groups readings by measurement type + day-of-week
5. Clusters readings into 15-minute bins
6. Computes median time + 5 minutes for each cluster
7. Inserts schedules for upcoming week into `notification_schedules`

**Eligibility:**

- User must have notifications enabled
- Must have readings spanning ≥7 days in past 14 days

**Output:**

- One schedule row per computed reminder time
- Status: `scheduled`

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

- **Bin size**: `15` minutes (line ~66) - clustering granularity
- **Reminder offset**: `+5` minutes after median (line ~105) - buffer time

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
