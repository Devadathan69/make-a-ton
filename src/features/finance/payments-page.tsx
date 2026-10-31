"use client";

import { Badge, PageHeader, Panel, ResourceState, StarterNote, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const load = () => api.payments.list();
export function PaymentsPage() {
  const { data, loading, error } = useResource(load);
  return <><PageHeader eyebrow="Finance / Payments" title="Know what came in." description="A traceable payment history, linked to the invoice each payment settles." />
    <Panel title="Payment records"><ResourceState loading={loading} error={error} empty={data?.total === 0} />{data && <Table headings={["Invoice", "Customer", "Amount", "Method", "Date", "Note"]}>{data.items.map((payment) => <tr key={payment.id}><td><strong>{payment.invoiceNumber}</strong></td><td>{payment.customerName}</td><td>{formatMoney(payment.amount)}</td><td><Badge value={payment.method} /></td><td>{formatDate(payment.paidAt)}</td><td>{payment.note}</td></tr>)}</Table>}</Panel>
    <StarterNote owner="Adrinath">Implement the record-payment form with amount, method, date, and note. Show server validation and refresh the invoice balance after success.</StarterNote></>;
}
