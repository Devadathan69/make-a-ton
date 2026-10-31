/** DEVELOPMENT ONLY: tab-local CRUD fixtures; not a billing or authorization implementation. */
import type { AppApi, CrudResource, Entity, ListQuery, Page, Subscription } from "../contracts";
import { ApiError } from "./http";
import * as fixtures from "./fixtures";

function paginate<T extends { id: string }>(records: T[], query: ListQuery = {}): Page<T> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
  const filtered = records.filter((record) => {
    const value = record as T & { status?: string; customerId?: string; createdAt?: string };
    return (!query.search || JSON.stringify(record).toLowerCase().includes(query.search.toLowerCase())) &&
      (!query.status || value.status === query.status) &&
      (!query.customerId || value.customerId === query.customerId) &&
      (!query.from || (value.createdAt ?? "") >= query.from) &&
      (!query.to || (value.createdAt ?? "").slice(0, 10) <= query.to);
  });
  return structuredClone({ items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize });
}

function mockCrud<T extends Entity, I>(records: T[], make: (input: I, existing?: T) => Omit<T, keyof Entity>): CrudResource<T, I> {
  function find(id: string): T {
    const record = records.find((item) => item.id === id);
    if (!record) throw new ApiError("NOT_FOUND", "Record not found", 404);
    return record;
  }
  return {
    list: async (query) => paginate(records, query),
    get: async (id) => structuredClone(find(id)),
    create: async (input) => {
      const timestamp = fixtures.DEMO_NOW;
      const record = { ...make(input), id: crypto.randomUUID(), createdAt: timestamp, updatedAt: timestamp } as T;
      records.unshift(record);
      return structuredClone(record);
    },
    update: async (id, input) => {
      const record = find(id);
      Object.assign(record, make({ ...record, ...input } as I, record), { updatedAt: fixtures.DEMO_NOW });
      return structuredClone(record);
    },
  };
}

function backendRequired(): never {
  throw new ApiError("NOT_IMPLEMENTED", "This workflow needs the backend. Use fixtures to develop the interface; Devadathan implements this action.", 501);
}

export function createMockApi(): AppApi {
  const state = structuredClone({
    products: fixtures.products, plans: fixtures.plans, taxes: fixtures.taxes,
    discounts: fixtures.discounts, customers: fixtures.customers, templates: fixtures.templates,
    subscriptions: fixtures.subscriptions, invoices: fixtures.invoices, payments: fixtures.payments,
  });
  const subscriptionResource = mockCrud<Subscription, Parameters<AppApi["subscriptions"]["create"]>[0]>(state.subscriptions, (input, existing) => ({
    ...input, number: existing?.number ?? `SUB-DEMO-${state.subscriptions.length + 1}`, status: existing?.status ?? "DRAFT", nextBillingDate: existing?.nextBillingDate ?? null,
    customerName: state.customers.find((item) => item.id === input.customerId)?.company ?? "Demo customer",
    planName: state.plans.find((item) => item.id === input.planId)?.name ?? "Demo plan",
    quotationValidUntil: input.quotationValidUntil,
    lines: input.lines.map((line) => {
      const product = state.products.find((item) => item.id === line.productId);
      const variant = product?.variants.find((item) => item.id === line.variantId);
      const unitPrice = (product?.salesPrice ?? 0) + (variant?.priceAdjustment ?? 0);
      return { ...line, id: crypto.randomUUID(), description: product?.name ?? "Demo item", unitPrice, subtotal: unitPrice * line.quantity };
    }), allowedActions: existing?.allowedActions ?? ["quote"],
  }));
  return {
    session: { get: async () => ({ mode: "mock", user: { id: "demo_admin", name: "Demo workspace", email: "demo@example.test", role: "ADMIN", customerId: null } }) },
    products: mockCrud(state.products, (input) => ({ ...input, variants: input.variants.map((variant) => ({ ...variant, id: variant.id ?? crypto.randomUUID() })) })),
    plans: mockCrud(state.plans, (input) => input), taxes: mockCrud(state.taxes, (input) => input),
    discounts: mockCrud(state.discounts, (input) => ({ ...input, usageCount: 0 })),
    customers: mockCrud(state.customers, (input) => input), templates: mockCrud(state.templates, (input) => input),
    subscriptions: { ...subscriptionResource, transition: async () => backendRequired(), preview: async () => backendRequired() },
    invoices: {
      list: async (query) => paginate(state.invoices, query),
      get: async (id) => {
        const invoice = state.invoices.find((item) => item.id === id);
        if (!invoice) throw new ApiError("NOT_FOUND", "Invoice not found", 404);
        return structuredClone(invoice);
      },
      action: async () => backendRequired(), documentUrl: () => "/invoices?document=backend-required",
    },
    payments: { list: async (query) => paginate(state.payments, query), create: async () => backendRequired() },
    reports: { summary: async () => structuredClone(fixtures.summary) },
    portal: {
      subscriptions: async (query) => paginate(state.subscriptions, { ...query, customerId: "customer_maple" }),
      invoices: async (query) => paginate(state.invoices, { ...query, customerId: "customer_maple" }),
      transition: async () => backendRequired(),
    },
    billing: { run: async () => backendRequired(), advanceClock: async () => backendRequired() },
  };
}
