import { describe, expect, it } from 'vitest';
import { addDays, isBoundary, nextCycle } from './dates';
describe('calendar anchored billing',()=>{
  it('clamps monthly dates and restores the original day after February',()=>{
    expect(nextCycle('2024-01-31','2024-01-31','MONTHLY')).toBe('2024-02-29');
    expect(nextCycle('2024-01-31','2024-02-29','MONTHLY')).toBe('2024-03-31');
    expect(nextCycle('2025-01-31','2025-01-31','MONTHLY')).toBe('2025-02-28');
    expect(isBoundary('2024-01-31','2024-03-30','MONTHLY')).toBe(false);
  });
  it('preserves leap-year anchors for annual renewals and calendar days for daily/weekly',()=>{
    expect(nextCycle('2024-02-29','2025-02-28','YEARLY')).toBe('2026-02-28');
    expect(nextCycle('2024-02-29','2027-02-28','YEARLY')).toBe('2028-02-29');
    expect(nextCycle('2026-12-31','2026-12-31','DAILY')).toBe('2027-01-01');
    expect(nextCycle('2026-12-31','2026-12-31','WEEKLY')).toBe('2027-01-07');
    expect(addDays('2026-10-31',14)).toBe('2026-11-14');
  });
});
