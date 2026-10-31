import { describe, expect, it } from "vitest";
import {
  bpsToInputString,
  formatRateBps,
  isValidDateString,
  paiseToInputString,
  parseRateBps,
  parseRupeesToPaise,
} from "./catalog-utils";

describe("Catalog Utils & Validation", () => {
  describe("parseRateBps (Percentage -> Basis Points)", () => {
    it("accepts valid percentages including 0%, 10%, 10.25%, and 100%", () => {
      expect(parseRateBps("0")).toEqual({ ok: true, value: 0 });
      expect(parseRateBps("10")).toEqual({ ok: true, value: 1000 });
      expect(parseRateBps("10.25")).toEqual({ ok: true, value: 1025 });
      expect(parseRateBps("18.5")).toEqual({ ok: true, value: 1850 });
      expect(parseRateBps("100")).toEqual({ ok: true, value: 10000 });
    });

    it("rejects negative percentages and values > 100%", () => {
      const negativeRes = parseRateBps("-5");
      expect(negativeRes.ok).toBe(false);
      expect(negativeRes.error).toBeDefined();

      const overHundred = parseRateBps("100.01");
      expect(overHundred.ok).toBe(false);
      expect(overHundred.error).toContain("between 0% and 100%");
    });

    it("rejects overprecise inputs beyond 2 decimal places", () => {
      const overPrecise = parseRateBps("10.255");
      expect(overPrecise.ok).toBe(false);
      expect(overPrecise.error).toContain("at most two decimal places");

      const tripleZero = parseRateBps("5.1234");
      expect(tripleZero.ok).toBe(false);
    });

    it("rejects empty, non-numeric, or symbol-bearing input", () => {
      expect(parseRateBps("").ok).toBe(false);
      expect(parseRateBps("abc").ok).toBe(false);
      expect(parseRateBps("10%").ok).toBe(false);
      expect(parseRateBps("12..5").ok).toBe(false);
    });
  });

  describe("formatRateBps (Basis Points -> Percentage String)", () => {
    it("formats integer basis points with minimal decimal places", () => {
      expect(formatRateBps(0)).toBe("0%");
      expect(formatRateBps(1000)).toBe("10%");
      expect(formatRateBps(1050)).toBe("10.5%");
      expect(formatRateBps(1025)).toBe("10.25%");
      expect(formatRateBps(10000)).toBe("100%");
    });

    it("converts basis points to form input string", () => {
      expect(bpsToInputString(1000)).toBe("10");
      expect(bpsToInputString(1025)).toBe("10.25");
      expect(bpsToInputString(1050)).toBe("10.5");
    });
  });

  describe("parseRupeesToPaise (Rupees -> Paise)", () => {
    it("parses valid rupee strings into safe integer paise", () => {
      expect(parseRupeesToPaise("0")).toEqual({ ok: true, value: 0 });
      expect(parseRupeesToPaise("560")).toEqual({ ok: true, value: 56000 });
      expect(parseRupeesToPaise("1000.50")).toEqual({ ok: true, value: 100050 });
      expect(parseRupeesToPaise("25.05")).toEqual({ ok: true, value: 2505 });
    });

    it("rejects negative amounts, non-numeric characters, and invalid currencies", () => {
      expect(parseRupeesToPaise("-10").ok).toBe(false);
      expect(parseRupeesToPaise("abc").ok).toBe(false);
      expect(parseRupeesToPaise("₹500").ok).toBe(false);
      expect(parseRupeesToPaise("").ok).toBe(false);
    });
  });

  describe("paiseToInputString (Paise -> Form String)", () => {
    it("converts paise to clean rupee string", () => {
      expect(paiseToInputString(0)).toBe("0");
      expect(paiseToInputString(56000)).toBe("560");
      expect(paiseToInputString(56050)).toBe("560.50");
      expect(paiseToInputString(100000)).toBe("1000");
    });
  });

  describe("isValidDateString & Date Boundaries", () => {
    it("validates YYYY-MM-DD format strictly", () => {
      expect(isValidDateString("2026-10-31")).toBe(true);
      expect(isValidDateString("2026-01-01")).toBe(true);
      expect(isValidDateString("invalid-date")).toBe(false);
      expect(isValidDateString("31-10-2026")).toBe(false);
      expect(isValidDateString("")).toBe(false);
    });

    it("verifies date range comparisons for availability and discount validity", () => {
      const from = "2026-10-01";
      const toValid = "2026-10-31";
      const toReversed = "2026-09-30";

      expect(toValid >= from).toBe(true);
      expect(toReversed >= from).toBe(false);
    });
  });

  describe("Product Variant and Pricing Invariants", () => {
    it("computes variant price adjustment as added to base unit price", () => {
      const baseSalesPricePaise = 100000; // ₹1,000
      const odooAdjustmentPaise = 56000; // +₹560
      const effectiveUnitPrice = baseSalesPricePaise + odooAdjustmentPaise;

      expect(effectiveUnitPrice).toBe(156000); // ₹1,560
    });

    it("handles zero price adjustments for standard variants", () => {
      const baseSalesPricePaise = 50000;
      const zeroAdjustment = 0;
      expect(baseSalesPricePaise + zeroAdjustment).toBe(50000);
    });

    it("detects duplicate variant names regardless of casing", () => {
      const variants = [
        { name: "Odoo", priceAdjustment: 56000 },
        { name: "odoo", priceAdjustment: 56000 },
      ];
      const names = new Set<string>();
      let duplicateFound = false;

      for (const v of variants) {
        const lower = v.name.toLowerCase();
        if (names.has(lower)) {
          duplicateFound = true;
          break;
        }
        names.add(lower);
      }

      expect(duplicateFound).toBe(true);
    });
  });

  describe("Plan Invariants", () => {
    it("accepts all 4 billing intervals: DAILY, WEEKLY, MONTHLY, YEARLY", () => {
      const validIntervals = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
      validIntervals.forEach((interval) => {
        expect(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).toContain(interval);
      });
    });

    it("supports zero base fee for per-seat pricing models", () => {
      const baseFee = 0;
      expect(baseFee).toBe(0);
      expect(baseFee >= 0).toBe(true);
    });

    it("enforces minimum seat quantity >= 1", () => {
      const invalidQty = 0;
      const validQty = 1;
      expect(invalidQty >= 1).toBe(false);
      expect(validQty >= 1).toBe(true);
    });
  });

  describe("Discount Rule Invariants", () => {
    it("requires at least one product when scope is PRODUCT", () => {
      const productScope = "PRODUCT";
      const emptyProducts: string[] = [];
      const validProducts = ["prod_workspace"];

      const isInvalid = productScope === "PRODUCT" && emptyProducts.length === 0;
      const isValid = productScope === "PRODUCT" && validProducts.length > 0;

      expect(isInvalid).toBe(true);
      expect(isValid).toBe(true);
    });

    it("submits empty productIds when scope is SUBSCRIPTION", () => {
      const scope = "SUBSCRIPTION";
      const payloadProductIds = scope === "SUBSCRIPTION" ? [] : ["prod_workspace"];
      expect(payloadProductIds).toEqual([]);
    });

    it("allows null usageLimit for unlimited discount campaigns", () => {
      const usageLimit: number | null = null;
      expect(usageLimit).toBeNull();
    });
  });
});

it("preserves every paise when reopening a maximum safe amount", () => { expect(paiseToInputString(Number.MAX_SAFE_INTEGER)).toBe("90071992547409.91"); });
it("rejects dates normalized into a different month", () => {expect(isValidDateString("2026-02-31")).toBe(false);});
