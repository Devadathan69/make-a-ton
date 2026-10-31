import type { ApiErrorBody, AppApi, CrudResource, ListQuery } from "../contracts";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
  }
}

function queryString(query?: object): string {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") values.set(key, String(value));
  }
  return values.size ? `?${values}` : "";
}

export async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method, credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ApiErrorBody | null;
    throw new ApiError(payload?.error?.code ?? "HTTP_ERROR", payload?.error?.message ?? `Request failed (${response.status})`, response.status, payload?.error?.fields);
  }
  return response.json() as Promise<T>;
}

function crud<T, I>(path: string): CrudResource<T, I> {
  return {
    list: (query) => request(`${path}${queryString(query)}`),
    get: (id) => request(`${path}/${encodeURIComponent(id)}`),
    create: (input) => request(path, "POST", input),
    update: (id, input) => request(`${path}/${encodeURIComponent(id)}`, "PATCH", input),
  };
}

export function createHttpApi(): AppApi {
  const listInvoices = (query?: ListQuery) => request<Awaited<ReturnType<AppApi["invoices"]["list"]>>>(`/invoices${queryString(query)}`);
  return {
    session: { get: () => request("/session") },
    products: crud("/products"), plans: crud("/plans"), taxes: crud("/taxes"),
    discounts: crud("/discounts"), customers: crud("/customers"), templates: crud("/templates"),
    subscriptions: {
      ...crud("/subscriptions"),
      transition: (id, action) => request(`/subscriptions/${encodeURIComponent(id)}/transition`, "POST", { action }),
      preview: (id) => request(`/subscriptions/${encodeURIComponent(id)}/preview`),
    },
    invoices: {
      list: listInvoices, get: (id) => request(`/invoices/${encodeURIComponent(id)}`),
      action: (id, action) => request(`/invoices/${encodeURIComponent(id)}/actions`, "POST", { action }),
      documentUrl: (id) => `/api/v1/invoices/${encodeURIComponent(id)}/document`,
    },
    payments: {
      list: (query) => request(`/payments${queryString(query)}`),
      create: (input) => request("/payments", "POST", input),
    },
    reports: { summary: (query) => request(`/reports/summary${queryString(query)}`) },
    portal: {
      subscriptions: (query) => request(`/portal/subscriptions${queryString(query)}`),
      invoices: (query) => request(`/portal/invoices${queryString(query)}`),
      transition: (id, action) => request(`/portal/subscriptions/${encodeURIComponent(id)}/transition`, "POST", { action }),
    },
    billing: {
      run: () => request("/billing/run", "POST"),
      advanceClock: (to) => request("/demo/clock", "POST", { to }),
    },
  };
}
