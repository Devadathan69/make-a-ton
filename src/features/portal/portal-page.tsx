"use client";

import { Badge, PageHeader, Panel, ResourceState, StarterNote } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const load = async () => ({ subscriptions: await api.portal.subscriptions(), invoices: await api.portal.invoices() });
export function PortalPage() {
  const { data, loading, error } = useResource(load);
  return <><PageHeader eyebrow="Customer portal / Preview" title="Your workspace. Your subscriptions." description="A customer view of Maple Studio's sample subscriptions and invoices." />
    <ResourceState loading={loading} error={error} />
    {data && <div className="portal-grid"><Panel title="My subscriptions">{data.subscriptions.items.map((subscription) => <div className="record-card" key={subscription.id}><h3>{subscription.planName}</h3><p>{subscription.number}<br />Next billing: {subscription.nextBillingDate ? formatDate(subscription.nextBillingDate) : "Not scheduled"}</p><Badge value={subscription.status} /></div>)}</Panel>
    <Panel title="My invoices">{data.invoices.items.map((invoice) => <div className="record-card" key={invoice.id}><h3>{invoice.number}</h3><p>Total: {formatMoney(invoice.total)}<br />Outstanding: {formatMoney(invoice.balance)}</p><Badge value={invoice.status} /></div>)}</Panel></div>}
    <StarterNote owner="Hannath">Implement customer self-service and downloads against portal endpoints. This fixture preview has no real login or access protection yet.</StarterNote></>;
}
