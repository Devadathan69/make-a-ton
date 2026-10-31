"use client";

import { Badge, PageHeader, Panel, ResourceState, StarterNote, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const load = () => api.subscriptions.list();
export function SubscriptionsPage() {
  const { data, loading, error } = useResource(load);
  return <><PageHeader eyebrow="Workspace / Subscriptions" title="Every subscription, in sync." description="Follow the full journey from first draft to the final billing cycle." />
    <Panel title="Subscriptions"><ResourceState loading={loading} error={error} empty={data?.total === 0} />{data && <Table headings={["Subscription", "Customer", "Plan", "Next billing", "Stage"]}>{data.items.map((subscription) => <tr key={subscription.id}><td><strong>{subscription.number}</strong></td><td>{subscription.customerName}</td><td>{subscription.planName}</td><td>{subscription.nextBillingDate ? formatDate(subscription.nextBillingDate) : "Not scheduled"}</td><td><Badge value={subscription.status} /></td></tr>)}</Table>}</Panel>
    <StarterNote owner="Hannath">Add detail panels and policy-aware lifecycle actions from allowedActions. Devadathan owns transition validation and billing.</StarterNote></>;
}
