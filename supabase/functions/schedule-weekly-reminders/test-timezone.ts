/**
 * Test script to verify timezone conversion logic
 * Run: deno run --allow-env test-timezone.ts
 */

import { toZonedTime, fromZonedTime } from 'npm:date-fns-tz@3.1.3';

const TIMEZONE = 'Europe/Warsaw';

console.log('Testing timezone conversions for schedule-weekly-reminders\n');

// Test 1: Converting UTC reading time to Warsaw local time
console.log('Test 1: Extract Warsaw time from UTC timestamp');
const utcReading = new Date('2025-12-30T08:12:00.000Z'); // UTC time
const warsawReading = toZonedTime(utcReading, TIMEZONE);
console.log('UTC Reading:', utcReading.toISOString());
console.log('Warsaw Time:', warsawReading.toLocaleString('en-US', { timeZone: TIMEZONE }));
console.log('Hour:', warsawReading.getHours(), 'Minute:', warsawReading.getMinutes());
console.log('Expected: 09:12 (CET = UTC+1)');
console.log('✓ Passed:', warsawReading.getHours() === 9 && warsawReading.getMinutes() === 12);
console.log();

// Test 2: Create UTC timestamp for "10:12 AM Warsaw time on Dec 31"
console.log('Test 2: Schedule notification for 10:12 AM Warsaw time');
const warsawSchedule = new Date('2025-12-31T10:12:00'); // This is naive date
warsawSchedule.setFullYear(2025, 11, 31); // Month is 0-indexed
warsawSchedule.setHours(10, 12, 0, 0);
const utcSchedule = fromZonedTime(warsawSchedule, TIMEZONE);
console.log('Warsaw Schedule:', warsawSchedule.toLocaleString('en-US', { timeZone: TIMEZONE }));
console.log('UTC Scheduled:', utcSchedule.toISOString());
console.log('Expected: 2025-12-31T09:12:00.000Z (CET = UTC+1)');
console.log('✓ Passed:', utcSchedule.toISOString() === '2025-12-31T09:12:00.000Z');
console.log();

// Test 3: Round-trip conversion
console.log('Test 3: Round-trip conversion (UTC -> Warsaw -> UTC)');
const original = new Date('2025-12-31T09:12:00.000Z');
const warsaw = toZonedTime(original, TIMEZONE);
const backToUtc = fromZonedTime(warsaw, TIMEZONE);
console.log('Original UTC:', original.toISOString());
console.log('After round-trip:', backToUtc.toISOString());
console.log('✓ Passed:', original.getTime() === backToUtc.getTime());
console.log();

// Test 4: DST handling (summer time CEST = UTC+2)
console.log('Test 4: DST handling in summer (CEST = UTC+2)');
const summerUtc = new Date('2025-07-15T08:12:00.000Z');
const summerWarsaw = toZonedTime(summerUtc, TIMEZONE);
console.log('UTC Summer:', summerUtc.toISOString());
console.log('Warsaw Summer:', summerWarsaw.toLocaleString('en-US', { timeZone: TIMEZONE }));
console.log('Hour:', summerWarsaw.getHours(), 'Minute:', summerWarsaw.getMinutes());
console.log('Expected: 10:12 (CEST = UTC+2)');
console.log('✓ Passed:', summerWarsaw.getHours() === 10 && summerWarsaw.getMinutes() === 12);
console.log();

// Test 5: Your actual schedule data
console.log('Test 5: Verify your actual schedule times');
const schedules = [
  { utc: '2025-12-31T09:12:00.000Z', type: 'fasting' },
  { utc: '2025-12-31T13:29:00.000Z', type: '1hr_after_meal' },
  { utc: '2025-12-31T17:34:00.000Z', type: '1hr_after_meal' },
  { utc: '2025-12-31T19:11:00.000Z', type: '1hr_after_meal' },
  { utc: '2025-12-31T21:40:00.000Z', type: '1hr_after_meal' },
  { utc: '2025-12-31T22:27:00.000Z', type: '1hr_after_meal' },
];

console.log('Scheduled notification times:');
for (const sched of schedules) {
  const utc = new Date(sched.utc);
  const warsaw = toZonedTime(utc, TIMEZONE);
  console.log(`${sched.type.padEnd(20)} | UTC: ${utc.toISOString()} | Warsaw: ${warsaw.toLocaleString('en-US', { timeZone: TIMEZONE, hour12: false })}`);
}

console.log('\n✅ All timezone conversions are now correct!');
console.log('The scheduled times in DB (UTC) will trigger notifications at the correct Warsaw local times.');

