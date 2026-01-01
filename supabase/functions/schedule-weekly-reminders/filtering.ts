/**
 * Filtering logic for meal time validation
 * 
 * This module provides functions to filter glucose readings based on:
 * - User-defined meal time windows
 * - Statistical outlier detection
 * - Minimum spacing enforcement for scheduled reminders
 */

export interface MealWindow {
  id: string;
  user_id: string;
  day_of_week: number;
  measurement_type: 'fasting' | '1hr_after_meal';
  meal_number: number | null;
  time_start: string; // HH:MM:SS format
  time_end: string; // HH:MM:SS format
  created_at: string;
  updated_at: string;
}

export interface Reading {
  user_id: string;
  measurement_type: 'fasting' | '1hr_after_meal';
  day_of_week: number;
  minute_of_day: number;
  date: string;
}

export interface Schedule {
  user_id: string;
  measurement_type: string;
  scheduled_at: string;
  minute_of_day?: number; // Helper field for sorting
  frequency?: number; // Helper field for prioritization
  is_default_reminder?: boolean; // Helper field: identifies gap-filling reminders
}

/**
 * Convert time string (HH:MM:SS) to minutes since midnight
 */
function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Filter readings to only include those within user-defined meal windows
 * 
 * @param readings Array of readings with minute_of_day and day_of_week
 * @param mealWindows Array of meal windows for the user
 * @returns Filtered array of readings that fall within defined windows
 */
export function filterReadingsByMealWindows(
  readings: Reading[],
  mealWindows: MealWindow[]
): Reading[] {
  if (!mealWindows || mealWindows.length === 0) {
    // No meal windows defined - return all readings (backward compatibility)
    return readings;
  }

  return readings.filter((reading) => {
    // Find applicable windows for this reading
    const applicableWindows = mealWindows.filter(
      (window) =>
        window.day_of_week === reading.day_of_week &&
        window.measurement_type === reading.measurement_type
    );

    if (applicableWindows.length === 0) {
      // No window defined for this day/type - exclude the reading
      return false;
    }

    // Check if reading falls within any of the applicable windows
    return applicableWindows.some((window) => {
      const startMinute = timeToMinutes(window.time_start);
      const endMinute = timeToMinutes(window.time_end);
      const readingMinute = reading.minute_of_day;

      return readingMinute >= startMinute && readingMinute <= endMinute;
    });
  });
}

/**
 * Detect and remove statistical outliers from a set of readings
 * 
 * Uses median and standard deviation to identify readings that are
 * significantly different from the cluster pattern.
 * 
 * @param minutesOfDay Array of minute values to analyze
 * @param threshold Number of standard deviations from median (default: 2)
 * @returns Filtered array with outliers removed
 */
export function detectStatisticalOutliers(
  minutesOfDay: number[],
  threshold = 2
): number[] {
  if (minutesOfDay.length < 3) {
    // Need at least 3 readings for meaningful statistics
    return minutesOfDay;
  }

  // Calculate median
  const sorted = [...minutesOfDay].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianValue =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  // Calculate standard deviation
  const squaredDiffs = minutesOfDay.map((m) => Math.pow(m - medianValue, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / minutesOfDay.length;
  const stdDev = Math.sqrt(variance);

  // Filter out outliers (beyond threshold standard deviations)
  return minutesOfDay.filter((m) => {
    const deviations = Math.abs(m - medianValue) / (stdDev || 1); // Avoid division by zero
    return deviations <= threshold;
  });
}

/**
 * Apply outlier detection to readings grouped by day and measurement type
 * 
 * This prevents false positives by analyzing each day/type combination separately.
 * 
 * @param readings Array of readings to filter
 * @param threshold Number of standard deviations (default: 2)
 * @returns Filtered array with outliers removed
 */
export function filterOutliers(
  readings: Reading[],
  threshold = 2
): Reading[] {
  // Group readings by user, day, and type
  const groups = new Map<string, Reading[]>();
  
  for (const reading of readings) {
    const key = `${reading.user_id}|${reading.day_of_week}|${reading.measurement_type}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(reading);
  }

  // Filter outliers within each group
  const filtered: Reading[] = [];
  
  for (const groupReadings of groups.values()) {
    const minutes = groupReadings.map((r) => r.minute_of_day);
    const validMinutes = new Set(detectStatisticalOutliers(minutes, threshold));
    
    // Keep only readings whose minute_of_day is in the valid set
    filtered.push(
      ...groupReadings.filter((r) => validMinutes.has(r.minute_of_day))
    );
  }

  return filtered;
}

/**
 * Enforce minimum spacing between scheduled reminders
 * 
 * Removes schedules that are too close together, keeping the ones
 * with higher frequency/confidence.
 * 
 * @param schedules Array of schedules with scheduled_at timestamps
 * @param minSpacingMinutes Minimum minutes between reminders (default: 90)
 * @returns Filtered array with proper spacing
 */
export function enforceMinimumSpacing(
  schedules: Schedule[],
  minSpacingMinutes = 90
): Schedule[] {
  if (schedules.length === 0) return schedules;

  // Sort by scheduled time
  const sorted = [...schedules].sort((a, b) => {
    return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
  });

  // Track which schedules to keep
  const toKeep: Schedule[] = [];
  let lastKeptMinute: number | null = null;

  for (const schedule of sorted) {
    const scheduleDate = new Date(schedule.scheduled_at);
    const currentMinute = scheduleDate.getHours() * 60 + scheduleDate.getMinutes();

    if (lastKeptMinute === null || currentMinute - lastKeptMinute >= minSpacingMinutes) {
      // Keep this schedule
      toKeep.push(schedule);
      lastKeptMinute = currentMinute;
    } else {
      // Too close to previous - compare frequency/confidence
      const previous = toKeep[toKeep.length - 1];
      const currentFrequency = schedule.frequency || 0;
      const previousFrequency = previous.frequency || 0;

      if (currentFrequency > previousFrequency) {
        // Replace previous with current (higher frequency)
        toKeep[toKeep.length - 1] = schedule;
        lastKeptMinute = currentMinute;
      }
      // Otherwise, keep the previous one
    }
  }

  return toKeep;
}

/**
 * Adjust schedules to fit within meal windows
 * 
 * Schedules that fall OUTSIDE a meal window but are within 30 minutes
 * of a boundary are shifted to the nearest edge (start or end).
 * Schedules too far from any window are discarded.
 * 
 * @param schedules Array of schedules to adjust
 * @param mealWindows Array of meal windows
 * @returns Adjusted schedules that fit within windows
 */
export function adjustSchedulesToMealWindows(
  schedules: Schedule[],
  mealWindows: MealWindow[]
): Schedule[] {
  if (!mealWindows || mealWindows.length === 0) {
    return schedules;
  }

  const adjustedSchedules: Schedule[] = [];
  const PROXIMITY_THRESHOLD = 30; // minutes

  for (const schedule of schedules) {
    const scheduleDate = new Date(schedule.scheduled_at);
    // Use provided minute_of_day if available (already in local time from computeScheduleTimes)
    // Otherwise extract from UTC time
    const dayOfWeek = scheduleDate.getUTCDay();
    const minuteOfDay = schedule.minute_of_day !== undefined 
      ? schedule.minute_of_day 
      : scheduleDate.getUTCHours() * 60 + scheduleDate.getUTCMinutes();

    // Find applicable windows for this schedule
    const applicableWindows = mealWindows.filter(
      (window) =>
        window.day_of_week === dayOfWeek &&
        window.measurement_type === schedule.measurement_type
    );

    if (applicableWindows.length === 0) {
      // No window defined for this day/type - discard
      continue;
    }

    // Check if schedule already falls within a window
    let isInside = false;
    for (const window of applicableWindows) {
      const startMinute = timeToMinutes(window.time_start);
      const endMinute = timeToMinutes(window.time_end);
      
      if (minuteOfDay >= startMinute && minuteOfDay <= endMinute) {
        isInside = true;
        break;
      }
    }

    if (isInside) {
      // Schedule is already inside a window - keep unchanged
      adjustedSchedules.push(schedule);
      continue;
    }

    // Schedule is outside - check if it's close enough to adjust
    let bestWindow: MealWindow | null = null;
    let bestDistance = Infinity;
    let bestAdjustedMinute = minuteOfDay;

    for (const window of applicableWindows) {
      const startMinute = timeToMinutes(window.time_start);
      const endMinute = timeToMinutes(window.time_end);

      // Calculate distance to nearest boundary
      let distance: number;
      let adjustedMinute: number;

      if (minuteOfDay < startMinute) {
        // Schedule is before window
        distance = startMinute - minuteOfDay;
        adjustedMinute = startMinute;
      } else {
        // Schedule is after window
        distance = minuteOfDay - endMinute;
        adjustedMinute = endMinute;
      }

      if (distance < bestDistance) {
        bestDistance = distance;
        bestWindow = window;
        bestAdjustedMinute = adjustedMinute;
      }
    }

    // If within proximity threshold, adjust to nearest boundary
    if (bestWindow && bestDistance <= PROXIMITY_THRESHOLD) {
      // Create adjusted schedule
      const adjustedDate = new Date(scheduleDate);
      adjustedDate.setUTCHours(Math.floor(bestAdjustedMinute / 60));
      adjustedDate.setUTCMinutes(bestAdjustedMinute % 60);
      adjustedDate.setUTCSeconds(0);
      adjustedDate.setUTCMilliseconds(0);

      adjustedSchedules.push({
        ...schedule,
        scheduled_at: adjustedDate.toISOString(),
        minute_of_day: bestAdjustedMinute
      });
    }
    // Otherwise, schedule is too far - discard
  }

  return adjustedSchedules;
}

/**
 * Fill missing meal window reminders with default schedules
 * 
 * For each meal window that has no coverage after adjustment,
 * add a default reminder at window_end - 20 minutes.
 * Only creates reminders for measurement types the user has actually used.
 * 
 * @param adjustedSchedules Schedules after adjustment phase
 * @param mealWindows All meal windows for users
 * @param userMeasurementTypes Map of user_id to Set of measurement types they use
 * @param targetMonday Monday of the week being scheduled (UTC)
 * @param createScheduleDate Function to create date from day_of_week and minute_of_day
 * @returns Array of gap-filling schedules
 */
export function fillMissingMealWindowReminders(
  adjustedSchedules: Schedule[],
  mealWindows: MealWindow[],
  userMeasurementTypes: Map<string, Set<string>>,
  targetMonday: Date,
  createScheduleDate?: (dayOfWeek: number, minuteOfDay: number, targetMonday: Date) => Date
): Schedule[] {
  const gapFillers: Schedule[] = [];
  const DEFAULT_OFFSET_MINUTES = 20; // 20 minutes before window end

  // Default date creator (uses UTC directly - caller should provide timezone-aware version)
  const defaultCreateScheduleDate = (dayOfWeek: number, minuteOfDay: number, targetMonday: Date): Date => {
    const reminderDate = new Date(targetMonday);
    const daysToAdd = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    reminderDate.setDate(reminderDate.getDate() + daysToAdd);
    reminderDate.setUTCHours(Math.floor(minuteOfDay / 60));
    reminderDate.setUTCMinutes(minuteOfDay % 60);
    reminderDate.setUTCSeconds(0);
    reminderDate.setUTCMilliseconds(0);
    return reminderDate;
  };

  const dateCreator = createScheduleDate || defaultCreateScheduleDate;

  // Build coverage map: user_id|day_of_week|measurement_type -> has_coverage
  const coverage = new Map<string, boolean>();
  for (const schedule of adjustedSchedules) {
    const scheduleDate = new Date(schedule.scheduled_at);
    const dayOfWeek = scheduleDate.getUTCDay();
    const key = `${schedule.user_id}|${dayOfWeek}|${schedule.measurement_type}`;
    coverage.set(key, true);
  }

  // Group meal windows by user
  const windowsByUser = new Map<string, MealWindow[]>();
  for (const window of mealWindows) {
    if (!windowsByUser.has(window.user_id)) {
      windowsByUser.set(window.user_id, []);
    }
    windowsByUser.get(window.user_id)!.push(window);
  }

  // For each user, check their meal windows
  for (const [userId, userWindows] of windowsByUser.entries()) {
    const userTypes = userMeasurementTypes.get(userId);
    if (!userTypes) continue; // User has no measurement history

    for (const window of userWindows) {
      // Check if user uses this measurement type
      if (!userTypes.has(window.measurement_type)) {
        continue; // User doesn't use this type - skip
      }

      // Check if window has coverage
      const key = `${userId}|${window.day_of_week}|${window.measurement_type}`;
      if (coverage.has(key)) {
        continue; // Already has coverage
      }

      // Create default reminder: window_end - 20 minutes
      const endMinute = timeToMinutes(window.time_end);
      const reminderMinute = Math.max(
        timeToMinutes(window.time_start),
        endMinute - DEFAULT_OFFSET_MINUTES
      );

      // Use provided date creator to handle timezone properly
      const reminderDate = dateCreator(window.day_of_week, reminderMinute, targetMonday);

      gapFillers.push({
        user_id: userId,
        measurement_type: window.measurement_type,
        scheduled_at: reminderDate.toISOString(),
        minute_of_day: reminderMinute,
        frequency: 0,
        is_default_reminder: true
      });

      // Mark as covered
      coverage.set(key, true);
    }
  }

  return gapFillers;
}

/**
 * @deprecated Use adjustSchedulesToMealWindows instead
 * Validate that scheduled times fall within user's meal windows
 * 
 * @param schedules Array of schedules to validate
 * @param mealWindows Array of meal windows
 * @returns Filtered schedules that fall within valid windows
 */
export function validateSchedulesAgainstWindows(
  schedules: Schedule[],
  mealWindows: MealWindow[]
): Schedule[] {
  if (!mealWindows || mealWindows.length === 0) {
    return schedules;
  }

  return schedules.filter((schedule) => {
    const scheduleDate = new Date(schedule.scheduled_at);
    const dayOfWeek = scheduleDate.getDay();
    const minuteOfDay = scheduleDate.getHours() * 60 + scheduleDate.getMinutes();

    // Find applicable windows
    const applicableWindows = mealWindows.filter(
      (window) =>
        window.day_of_week === dayOfWeek &&
        window.measurement_type === schedule.measurement_type
    );

    if (applicableWindows.length === 0) {
      return false;
    }

    // Check if schedule falls within any window
    return applicableWindows.some((window) => {
      const startMinute = timeToMinutes(window.time_start);
      const endMinute = timeToMinutes(window.time_end);
      return minuteOfDay >= startMinute && minuteOfDay <= endMinute;
    });
  });
}

