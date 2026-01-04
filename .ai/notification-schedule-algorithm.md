# Complete Feature Specification: Adaptive Notification Scheduling

**Version**: 2.0\
**Status**: Ready for Implementation\
**Last Updated**: January 2026

---

## Table of Contents

1. [Overview & Goals](#overview--goals)
2. [User Journey & Data Evolution](#user-journey--data-evolution)
3. [Algorithm Specification](#algorithm-specification)
4. [Database Schema Changes](#database-schema-changes)
5. [Data Structures](#data-structures)
6. [Implementation Details](#implementation-details)
7. [Testing Strategy](#testing-strategy)

---

## Overview & Goals

### Problem Statement

Users with gestational diabetes often forget to measure glucose levels, and when
they do remember, measurements are taken late (2-3hrs post-meal instead of 1hr).
This creates noisy historical data that makes schedule generation unreliable.

### Solution Approach

**Adaptive Coverage-First Scheduling** that:

1. **Guarantees coverage**: Creates schedules for all defined meal windows
2. **Learns from quality data**: Prioritizes readings from scheduled weeks over
   noisy history
3. **Evolves over time**: Transitions from bootstrap → transition → mature modes
4. **Maintains quality**: Falls back gracefully when data is insufficient

### Success Metrics

- **Coverage**: 100% of meal windows get schedules (up to 42 per user)
- **Confidence**: Average confidence increases from 0.5 → 0.8+ over 4 weeks
- **Compliance**: Users measure within ±30min of scheduled time
- **Adaptive**: Users in mature mode rely on scheduled data only

---

## User Journey & Data Evolution

### Stage 1: Bootstrap (Week 0)

**Characteristics**:

- No scheduled weeks exist
- Only noisy historical data available (60-day lookback)
- Most schedules use window defaults

**Data Quality**:

```
Historical data: 100% (weight: 1.0)
Scheduled data: 0%
Average confidence: 0.5-0.6
```

**Outcome**: 42 schedules created (mostly defaults)

---

### Stage 2: Transition (Weeks 1-3)

**Characteristics**:

- 1-3 scheduled weeks completed
- Clean data from scheduled weeks mixed with historical
- Gradually reducing reliance on noisy history

**Data Quality**:

```
Week 1: Historical 93% (weight: 0.7) + Scheduled 7% (weight: 1.0)
Week 2: Historical 86% (weight: 0.4) + Scheduled 14% (weight: 1.0)
Week 3: Historical 79% (weight: 0.1) + Scheduled 21% (weight: 1.0)
Average confidence: 0.6-0.75
```

**Outcome**: 42 schedules with improving accuracy

---

### Stage 3: Mature (Week 4+)

**Characteristics**:

- 4+ scheduled weeks completed
- Only uses clean scheduled data
- Historical data ignored

**Data Quality**:

```
Historical data: 0% (disabled)
Scheduled data: 100% (weight: 1.0)
Average confidence: 0.8-1.0
```

**Outcome**: 42 schedules with high accuracy

---

### Edge Case: Non-Compliant User (Mature with gaps)

**Characteristics**:

- Has 4+ scheduled weeks but stopped measuring
- Scheduled week data is sparse (<3 readings per window)

**Adaptive Response**:

```
Detect: readings.length < 3 in mature mode
Action: Temporarily re-enable historical lookback (30 days)
Fallback: Window defaults if still insufficient
Confidence: Reduced to 0.5-0.6
```

---

## Algorithm Specification

### High-Level Flow

```
FOR each eligible user:
  │
  ├─ Fetch meal windows
  │    └─ IF no windows → SKIP user (no schedules)
  │
  ├─ Determine lookback strategy (bootstrap/transition/mature)
  │    ├─ Count scheduled weeks
  │    ├─ Calculate historical weight decay
  │    └─ Set data source priorities
  │
  ├─ Fetch readings with quality context
  │    ├─ Scheduled weeks (high quality, weight 1.0)
  │    └─ Historical data (decaying weight)
  │
  ├─ FOR each meal window:
  │    ├─ Extract window-specific readings
  │    ├─ Remove outliers (per window)
  │    ├─ Apply quality weights
  │    │
  │    ├─ IF weighted readings ≥3:
  │    │    ├─ Calculate weighted median
  │    │    ├─ Schedule: median + 5 min
  │    │    ├─ Confidence: 0.7 + quality bonus
  │    │    └─ Source: 'history'
  │    │
  │    └─ ELSE:
  │         ├─ Calculate default timing:
  │         │    - Fasting: (start + end) / 2
  │         │    - Post-meal: end - 30 min
  │         ├─ Schedule: default
  │         ├─ Confidence: 0.5
  │         └─ Source: 'default_window'
  │
  ├─ Enforce 90-min spacing (prioritize by confidence)
  │
  └─ OUTPUT: up to 42 schedules
```

---

### Lookback Strategy Logic

```typescript
async function determineLookbackStrategy(
  userId: string,
  targetMonday: Date,
): Promise<LookbackStrategy> {
  // Count completed scheduled weeks (before target week)
  const scheduledWeeks = await countScheduledWeeks(userId, targetMonday);

  if (scheduledWeeks === 0) {
    // Bootstrap: First-time user
    return {
      mode: "bootstrap",
      scheduledWeeksCount: 0,
      useScheduledWeeks: false,
      useHistoricalWeeks: true,
      historicalLookbackDays: 60,
      historicalWeight: 1.0,
    };
  }

  if (scheduledWeeks < 4) {
    // Transition: Building quality dataset
    // Weight decay: Week 1 = 0.7, Week 2 = 0.4, Week 3 = 0.1
    const historicalWeight = Math.max(0.1, 1.0 - (scheduledWeeks * 0.3));
    const historicalDays = 60 - (scheduledWeeks * 7);

    return {
      mode: "transition",
      scheduledWeeksCount: scheduledWeeks,
      useScheduledWeeks: true,
      useHistoricalWeeks: true,
      historicalLookbackDays: historicalDays,
      historicalWeight: historicalWeight,
    };
  }

  // Mature: Use scheduled data only
  return {
    mode: "mature",
    scheduledWeeksCount: scheduledWeeks,
    useScheduledWeeks: true,
    useHistoricalWeeks: false,
    historicalLookbackDays: 0,
    historicalWeight: 0,
  };
}
```

---

### Weighted Median Calculation

```typescript
function calculateWeightedMedian(
  readings: ReadingWithWeight[],
): number {
  if (readings.length === 0) return 0;

  // Sort by minute_of_day
  const sorted = [...readings].sort((a, b) =>
    a.minute_of_day - b.minute_of_day
  );

  // Calculate total weight
  const totalWeight = sorted.reduce((sum, r) => sum + r.weight, 0);

  // Find weighted median position
  const targetWeight = totalWeight / 2;
  let cumulativeWeight = 0;

  for (const reading of sorted) {
    cumulativeWeight += reading.weight;
    if (cumulativeWeight >= targetWeight) {
      return reading.minute_of_day;
    }
  }

  // Fallback (should not reach)
  return sorted[Math.floor(sorted.length / 2)].minute_of_day;
}
```

---

### Enhanced Confidence Scoring

```typescript
function calculateConfidence(
  readings: ReadingWithWeight[],
  strategy: LookbackStrategy,
): number {
  if (readings.length < 3) return 0.5; // Default fallback

  // Separate by data quality
  const scheduledReadings = readings.filter((r) =>
    r.data_quality === "scheduled_week"
  );
  const historicalReadings = readings.filter((r) =>
    r.data_quality === "historical"
  );

  // Base confidence
  let confidence = 0.7;

  // Bonus: Scheduled data count (high quality)
  const scheduledBonus = Math.min(0.2, scheduledReadings.length * 0.04);
  confidence += scheduledBonus;

  // Bonus: Historical data count (weighted by strategy)
  const historicalBonus = Math.min(
    0.1,
    historicalReadings.length * 0.02 * strategy.historicalWeight,
  );
  confidence += historicalBonus;

  // Bonus: Data quality ratio
  const scheduledRatio = scheduledReadings.length / readings.length;
  confidence += scheduledRatio * 0.1;

  return Math.min(1.0, confidence);
}
```

---

### Adaptive Fallback Logic

```typescript
async function applyAdaptiveFallback(
  readings: ReadingWithWeight[],
  strategy: LookbackStrategy,
  userId: string,
  window: MealWindow,
): Promise<ReadingWithWeight[]> {
  // Check if mature mode has insufficient data
  if (strategy.mode === "mature" && readings.length < 3) {
    console.log(
      `User ${userId} in mature mode with insufficient data, applying fallback`,
    );

    // Re-enable recent historical data (30 days)
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - 30);

    const fallbackReadings = await fetchHistoricalReadings(
      userId,
      window,
      lookbackDate,
    );

    // Add with reduced weight
    const weightedFallback = fallbackReadings.map((r) => ({
      ...r,
      data_quality: "historical",
      weight: 0.5,
    }));

    readings.push(...weightedFallback);
  }

  return readings;
}
```

---

## Database Schema Changes

### 1. Add Reading Context Column

```sql
-- Tag readings by quality
ALTER TABLE glucose_readings 
ADD COLUMN reading_context text DEFAULT 'organic';

COMMENT ON COLUMN glucose_readings.reading_context IS 
  'Context: organic (unprompted), scheduled_prompt (within 30min of schedule), manual_entry';

-- Index for quick filtering
CREATE INDEX idx_readings_context 
  ON glucose_readings(user_id, reading_context, measured_at);
```

---

### 2. Auto-Tag Scheduled Readings (Trigger)

```sql
CREATE OR REPLACE FUNCTION tag_scheduled_reading()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if reading occurred within 30min of a scheduled notification
  IF EXISTS (
    SELECT 1 
    FROM notification_schedules ns
    WHERE ns.user_id = NEW.user_id
      AND ns.measurement_type = NEW.measurement_type
      AND ns.scheduled_at BETWEEN 
          NEW.measured_at - INTERVAL '30 minutes'
          AND NEW.measured_at + INTERVAL '30 minutes'
      -- Only check current/future schedules
      AND ns.scheduled_at >= CURRENT_DATE - INTERVAL '7 days'
  ) THEN
    NEW.reading_context = 'scheduled_prompt';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tag_scheduled_reading
  BEFORE INSERT ON glucose_readings
  FOR EACH ROW
  EXECUTE FUNCTION tag_scheduled_reading();
```

---

### 3. Add Metadata to Schedules Table

```sql
-- Optional: Store schedule metadata for analytics
ALTER TABLE notification_schedules 
ADD COLUMN meal_window_id uuid REFERENCES user_meal_windows(id),
ADD COLUMN confidence numeric(3,2),
ADD COLUMN source text,
ADD COLUMN readings_count integer;

COMMENT ON COLUMN notification_schedules.confidence IS 
  'Confidence score 0.0-1.0 indicating schedule quality';
  
COMMENT ON COLUMN notification_schedules.source IS 
  'Source: history (data-driven) or default_window (fallback)';
```

---

### 4. Helper Function: Count Scheduled Weeks

```sql
CREATE OR REPLACE FUNCTION count_scheduled_weeks(
  p_user_id uuid,
  p_target_monday date
) RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  -- Count distinct weeks where user had schedules created
  SELECT COUNT(DISTINCT nsr.run_week_start_date)
  INTO v_count
  FROM notification_schedule_runs nsr
  WHERE nsr.status = 'completed'
    AND nsr.run_week_start_date < p_target_monday
    AND EXISTS (
      SELECT 1 
      FROM notification_schedules ns
      WHERE ns.user_id = p_user_id
        AND ns.scheduled_at >= nsr.run_week_start_date
        AND ns.scheduled_at < nsr.run_week_start_date + INTERVAL '7 days'
    );
    
  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql;
```

---

## Data Structures

### LookbackStrategy

```typescript
interface LookbackStrategy {
  mode: "bootstrap" | "transition" | "mature";
  scheduledWeeksCount: number;
  useScheduledWeeks: boolean;
  useHistoricalWeeks: boolean;
  historicalLookbackDays: number;
  historicalWeight: number; // 0.0-1.0
}
```

### ReadingWithWeight

```typescript
interface ReadingWithWeight {
  user_id: string;
  measurement_type: string;
  day_of_week: number;
  minute_of_day: number;
  date: string;
  data_quality: "scheduled_week" | "historical";
  weight: number; // Applied during median calculation
}
```

### ScheduleCandidate

```typescript
interface ScheduleCandidate {
  user_id: string;
  meal_window_id: string;
  measurement_type: string;
  day_of_week: number;
  minute_of_day: number;
  scheduled_at: string; // ISO timestamp

  // Metadata
  confidence: number;
  source: "history" | "default_window";
  readings_count?: number;
  data_quality_breakdown?: {
    scheduled: number;
    historical: number;
  };
}
```

### Schedule (DB Output)

```typescript
interface Schedule {
  user_id: string;
  measurement_type: string;
  scheduled_at: string;

  // Optional metadata
  meal_window_id?: string;
  confidence?: number;
  source?: string;
  readings_count?: number;
}
```

---

## Implementation Details

### Phase 1: Database Setup

**Tasks**:

1. Run schema migrations:
   - Add `reading_context` column
   - Create trigger `tag_scheduled_reading`
   - Add optional metadata columns to `notification_schedules`
   - Create helper function `count_scheduled_weeks`

2. Backfill existing data (optional):
   ```sql
   -- Tag historical readings that matched past schedules
   UPDATE glucose_readings gr
   SET reading_context = 'scheduled_prompt'
   WHERE EXISTS (
     SELECT 1 FROM notification_schedules ns
     WHERE ns.user_id = gr.user_id
       AND ns.measurement_type = gr.measurement_type
       AND ns.scheduled_at BETWEEN 
           gr.measured_at - INTERVAL '30 minutes'
           AND gr.measured_at + INTERVAL '30 minutes'
   );
   ```

**Deliverables**:

- Migration scripts
- Rollback scripts
- Database documentation

---

### Phase 2: Core Algorithm Refactor

**Files to Create**:

```
supabase/functions/schedule-weekly-reminders/
├── filtering.ts (existing, minor updates)
├── adaptive-lookback.ts (new)
├── weighted-statistics.ts (new)
└── schedule-generator.ts (refactored from main)
```

**Key Functions**:

#### `adaptive-lookback.ts`

```typescript
export async function determineLookbackStrategy(
  supabase: SupabaseClient,
  userId: string,
  targetMonday: Date,
): Promise<LookbackStrategy>;

export async function fetchReadingsWithContext(
  supabase: SupabaseClient,
  userId: string,
  strategy: LookbackStrategy,
  targetMonday: Date,
): Promise<ReadingWithWeight[]>;

export async function applyAdaptiveFallback(
  supabase: SupabaseClient,
  readings: ReadingWithWeight[],
  strategy: LookbackStrategy,
  userId: string,
  window: MealWindow,
): Promise<ReadingWithWeight[]>;
```

#### `weighted-statistics.ts`

```typescript
export function calculateWeightedMedian(
  readings: ReadingWithWeight[],
): number;

export function calculateConfidence(
  readings: ReadingWithWeight[],
  strategy: LookbackStrategy,
): number;

export function filterOutliersByWeight(
  readings: ReadingWithWeight[],
): ReadingWithWeight[];
```

#### `schedule-generator.ts`

```typescript
export async function generateScheduleForWindow(
  supabase: SupabaseClient,
  window: MealWindow,
  readings: ReadingWithWeight[],
  strategy: LookbackStrategy,
  targetMonday: Date,
): Promise<ScheduleCandidate>;

export function enforceSpacingByConfidence(
  candidates: ScheduleCandidate[],
  minSpacingMinutes: number,
): ScheduleCandidate[];
```

**Deliverables**:

- Refactored modular code
- Unit tests for each module
- Integration tests

---

### Phase 3: Main Edge Function Update

**Update `index.ts`**:

```typescript
import {
  determineLookbackStrategy,
  fetchReadingsWithContext,
} from "./adaptive-lookback.ts";
import {
  enforceSpacingByConfidence,
  generateScheduleForWindow,
} from "./schedule-generator.ts";

Deno.serve(async (req) => {
  // ... existing auth/setup

  for (const user of eligibleUsers) {
    // 1. Determine strategy
    const strategy = await determineLookbackStrategy(
      supabase,
      user.user_id,
      targetMonday,
    );

    // 2. Fetch weighted readings
    const readings = await fetchReadingsWithContext(
      supabase,
      user.user_id,
      strategy,
      targetMonday,
    );

    // 3. Generate per-window schedules
    const candidates: ScheduleCandidate[] = [];
    for (const window of userMealWindows) {
      const candidate = await generateScheduleForWindow(
        supabase,
        window,
        readings,
        strategy,
        targetMonday,
      );
      candidates.push(candidate);
    }

    // 4. Resolve conflicts
    const finalSchedules = enforceSpacingByConfidence(candidates, 90);

    // 5. Insert to DB
    await insertSchedules(supabase, finalSchedules);
  }

  // ... return response
});
```

**Deliverables**:

- Updated edge function
- End-to-end test with sample users
- Performance benchmarks

---

## Testing Strategy

### Unit Tests

**`adaptive-lookback.test.ts`**:

```typescript
describe("determineLookbackStrategy", () => {
  it("should use bootstrap mode for new users", async () => {
    const strategy = await determineLookbackStrategy(
      supabase,
      newUserId,
      targetMonday,
    );
    expect(strategy.mode).toBe("bootstrap");
    expect(strategy.historicalLookbackDays).toBe(60);
    expect(strategy.historicalWeight).toBe(1.0);
  });

  it("should transition to mature mode after 4 weeks", async () => {
    const strategy = await determineLookbackStrategy(
      supabase,
      matureUserId,
      targetMonday,
    );
    expect(strategy.mode).toBe("mature");
    expect(strategy.useHistoricalWeeks).toBe(false);
  });

  it("should decay historical weight in transition mode", async () => {
    const strategy = await determineLookbackStrategy(
      supabase,
      transitionUserId,
      targetMonday,
    );
    expect(strategy.mode).toBe("transition");
    expect(strategy.historicalWeight).toBeLessThan(1.0);
  });
});
```

**`weighted-statistics.test.ts`**:

```typescript
describe("calculateWeightedMedian", () => {
  it("should weight scheduled readings higher", () => {
    const readings = [
      { minute_of_day: 420, weight: 0.4 }, // Historical: 7:00am
      { minute_of_day: 480, weight: 1.0 }, // Scheduled: 8:00am
      { minute_of_day: 540, weight: 1.0 }, // Scheduled: 9:00am
    ];
    const median = calculateWeightedMedian(readings);
    expect(median).toBeCloseTo(480, 0); // Should favor 8:00am
  });
});
```

---

### Integration Tests

**Test Scenarios**:

1. **Bootstrap User**:
   - Input: New user, 40 noisy readings, all meal windows
   - Expected: 42 schedules, ~70% defaults, confidence 0.5-0.6

2. **Transition User (Week 2)**:
   - Input: 2 scheduled weeks, 100 total readings
   - Expected: 42 schedules, ~40% history-based, confidence 0.65-0.75

3. **Mature User**:
   - Input: 6 scheduled weeks, 250 scheduled readings
   - Expected: 42 schedules, ~90% history-based, confidence 0.85-1.0

4. **Non-Compliant Mature User**:
   - Input: 5 scheduled weeks but only 20 readings last 2 weeks
   - Expected: Adaptive fallback triggered, confidence 0.5-0.6

5. **Partial Windows User**:
   - Input: Only Mon-Fri meal windows defined
   - Expected: 30 schedules (5 days × 6 types), confidence varies

---

### Load Testing

```bash
# Simulate 1000 users with mixed profiles
deno test --allow-net --allow-env load-test.ts

# Verify:
# - Execution time < 60 seconds for all users
# - Memory usage < 512MB
# - Database connection pool stable
```
