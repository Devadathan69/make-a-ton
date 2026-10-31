"use client";

import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, PageHeader, Panel, ResourceState, Table } from "@/components/ui";
import { api } from "@/lib/api";
import type { Invoice, Page } from "@/lib/contracts";
import { formatDate, formatMoney } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { InvoiceDetailDrawer } from "./invoice-detail-drawer";
import styles from "./invoices.module.css";
import { RecordPaymentDialog } from "./record-payment-dialog";

function InvoicesPageContent() {
  const searchParams = useSearchParams();
  const urlInvoiceId = searchParams.get("invoiceId") ?? searchParams.get("id");

  // Filters state
  const [searchInput, setSearchInput] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") ?? "");
  const [fromDate, setFromDate] = useState<string>(searchParams.get("from") ?? "");
  const [toDate, setToDate] = useState<string>(searchParams.get("to") ?? "");
  const [customerId, setCustomerId] = useState(searchParams.get("customerId") ?? "");
  const customers = useResource(useCallback(() => api.customers.list({pageSize:100}), []));
  const [overdueOnly, setOverdueOnly] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const pageSize = 10;

  // Selected invoice for detail drawer - initialized directly from URL if present
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(urlInvoiceId);

  // Record payment dialog
  const [showPaymentDialog, setShowPaymentDialog] = useState<boolean>(false);

  const loader = useCallback(async () => {
    if (fromDate && toDate && fromDate > toDate) throw new Error("From date must be on or before To date.");
    return api.invoices.list({
      page,
      pageSize,
      search: searchInput.trim() || undefined,
      status: overdueOnly ? "OVERDUE" : statusFilter || undefined,
      customerId: customerId || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
    });
  }, [page, pageSize, searchInput, statusFilter, fromDate, toDate, overdueOnly, customerId]);

  const { data, loading, error, refresh } = useResource<Page<Invoice>>(loader);

  // All matching rows and totals are filtered by the server before pagination.
  const displayedItems = data?.items ?? [];

  const handleFilterChange = () => {
    setPage(1); // Reset page on filter alteration
  };

  const handleResetFilters = () => {
    setSearchInput("");
    setStatusFilter("");
    setFromDate("");
    setToDate("");
    setOverdueOnly(false);
    setCustomerId("");
    setPage(1);
  };

  const totalCount = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasActiveFilters = Boolean(searchInput || statusFilter || fromDate || toDate || overdueOnly || customerId);

  return (
    <>
      <PageHeader
        eyebrow="Finance / Invoices"
        title="Invoices & Receivables"
        description="Comprehensive accounting of every billing cycle, line items, and payment reconciliation."
        action={
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="button button-secondary"
              onClick={refresh}
              disabled={loading}
              title="Refresh invoices"
            >
              {loading ? "Refreshing…" : "↻ Refresh"}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setShowPaymentDialog(true)}
            >
              💳 Record Payment
            </button>
          </div>
        }
      />

      {/* Filter and Search Bar */}
      <div className={styles.filterBar} role="search" aria-label="Invoice search and filters">
        <div className={styles.filterGroup}>
          <label htmlFor="invoice-search" className={styles.filterLabel}>
            Search
          </label>
          <input
            id="invoice-search"
            type="search"
            className={styles.filterInput}
            placeholder="Invoice #, customer, etc."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              handleFilterChange();
            }}
          />
        </div>

        <div className={styles.filterGroup}>
          <label htmlFor="invoice-status" className={styles.filterLabel}>
            Lifecycle Status
          </label>
          <select
            id="invoice-status"
            className={styles.filterInput}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              handleFilterChange();
            }}
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="PAID">Paid</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="OVERDUE">Overdue (derived)</option>
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label htmlFor="invoice-from" className={styles.filterLabel}>
            Issued From
          </label>
          <input
            id="invoice-from"
            type="date"
            className={styles.filterInput}
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              handleFilterChange();
            }}
          />
        </div>

        <div className={styles.filterGroup}>
          <label htmlFor="invoice-to" className={styles.filterLabel}>
            Issued To
          </label>
          <input
            id="invoice-to"
            type="date"
            className={styles.filterInput}
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              handleFilterChange();
            }}
          />
        </div>

        <div className={styles.filterGroup}><label htmlFor="invoice-customer" className={styles.filterLabel}>Customer</label><select id="invoice-customer" value={customerId} className={styles.filterInput} onChange={e=>{setCustomerId(e.target.value);setPage(1);}}><option value="">All customers</option>{customers.data?.items.map(customer=><option key={customer.id} value={customer.id}>{customer.company}</option>)}</select>{customers.error&&<p role="alert">{customers.error} <button onClick={customers.refresh}>Retry customers</button></p>}</div>
        <div className={styles.filterGroup} style={{ justifyContent: "flex-end" }}>
          <label className={styles.filterCheckboxLabel}>
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => {
                setOverdueOnly(e.target.checked);
                handleFilterChange();
              }}
            />
            <span>Overdue only</span>
          </label>
        </div>

        {hasActiveFilters && (
          <div className={styles.filterActions}>
            <button
              type="button"
              className="button button-secondary"
              onClick={handleResetFilters}
            >
              Reset filters
            </button>
          </div>
        )}
      </div>

      {/* Invoices List Panel */}
      <Panel title="Invoices Ledger" aside={<small>{totalCount} total records</small>}>
        <ResourceState loading={loading} error={error} empty={totalCount === 0} />

        {data && (
          <>
            <Table
              headings={[
                "Invoice #",
                "Customer",
                "Period",
                "Issued",
                "Due Date",
                "Total",
                "Paid",
                "Balance",
                "Status",
                "Action",
              ]}
            >
              {displayedItems.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
                    No invoices match the specified filters.
                  </td>
                </tr>
              ) : (
                displayedItems.map((invoice) => {
                  const isPartiallyPaid = invoice.paid > 0 && invoice.balance > 0;
                  return (
                    <tr
                      key={invoice.id}
                      className={styles.rowClickable}
                      onClick={() => setSelectedInvoiceId(invoice.id)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          setSelectedInvoiceId(invoice.id);
                        }
                      }}
                      role="button"
                      aria-label={`View details for invoice ${invoice.number}`}
                    >
                      <td>
                        <strong>{invoice.number}</strong>
                      </td>
                      <td>{invoice.customerName}</td>
                      <td>
                        {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
                      </td>
                      <td>{formatDate(invoice.issuedAt)}</td>
                      <td>
                        {formatDate(invoice.dueAt)}
                        {invoice.overdue && (
                          <small style={{ color: "#a14536", fontWeight: 700 }}>
                            Overdue
                          </small>
                        )}
                      </td>
                      <td>
                        <strong>{formatMoney(invoice.total)}</strong>
                      </td>
                      <td style={{ color: invoice.paid > 0 ? "#33784b" : undefined }}>
                        {formatMoney(invoice.paid)}
                      </td>
                      <td style={{ color: invoice.balance > 0 ? "#a14536" : undefined, fontWeight: 600 }}>
                        {formatMoney(invoice.balance)}
                      </td>
                      <td>
                        <div className={styles.badgeRow}>
                          <Badge value={invoice.status} />
                          {isPartiallyPaid && (
                            <span className={styles.badgePartial}>Partially Paid</span>
                          )}
                          {invoice.overdue && (
                            <span className={styles.badgeOverdue}>Overdue</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button button-secondary"
                          style={{ padding: "6px 10px", fontSize: 10 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedInvoiceId(invoice.id);
                          }}
                        >
                          View Details →
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </Table>

            {/* Pagination Controls */}
            {totalCount > 0 && (
              <div className={styles.paginationBar}>
                <span>
                  Showing {(page - 1) * pageSize + 1} to{" "}
                  {Math.min(page * pageSize, totalCount)} of {totalCount} invoices
                </span>
                <div className={styles.paginationControls}>
                  <button
                    type="button"
                    className={styles.paginationButton}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={loading || page <= 1}
                  >
                    ← Previous
                  </button>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className={styles.paginationButton}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={loading || page >= totalPages}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Panel>

      {/* Invoice Detail Drawer */}
      {selectedInvoiceId && (
        <InvoiceDetailDrawer
          invoiceId={selectedInvoiceId}
          onClose={() => setSelectedInvoiceId(null)}
          onInvoiceUpdated={refresh}
        />
      )}

      {/* Record Payment Dialog */}
      {showPaymentDialog && (
        <RecordPaymentDialog
          onClose={() => setShowPaymentDialog(false)}
          onPaymentRecorded={() => {
            refresh();
          }}
        />
      )}
    </>
  );
}

export function InvoicesPage() {
  return (
    <Suspense fallback={<p className="state" role="status">Loading invoices view…</p>}>
      <InvoicesPageContent />
    </Suspense>
  );
}
