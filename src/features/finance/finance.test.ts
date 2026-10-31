import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney } from "@/lib/format";
import type { Invoice } from "@/lib/contracts";

/** Helper function implementing the business rules for payment validation in Finance */
function validatePaymentAmount(amountStr: string, currentBalancePaise: number): {
  valid: boolean;
  paise: number | null;
  error?: string;
} {
  const paise = parseMoney(amountStr);
  if (paise === null || paise <= 0) {
    return { valid: false, paise: null, error: "Please enter a valid positive payment amount." };
  }
  if (paise > currentBalancePaise) {
    return {
      valid: false,
      paise,
      error: `Payment amount (${formatMoney(paise)}) exceeds current balance (${formatMoney(currentBalancePaise)}).`,
    };
  }
  return { valid: true, paise };
}

/** Helper evaluating invoice lifecycle action availability according to business rules */
function getInvoiceActionPermissions(invoice: Pick<Invoice, "status" | "paid" | "balance" | "total">) {
  const canConfirm = invoice.status === "DRAFT";
  const canCancel =
    (invoice.status === "DRAFT" || invoice.status === "CONFIRMED") && invoice.paid === 0;
  const canSend = invoice.status === "CONFIRMED" || invoice.status === "PAID";
  const isPartiallyPaid = invoice.status === "CONFIRMED" && invoice.paid > 0 && invoice.balance > 0;
  const canRecordPayment = invoice.status === "CONFIRMED" && invoice.balance > 0;

  return { canConfirm, canCancel, canSend, isPartiallyPaid, canRecordPayment };
}

/** Helper evaluating date range order */
function validateDateRange(from: string, to: string): { valid: boolean; error?: string } {
  if (from && to && from > to) {
    return { valid: false, error: "From date cannot be later than To date." };
  }
  return { valid: true };
}

describe("Finance: Payment Amount Validation & Parsing", () => {
  it("converts valid rupee strings to exact integer paise", () => {
    expect(parseMoney("4000")).toBe(400000);
    expect(parseMoney("4000.00")).toBe(400000);
    expect(parseMoney("5900.50")).toBe(590050);
    expect(parseMoney("0.05")).toBe(5);
  });

  it("rejects invalid, negative, zero, or overprecision amounts", () => {
    expect(parseMoney("0")).toBe(0); // 0 is non-positive
    expect(validatePaymentAmount("0", 500000).valid).toBe(false);
    expect(validatePaymentAmount("-500", 500000).valid).toBe(false);
    expect(validatePaymentAmount("abc", 500000).valid).toBe(false);
    expect(validatePaymentAmount("100.999", 500000).valid).toBe(false); // >2 decimals
    expect(validatePaymentAmount("", 500000).valid).toBe(false);
  });

  it("blocks overpayment exceeding remaining invoice balance", () => {
    const remainingBalance = 590000; // ₹5,900.00
    // Try to pay ₹6,000 against ₹5,900
    const overpayment = validatePaymentAmount("6000.00", remainingBalance);
    expect(overpayment.valid).toBe(false);
    expect(overpayment.error).toContain("exceeds current balance");

    // Pay exact remaining balance ₹5,900
    const exact = validatePaymentAmount("5900.00", remainingBalance);
    expect(exact.valid).toBe(true);
    expect(exact.paise).toBe(590000);

    // Pay partial amount ₹4,000
    const partial = validatePaymentAmount("4000.00", remainingBalance);
    expect(partial.valid).toBe(true);
    expect(partial.paise).toBe(400000);
  });
});

describe("Finance: Invoice Lifecycle & Derived Badges", () => {
  it("allows confirm on DRAFT only", () => {
    const draft: Pick<Invoice, "status" | "paid" | "balance" | "total"> = {
      status: "DRAFT",
      paid: 0,
      balance: 990000,
      total: 990000,
    };
    const permissions = getInvoiceActionPermissions(draft);
    expect(permissions.canConfirm).toBe(true);
    expect(permissions.canCancel).toBe(true);
    expect(permissions.canSend).toBe(false);
    expect(permissions.canRecordPayment).toBe(false);
  });

  it("identifies partially paid confirmed invoice and disallows cancellation", () => {
    const partiallyPaid: Pick<Invoice, "status" | "paid" | "balance" | "total"> = {
      status: "CONFIRMED",
      paid: 400000, // ₹4,000
      balance: 590000, // ₹5,900
      total: 990000, // ₹9,900
    };
    const permissions = getInvoiceActionPermissions(partiallyPaid);
    expect(permissions.canConfirm).toBe(false);
    expect(permissions.isPartiallyPaid).toBe(true);
    expect(permissions.canCancel).toBe(false); // Unpaid only!
    expect(permissions.canSend).toBe(true);
    expect(permissions.canRecordPayment).toBe(true);
  });

  it("allows cancel on unpaid confirmed invoice", () => {
    const unpaidConfirmed: Pick<Invoice, "status" | "paid" | "balance" | "total"> = {
      status: "CONFIRMED",
      paid: 0,
      balance: 990000,
      total: 990000,
    };
    const permissions = getInvoiceActionPermissions(unpaidConfirmed);
    expect(permissions.canCancel).toBe(true);
    expect(permissions.isPartiallyPaid).toBe(false);
    expect(permissions.canSend).toBe(true);
  });

  it("handles fully paid settled invoice correctly", () => {
    const fullyPaid: Pick<Invoice, "status" | "paid" | "balance" | "total"> = {
      status: "PAID",
      paid: 990000,
      balance: 0,
      total: 990000,
    };
    const permissions = getInvoiceActionPermissions(fullyPaid);
    expect(permissions.canConfirm).toBe(false);
    expect(permissions.canCancel).toBe(false);
    expect(permissions.canRecordPayment).toBe(false);
    expect(permissions.isPartiallyPaid).toBe(false);
    expect(permissions.canSend).toBe(true);
  });

  it("disallows all action operations on CANCELLED invoice", () => {
    const cancelled: Pick<Invoice, "status" | "paid" | "balance" | "total"> = {
      status: "CANCELLED",
      paid: 0,
      balance: 0,
      total: 990000,
    };
    const permissions = getInvoiceActionPermissions(cancelled);
    expect(permissions.canConfirm).toBe(false);
    expect(permissions.canCancel).toBe(false);
    expect(permissions.canSend).toBe(false);
    expect(permissions.canRecordPayment).toBe(false);
  });
});

describe("Finance: Date Range Validation", () => {
  it("accepts valid chronological dates", () => {
    expect(validateDateRange("2026-10-01", "2026-10-31").valid).toBe(true);
    expect(validateDateRange("2026-10-15", "2026-10-15").valid).toBe(true);
    expect(validateDateRange("", "2026-10-31").valid).toBe(true);
    expect(validateDateRange("2026-10-01", "").valid).toBe(true);
  });

  it("rejects inverted date ranges", () => {
    const result = validateDateRange("2026-10-31", "2026-10-01");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("From date cannot be later than To date.");
  });
});

describe("Finance: Common Chart Scaling Calculations", () => {
  it("determines unified maximum and computes proportional widths", () => {
    const monthlyData = [
      { month: "Sep 2026", billed: 500000, collected: 250000 },
      { month: "Oct 2026", billed: 1000000, collected: 800000 },
    ];

    const chartMax = Math.max(1, ...monthlyData.flatMap((m) => [m.billed, m.collected]));
    expect(chartMax).toBe(1000000); // Max value across all months and metrics

    // October billed is 100% of max
    const octBilledWidth = Math.round((monthlyData[1].billed / chartMax) * 100);
    expect(octBilledWidth).toBe(100);

    // September collected is 25% of max
    const sepCollectedWidth = Math.round((monthlyData[0].collected / chartMax) * 100);
    expect(sepCollectedWidth).toBe(25);
  });
});
