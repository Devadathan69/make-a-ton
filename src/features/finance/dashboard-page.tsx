"use client";

import Link from "next/link";
import { Badge, PageHeader, Panel, ResourceState, StarterNote } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const load = () => api.reports.summary();
export function DashboardPage() {
  const { data, loading, error } = useResource(load);
  return <><PageHeader eyebrow="Workspace / Overview" title="A clear view of every cycle." description="Subscriptions, collections, and the work that needs your attention." action={<Link href="/subscriptions" className="button">View subscriptions <span>↗</span></Link>} />
    <ResourceState loading={loading} error={error} />
    {data && <><div className="stats-grid">{[
      { label: "Active subscriptions", value: String(data.activeSubscriptions), note: "Currently delivering value" },
      { label: "Billed this period", value: formatMoney(data.billed), note: "Confirmed invoices, including tax" },
      { label: "Payments collected", value: formatMoney(data.collected), note: "Recorded payments this period" },
      { label: "Outstanding balance", value: formatMoney(data.outstanding), note: "Unpaid confirmed invoice balances" },
    ].map((stat) => <div className="stat-card" key={stat.label}><p className="stat-label">{stat.label}</p><p className="stat-value">{stat.value}</p><p className="stat-note">{stat.note}</p></div>)}</div>
    <div className="dashboard-grid"><Panel title="Billing & collections" aside={<small>{formatDate(data.asOf)}</small>}><div className="chart">{data.monthly.map((month) => <div key={month.month}><div className="chart-row"><span>Billed</span><div className="chart-track"><div className="chart-bar" style={{ width: `${month.billed ? 100 : 0}%` }} /></div><span className="chart-value">{formatMoney(month.billed)}</span></div><div className="chart-row" style={{ marginTop: 14 }}><span>Collected</span><div className="chart-track"><div className="chart-bar secondary" style={{ width: `${Math.min(100, month.billed ? month.collected / month.billed * 100 : 0)}%` }} /></div><span className="chart-value">{formatMoney(month.collected)}</span></div><p className="chart-caption" style={{ marginTop: 25 }}>{month.month} · Billed amounts and cash collected are shown separately.</p></div>)}</div></Panel>
    <Panel title="Attention needed" aside={<small>{data.attention.length} item</small>}><div className="attention-list">{data.attention.map((item) => <div className="attention-item" key={item.id}><Badge value={item.kind} /><p>{item.title}</p><Link className="text-link" href={item.href}>Review record →</Link></div>)}</div></Panel></div>
    <Panel title="At a glance"><div className="summary-strip"><span>Monthly recurring value<strong>{formatMoney(data.mrr)}</strong></span><span>Overdue balance<strong>{formatMoney(data.overdue)}</strong></span><span>Currency<strong>INR</strong></span></div></Panel></>}
    <StarterNote owner="Adrinath">Add date filters, drill-downs, invoice actions, and payment forms. These starter figures come from fixtures; the backend will calculate live metrics.</StarterNote></>;
}
