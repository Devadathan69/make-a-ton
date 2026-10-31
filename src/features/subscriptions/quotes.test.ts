import { describe, expect, it } from "vitest";
import type { LineInput, Product, QuoteTemplate } from "@/lib/contracts";
import { addDays, cloneLines, getIndicativeSubtotal, getIndicativeUnitPrice, sanitizeLineVariant } from "./quote-helpers";

describe("Quotation templates & composer helper logic", () => {
  const sampleProducts: Product[] = [
    {
      id: "prod_crm",
      name: "CRM Pro",
      type: "SOFTWARE",
      salesPrice: 200000, // ₹2,000.00
      costPrice: 50000,
      notes: "Main CRM suite",
      active: true,
      variants: [
        { id: "var_enterprise", name: "Enterprise Edition", priceAdjustment: 50000 }, // +₹500.00
        { id: "var_cloud", name: "Dedicated Cloud", priceAdjustment: 100000 },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "prod_support",
      name: "24/7 Dedicated Support",
      type: "SERVICE",
      salesPrice: 150000,
      costPrice: 80000,
      notes: "Priority SLAs",
      active: true,
      variants: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  it("ensures template-copy isolation: draft edits do not mutate original template", () => {
    const originalTemplate: QuoteTemplate = {
      id: "tmpl_1",
      name: "Standard Onboarding",
      planId: "plan_growth",
      validDays: 30,
      lines: [
        { productId: "prod_crm", variantId: "var_enterprise", quantity: 5, taxIds: ["tax_gst"] },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    // Copy template lines into draft
    const draftLines = cloneLines(originalTemplate.lines);

    // Modify draft lines
    draftLines[0].quantity = 99;
    draftLines[0].taxIds.push("tax_cess");
    draftLines[0].variantId = null;

    // Verify original template is untouched
    expect(originalTemplate.lines[0].quantity).toBe(5);
    expect(originalTemplate.lines[0].taxIds).toEqual(["tax_gst"]);
    expect(originalTemplate.lines[0].variantId).toBe("var_enterprise");
  });

  it("resets incompatible variant selection when product changes", () => {
    // Line initially with CRM Pro Enterprise variant
    const lineWithVariant: LineInput = {
      productId: "prod_crm",
      variantId: "var_enterprise",
      quantity: 2,
      taxIds: [],
    };

    // Sanitize with same product - variant should be preserved
    const preserved = sanitizeLineVariant(lineWithVariant, sampleProducts);
    expect(preserved.variantId).toBe("var_enterprise");

    // Change product to prod_support (which has no variants)
    const lineChangedProduct: LineInput = {
      ...lineWithVariant,
      productId: "prod_support",
    };
    const sanitized = sanitizeLineVariant(lineChangedProduct, sampleProducts);

    // Incompatible variant MUST be reset to null
    expect(sanitized.variantId).toBeNull();
  });

  it("calculates indicative catalog unit prices and line subtotals accurately", () => {
    const lineWithVariant: LineInput = {
      productId: "prod_crm",
      variantId: "var_enterprise",
      quantity: 3,
      taxIds: [],
    };

    // Sales price (200000) + variant (50000) = 250000 paise (₹2,500.00)
    const unitPrice = getIndicativeUnitPrice(lineWithVariant, sampleProducts);
    expect(unitPrice).toBe(250000);

    // 250000 * 3 = 750000 paise
    const subtotal = getIndicativeSubtotal(lineWithVariant, sampleProducts);
    expect(subtotal).toBe(750000);
  });

  it("correctly adds validity days to date strings in YYYY-MM-DD format", () => {
    expect(addDays("2026-01-15", 30)).toBe("2026-02-14");
    expect(addDays("2026-10-31", 15)).toBe("2026-11-15");
  });
});
