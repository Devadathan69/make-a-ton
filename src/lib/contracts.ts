/** Shared integration contract. Devadathan owns changes; all feature UIs consume it. */
export type Role = "ADMIN" | "STAFF" | "CUSTOMER";
export type BillingInterval = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type SubscriptionStatus = "DRAFT" | "QUOTATION" | "CONFIRMED" | "ACTIVE" | "PAUSED" | "CLOSED";
export type SubscriptionAction = "quote" | "confirm" | "activate" | "pause" | "resume" | "renew" | "close";
export type InvoiceStatus = "DRAFT" | "CONFIRMED" | "PAID" | "CANCELLED";
export type InvoiceAction = "confirm" | "cancel" | "send";
export type PaymentMethod = "BANK_TRANSFER" | "CARD" | "UPI" | "CASH" | "OTHER";
/** All money uses integer paise (INR); quantities are positive integers; dates are ISO strings. */
export interface Entity { id: string; createdAt: string; updatedAt: string }
export interface User { id: string; name: string; email: string; role: Role; customerId: string | null }
export interface Session { user: User; mode: "mock" | "http" }
export interface ProductVariant { id: string; name: string; priceAdjustment: number }
export interface Product extends Entity {
  name: string; type: "SOFTWARE" | "SERVICE" | "ADDON"; salesPrice: number;
  costPrice: number; notes: string; active: boolean; variants: ProductVariant[];
}
export type ProductInput = Omit<Product, keyof Entity | "variants"> & {
  variants: { id?: string; name: string; priceAdjustment: number }[];
};
export interface Plan extends Entity {
  name: string; price: number; interval: BillingInterval; minimumQuantity: number;
  availableFrom: string; availableUntil: string | null; autoClose: boolean;
  allowEarlyClose: boolean; allowPause: boolean; allowRenew: boolean; active: boolean; taxIds: string[];
}
export type PlanInput = Omit<Plan, keyof Entity>;
export interface TaxRule extends Entity { name: string; rateBps: number; active: boolean }
export type TaxInput = Omit<TaxRule, keyof Entity>;
export interface DiscountRule extends Entity {
  name: string; kind: "FIXED" | "PERCENTAGE"; value: number;
  scope: "PRODUCT" | "SUBSCRIPTION"; productIds: string[]; minimumPurchase: number;
  minimumQuantity: number; startsAt: string; endsAt: string | null;
  usageLimit: number | null; usageCount: number; active: boolean;
}
/** Percentage discount value is basis points: 1000 = 10%. Fixed value is paise. */
export type DiscountInput = Omit<DiscountRule, keyof Entity | "usageCount">;
export interface Customer extends Entity { name: string; email: string; company: string; address: string }
export type CustomerInput = Omit<Customer, keyof Entity>;
export interface LineInput {
  productId: string; variantId: string | null; quantity: number; taxIds: string[];
}
export interface QuoteTemplate extends Entity { name: string; planId: string; validDays: number; lines: LineInput[] }
export type TemplateInput = Omit<QuoteTemplate, keyof Entity>;
export interface SubscriptionLine extends LineInput {
  id: string; description: string; unitPrice: number; subtotal: number;
}
export interface Subscription extends Entity {
  number: string; customerId: string; customerName: string; planId: string; planName: string;
  status: SubscriptionStatus; startDate: string; expiryDate: string | null;
  nextBillingDate: string | null; paymentTermsDays: number; quotationValidUntil: string | null;
  lines: SubscriptionLine[]; allowedActions: SubscriptionAction[];
}
export interface SubscriptionInput {
  customerId: string; planId: string; templateId?: string; startDate: string;
  expiryDate: string | null; paymentTermsDays: number; quotationValidUntil: string | null;
  lines: LineInput[];
}
export interface InvoiceLine {
  id: string; description: string; quantity: number; unitPrice: number;
  subtotal: number; discount: number; tax: number; total: number;
}
export interface Invoice extends Entity {
  number: string; subscriptionId: string; customerId: string; customerName: string;
  status: InvoiceStatus; issuedAt: string; dueAt: string; periodStart: string; periodEnd: string;
  subtotal: number; discount: number; tax: number; total: number; paid: number;
  balance: number; overdue: boolean; lines: InvoiceLine[]; explanation: string[];
}
export interface Payment extends Entity {
  invoiceId: string; invoiceNumber: string; customerName: string;
  amount: number; method: PaymentMethod; paidAt: string; note: string;
}
export interface PaymentInput { invoiceId: string; amount: number; method: PaymentMethod; paidAt: string; note: string }
export interface ListQuery {
  page?: number; pageSize?: number; search?: string; status?: string;
  customerId?: string; from?: string; to?: string;
}
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export interface ReportQuery { from?: string; to?: string }
export interface DashboardSummary {
  activeSubscriptions: number; mrr: number; billed: number; collected: number;
  outstanding: number; overdue: number; asOf: string;
  monthly: { month: string; billed: number; collected: number }[];
  attention: { id: string; kind: "OVERDUE" | "EXPIRING" | "BILLING_FAILURE"; title: string; href: string }[];
}
export interface BillingRunResult {
  runId: string; generated: number; skipped: number; failed: number; asOf: string;
}
export interface CrudResource<T, I> {
  list(query?: ListQuery): Promise<Page<T>>;
  get(id: string): Promise<T>;
  create(input: I): Promise<T>;
  update(id: string, input: Partial<I>): Promise<T>;
}
export interface AppApi {
  session: { get(): Promise<Session> };
  products: CrudResource<Product, ProductInput>;
  plans: CrudResource<Plan, PlanInput>;
  taxes: CrudResource<TaxRule, TaxInput>;
  discounts: CrudResource<DiscountRule, DiscountInput>;
  customers: CrudResource<Customer, CustomerInput>;
  templates: CrudResource<QuoteTemplate, TemplateInput>;
  subscriptions: CrudResource<Subscription, SubscriptionInput> & {
    transition(id: string, action: SubscriptionAction): Promise<Subscription>;
    preview(id: string): Promise<Invoice>;
  };
  invoices: {
    list(query?: ListQuery): Promise<Page<Invoice>>; get(id: string): Promise<Invoice>;
    action(id: string, action: InvoiceAction): Promise<Invoice>;
    documentUrl(id: string): string;
  };
  payments: { list(query?: ListQuery): Promise<Page<Payment>>; create(input: PaymentInput): Promise<Payment> };
  reports: { summary(query?: ReportQuery): Promise<DashboardSummary> };
  portal: {
    subscriptions(query?: ListQuery): Promise<Page<Subscription>>;
    invoices(query?: ListQuery): Promise<Page<Invoice>>;
    transition(id: string, action: SubscriptionAction): Promise<Subscription>;
  };
  billing: { run(): Promise<BillingRunResult>; advanceClock(to: string): Promise<BillingRunResult> };
}
export interface ApiErrorBody { error: { code: string; message: string; fields?: Record<string, string> } }
