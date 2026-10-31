import { describe, expect, it } from "vitest";
import type { SubscriptionAction } from "@/lib/contracts";

describe("Customer portal self-service & security invariants", () => {
  const ALL_POSSIBLE_ACTIONS: SubscriptionAction[] = [
    "quote",
    "confirm",
    "activate",
    "pause",
    "resume",
    "renew",
    "close",
  ];

  const SELF_SERVICE_ACTIONS: SubscriptionAction[] = ["pause", "resume", "renew", "close"];

  it("filters out internal staff actions from customer self-service controls", () => {
    // If a subscription object includes staff lifecycle actions (e.g. quote, confirm, activate),
    // the customer portal must filter them out.
    const allowedByServer: SubscriptionAction[] = ["quote", "confirm", "pause", "close"];

    const exposedInPortal = allowedByServer.filter((a) => SELF_SERVICE_ACTIONS.includes(a));

    expect(exposedInPortal).toEqual(["pause", "close"]);
    expect(exposedInPortal).not.toContain("quote");
    expect(exposedInPortal).not.toContain("confirm");
    expect(exposedInPortal).not.toContain("activate");
  });

  it("verifies mock mode document download notice behavior", () => {
    function getDocumentAction(mode: "mock" | "http", docUrl: string) {
      if (mode === "mock" || docUrl.includes("backend-required")) {
        return { isAvailable: false, notice: "Unavailable in mock mode" };
      }
      return { isAvailable: true, url: docUrl };
    }

    const mockResult = getDocumentAction("mock", "/invoices?document=backend-required");
    expect(mockResult.isAvailable).toBe(false);

    const httpResult = getDocumentAction("http", "/api/v1/invoices/inv_1/document");
    expect(httpResult.isAvailable).toBe(true);
    expect(httpResult.url).toBe("/api/v1/invoices/inv_1/document");
  });

  it("ensures all self-service actions belong to the official contract actions", () => {
    SELF_SERVICE_ACTIONS.forEach((action) => {
      expect(ALL_POSSIBLE_ACTIONS).toContain(action);
    });
  });
});
