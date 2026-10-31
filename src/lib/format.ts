export function formatMoney(paise: number): string {
  const amount = BigInt(paise);
  const rupees = amount / 100n;
  const fraction = ((amount < 0n ? -amount : amount) % 100n).toString().padStart(2, "0");
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2,
  }).formatToParts(amount < 0n && rupees === 0n ? -0 : rupees)
    .map(part => part.type === "fraction" ? fraction : part.value).join("");
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export function parseMoney(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : null;
}
