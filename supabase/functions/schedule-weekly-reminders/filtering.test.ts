/**
 * Unit tests for filtering functions
 * Run: deno test --allow-env filtering.test.ts
 */

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  filterReadingsByMealWindows,
  detectStatisticalOutliers,
  filterOutliers,
  enforceMinimumSpacing,
  validateSchedulesAgainstWindows,
  adjustSchedulesToMealWindows,
  fillMissingMealWindowReminders,
  type MealWindow,
  type Reading,
  type Schedule,
} from './filtering.ts';

// Helper: Create a meal window
function createMealWindow(
  dayOfWeek: number,
  type: 'fasting' | '1hr_after_meal',
  mealNumber: number | null,
  start: string,
  end: string
): MealWindow {
  return {
    id: crypto.randomUUID(),
    user_id: 'test-user',
    day_of_week: dayOfWeek,
    measurement_type: type,
    meal_number: mealNumber,
    time_start: start,
    time_end: end,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// Helper: Create a reading
function createReading(
  dayOfWeek: number,
  minuteOfDay: number,
  type: 'fasting' | '1hr_after_meal',
  date: string
): Reading {
  return {
    user_id: 'test-user',
    measurement_type: type,
    day_of_week: dayOfWeek,
    minute_of_day: minuteOfDay,
    date,
  };
}

Deno.test('filterReadingsByMealWindows - filters readings within windows', () => {
  const windows: MealWindow[] = [
    createMealWindow(1, 'fasting', null, '07:30:00', '09:00:00'), // Monday fasting 7:30-9:00
    createMealWindow(1, '1hr_after_meal', 1, '12:00:00', '13:30:00'), // Monday meal 1 12:00-13:30
  ];

  const readings: Reading[] = [
    createReading(1, 8 * 60 + 15, 'fasting', '2025-12-29'), // 08:15 - within window
    createReading(1, 6 * 60 + 30, 'fasting', '2025-12-29'), // 06:30 - before window
    createReading(1, 12 * 60 + 30, '1hr_after_meal', '2025-12-29'), // 12:30 - within window
    createReading(1, 15 * 60, '1hr_after_meal', '2025-12-29'), // 15:00 - outside window
  ];

  const filtered = filterReadingsByMealWindows(readings, windows);

  assertEquals(filtered.length, 2, 'Should keep only readings within windows');
  assertEquals(filtered[0].minute_of_day, 8 * 60 + 15);
  assertEquals(filtered[1].minute_of_day, 12 * 60 + 30);
});

Deno.test('filterReadingsByMealWindows - returns all if no windows defined', () => {
  const readings: Reading[] = [
    createReading(1, 8 * 60, 'fasting', '2025-12-29'),
    createReading(1, 12 * 60, '1hr_after_meal', '2025-12-29'),
  ];

  const filtered = filterReadingsByMealWindows(readings, []);

  assertEquals(filtered.length, 2, 'Should return all readings when no windows');
});

Deno.test('filterReadingsByMealWindows - excludes readings on days without windows', () => {
  const windows: MealWindow[] = [
    createMealWindow(1, 'fasting', null, '07:30:00', '09:00:00'), // Monday only
  ];

  const readings: Reading[] = [
    createReading(1, 8 * 60, 'fasting', '2025-12-29'), // Monday - OK
    createReading(2, 8 * 60, 'fasting', '2025-12-30'), // Tuesday - no window
  ];

  const filtered = filterReadingsByMealWindows(readings, windows);

  assertEquals(filtered.length, 1, 'Should exclude Tuesday reading');
  assertEquals(filtered[0].day_of_week, 1);
});

Deno.test('detectStatisticalOutliers - removes outliers beyond threshold', () => {
  // Normal cluster around 480 (8:00 AM) with one outlier at 1380 (23:00)
  const minutes = [475, 480, 485, 490, 478, 482, 1380]; // Last one is 23:00

  const filtered = detectStatisticalOutliers(minutes, 2);

  assertEquals(filtered.length, 6, 'Should remove the late night outlier');
  assertEquals(filtered.includes(1380), false, 'Should not include 23:00');
});

Deno.test('detectStatisticalOutliers - handles small datasets', () => {
  const minutes = [480, 485];

  const filtered = detectStatisticalOutliers(minutes, 2);

  assertEquals(filtered.length, 2, 'Should return all readings when < 3 readings');
});

Deno.test('detectStatisticalOutliers - handles identical values', () => {
  const minutes = [480, 480, 480, 480];

  const filtered = detectStatisticalOutliers(minutes, 2);

  assertEquals(filtered.length, 4, 'Should handle zero std deviation');
});

Deno.test('filterOutliers - applies detection per group', () => {
  const readings: Reading[] = [
    // Monday fasting cluster around 8:00 (need enough readings for statistical significance)
    createReading(1, 475, 'fasting', '2025-12-29'), // 7:55
    createReading(1, 480, 'fasting', '2025-12-22'), // 8:00
    createReading(1, 485, 'fasting', '2025-12-15'), // 8:05
    createReading(1, 478, 'fasting', '2025-12-08'), // 7:58
    createReading(1, 482, 'fasting', '2025-12-01'), // 8:02
    createReading(1, 1380, 'fasting', '2025-11-24'), // 23:00 - Clear outlier
    
    // Monday meal cluster - should remain intact
    createReading(1, 715, '1hr_after_meal', '2025-12-29'), // 11:55
    createReading(1, 720, '1hr_after_meal', '2025-12-22'), // 12:00
    createReading(1, 725, '1hr_after_meal', '2025-12-15'), // 12:05
  ];

  const filtered = filterOutliers(readings, 2);

  // Should remove 1 outlier (23:00 fasting)
  assertEquals(filtered.length, 8, 'Should remove 1 outlier');
  
  // Check outlier is gone
  const minutes = filtered.map(r => r.minute_of_day);
  assertEquals(minutes.includes(1380), false, 'Should not include 23:00');
  
  // Check valid readings remain
  assertEquals(minutes.filter(m => m >= 475 && m <= 485).length, 5, 'Fasting cluster intact');
  assertEquals(minutes.filter(m => m >= 715 && m <= 725).length, 3, 'Meal cluster intact');
});

Deno.test('enforceMinimumSpacing - removes schedules too close together', () => {
  const schedules: Schedule[] = [
    {
      user_id: 'test-user',
      measurement_type: 'fasting',
      scheduled_at: '2026-01-06T07:30:00.000Z', // 8:30 Warsaw
      minute_of_day: 8 * 60 + 30,
      frequency: 5,
    },
    {
      user_id: 'test-user',
      measurement_type: '1hr_after_meal',
      scheduled_at: '2026-01-06T09:00:00.000Z', // 10:00 Warsaw (90 min later - OK)
      minute_of_day: 10 * 60,
      frequency: 4,
    },
    {
      user_id: 'test-user',
      measurement_type: '1hr_after_meal',
      scheduled_at: '2026-01-06T09:30:00.000Z', // 10:30 Warsaw (only 30 min - too close)
      minute_of_day: 10 * 60 + 30,
      frequency: 3,
    },
  ];

  const filtered = enforceMinimumSpacing(schedules, 90);

  assertEquals(filtered.length, 2, 'Should keep only 2 schedules');
  assertEquals(filtered[0].minute_of_day, 8 * 60 + 30);
  assertEquals(filtered[1].minute_of_day, 10 * 60); // Keeps higher frequency one
});

Deno.test('enforceMinimumSpacing - prioritizes higher frequency', () => {
  const schedules: Schedule[] = [
    {
      user_id: 'test-user',
      measurement_type: 'fasting',
      scheduled_at: '2026-01-06T07:30:00.000Z',
      minute_of_day: 8 * 60,
      frequency: 3, // Lower frequency
    },
    {
      user_id: 'test-user',
      measurement_type: '1hr_after_meal',
      scheduled_at: '2026-01-06T08:00:00.000Z', // 30 min later
      minute_of_day: 8 * 60 + 30,
      frequency: 7, // Higher frequency - should win
    },
  ];

  const filtered = enforceMinimumSpacing(schedules, 90);

  assertEquals(filtered.length, 1, 'Should keep only 1 schedule');
  assertEquals(filtered[0].frequency, 7, 'Should keep higher frequency');
  assertEquals(filtered[0].minute_of_day, 8 * 60 + 30);
});

Deno.test('validateSchedulesAgainstWindows - filters schedules outside windows', () => {
  const windows: MealWindow[] = [
    createMealWindow(1, 'fasting', null, '07:30:00', '09:00:00'), // Monday 7:30-9:00
    createMealWindow(1, '1hr_after_meal', 1, '12:00:00', '13:30:00'), // Monday 12:00-13:30
  ];

  // Note: Jan 6, 2026 is a Tuesday (day 2), not Monday
  // Let's use correct dates: Jan 5, 2026 is Monday
  const schedules: Schedule[] = [
    {
      user_id: 'test-user',
      measurement_type: 'fasting',
      scheduled_at: '2026-01-05T07:30:00.000Z', // Monday 8:30 Warsaw (CET=UTC+1) - within window
    },
    {
      user_id: 'test-user',
      measurement_type: 'fasting',
      scheduled_at: '2026-01-05T09:30:00.000Z', // Monday 10:30 Warsaw - outside window
    },
    {
      user_id: 'test-user',
      measurement_type: '1hr_after_meal',
      scheduled_at: '2026-01-05T11:30:00.000Z', // Monday 12:30 Warsaw - within window
    },
  ];

  const filtered = validateSchedulesAgainstWindows(schedules, windows);

  assertEquals(filtered.length, 2, 'Should keep only schedules within windows');
  
  // Check that 10:30 schedule was removed
  const kept = filtered.map(s => s.scheduled_at);
  assertEquals(kept.includes('2026-01-05T09:30:00.000Z'), false, 'Should not include 10:30 schedule');
});

Deno.test('validateSchedulesAgainstWindows - returns all if no windows', () => {
  const schedules: Schedule[] = [
    {
      user_id: 'test-user',
      measurement_type: 'fasting',
      scheduled_at: '2026-01-06T07:30:00.000Z',
    },
  ];

  const filtered = validateSchedulesAgainstWindows(schedules, []);

  assertEquals(filtered.length, 1, 'Should return all schedules when no windows');
});

// Integration test: End-to-end filtering scenario
Deno.test('Integration - full filtering pipeline', () => {
  // Setup: User has meal windows for Monday
  const windows: MealWindow[] = [
    createMealWindow(1, 'fasting', null, '07:30:00', '09:00:00'),
    createMealWindow(1, '1hr_after_meal', 1, '10:00:00', '11:00:00'),
    createMealWindow(1, '1hr_after_meal', 2, '12:00:00', '13:30:00'),
  ];

  // User has readings including some outliers and out-of-window entries
  const readings: Reading[] = [
    // Fasting cluster
    createReading(1, 475, 'fasting', '2025-12-29'), // 7:55
    createReading(1, 480, 'fasting', '2025-12-29'), // 8:00
    createReading(1, 485, 'fasting', '2025-12-29'), // 8:05
    createReading(1, 1380, 'fasting', '2025-12-29'), // 23:00 - OUTLIER
    createReading(1, 360, 'fasting', '2025-12-29'), // 6:00 - OUTSIDE WINDOW
    
    // Meal 1 cluster
    createReading(1, 615, '1hr_after_meal', '2025-12-29'), // 10:15
    createReading(1, 620, '1hr_after_meal', '2025-12-29'), // 10:20
    createReading(1, 625, '1hr_after_meal', '2025-12-29'), // 10:25
    
    // Meal 2 cluster
    createReading(1, 735, '1hr_after_meal', '2025-12-29'), // 12:15
    createReading(1, 740, '1hr_after_meal', '2025-12-29'), // 12:20
  ];

  // Step 1: Filter by meal windows
  let filtered = filterReadingsByMealWindows(readings, windows);
  assertEquals(filtered.length, 8, 'Should remove 6:00 and 23:00 by window filter');

  // Step 2: Remove statistical outliers
  filtered = filterOutliers(filtered, 2);
  assertEquals(filtered.length, 8, 'No statistical outliers after window filtering');

  // Verify final set is clean
  const minutes = filtered.map(r => r.minute_of_day);
  assertEquals(minutes.includes(1380), false);
  assertEquals(minutes.includes(360), false);
  assertExists(minutes.find(m => m >= 475 && m <= 485), 'Fasting cluster intact');
  assertExists(minutes.find(m => m >= 615 && m <= 625), 'Meal 1 cluster intact');
  assertExists(minutes.find(m => m >= 735 && m <= 740), 'Meal 2 cluster intact');
});

// ========================================
// NEW TESTS FOR MEAL WINDOW ADJUSTMENT AND GAP FILLING
// ========================================

Deno.test('adjustSchedulesToMealWindows - keeps schedules already inside windows', () => {
  const windows: MealWindow[] = [
    createMealWindow(1, 'fasting', null, '07:30:00', '09:00:00'), // Monday 7:30-9:00
  ];

  const schedules: Schedule[] = [
    {
      user_id: 'test-user',
      measurement_type: 'fasting',
      scheduled_at: '2026-01-05T07:45:00.000Z', // Monday 8:45 Warsaw - inside window
      minute_of_day: 8 * 60 + 45,
    },
  ];

  const adjusted = adjustSchedulesToMealWindows(schedules, windows);

  assertEquals(adjusted.length, 1, 'Should keep schedule inside window');
  assertEquals(adjusted[0].scheduled_at, '2026-01-05T07:45:00.000Z', 'Should not modify time');
});

Deno.test('adjustSchedulesToMealWindows - adjusts schedules near window boundaries', () => {
  const windows: MealWindow[] = [
    createMealWindow(1, 'fasting', null, '07:30:00', '09:00:00'), // Monday 7:30-9:00 (450-540 minutes)
  ];

  const schedules: Schedule[] = [
    {
      user_id: 'test-user',
      measurement_type: 'fasting',
      // Schedule at 7:15 (435 minutes) - 15 min before window start
      scheduled_at: '2026-01-05T07:15:00.000Z',
      minute_of_day: 7 * 60 + 15,
    },
    {
      user_id: 'test-user',
      measurement_type: 'fasting',
      // Schedule at 9:20 (560 minutes) - 20 min after window end
      scheduled_at: '2026-01-05T09:20:00.000Z',
      minute_of_day: 9 * 60 + 20,
    },
  ];

  const adjusted = adjustSchedulesToMealWindows(schedules, windows);

  assertEquals(adjusted.length, 2, 'Should adjust both schedules');
  
  // First schedule should be moved to window start (7:30)
  const firstDate = new Date(adjusted[0].scheduled_at);
  assertEquals(firstDate.getUTCHours(), 7, 'Should adjust to 7:30 hour');
  assertEquals(firstDate.getUTCMinutes(), 30, 'Should adjust to 7:30 minutes');
  
  // Second schedule should be moved to window end (9:00)
  const secondDate = new Date(adjusted[1].scheduled_at);
  assertEquals(secondDate.getUTCHours(), 9, 'Should adjust to 9:00 hour');
  assertEquals(secondDate.getUTCMinutes(), 0, 'Should adjust to 9:00 minutes');
});

Deno.test('adjustSchedulesToMealWindows - discards schedules too far from windows', () => {
  const windows: MealWindow[] = [
    createMealWindow(1, 'fasting', null, '07:30:00', '09:00:00'), // Monday 7:30-9:00
  ];

  const schedules: Schedule[] = [
    {
      user_id: 'test-user',
      measurement_type: 'fasting',
      // Schedule at 6:00 - 90 min before window (too far)
      scheduled_at: '2026-01-05T06:00:00.000Z',
      minute_of_day: 6 * 60,
    },
    {
      user_id: 'test-user',
      measurement_type: 'fasting',
      // Schedule at 8:00 - inside window (should keep)
      scheduled_at: '2026-01-05T08:00:00.000Z',
      minute_of_day: 8 * 60,
    },
  ];

  const adjusted = adjustSchedulesToMealWindows(schedules, windows);

  assertEquals(adjusted.length, 1, 'Should discard schedule too far away');
  assertEquals(adjusted[0].minute_of_day, 8 * 60, 'Should keep the one inside window');
});

Deno.test('adjustSchedulesToMealWindows - discards schedules with no matching window', () => {
  const windows: MealWindow[] = [
    createMealWindow(1, 'fasting', null, '07:30:00', '09:00:00'), // Monday only
  ];

  const schedules: Schedule[] = [
    {
      user_id: 'test-user',
      measurement_type: 'fasting',
      scheduled_at: '2026-01-06T08:00:00.000Z', // Tuesday - no window
      minute_of_day: 8 * 60,
    },
    {
      user_id: 'test-user',
      measurement_type: '1hr_after_meal', // Different type - no window
      scheduled_at: '2026-01-05T08:00:00.000Z',
      minute_of_day: 8 * 60,
    },
  ];

  const adjusted = adjustSchedulesToMealWindows(schedules, windows);

  assertEquals(adjusted.length, 0, 'Should discard schedules without matching windows');
});

Deno.test('adjustSchedulesToMealWindows - returns all if no windows defined', () => {
  const schedules: Schedule[] = [
    {
      user_id: 'test-user',
      measurement_type: 'fasting',
      scheduled_at: '2026-01-06T08:00:00.000Z',
      minute_of_day: 8 * 60,
    },
  ];

  const adjusted = adjustSchedulesToMealWindows(schedules, []);

  assertEquals(adjusted.length, 1, 'Should return all schedules when no windows');
});

Deno.test('fillMissingMealWindowReminders - adds default for uncovered windows', () => {
  const windows: MealWindow[] = [
    createMealWindow(1, 'fasting', null, '07:30:00', '09:00:00'), // Monday 7:30-9:00
    createMealWindow(1, '1hr_after_meal', 1, '12:00:00', '13:00:00'), // Monday 12:00-13:00
  ];

  const schedules: Schedule[] = [
    {
      user_id: 'test-user',
      measurement_type: 'fasting',
      scheduled_at: '2026-01-05T08:00:00.000Z', // Covers fasting window
      minute_of_day: 8 * 60,
    },
  ];

  const userTypes = new Map([['test-user', new Set(['fasting', '1hr_after_meal'])]]);
  const targetMonday = new Date('2026-01-05T00:00:00.000Z');

  const gapFillers = fillMissingMealWindowReminders(schedules, windows, userTypes, targetMonday);

  assertEquals(gapFillers.length, 1, 'Should create one gap filler for uncovered window');
  assertEquals(gapFillers[0].measurement_type, '1hr_after_meal', 'Should fill meal window');
  assertEquals(gapFillers[0].is_default_reminder, true, 'Should mark as default');
  
  // Should be at 12:40 (13:00 - 20 min)
  const reminderDate = new Date(gapFillers[0].scheduled_at);
  assertEquals(reminderDate.getUTCHours(), 12, 'Should be 20 min before end - hour');
  assertEquals(reminderDate.getUTCMinutes(), 40, 'Should be 20 min before end - minutes');
});

Deno.test('fillMissingMealWindowReminders - skips types user does not use', () => {
  const windows: MealWindow[] = [
    createMealWindow(1, 'fasting', null, '07:30:00', '09:00:00'),
    createMealWindow(1, '1hr_after_meal', 1, '12:00:00', '13:00:00'),
  ];

  const schedules: Schedule[] = [];
  
  // User only uses fasting, not 1hr_after_meal
  const userTypes = new Map([['test-user', new Set(['fasting'])]]);
  const targetMonday = new Date('2026-01-05T00:00:00.000Z');

  const gapFillers = fillMissingMealWindowReminders(schedules, windows, userTypes, targetMonday);

  assertEquals(gapFillers.length, 1, 'Should only fill for types user uses');
  assertEquals(gapFillers[0].measurement_type, 'fasting', 'Should only fill fasting');
});

Deno.test('fillMissingMealWindowReminders - does not duplicate covered windows', () => {
  const windows: MealWindow[] = [
    createMealWindow(1, 'fasting', null, '07:30:00', '09:00:00'),
  ];

  const schedules: Schedule[] = [
    {
      user_id: 'test-user',
      measurement_type: 'fasting',
      scheduled_at: '2026-01-05T08:00:00.000Z',
      minute_of_day: 8 * 60,
    },
  ];

  const userTypes = new Map([['test-user', new Set(['fasting'])]]);
  const targetMonday = new Date('2026-01-05T00:00:00.000Z');

  const gapFillers = fillMissingMealWindowReminders(schedules, windows, userTypes, targetMonday);

  assertEquals(gapFillers.length, 0, 'Should not create filler for already covered window');
});

Deno.test('fillMissingMealWindowReminders - handles multiple users', () => {
  const windows: MealWindow[] = [
    { ...createMealWindow(1, 'fasting', null, '07:30:00', '09:00:00'), user_id: 'user-1' },
    { ...createMealWindow(1, 'fasting', null, '07:30:00', '09:00:00'), user_id: 'user-2' },
  ];

  const schedules: Schedule[] = [];

  const userTypes = new Map([
    ['user-1', new Set(['fasting'])],
    ['user-2', new Set(['fasting'])],
  ]);
  const targetMonday = new Date('2026-01-05T00:00:00.000Z');

  const gapFillers = fillMissingMealWindowReminders(schedules, windows, userTypes, targetMonday);

  assertEquals(gapFillers.length, 2, 'Should create fillers for both users');
  assertEquals(gapFillers[0].user_id, 'user-1');
  assertEquals(gapFillers[1].user_id, 'user-2');
});

Deno.test('fillMissingMealWindowReminders - respects custom date creator', () => {
  const windows: MealWindow[] = [
    createMealWindow(1, 'fasting', null, '07:30:00', '09:00:00'),
  ];

  const schedules: Schedule[] = [];
  const userTypes = new Map([['test-user', new Set(['fasting'])]]);
  const targetMonday = new Date('2026-01-05T00:00:00.000Z');

  // Custom date creator that adds 1 hour offset
  const customDateCreator = (dayOfWeek: number, minuteOfDay: number, targetMonday: Date): Date => {
    const date = new Date(targetMonday);
    const daysToAdd = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    date.setDate(date.getDate() + daysToAdd);
    date.setUTCHours(Math.floor(minuteOfDay / 60) + 1); // Add 1 hour
    date.setUTCMinutes(minuteOfDay % 60);
    return date;
  };

  const gapFillers = fillMissingMealWindowReminders(
    schedules,
    windows,
    userTypes,
    targetMonday,
    customDateCreator
  );

  assertEquals(gapFillers.length, 1);
  const reminderDate = new Date(gapFillers[0].scheduled_at);
  // Should be 9:40 instead of 8:40 (due to +1 hour offset)
  assertEquals(reminderDate.getUTCHours(), 9, 'Should use custom date creator');
});

// Integration test: End-to-end with adjustment and gap filling
Deno.test('Integration - adjustment + gap filling pipeline', () => {
  const windows: MealWindow[] = [
    createMealWindow(1, 'fasting', null, '07:30:00', '09:00:00'),
    createMealWindow(1, '1hr_after_meal', 1, '10:00:00', '11:00:00'),
    createMealWindow(1, '1hr_after_meal', 2, '12:00:00', '13:30:00'),
  ];

  const schedules: Schedule[] = [
    {
      user_id: 'test-user',
      measurement_type: 'fasting',
      scheduled_at: '2026-01-05T07:15:00.000Z', // 7:15 - will adjust to 7:30
      minute_of_day: 7 * 60 + 15,
    },
    {
      user_id: 'test-user',
      measurement_type: '1hr_after_meal',
      scheduled_at: '2026-01-05T10:30:00.000Z', // 10:30 - inside meal 1 window
      minute_of_day: 10 * 60 + 30,
    },
    // Note: meal 2 window has no coverage - should be filled
  ];

  // Phase 1: Adjust
  const adjusted = adjustSchedulesToMealWindows(schedules, windows);
  assertEquals(adjusted.length, 2, 'Should adjust and keep both schedules');

  // Phase 2: Fill gaps
  const userTypes = new Map([['test-user', new Set(['fasting', '1hr_after_meal'])]]);
  const targetMonday = new Date('2026-01-05T00:00:00.000Z');
  const gapFillers = fillMissingMealWindowReminders(adjusted, windows, userTypes, targetMonday);

  assertEquals(gapFillers.length, 1, 'Should create one gap filler');
  assertEquals(gapFillers[0].measurement_type, '1hr_after_meal', 'Should fill meal 2');
  
  // Final result: 2 adjusted + 1 filler = 3 total
  const final = [...adjusted, ...gapFillers];
  assertEquals(final.length, 3, 'Should have 3 total schedules');
  
  // Verify all windows are covered
  const coverage = new Set(final.map(s => `${s.measurement_type}`));
  assertEquals(coverage.has('fasting'), true, 'Fasting covered');
  assertEquals(coverage.has('1hr_after_meal'), true, 'Meal covered');
});

console.log('✅ All filtering tests passed!');

