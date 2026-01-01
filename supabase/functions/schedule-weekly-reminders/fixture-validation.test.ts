/**
 * Fixture validation tests using real glucose measurement data
 * 
 * Purpose: Validate that the filtering system works correctly with actual user data
 * and produces schedules within expected time ranges.
 * 
 * Run: deno test --allow-env --allow-read fixture-validation.test.ts
 */
// eslint-disable @typescript-eslint/no-explicit-any

import { assertEquals, assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { toZonedTime } from 'npm:date-fns-tz@3.1.3';
import {
  filterReadingsByMealWindows,
  filterOutliers,
  type MealWindow,
  type Reading,
} from './filtering.ts';

const TIMEZONE = 'Europe/Warsaw';

// Load fixture data
const fixtureData = JSON.parse(
  await Deno.readTextFile('../_fixtures/glucose-measurments.json')
);

// Helper: Create default meal windows (same as seed function)
function createDefaultMealWindows(userId: string): MealWindow[] {
  const windows: MealWindow[] = [];
  
  for (let dow = 0; dow <= 6; dow++) {
    // Fasting: 07:30-09:00
    windows.push({
      id: crypto.randomUUID(),
      user_id: userId,
      day_of_week: dow,
      measurement_type: 'fasting',
      meal_number: null,
      time_start: '07:30:00',
      time_end: '09:00:00',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    
    // Meal 1: 10:00-11:00
    windows.push({
      id: crypto.randomUUID(),
      user_id: userId,
      day_of_week: dow,
      measurement_type: '1hr_after_meal',
      meal_number: 1,
      time_start: '10:00:00',
      time_end: '11:00:00',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    
    // Meal 2: 12:00-13:30
    windows.push({
      id: crypto.randomUUID(),
      user_id: userId,
      day_of_week: dow,
      measurement_type: '1hr_after_meal',
      meal_number: 2,
      time_start: '12:00:00',
      time_end: '13:30:00',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    
    // Meal 3: 15:00-16:00
    windows.push({
      id: crypto.randomUUID(),
      user_id: userId,
      day_of_week: dow,
      measurement_type: '1hr_after_meal',
      meal_number: 3,
      time_start: '15:00:00',
      time_end: '16:00:00',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    
    // Meal 4: 17:30-19:00
    windows.push({
      id: crypto.randomUUID(),
      user_id: userId,
      day_of_week: dow,
      measurement_type: '1hr_after_meal',
      meal_number: 4,
      time_start: '17:30:00',
      time_end: '19:00:00',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    
    // Meal 5: 20:00-21:00
    windows.push({
      id: crypto.randomUUID(),
      user_id: userId,
      day_of_week: dow,
      measurement_type: '1hr_after_meal',
      meal_number: 5,
      time_start: '20:00:00',
      time_end: '21:00:00',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  
  return windows;
}

Deno.test('Fixture validation - filter real glucose measurements', () => {
  console.log(`\n📊 Testing with ${fixtureData.length} real glucose readings...`);
  
  // Get unique user IDs
  const userIds = [...new Set(fixtureData.map((r: any) => r.user_id))] as string[];
  console.log(`   Found ${userIds.length} user(s) in fixture data`);
  
  for (const userId of userIds) {
    // Get user's readings
    const userReadings = fixtureData.filter((r: any) => r.user_id === userId);
    console.log(`\n   User: ${userId.substring(0, 8)}... (${userReadings.length} readings)`);
    
    // Convert to Reading format
    const readings: Reading[] = userReadings.map((r: any) => {
      const utcDate = new Date(r.measured_at);
      const warsawDate = toZonedTime(utcDate, TIMEZONE);
      const dayOfWeek = warsawDate.getDay();
      const minuteOfDay = warsawDate.getHours() * 60 + warsawDate.getMinutes();
      const dateStr = warsawDate.toISOString().split('T')[0];
      
      return {
        user_id: userId,
        measurement_type: r.measurement_type,
        day_of_week: dayOfWeek,
        minute_of_day: minuteOfDay,
        date: dateStr,
      };
    });
    
    // Create default meal windows
    const windows = createDefaultMealWindows(userId);
    
    // Apply filtering
    const windowFiltered = filterReadingsByMealWindows(readings, windows);
    const outlierFiltered = filterOutliers(windowFiltered, 2);
    
    const removedByWindows = readings.length - windowFiltered.length;
    const removedByOutliers = windowFiltered.length - outlierFiltered.length;
    
    console.log(`   ✓ Window filtering: removed ${removedByWindows} readings`);
    console.log(`   ✓ Outlier filtering: removed ${removedByOutliers} readings`);
    console.log(`   ✓ Final: ${outlierFiltered.length} valid readings`);
    
    // Assertions
    assert(outlierFiltered.length > 0, 'Should have some valid readings after filtering');
    assert(outlierFiltered.length <= readings.length, 'Filtered count should not exceed original');
    
    // Check all filtered readings fall within defined windows
    for (const reading of outlierFiltered) {
      const applicableWindows = windows.filter(
        w => w.day_of_week === reading.day_of_week && w.measurement_type === reading.measurement_type
      );
      
      const inWindow = applicableWindows.some(w => {
        const [startH, startM] = w.time_start.split(':').map(Number);
        const [endH, endM] = w.time_end.split(':').map(Number);
        const startMinute = startH * 60 + startM;
        const endMinute = endH * 60 + endM;
        return reading.minute_of_day >= startMinute && reading.minute_of_day <= endMinute;
      });
      
      assert(inWindow, `Reading at ${reading.minute_of_day} min should be within a window`);
    }
  }
});

Deno.test('Fixture validation - no late night measurements', () => {
  console.log('\n🌙 Checking for late night measurements...');
  
  const readings: Reading[] = fixtureData.map((r: any) => {
    const utcDate = new Date(r.measured_at);
    const warsawDate = toZonedTime(utcDate, TIMEZONE);
    const dayOfWeek = warsawDate.getDay();
    const minuteOfDay = warsawDate.getHours() * 60 + warsawDate.getMinutes();
    const dateStr = warsawDate.toISOString().split('T')[0];
    
    return {
      user_id: r.user_id,
      measurement_type: r.measurement_type,
      day_of_week: dayOfWeek,
      minute_of_day: minuteOfDay,
      date: dateStr,
    };
  });
  
  const userId = readings[0].user_id;
  const windows = createDefaultMealWindows(userId);
  
  // Apply filtering
  const filtered = filterReadingsByMealWindows(readings, windows);
  
  // Check: no readings after 21:00 (1260 minutes) or before 7:30 (450 minutes)
  const lateNight = filtered.filter(r => r.minute_of_day > 1260); // After 21:00
  const veryEarly = filtered.filter(r => r.minute_of_day < 450); // Before 7:30
  
  console.log(`   ✓ Late night readings (after 21:00): ${lateNight.length}`);
  console.log(`   ✓ Very early readings (before 7:30): ${veryEarly.length}`);
  
  assertEquals(lateNight.length, 0, 'Should have no readings after 21:00');
  assertEquals(veryEarly.length, 0, 'Should have no readings before 7:30');
});

Deno.test('Fixture validation - measurement type distribution', () => {
  console.log('\n📈 Analyzing measurement type distribution...');
  
  const readings: Reading[] = fixtureData.map((r: any) => {
    const utcDate = new Date(r.measured_at);
    const warsawDate = toZonedTime(utcDate, TIMEZONE);
    const dayOfWeek = warsawDate.getDay();
    const minuteOfDay = warsawDate.getHours() * 60 + warsawDate.getMinutes();
    const dateStr = warsawDate.toISOString().split('T')[0];
    
    return {
      user_id: r.user_id,
      measurement_type: r.measurement_type,
      day_of_week: dayOfWeek,
      minute_of_day: minuteOfDay,
      date: dateStr,
    };
  });
  
  const fasting = readings.filter(r => r.measurement_type === 'fasting');
  const afterMeal = readings.filter(r => r.measurement_type === '1hr_after_meal');
  
  console.log(`   Original: ${fasting.length} fasting, ${afterMeal.length} after meal`);
  
  const userId = readings[0].user_id;
  const windows = createDefaultMealWindows(userId);
  const filtered = filterReadingsByMealWindows(readings, windows);
  
  const fastingFiltered = filtered.filter(r => r.measurement_type === 'fasting');
  const afterMealFiltered = filtered.filter(r => r.measurement_type === '1hr_after_meal');
  
  console.log(`   Filtered: ${fastingFiltered.length} fasting, ${afterMealFiltered.length} after meal`);
  
  // Both types should be present
  assert(fastingFiltered.length > 0, 'Should have fasting measurements');
  assert(afterMealFiltered.length > 0, 'Should have after meal measurements');
  
  // Fasting should only be in fasting window (7:30-9:00)
  for (const reading of fastingFiltered) {
    assert(
      reading.minute_of_day >= 450 && reading.minute_of_day <= 540,
      `Fasting reading at ${reading.minute_of_day} should be between 7:30-9:00`
    );
  }
});

Deno.test('Fixture validation - day of week coverage', () => {
  console.log('\n📅 Checking day of week coverage...');
  
  const readings: Reading[] = fixtureData.map((r: any) => {
    const utcDate = new Date(r.measured_at);
    const warsawDate = toZonedTime(utcDate, TIMEZONE);
    const dayOfWeek = warsawDate.getDay();
    const minuteOfDay = warsawDate.getHours() * 60 + warsawDate.getMinutes();
    const dateStr = warsawDate.toISOString().split('T')[0];
    
    return {
      user_id: r.user_id,
      measurement_type: r.measurement_type,
      day_of_week: dayOfWeek,
      minute_of_day: minuteOfDay,
      date: dateStr,
    };
  });
  
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const byDay = new Map<number, number>();
  
  for (const reading of readings) {
    byDay.set(reading.day_of_week, (byDay.get(reading.day_of_week) || 0) + 1);
  }
  
  console.log('   Distribution by day:');
  for (let i = 0; i <= 6; i++) {
    const count = byDay.get(i) || 0;
    console.log(`   ${dayNames[i].padEnd(10)}: ${count} readings`);
  }
  
  // Should have readings for multiple days
  assert(byDay.size >= 3, 'Should have readings from at least 3 different days');
});

console.log('\n✅ All fixture validation tests completed!');

