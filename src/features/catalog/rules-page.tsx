"use client";

import { Badge, PageHeader, Panel, ResourceState, StarterNote, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const load = async () => ({ taxes: await api.taxes.list(), discounts: await api.discounts.list() });
export function RulesPage() {
  const { data, loading, error } = useResource(load);
  return <><PageHeader eyebrow="Catalog / Rules" title="Every charge, explained." description="Configure tax and discount rules that billing can apply consistently." />
    <ResourceState loading={loading} error={error} />
    {data && <><Panel title="Tax rules"><Table headings={["Name", "Rate", "Status"]}>{data.taxes.items.map((tax) => <tr key={tax.id}><td>{tax.name}</td><td>{tax.rateBps / 100}%</td><td><Badge value={tax.active ? "ACTIVE" : "CLOSED"} /></td></tr>)}</Table></Panel>
    <Panel title="Discount rules"><Table headings={["Rule", "Value", "Scope", "Minimum quantity", "Uses"]}>{data.discounts.items.map((discount) => <tr key={discount.id}><td><strong>{discount.name}</strong></td><td>{discount.kind === "FIXED" ? formatMoney(discount.value) : `${discount.value / 100}%`}</td><td><Badge value={discount.scope} /></td><td>{discount.minimumQuantity}</td><td>{discount.usageCount} / {discount.usageLimit ?? "Unlimited"}</td></tr>)}</Table></Panel></>}
    <StarterNote owner="Athul">Add admin-only tax and discount forms. The fixture tax is illustrative and is not a statutory tax configuration.</StarterNote></>;
}
