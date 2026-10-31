import { describe, expect, it } from "vitest";
import { createMockApi } from "./mock";

describe("independent feature development", () => {
  it("supports catalog changes in an isolated adapter", async () => {
    const first = createMockApi();
    const second = createMockApi();
    const product = await first.products.create({ name: "New add-on", type: "ADDON", salesPrice: 99900, costPrice: 20000, notes: "", active: true, variants: [] });
    expect((await first.products.list({ search: "New add-on" })).total).toBe(1);
    expect((await second.products.list({ search: "New add-on" })).total).toBe(0);
    expect((await first.products.get(product.id)).salesPrice).toBe(99900);
  });
  it("does not let a portal filter select a different fixture customer", async () => {
    const result = await createMockApi().portal.subscriptions({ customerId: "customer_north" });
    expect(result.items.every((item) => item.customerId === "customer_maple")).toBe(true);
  });
  it("makes unfinished business workflows explicit instead of pretending they succeeded", async () => {
    await expect(createMockApi().billing.run()).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
    await expect(createMockApi().payments.create({ invoiceId: "inv_maple", amount: 100, method: "CASH", paidAt: "2026-10-31", note: "" })).rejects.toMatchObject({ code: "NOT_IMPLEMENTED" });
  });
  it("does not leak mutable fixture references to consumers", async () => {
    const adapter = createMockApi();
    const result = await adapter.products.list();
    result.items[0].name = "Changed outside adapter";
    expect((await adapter.products.get(result.items[0].id)).name).not.toBe("Changed outside adapter");
  });
  it("keeps variant IDs and subscription display fields intact after fixture edits", async () => {
    const adapter = createMockApi();
    const product = await adapter.products.update("prod_workspace", { notes: "Updated note" });
    expect(product.variants[0].id).toBe("variant_odoo");
    const subscription = await adapter.subscriptions.update("sub_maple", { paymentTermsDays: 30 });
    expect(subscription.number).toBe("SUB-2026-0001");
    expect(subscription.status).toBe("ACTIVE");
    expect(subscription.lines[0].unitPrice).toBe(100000);
  });
});
