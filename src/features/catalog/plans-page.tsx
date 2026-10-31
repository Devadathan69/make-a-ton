"use client";

import { Badge, PageHeader, Panel, ResourceState, StarterNote, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const load = () => api.plans.list();
export function PlansPage() {
  const { data, loading, error } = useResource(load);
  return <><PageHeader eyebrow="Catalog / Plans" title="A plan for every cycle." description="Set recurring base fees, billing intervals, and subscription policies." />
    <Panel title="Subscription plans"><ResourceState loading={loading} error={error} empty={data?.total === 0} />{data && <Table headings={["Plan", "Base fee / cycle", "Interval", "Minimum seats", "Pause", "Renew"]}>{data.items.map((plan) => <tr key={plan.id}><td><strong>{plan.name}</strong></td><td>{formatMoney(plan.price)}</td><td><Badge value={plan.interval} /></td><td>{plan.minimumQuantity}</td><td>{plan.allowPause ? "Allowed" : "Restricted"}</td><td>{plan.allowRenew ? "Allowed" : "Restricted"}</td></tr>)}</Table>}</Panel>
    <StarterNote owner="Athul">Implement plan creation and editing, availability dates, and policy switches. The base fee is charged once per cycle in addition to product lines.</StarterNote></>;
}
