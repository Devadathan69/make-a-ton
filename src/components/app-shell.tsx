"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { dataMode } from "@/lib/api";

const groups = [
  { title: "WORKSPACE", items: [["/dashboard", "Overview", "01"], ["/customers", "Customers", "02"], ["/quotes", "Quotations", "03"], ["/subscriptions", "Subscriptions", "04"]] },
  { title: "CATALOG", items: [["/catalog/products", "Products", "05"], ["/catalog/plans", "Plans", "06"], ["/catalog/rules", "Taxes & discounts", "07"]] },
  { title: "FINANCE", items: [["/invoices", "Invoices", "08"], ["/payments", "Payments", "09"], ["/portal", "Customer portal", "↗"]] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/dashboard" className="brand"><span className="brand-mark">L</span><span>LoopLedger<span className="brand-subtitle">SUBSCRIPTION OPERATIONS</span></span></Link>
      <div className="workspace-switch"><span className="workspace-icon">B</span><div><strong>Brightloop Software</strong><small>Business workspace</small></div></div>
      <nav aria-label="Main navigation">{groups.map((group) => <div className="nav-group" key={group.title}><p>{group.title}</p>{group.items.map(([href, label, index]) => <Link href={href} key={href} aria-current={pathname === href ? "page" : undefined} className={pathname === href ? "nav-item active" : "nav-item"}><span className="nav-index">{index}</span>{label}<span className="nav-arrow">›</span></Link>)}</div>)}</nav>
      <div className="sidebar-footer"><span className="live-dot" /><span>Make-A-Ton 9.0<small>Team of four · Kochi</small></span></div>
    </aside>
    <div className="main-column">
      <header className="topbar"><span>Brightloop <span className="breadcrumb-slash">/</span> Operations</span><div className="topbar-right"><span className="environment-tag">{dataMode === "mock" ? "Development fixtures" : "Connected API"}</span><span className="avatar" aria-label="Workspace">BL</span></div></header>
      {dataMode === "mock" && <div className="mock-banner"><strong>Starter preview</strong><span>Sample records · browser-only edits reset on reload · billing and authentication are not implemented yet</span></div>}
      <main id="main-content">{children}</main>
      <footer className="main-footer"><span>LoopLedger / Make-A-Ton 2026</span><span>One place for every billing cycle.</span></footer>
    </div>
  </div>;
}
