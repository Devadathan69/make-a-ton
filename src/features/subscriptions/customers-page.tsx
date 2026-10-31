"use client";

import { PageHeader, Panel, ResourceState, StarterNote, Table } from "@/components/ui";
import { api } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

const load = () => api.customers.list();
export function CustomersPage() {
  const { data, loading, error } = useResource(load);
  return <><PageHeader eyebrow="Workspace / Customers" title="Good relationships start here." description="A shared customer directory for your subscription team." />
    <Panel title="Customers"><ResourceState loading={loading} error={error} empty={data?.total === 0} />{data && <Table headings={["Company", "Contact", "Email", "Address"]}>{data.items.map((customer) => <tr key={customer.id}><td><strong>{customer.company}</strong></td><td>{customer.name}</td><td>{customer.email}</td><td>{customer.address}</td></tr>)}</Table>}</Panel>
    <StarterNote owner="Hannath">Add customer forms, search, and paginated lists. Authentication accounts and customer records are linked by the backend.</StarterNote></>;
}
