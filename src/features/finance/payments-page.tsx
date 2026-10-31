"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Badge, PageHeader, Panel, ResourceState, Table } from "@/components/ui";
import { api } from "@/lib/api";
import type { PaymentMethod } from "@/lib/contracts";
import { formatDate, formatMoney } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import styles from "./invoices.module.css";
import { RecordPaymentDialog } from "./record-payment-dialog";

export function PaymentsPage() {
  const [searchInput, setSearchInput] = useState<string>("");
  const [methodFilter, setMethodFilter] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const pageSize = 10;

  // Record payment dialog
  const [showPaymentDialog, setShowPaymentDialog] = useState<boolean>(false);

  const loader = useCallback(async () => {
    return api.payments.list({
      page,
      pageSize,
      search: searchInput.trim() || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
    });
  }, [page, pageSize, searchInput, fromDate, toDate]);

  const { data, loading, error, refresh } = useResource(loader);

  // Client-side filter for payment method if selected
  const displayedItems = data?.items
    ? methodFilter
      ? data.items.filter((item) => item.method === methodFilter)
      : data.items
    : [];

  const handleFilterChange = () => {
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchInput("");
    setMethodFilter("");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  const totalCount = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasActiveFilters = Boolean(searchInput || methodFilter || fromDate || toDate);

  // Calculate sum of settled amounts on currently displayed items
  const settledSum = displayedItems.reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <>
      <PageHeader
        eyebrow="Finance / Payments"
        title="Payment Collections"
        description="Traceable cash receipts, reconciliation history, and invoice settlement records."
        action={
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="button button-secondary"
              onClick={refresh}
              disabled={loading}
              title="Refresh payment records"
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
      <div className={styles.filterBar} role="search" aria-label="Payment history filters">
        <div className={styles.filterGroup}>
          <label htmlFor="payment-search" className={styles.filterLabel}>
            Search
          </label>
          <input
            id="payment-search"
            type="search"
            className={styles.filterInput}
            placeholder="Invoice #, customer, note"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              handleFilterChange();
            }}
          />
        </div>

        <div className={styles.filterGroup}>
          <label htmlFor="payment-method-filter" className={styles.filterLabel}>
            Payment Method
          </label>
          <select
            id="payment-method-filter"
            className={styles.filterInput}
            value={methodFilter}
            onChange={(e) => {
              setMethodFilter(e.target.value);
              handleFilterChange();
            }}
          >
            <option value="">All methods</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
            <option value="CASH">Cash</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label htmlFor="payment-from" className={styles.filterLabel}>
            Paid From
          </label>
          <input
            id="payment-from"
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
          <label htmlFor="payment-to" className={styles.filterLabel}>
            Paid To
          </label>
          <input
            id="payment-to"
            type="date"
            className={styles.filterInput}
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              handleFilterChange();
            }}
          />
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

      {/* Payment Records Panel */}
      <Panel
        title="Payment History"
        aside={
          <small>
            {totalCount} total records · Displayed sum: {formatMoney(settledSum)}
          </small>
        }
      >
        <ResourceState loading={loading} error={error} empty={totalCount === 0} />

        {data && (
          <>
            <Table
              headings={[
                "Invoice #",
                "Customer",
                "Method",
                "Amount",
                "Paid Date",
                "Note / Reference",
                "Receipt ID",
              ]}
            >
              {displayedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
                    No payment records match the specified filters.
                  </td>
                </tr>
              ) : (
                displayedItems.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <Link
                        href={`/invoices?invoiceId=${payment.invoiceId}`}
                        style={{ color: "var(--accent)", fontWeight: 700, textDecoration: "underline" }}
                        title="View invoice details"
                      >
                        {payment.invoiceNumber} ↗
                      </Link>
                    </td>
                    <td>{payment.customerName}</td>
                    <td>
                      <Badge value={payment.method as PaymentMethod} />
                    </td>
                    <td style={{ fontWeight: 700, color: "#33784b" }}>
                      {formatMoney(payment.amount)}
                    </td>
                    <td>{formatDate(payment.paidAt)}</td>
                    <td style={{ color: "var(--ink)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {payment.note || "—"}
                    </td>
                    <td>
                      <code style={{ fontSize: 10, color: "var(--muted)" }}>{payment.id}</code>
                    </td>
                  </tr>
                ))
              )}
            </Table>

            {/* Pagination Controls */}
            {totalCount > 0 && (
              <div className={styles.paginationBar}>
                <span>
                  Showing {(page - 1) * pageSize + 1} to{" "}
                  {Math.min(page * pageSize, totalCount)} of {totalCount} payment records
                </span>
                <div className={styles.paginationControls}>
                  <button
                    type="button"
                    className={styles.paginationButton}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
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
                    disabled={page >= totalPages}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Panel>

      {/* Record Payment Dialog */}
      {showPaymentDialog && (
        <RecordPaymentDialog
          onClose={() => setShowPaymentDialog(false)}
          onPaymentRecorded={() => {
            setShowPaymentDialog(false);
            refresh();
          }}
        />
      )}
    </>
  );
}
