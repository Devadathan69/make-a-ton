"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { api, ApiError, dataMode } from "@/lib/api";
import type { Invoice, InvoiceAction } from "@/lib/contracts";
import { formatDate, formatMoney } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import styles from "./invoices.module.css";
import { RecordPaymentDialog } from "./record-payment-dialog";

interface InvoiceDetailDrawerProps {
  invoiceId: string;
  onClose: () => void;
  onInvoiceUpdated?: () => void;
}

export function InvoiceDetailDrawer({
  invoiceId,
  onClose,
  onInvoiceUpdated,
}: InvoiceDetailDrawerProps) {
  // Action states
  const [pendingAction, setPendingAction] = useState<InvoiceAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modals
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);

  // Fetch fresh invoice using established useResource pattern
  const loadInvoice = useCallback(async () => {
    return api.invoices.get(invoiceId);
  }, [invoiceId]);

  const { data: invoice, loading, error, refresh } = useResource<Invoice>(loadInvoice);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showCancelModal) {
          setShowCancelModal(false);
        } else if (showPaymentModal) {
          setShowPaymentModal(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, showCancelModal, showPaymentModal]);

  const handleAction = async (action: InvoiceAction) => {
    if (!invoice) return;
    setPendingAction(action);
    setActionError(null);
    setActionSuccess(null);

    try {
      await api.invoices.action(invoice.id, action);
      setActionSuccess(`Invoice action '${action}' completed successfully.`);
      setShowCancelModal(false);
      refresh();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("loopledger:refresh"));
      }
      onInvoiceUpdated?.();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setActionError(`Server error (${err.code}): ${err.message}`);
      } else if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError("Action failed. Please try again.");
      }
    } finally {
      setPendingAction(null);
    }
  };

  const isMockMode = dataMode === "mock";
  const canConfirm = invoice?.status === "DRAFT";
  const canCancel = (invoice?.status === "DRAFT" || invoice?.status === "CONFIRMED") && (invoice.paid === 0);
  const isPartiallyPaid = (invoice?.paid ?? 0) > 0 && (invoice?.balance ?? 0) > 0;
  const canSend = invoice?.status === "CONFIRMED" || invoice?.status === "PAID";
  const canRecordPayment = invoice?.status === "CONFIRMED" && (invoice?.balance ?? 0) > 0;

  return (
    <>
      <div className={styles.drawerOverlay} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="invoice-drawer-title">
        <div className={styles.drawerContent} onClick={(e) => e.stopPropagation()}>
          {/* Drawer Header */}
          <div className={styles.drawerHeader}>
            <div className={styles.drawerTitleWrap}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h2 id="invoice-drawer-title" style={{ fontSize: 20 }}>
                  {invoice ? invoice.number : "Invoice Details"}
                </h2>
                {invoice && (
                  <div className={styles.badgeRow}>
                    <Badge value={invoice.status} />
                    {isPartiallyPaid && <span className={styles.badgePartial}>Partially Paid</span>}
                    {invoice.overdue && <span className={styles.badgeOverdue}>Overdue</span>}
                  </div>
                )}
              </div>
              <small style={{ color: "var(--muted)", fontSize: 11 }}>
                Authoritative record from billing ledger
              </small>
            </div>
            <button
              type="button"
              className={styles.drawerClose}
              onClick={onClose}
              aria-label="Close invoice drawer"
            >
              ✕
            </button>
          </div>

          {/* Drawer Body */}
          <div className={styles.drawerBody}>
            {loading && <p className="state" role="status">Loading fresh invoice details…</p>}
            {error && <p className="state state-error" role="alert">{error}</p>}

            {invoice && (
              <>
                {/* Action Feedback Alerts */}
                {actionError && (
                  <div className={`${styles.alertBox} ${styles.alertError}`} role="alert">
                    <strong>Action Failed:</strong> {actionError}
                  </div>
                )}
                {actionSuccess && (
                  <div className={`${styles.alertBox} ${styles.alertSuccess}`} role="status">
                    {actionSuccess}
                  </div>
                )}

                {/* Status lifecycle explainer */}
                <div className={styles.lifecycleNotice}>
                  {invoice.status === "DRAFT" && (
                    <p>
                      <strong>Draft Status:</strong> This invoice is an unissued draft. Line items and
                      discounts are preview estimates. Confirming issues this invoice officially with
                      payment liability.
                    </p>
                  )}
                  {invoice.status === "CONFIRMED" && (
                    <p>
                      <strong>Confirmed Status:</strong> This invoice is legally issued. Totals are
                      immutable and payment collections are being tracked.
                    </p>
                  )}
                  {invoice.status === "PAID" && (
                    <p>
                      <strong>Paid Status:</strong> This invoice has been completely settled with zero
                      outstanding balance.
                    </p>
                  )}
                  {invoice.status === "CANCELLED" && (
                    <p>
                      <strong>Cancelled Status:</strong> This invoice was cancelled before collection.
                      No payment liability exists.
                    </p>
                  )}
                </div>

                {/* Action Toolbar */}
                <div className={styles.actionBar}>
                  {/* Confirm Action */}
                  {canConfirm && (
                    <button
                      type="button"
                      className="button"
                      onClick={() => handleAction("confirm")}
                      disabled={pendingAction !== null}
                    >
                      {pendingAction === "confirm" ? "Confirming…" : "✓ Confirm Invoice"}
                    </button>
                  )}

                  {/* Send Action */}
                  {canSend && (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => handleAction("send")}
                      disabled={pendingAction !== null}
                      title="Send billing email with invoice to customer"
                    >
                      {pendingAction === "send" ? "Sending…" : "✉ Send to Customer"}
                    </button>
                  )}

                  {/* Download / Print Document Action */}
                  {isMockMode ? (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled
                        title="Document rendering requires connected HTTP mode"
                      >
                        🖶 Printable Document
                      </button>
                      <small style={{ color: "var(--muted)", fontSize: 10 }}>
                        (Requires HTTP mode)
                      </small>
                    </div>
                  ) : (
                    <a
                      href={api.invoices.documentUrl(invoice.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button button-secondary"
                      title="Open printable HTML invoice in new tab"
                    >
                      🖶 Print / PDF ↗
                    </a>
                  )}

                  {/* Record Payment Action */}
                  {canRecordPayment && (
                    <button
                      type="button"
                      className="button"
                      style={{ background: "#205942", borderColor: "#205942" }}
                      onClick={() => setShowPaymentModal(true)}
                    >
                      💳 Record Payment
                    </button>
                  )}

                  {/* Cancel Action */}
                  {invoice.status !== "CANCELLED" && invoice.status !== "PAID" && (
                    canCancel ? (
                      <button
                        type="button"
                        className="button button-secondary"
                        style={{ color: "#a14536", borderColor: "#f2ceca", marginLeft: "auto" }}
                        onClick={() => setShowCancelModal(true)}
                        disabled={pendingAction !== null}
                      >
                        Cancel Invoice
                      </button>
                    ) : (
                      <span
                        style={{ color: "var(--muted)", fontSize: 11, marginLeft: "auto" }}
                        title="Partially or fully paid invoices cannot be cancelled"
                      >
                        (Cannot cancel paid invoice)
                      </span>
                    )
                  )}
                </div>

                {/* Metadata Grid */}
                <div className={styles.metaGrid}>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Customer</span>
                    <span className={styles.metaValue}>{invoice.customerName}</span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Subscription</span>
                    <span className={styles.metaValue}>
                      <Link
                        href={`/subscriptions?id=${invoice.subscriptionId}`}
                        style={{ color: "var(--accent)", textDecoration: "underline" }}
                      >
                        {invoice.subscriptionId} ↗
                      </Link>
                    </span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Billing Period</span>
                    <span className={styles.metaValue}>
                      {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
                    </span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Issued Date</span>
                    <span className={styles.metaValue}>{formatDate(invoice.issuedAt)}</span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Payment Terms / Due Date</span>
                    <span className={styles.metaValue}>
                      {formatDate(invoice.dueAt)}
                      {invoice.overdue && (
                        <span style={{ color: "#a14536", marginLeft: 6, fontWeight: 700 }}>
                          (Overdue)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Email Delivery</span>
                    <span className={styles.metaValue}>
                      {invoice.emailStatus ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Badge value={invoice.emailStatus} />
                          {invoice.emailError && (
                            <small style={{ color: "#a14536" }}>{invoice.emailError}</small>
                          )}
                        </span>
                      ) : (
                        "Not sent yet"
                      )}
                    </span>
                  </div>
                </div>

                {/* Line Items Table */}
                <div>
                  <h3 style={{ marginBottom: 12, fontSize: 14 }}>Line Items</h3>
                  <div className={styles.linesTableWrap}>
                    <table>
                      <thead>
                        <tr>
                          <th>Description</th>
                          <th style={{ textAlign: "right" }}>Qty</th>
                          <th style={{ textAlign: "right" }}>Unit Price</th>
                          <th style={{ textAlign: "right" }}>Subtotal</th>
                          <th style={{ textAlign: "right" }}>Discount</th>
                          <th style={{ textAlign: "right" }}>Tax</th>
                          <th style={{ textAlign: "right" }}>Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoice.lines.map((line) => (
                          <tr key={line.id}>
                            <td><strong>{line.description}</strong></td>
                            <td style={{ textAlign: "right" }}>{line.quantity}</td>
                            <td style={{ textAlign: "right" }}>{formatMoney(line.unitPrice)}</td>
                            <td style={{ textAlign: "right" }}>{formatMoney(line.subtotal)}</td>
                            <td style={{ textAlign: "right", color: line.discount > 0 ? "#a14536" : undefined }}>
                              {line.discount > 0 ? `−${formatMoney(line.discount)}` : "₹0.00"}
                            </td>
                            <td style={{ textAlign: "right" }}>{formatMoney(line.tax)}</td>
                            <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(line.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Financial Totals Reconciliation Card */}
                <div className={styles.totalsCard}>
                  <div className={styles.totalRow}>
                    <span>Lines Subtotal</span>
                    <span>{formatMoney(invoice.subtotal)}</span>
                  </div>
                  <div className={styles.totalRow}>
                    <span>Total Discounts Applied</span>
                    <span style={{ color: invoice.discount > 0 ? "#a14536" : undefined }}>
                      {invoice.discount > 0 ? `−${formatMoney(invoice.discount)}` : "₹0.00"}
                    </span>
                  </div>
                  <div className={styles.totalRow}>
                    <span>Total Taxes Assessed</span>
                    <span>+{formatMoney(invoice.tax)}</span>
                  </div>
                  <div className={`${styles.totalRow} ${styles.totalRowGrand}`}>
                    <span>Grand Total Invoiced</span>
                    <span>{formatMoney(invoice.total)}</span>
                  </div>
                  <div className={`${styles.totalRow} ${styles.totalRowPaid}`}>
                    <span>Total Payments Settled</span>
                    <span>−{formatMoney(invoice.paid)}</span>
                  </div>
                  <div className={`${styles.totalRow} ${styles.totalRowBalance}`}>
                    <span>Remaining Outstanding Balance</span>
                    <span>{formatMoney(invoice.balance)}</span>
                  </div>
                </div>

                {/* Calculation Explanations */}
                {invoice.explanation && invoice.explanation.length > 0 && (
                  <div className={styles.explanationBox}>
                    <h3 style={{ fontSize: 13, color: "var(--ink)" }}>Calculation Trail & Explanations</h3>
                    <ul className={styles.explanationList}>
                      {invoice.explanation.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Cancel Invoice */}
      {showCancelModal && invoice && (
        <div className={styles.dialogOverlay} role="dialog" aria-modal="true" aria-labelledby="cancel-dialog-title">
          <div className={styles.dialogCard}>
            <h3 id="cancel-dialog-title" style={{ color: "#a14536" }}>
              Confirm Invoice Cancellation
            </h3>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--muted)" }}>
              Are you sure you want to cancel invoice <strong>{invoice.number}</strong> for{" "}
              <strong>{invoice.customerName}</strong> ({formatMoney(invoice.total)})? This will
              permanently void the invoice and release any reserved discount redemptions.
            </p>
            <div className={styles.dialogActions}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setShowCancelModal(false)}
                disabled={pendingAction !== null}
              >
                Keep Invoice
              </button>
              <button
                type="button"
                className={styles.buttonDanger}
                onClick={() => handleAction("cancel")}
                disabled={pendingAction !== null}
              >
                {pendingAction === "cancel" ? "Cancelling…" : "Yes, Cancel Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Dialog */}
      {showPaymentModal && invoice && (
        <RecordPaymentDialog
          initialInvoiceId={invoice.id}
          onClose={() => {
            setShowPaymentModal(false);
            refresh();
          }}
          onPaymentRecorded={() => {
            refresh();
            onInvoiceUpdated?.();
          }}
        />
      )}
    </>
  );
}
