"use client";

import { Badge, PageHeader, Panel, ResourceState, StarterNote, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const load = () => api.products.list();
export function ProductsPage() {
  const { data, loading, error } = useResource(load);
  return <><PageHeader eyebrow="Catalog / Products" title="Built for every offering." description="Your software, services, and add-ons, ready for the next billing cycle." />
    <Panel title="Product catalog" aside={<small>{data?.total ?? 0} products</small>}>
      <ResourceState loading={loading} error={error} empty={data?.total === 0} />
      {data && <Table headings={["Product", "Type", "Sales price", "Cost price", "Variants", "Status"]}>{data.items.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.notes}</small></td><td><Badge value={product.type} /></td><td>{formatMoney(product.salesPrice)}</td><td>{formatMoney(product.costPrice)}</td><td>{product.variants.length}</td><td><Badge value={product.active ? "ACTIVE" : "CLOSED"} /></td></tr>)}</Table>}
    </Panel><StarterNote owner="Athul">Implement product forms, variant editing, search, pagination, and validation here. Use the shared API adapter.</StarterNote></>;
}
