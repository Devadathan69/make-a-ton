import { describe, expect, it } from 'vitest';
import { dateOnly, listQuery, planSnapshot, safeInteger, taxSnapshot } from './values';
describe('database boundary', () => {
  it('rejects unsafe or fractional BIGINT mappings', () => {
    expect(safeInteger('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
    for (const n of ['9007199254740992','1.5',NaN]) expect(()=>safeInteger(n)).toThrow();
  });
  it('validates calendar dates without UTC/local conversion', () => {
    expect(dateOnly.parse('2024-02-29')).toBe('2024-02-29');
    expect(dateOnly.safeParse('2026-02-29').success).toBe(false);
    expect(dateOnly.safeParse('2026-10-31T00:00:00Z').success).toBe(false);
  });
  it('bounds pagination and validates persisted economic snapshots', () => {
    expect(listQuery.parse({})).toEqual({page:1,pageSize:20});
    expect(listQuery.safeParse({pageSize:101}).success).toBe(false);
    expect(taxSnapshot.safeParse([{id:'x',name:'Invalid',rateBps:10001}]).success).toBe(false);
    expect(planSnapshot.safeParse({price:0}).success).toBe(false);
  });
});
