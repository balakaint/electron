// The date arithmetic behind PLAN's month / year tiles (ScopeStats).
// Pure, so horizons.test.ts can pin the edge cases — leap years, the last
// day of a month, the last weeks of a year — without a clock.

export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

// 1 on 1 January. Built from local calendar dates, not a millisecond
// difference, so a daylight-saving change can't shift it by one.
export function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getFullYear(), 0, 1);
  const day = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day - start) / 86400000) + 1;
}

export interface Horizons {
  monthDays: number;
  dayOfMonth: number;
  monthLeft: number;
  yearDays: number;
  yearDay: number;
  yearLeft: number;
  // Months left in the year, rounded to the nearest half, or null once
  // fewer than one and a half remain — past that point the tile counts
  // days instead, because the count matters.
  monthsLeftHalves: number | null;
}

export function horizons(now: Date): Horizons {
  const y = now.getFullYear();
  const monthDays = daysInMonth(y, now.getMonth());
  const monthLeft = monthDays - now.getDate();
  const yearDays = dayOfYear(new Date(y, 11, 31));
  const yearDay = dayOfYear(now);
  const monthsLeft = 11 - now.getMonth() + monthLeft / monthDays;
  return {
    monthDays,
    dayOfMonth: now.getDate(),
    monthLeft,
    yearDays,
    yearDay,
    yearLeft: yearDays - yearDay,
    monthsLeftHalves: monthsLeft < 1.5 ? null : Math.round(monthsLeft * 2) / 2,
  };
}
