// src/utils/clinicalDayPartition.ts
//
// Partition lab orders by clinical day (Day 1, 2, 3…) relative to scenario start.
// Since 1 tick = 1 sim second, days are 24×3600 ticks apart.

import type { LabOrder } from '../store/usePatientStore';

/** Returns clinical day number (1-based) for a given tick */
export function clinicalDayOf(tickAt: number, scenarioStartTick: number): number {
  const elapsed_s = tickAt - scenarioStartTick;
  return Math.max(1, Math.floor(elapsed_s / (24 * 3600)) + 1);
}

/**
 * Groups lab orders by clinical day.
 * Uses readyAt (result available tick) as the day reference.
 */
export function partitionLabsByDay(
  orders: LabOrder[],
  scenarioStartTick: number,
): Map<number, LabOrder[]> {
  const byDay = new Map<number, LabOrder[]>();
  orders.forEach(o => {
    const day = clinicalDayOf(o.readyAt, scenarioStartTick);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(o);
  });
  return byDay;
}

/** Sort days descending (newest first) */
export function sortedDaysDesc(map: Map<number, unknown[]>): number[] {
  return Array.from(map.keys()).sort((a, b) => b - a);
}
