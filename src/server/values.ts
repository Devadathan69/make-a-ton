import { z } from "zod";

export function safeInteger(value: string | number | bigint): number {
  if (typeof value === "string" && !/^-?\d+$/.test(value)) throw new Error("Invalid database integer");
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error("Amount exceeds safe integer range");
  return result;
}
export const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, "Use a valid YYYY-MM-DD date");
export const taxSnapshot = z.array(z.object({ id: z.string(), name: z.string(), rateBps: z.number().int().min(0).max(10000) }));
export const planSnapshot = z.object({
  name: z.string(), price: money, interval: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  autoClose: z.boolean(), allowEarlyClose: z.boolean(), allowPause: z.boolean(), allowRenew: z.boolean(),
  taxes: taxSnapshot,
});
export const lineInput = z.object({ productId: z.string().min(1), variantId: z.string().nullable(), quantity: z.number().int().min(1).max(1000000), taxIds: z.array(z.string()).max(20).refine(v => new Set(v).size === v.length, "Remove duplicate taxes") });
export const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(), status: z.string().max(30).optional(),
  customerId: z.string().optional(), from: dateOnly.optional(), to: dateOnly.optional(),
});
export function timestamps(row: { created_at: Date; updated_at: Date }) {
  return { createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}
