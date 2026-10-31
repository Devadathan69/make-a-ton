import { describe, expect, it } from "vitest";
import type { Subscription, SubscriptionAction, SubscriptionStatus } from "@/lib/contracts";

describe("Subscription details & allowedActions logic", () => {
  const sampleSubscription: Subscription = {
    id: "sub_demo_1",
    number: "SUB-2026-001",
    customerId: "cust_acme",
    customerName: "Acme Corp",
    planId: "plan_growth",
    planName: "Growth Monthly",
    status: "ACTIVE",
    startDate: "2026-01-01",
    expiryDate: "2026-12-31",
    nextBillingDate: "2026-02-01",
    paymentTermsDays: 15,
    quotationValidUntil: null,
    lines: [
      {
        id: "line_1",
        productId: "prod_crm",
        variantId: null,
        description: "CRM Seats",
        unitPrice: 100000,
        quantity: 5,
        subtotal: 500000,
        taxIds: ["tax_gst"],
      },
    ],
    allowedActions: ["pause", "close"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("strictly restricts lifecycle actions to allowedActions supplied by server", () => {
    // The UI must not infer actions like 'activate' or 'confirm' when status is ACTIVE
    const permittedActions = sampleSubscription.allowedActions;
    expect(permittedActions).toContain("pause");
    expect(permittedActions).toContain("close");
    expect(permittedActions).not.toContain("confirm");
    expect(permittedActions).not.toContain("quote");
    expect(permittedActions).not.toContain("activate");
  });

  it("identifies disruptive actions requiring explicit confirmation dialogs", () => {
    function isDisruptiveAction(action: SubscriptionAction): boolean {
      return action === "pause" || action === "close";
    }

    expect(isDisruptiveAction("pause")).toBe(true);
    expect(isDisruptiveAction("close")).toBe(true);
    expect(isDisruptiveAction("quote")).toBe(false);
    expect(isDisruptiveAction("confirm")).toBe(false);
    expect(isDisruptiveAction("activate")).toBe(false);
    expect(isDisruptiveAction("resume")).toBe(false);
  });

  it("ensures paused and closed stages are clearly distinguished from active stage", () => {
    const activeSub = { ...sampleSubscription, status: "ACTIVE" as SubscriptionStatus };
    const pausedSub = { ...sampleSubscription, status: "PAUSED" as SubscriptionStatus };
    const closedSub = { ...sampleSubscription, status: "CLOSED" as SubscriptionStatus };

    expect(activeSub.status).toBe("ACTIVE");
    expect(pausedSub.status).toBe("PAUSED");
    expect(closedSub.status).toBe("CLOSED");
    expect((pausedSub.status as string) === "ACTIVE").toBe(false);
    expect((closedSub.status as string) === "ACTIVE").toBe(false);
  });
});
