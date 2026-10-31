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

/** A request key survives automatic payment retries. Other mutations are not auto-retried. */
export async function request<T>(path: string, method = "GET", body?: unknown, idempotencyKey?: string): Promise<T> {
  const payment = path === "/payments" && method === "POST";
  const key = payment ? idempotencyKey ?? crypto.randomUUID() : undefined;
  const options: RequestInit = {
    method, credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", ...(method === "GET" ? {} : { "X-LoopLedger-CSRF": "1" }), ...(key ? { "Idempotency-Key": key } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
  for (let attempt = 0; attempt < (payment ? 2 : 1); attempt++) {
    let response: Response;
    try { response = await fetch(`/api/v1${path}`, options); }
    catch {
      if (payment && attempt === 0) continue;
      throw new ApiError("NETWORK_ERROR", payment ? "Connection failed. Retry the same payment draft to preserve its request key." : "Connection failed. Please retry.", 0);
    }
    if (payment && attempt === 0 && [502, 503, 504].includes(response.status)) continue;
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as ApiErrorBody | null;
      throw new ApiError(payload?.error?.code ?? "HTTP_ERROR", payload?.error?.message ?? `Request failed (${response.status})`, response.status, payload?.error?.fields);
    }
    return response.json() as Promise<T>;
  }
  throw new ApiError("NETWORK_ERROR", "Payment response is unavailable", 0);
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
  // Retain the key on a rejected input object; a fresh draft gets a new key.
  // Success removes the key so a genuinely new payment can reuse a form object.
  const paymentKeys = new WeakMap<object, string>();
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
      create: async (input) => {
        const key = paymentKeys.get(input) ?? crypto.randomUUID();
        paymentKeys.set(input, key);
        try {
          const payment = await request<Awaited<ReturnType<AppApi["payments"]["create"]>>>("/payments", "POST", input, key);
          paymentKeys.delete(input);
          return payment;
        } catch (error) {
          if (error instanceof ApiError && error.status > 0 && error.status < 500) paymentKeys.delete(input);
          throw error;
        }
      },
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
