import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert";
import {
  determineLookbackStrategy,
  LookbackStrategy,
} from "./adaptive-lookback.ts";

// Mock Supabase client
const mockSupabase = (scheduledWeeks: number) => ({
  rpc: (_name: string, _args: any) =>
    Promise.resolve({ data: scheduledWeeks, error: null }),
});

Deno.test("determineLookbackStrategy - bootstrap mode", async () => {
  const strategy = await determineLookbackStrategy(
    mockSupabase(0) as any,
    "user-123",
    new Date("2026-01-05"),
  );

  assertEquals(strategy.mode, "bootstrap");
  assertEquals(strategy.scheduledWeeksCount, 0);
  assertEquals(strategy.useScheduledWeeks, false);
  assertEquals(strategy.useHistoricalWeeks, true);
  assertEquals(strategy.historicalLookbackDays, 60);
  assertEquals(strategy.historicalWeight, 1.0);
});

Deno.test("determineLookbackStrategy - transition mode (1 week)", async () => {
  const strategy = await determineLookbackStrategy(
    mockSupabase(1) as any,
    "user-123",
    new Date("2026-01-05"),
  );

  assertEquals(strategy.mode, "transition");
  assertEquals(strategy.scheduledWeeksCount, 1);
  assertEquals(strategy.useScheduledWeeks, true);
  assertEquals(strategy.useHistoricalWeeks, true);
  // Weight: 0.7
  assertAlmostEquals(strategy.historicalWeight, 0.7);
});

Deno.test("determineLookbackStrategy - transition mode (3 weeks)", async () => {
  const strategy = await determineLookbackStrategy(
    mockSupabase(3) as any,
    "user-123",
    new Date("2026-01-05"),
  );

  assertEquals(strategy.mode, "transition");
  // Weight: 0.1
  assertAlmostEquals(strategy.historicalWeight, 0.1);
});

Deno.test("determineLookbackStrategy - mature mode", async () => {
  const strategy = await determineLookbackStrategy(
    mockSupabase(4) as any,
    "user-123",
    new Date("2026-01-05"),
  );

  assertEquals(strategy.mode, "mature");
  assertEquals(strategy.scheduledWeeksCount, 4);
  assertEquals(strategy.useScheduledWeeks, true);
  assertEquals(strategy.useHistoricalWeeks, false);
  assertEquals(strategy.historicalLookbackDays, 0);
  assertEquals(strategy.historicalWeight, 0);
});
