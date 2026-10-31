import type { Customer, DashboardSummary, DiscountRule, Invoice, Payment, Plan, Product, QuoteTemplate, Subscription, TaxRule } from "../contracts";

export const DEMO_NOW = "2026-10-31T09:00:00+05:30";
const timestamps = { createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-31T03:30:00Z" };
export const products: Product[] = [
  { ...timestamps, id: "prod_workspace", name: "Workspace Suite", type: "SOFTWARE", salesPrice: 100000, costPrice: 35000, notes: "Per seat, per billing cycle", active: true,
    variants: [{ id: "variant_odoo", name: "Odoo", priceAdjustment: 56000 }] },
  { ...timestamps, id: "prod_support", name: "Priority Support", type: "ADDON", salesPrice: 250000, costPrice: 80000, notes: "Optional support add-on", active: true, variants: [] },
];
export const plans: Plan[] = [
  { ...timestamps, id: "plan_monthly", name: "Business Monthly", price: 0, interval: "MONTHLY", minimumQuantity: 1, availableFrom: "2026-01-01", availableUntil: null, autoClose: true, allowEarlyClose: true, allowPause: true, allowRenew: true, active: true, taxIds: [] },
  { ...timestamps, id: "plan_yearly", name: "Enterprise Yearly", price: 500000, interval: "YEARLY", minimumQuantity: 5, availableFrom: "2026-01-01", availableUntil: null, autoClose: true, allowEarlyClose: false, allowPause: false, allowRenew: true, active: true, taxIds: [] },
];
export const taxes: TaxRule[] = [
  { ...timestamps, id: "tax_demo", name: "Demo tax (illustrative)", rateBps: 1000, active: true },
];
export const discounts: DiscountRule[] = [
  { ...timestamps, id: "discount_seats", name: "Team launch offer", kind: "PERCENTAGE", value: 1000, scope: "SUBSCRIPTION", productIds: [], minimumPurchase: 0, minimumQuantity: 10, startsAt: "2026-10-01", endsAt: "2026-10-31", usageLimit: 100, usageCount: 1, active: true },
];
export const customers: Customer[] = [
  { ...timestamps, id: "customer_maple", name: "Ananya Rao", email: "ananya@example.test", company: "Maple Studio", address: "Kochi, Kerala" },
  { ...timestamps, id: "customer_north", name: "Arjun Menon", email: "arjun@example.test", company: "Northstar Labs", address: "Kochi, Kerala" },
];
export const templates: QuoteTemplate[] = [
  { ...timestamps, id: "template_team", name: "10-seat team starter", planId: "plan_monthly", validDays: 14,
    lines: [{ productId: "prod_workspace", variantId: null, quantity: 10, taxIds: ["tax_demo"] }] },
];
export const subscriptions: Subscription[] = [
  { ...timestamps, id: "sub_maple", number: "SUB-2026-0001", customerId: "customer_maple", customerName: "Maple Studio", planId: "plan_monthly", planName: "Business Monthly", status: "ACTIVE", startDate: "2026-10-01", expiryDate: "2027-10-01", nextBillingDate: "2026-11-01", paymentTermsDays: 14, quotationValidUntil: "2026-10-14",
    lines: [{ id: "sl_1", productId: "prod_workspace", variantId: null, quantity: 10, taxIds: ["tax_demo"], description: "Workspace Suite", unitPrice: 100000, subtotal: 1000000 }], allowedActions: ["pause", "close"] },
  { ...timestamps, id: "sub_north", number: "SUB-2026-0002", customerId: "customer_north", customerName: "Northstar Labs", planId: "plan_yearly", planName: "Enterprise Yearly", status: "QUOTATION", startDate: "2026-11-01", expiryDate: "2027-11-01", nextBillingDate: null, paymentTermsDays: 30, quotationValidUntil: "2026-11-10",
    lines: [{ id: "sl_2", productId: "prod_workspace", variantId: "variant_odoo", quantity: 20, taxIds: [], description: "Workspace Suite / Odoo", unitPrice: 156000, subtotal: 3120000 }], allowedActions: ["confirm"] },
];
export const invoices: Invoice[] = [
  { ...timestamps, id: "inv_maple", number: "INV-2026-0001", subscriptionId: "sub_maple", customerId: "customer_maple", customerName: "Maple Studio", status: "CONFIRMED", issuedAt: "2026-10-01", dueAt: "2026-10-15", periodStart: "2026-10-01", periodEnd: "2026-11-01", subtotal: 1000000, discount: 100000, tax: 90000, total: 990000, paid: 400000, balance: 590000, overdue: true,
    lines: [{ id: "il_1", description: "Workspace Suite · 10 seats", quantity: 10, unitPrice: 100000, subtotal: 1000000, discount: 100000, tax: 90000, total: 990000 }],
    explanation: ["10 seats × ₹1,000.00 = ₹10,000.00", "Team launch offer: 10% off = −₹1,000.00", "Illustrative demo tax: 10% of ₹9,000.00 = ₹900.00", "Payment recorded: ₹4,000.00. Remaining balance: ₹5,900.00."] },
];
export const payments: Payment[] = [
  { ...timestamps, id: "payment_maple", invoiceId: "inv_maple", invoiceNumber: "INV-2026-0001", customerName: "Maple Studio", amount: 400000, method: "BANK_TRANSFER", paidAt: "2026-10-12", note: "First instalment · demo record" },
];
export const summary: DashboardSummary = {
  activeSubscriptions: 1, mrr: 900000, billed: 990000, collected: 400000, outstanding: 590000, overdue: 590000, asOf: DEMO_NOW,
  monthly: [{ month: "Oct 2026", billed: 990000, collected: 400000 }],
  attention: [{ id: "attention_invoice", kind: "OVERDUE", title: "Maple Studio has ₹5,900 outstanding", href: "/invoices" }],
};
