import { parseMoney } from "@/lib/format";

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

/**
 * Parses a percentage string (e.g., "10", "10.25", "0", "100") into integer basis points (1000, 1025, 0, 10000).
 * Rejects invalid format, negative values, values > 100%, and more than 2 decimal places.
 */
export function parseRateBps(input: string): ValidationResult<number> {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Percentage is required." };
  }
  // At most 2 decimal places, non-negative numbers
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return {
      ok: false,
      error: "Enter a valid percentage with at most two decimal places (e.g. 10 or 10.25).",
    };
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(bps)) {
    return { ok: false, error: "Value is out of safe range." };
  }
  if (bps < 0 || bps > 10000) {
    return { ok: false, error: "Percentage must be between 0% and 100%." };
  }
  return { ok: true, value: bps };
}

/** Formats integer basis points to a clean percentage string (e.g., 1025 -> "10.25%", 1000 -> "10%"). */
export function formatRateBps(bps: number): string {
  const pct = bps / 100;
  if (bps % 100 === 0) return `${pct.toFixed(0)}%`;
  if (bps % 10 === 0) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

/** Converts basis points to a number string suitable for form inputs (e.g. 1025 -> "10.25"). */
export function bpsToInputString(bps: number): string {
  const pct = bps / 100;
  if (bps % 100 === 0) return pct.toFixed(0);
  if (bps % 10 === 0) return pct.toFixed(1);
  return pct.toFixed(2);
}

/**
 * Parses user input in Rupees into safe integer paise.
 * Rejects negative amounts or invalid currency formats.
 */
export function parseRupeesToPaise(input: string): ValidationResult<number> {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Amount is required." };
  }
  const paise = parseMoney(trimmed);
  if (paise === null || paise < 0) {
    return {
      ok: false,
      error: "Enter a valid non-negative amount in Rupees (e.g. 250 or 599.50).",
    };
  }
  return { ok: true, value: paise };
}

/** Converts integer paise to a plain rupee string for form inputs (e.g. 56000 -> "560", 56050 -> "560.50"). */
export function paiseToInputString(paise: number): string {
  const amount = BigInt(paise);
  const fraction = (amount % 100n).toString().padStart(2, "0");
  return `${amount / 100n}${fraction === "00" ? "" : `.${fraction}`}`;
}

export const formatPaiseToRupees = paiseToInputString;

/** Validates YYYY-MM-DD date string. */
export function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
}
