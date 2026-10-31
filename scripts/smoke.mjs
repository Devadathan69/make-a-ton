const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const routes = ["/dashboard", "/catalog/products", "/catalog/plans", "/catalog/rules", "/customers", "/quotes", "/subscriptions", "/invoices", "/payments", "/portal", "/login", "/api/health"];
for (const route of routes) {
  const response = await fetch(`${base}${route}`);
  if (!response.ok) throw new Error(`${route}: ${response.status}`);
  console.log(`OK ${route}`);
}
