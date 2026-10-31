import type { LineInput, Product } from "@/lib/contracts";

/**
 * Deep clones template or subscription line items to ensure mutation isolation.
 * Editing copied lines must never alter the template or other drafts.
 */
export function cloneLines(lines: LineInput[]): LineInput[] {
  return lines.map((line) => ({
    productId: line.productId,
    variantId: line.variantId,
    quantity: Math.max(1, Math.floor(line.quantity || 1)),
    taxIds: Array.isArray(line.taxIds) ? [...line.taxIds] : [],
  }));
}

/**
 * Ensures variant belongs to the selected product. If the product changes or the
 * current variant is invalid for that product, variantId is reset to null.
 */
export function sanitizeLineVariant(line: LineInput, products: Product[]): LineInput {
  const product = products.find((p) => p.id === line.productId);
  if (!product) {
    return { ...line, variantId: null };
  }
  const validVariant = product.variants?.some((v) => v.id === line.variantId);
  return {
    ...line,
    variantId: validVariant ? line.variantId : null,
  };
}

/**
 * Adds a number of days to a YYYY-MM-DD date string.
 */
export function addDays(dateStr: string, days: number): string {
  if (!dateStr || isNaN(days)) return "";
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Formats today's date as YYYY-MM-DD in UTC / local.
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Computes indicative catalog unit price for a line from lookup data.
 * Does not calculate taxes or discounts.
 */
export function getIndicativeUnitPrice(line: LineInput, products: Product[]): number {
  const product = products.find((p) => p.id === line.productId);
  if (!product) return 0;
  const variant = product.variants?.find((v) => v.id === line.variantId);
  return (product.salesPrice ?? 0) + (variant?.priceAdjustment ?? 0);
}

/**
 * Computes indicative catalog subtotal for a line.
 */
export function getIndicativeSubtotal(line: LineInput, products: Product[]): number {
  const unitPrice = getIndicativeUnitPrice(line, products);
  const qty = Math.max(1, Math.floor(line.quantity || 1));
  return unitPrice * qty;
}
