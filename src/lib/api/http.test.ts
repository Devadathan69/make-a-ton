import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpApi } from "./http";

afterEach(() => vi.unstubAllGlobals());

describe("frontend/backend integration boundary", () => {
  it("encodes filters and returns the agreed pagination DTO directly", async () => {
    const payload = { items: [], total: 0, page: 2, pageSize: 20 };
    const fetcher = vi.fn().mockResolvedValue(Response.json(payload));
    vi.stubGlobal("fetch", fetcher);
    expect(await createHttpApi().products.list({ search: "A & B", page: 2 })).toEqual(payload);
    const [url, options] = fetcher.mock.calls[0];
    const query = new URL(url, "http://test.local").searchParams;
    expect(query.get("search")).toBe("A & B");
    expect(query.get("page")).toBe("2");
    expect(options.credentials).toBe("same-origin");
  });
  it("preserves server validation codes and field errors for feature forms", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: "VALIDATION_ERROR", message: "Fix the amount", fields: { amount: "Exceeds balance" } } }, { status: 422 })));
    await expect(createHttpApi().payments.create({ invoiceId: "inv_1", amount: 100, method: "CASH", paidAt: "2026-10-31", note: "" })).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 422, fields: { amount: "Exceeds balance" } });
  });
  it("fails visibly on unavailable endpoints rather than returning fixture data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not implemented", { status: 503 })));
    await expect(createHttpApi().reports.summary()).rejects.toMatchObject({ code: "HTTP_ERROR", status: 503 });
  });
});
