-- Migration to fix timezone issue in existing records
-- Problem: Old records stored local time as UTC (datetime-local input without timezone conversion)
-- Solution: Adjust timestamps by subtracting the timezone offset

-- This migration assumes records were created in Europe/Warsaw timezone (UTC+1 or UTC+2 depending on DST)
-- If you have users in other timezones, you may need to adjust this migration

-- Step 1: Create a function to fix timestamps
-- The logic: If a timestamp was stored incorrectly (local time as UTC),
-- we need to convert it from UTC to local timezone, then back to UTC properly
-- 
-- However, since we don't know the exact timezone of each user when they created the record,
-- we'll use a conservative approach: subtract the timezone offset at the time of the record
--
-- For Europe/Warsaw timezone:
-- - Standard time: UTC+1 (CET)
-- - Daylight saving: UTC+2 (CEST)
-- 
-- We'll use PostgreSQL's timezone conversion to handle DST automatically

-- Fix timestamps by converting from UTC (where local time was incorrectly stored)
-- to Europe/Warsaw timezone, then back to UTC
-- 
-- Logic:
-- 1. measured_at AT TIME ZONE 'UTC' - converts timestamptz to timestamp, treating it as UTC
-- 2. AT TIME ZONE 'Europe/Warsaw' - interprets that timestamp as Warsaw local time and converts to UTC timestamptz
-- 
-- Example:
-- - Stored incorrectly: 2024-11-10T14:14:00Z (14:14 UTC, but should be 14:14 local)
-- - Step 1: 2024-11-10T14:14:00 (timestamp, no timezone)
-- - Step 2: Interpret as 14:14 Warsaw time = 13:14 UTC (if UTC+1) or 12:14 UTC (if UTC+2)
-- - Result: 2024-11-10T13:14:00Z (correct UTC time)
UPDATE glucose_readings
SET measured_at = (measured_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Warsaw'
WHERE measured_at < NOW() - INTERVAL '1 hour';
-- Only update records older than 1 hour to avoid affecting records created after the fix

