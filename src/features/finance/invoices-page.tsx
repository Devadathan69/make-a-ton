"use client";

import { Badge, PageHeader, Panel, ResourceState, StarterNote, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const load = () => api.invoices.list();
export function InvoicesPage() {
  const { data, loading, error } = useResource(load);
  return <><PageHeader eyebrow="Finance / Invoices" title="Every invoice, accounted for." description="Follow each charge from draft to payment, with a clear balance at every step." />
    <Panel title="Invoices"><ResourceState loading={loading} error={error} empty={data?.total === 0} />{data && <Table headings={["Invoice", "Customer", "Due date", "Total", "Outstanding", "Status"]}>{data.items.map((invoice) => <tr key={invoice.id}><td><strong>{invoice.number}</strong></td><td>{invoice.customerName}</td><td>{formatDate(invoice.dueAt)}{invoice.overdue && <small>Overdue</small>}</td><td>{formatMoney(invoice.total)}</td><td>{formatMoney(invoice.balance)}</td><td><Badge value={invoice.status} /></td></tr>)}</Table>}</Panel>
    <StarterNote owner="Adrinath">Add invoice details, calculation explanations, confirm/cancel/send controls, and printable downloads. Never calculate authoritative totals in this screen.</StarterNote></>;
}
