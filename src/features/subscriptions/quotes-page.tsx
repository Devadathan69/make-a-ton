"use client";

import { Badge, PageHeader, Panel, ResourceState, StarterNote, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const load = () => api.subscriptions.list({ status: "QUOTATION" });
export function QuotesPage() {
  const { data, loading, error } = useResource(load);
  return <><PageHeader eyebrow="Workspace / Quotations" title="From a conversation to a contract." description="Start with a template, assemble product lines, and send a clear offer." />
    <Panel title="Open quotations"><ResourceState loading={loading} error={error} empty={data?.total === 0} />{data && <Table headings={["Reference", "Customer", "Plan", "Valid until", "Stage"]}>{data.items.map((subscription) => <tr key={subscription.id}><td><strong>{subscription.number}</strong></td><td>{subscription.customerName}</td><td>{subscription.planName}</td><td>{subscription.quotationValidUntil ? formatDate(subscription.quotationValidUntil) : "—"}</td><td><Badge value={subscription.status} /></td></tr>)}</Table>}</Panel>
    <StarterNote owner="Hannath">Build the template selector, quotation editor, and stage actions. Quotations are subscriptions in the QUOTATION stage, not a separate entity.</StarterNote></>;
}
