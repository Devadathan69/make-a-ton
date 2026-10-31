"use client";

import { useCallback, useState } from "react";
import { Badge, PageHeader, Panel, ResourceState } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Invoice, Session, Subscription, SubscriptionAction } from "@/lib/contracts";
import { formatDate, formatMoney } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { Pagination } from "@/components/pagination";
import { useDialog } from "@/components/use-dialog";
import styles from "./portal.module.css";

const SELF_SERVICE_ACTIONS: SubscriptionAction[] = ["pause", "resume", "renew", "close"];

interface PortalData {
  session: Session;
  subscriptionTotal: number;
  invoiceTotal: number;
  subscriptions: Subscription[];
  invoices: Invoice[];
}

export function PortalPage() {
  const [subscriptionPage, setSubscriptionPage] = useState(1);
  const [invoicePage, setInvoicePage] = useState(1);
  const [newCycleStart, setNewCycleStart] = useState("");
  const [actionPendingSubId, setActionPendingSubId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    subId: string;
    subNumber: string;
    action: SubscriptionAction;
    requiresStart?: boolean;
  } | null>(null);

  // Document unavailable modal for mock mode
  const [mockDocNotice, setMockDocNotice] = useState<string | null>(null);

  // Invoice inspection modal
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const loader = useCallback(async (): Promise<PortalData> => {
    const [session, subsRes, invRes] = await Promise.all([
      api.session.get(),
      api.portal.subscriptions({ pageSize: 10, page: subscriptionPage }),
      api.portal.invoices({ pageSize: 10, page: invoicePage }),
    ]);

    return {
      session,
      subscriptionTotal: subsRes.total,
      invoiceTotal: invRes.total,
      subscriptions: subsRes.items,
      invoices: invRes.items,
    };
  }, [subscriptionPage, invoicePage]);

  const { data, loading, error, refresh } = useResource(loader);

  const handleSelfServiceClick = (sub: Subscription, action: SubscriptionAction) => {
    if (action === "pause" || action === "close" || action === "resume" || (action === "renew" && sub.status === "CLOSED")) {
      setConfirmDialog({
        subId: sub.id,
        subNumber: sub.number,
        action,
        requiresStart: action === "renew" && sub.status === "CLOSED",
      });
      setNewCycleStart("");
    } else {
      executeTransition(sub.id, action);
    }
  };

  const executeTransition = async (subId: string, action: SubscriptionAction) => {
    setActionPendingSubId(subId);
    setActionError(null);
    setActionSuccess(null);
    try {
      await api.portal.transition(subId, action, confirmDialog?.requiresStart ? {startDate:newCycleStart} : undefined);
      setActionSuccess(`Successfully performed '${action}' action.`);
      setConfirmDialog(null);
      refresh();
    } catch (err: unknown) {
      setConfirmDialog(null);
      if (err instanceof ApiError) {
        setActionError(err.message);
      } else if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError("Action failed. Please try again.");
      }
    } finally {
      setActionPendingSubId(null);
    }
  };

  const handleDocumentClick = (invoice: Invoice, sessionMode: "mock" | "http") => {
    if (sessionMode === "mock") {
      setMockDocNotice(
        `Invoice document for ${invoice.number} is unavailable in mock mode. In connected mode with an active session, Devadathan's server endpoint provides authorized printable HTML/PDF downloads.`
      );
    } else {
      const url = api.invoices.documentUrl(invoice.id);
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const confirmId = useDialog(Boolean(confirmDialog), () => setConfirmDialog(null), Boolean(actionPendingSubId));
  const docId = useDialog(Boolean(mockDocNotice), () => setMockDocNotice(null));
  const invoiceId = useDialog(Boolean(selectedInvoice), () => setSelectedInvoice(null));
  const isMock = data?.session.mode === "mock";
  const user = data?.session.user;

  return (
    <div className={styles.portalContainer}>
      <PageHeader
        eyebrow="Customer Portal"
        title="Your workspace. Your subscriptions."
        description="Review active plans, manage permitted self-service options, and view your billing history."
      />

      {user && (
        <div className={styles.welcomeStrip}>
          <div className={styles.welcomeText}>
            <h2>Welcome back, {user.name}</h2>
            <p>
              {isMock
                ? "Previewing customer view (Maple Studio test fixture). Session isolation is enforced by the backend."
                : `Signed in as ${user.email}`}
            </p>
          </div>
          <div className={styles.accountBadge}>
            <span>Role: <strong>{user.role}</strong></span>
            {isMock && <span style={{ color: "var(--accent)", fontWeight: 700 }}>· Mock Preview</span>}
          </div>
        </div>
      )}

      {actionSuccess && (
        <div className="state" style={{ background: "#eaf5ed", color: "#1b7340", padding: "12px 18px", borderRadius: 8 }}>
          {actionSuccess}
        </div>
      )}

      {actionError && (
        <div className="state state-error" role="alert">
          <strong>Self-service notice:</strong> {actionError}
          {isMock && (
            <p style={{ marginTop: 4, fontSize: 11 }}>
              (In local mock mode, lifecycle transition actions intentionally return NOT_IMPLEMENTED. Devadathan implements the backend state transition service).
            </p>
          )}
        </div>
      )}

      <ResourceState loading={loading} error={error} />

      {data && (
        <div className={styles.portalGrid}>
          {/* Subscriptions Panel */}
          <Panel
            title="My Subscriptions"
            aside={<small>{data.subscriptionTotal} active or recent</small>}
          >
            {data.subscriptions.length === 0 ? (
              <p className="state">No active or past subscriptions associated with your account.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
                {data.subscriptions.map((subscription) => {
                  // Only expose permitted self-service actions
                  const allowedSelfService = (subscription.allowedActions || []).filter((action) =>
                    SELF_SERVICE_ACTIONS.includes(action)
                  );
                  const isBusy = actionPendingSubId === subscription.id;

                  return (
                    <div key={subscription.id} className={styles.subCard}>
                      <div className={styles.subCardHeader}>
                        <div>
                          <h3>{subscription.planName}</h3>
                          <span className={styles.subRef}>{subscription.number}</span>
                        </div>
                        <Badge value={subscription.status} />
                      </div>

                      <div className={styles.cardMetaGrid}>
                        <div className={styles.cardMetaItem}>
                          <span className={styles.cardMetaLabel}>Effective Start</span>
                          <span className={styles.cardMetaValue}>
                            {formatDate(subscription.startDate)}
                          </span>
                        </div>

                        <div className={styles.cardMetaItem}>
                          <span className={styles.cardMetaLabel}>Next Billing</span>
                          <span className={styles.cardMetaValue}>
                            {subscription.nextBillingDate
                              ? formatDate(subscription.nextBillingDate)
                              : "No upcoming cycle"}
                          </span>
                        </div>

                        <div className={styles.cardMetaItem}>
                          <span className={styles.cardMetaLabel}>Payment Terms</span>
                          <span className={styles.cardMetaValue}>
                            {subscription.paymentTermsDays} days
                          </span>
                        </div>

                        {subscription.expiryDate && (
                          <div className={styles.cardMetaItem}>
                            <span className={styles.cardMetaLabel}>Contract Expiry</span>
                            <span className={styles.cardMetaValue}>
                              {formatDate(subscription.expiryDate)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Products / Seats summary */}
                      <div className={styles.productsBox}>
                        <h4>Included Products & Seats</h4>
                        <div className={styles.productsList}>
                          {subscription.lines.map((line) => (
                            <div key={line.id} className={styles.productRow}>
                              <span>{line.description}</span>
                              <strong>Qty: {line.quantity}</strong>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Permitted self-service controls */}
                      {allowedSelfService.length > 0 && (
                        <div className={styles.selfServiceActions}>
                          <span style={{ width: "100%", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                            Self-Service Controls
                          </span>
                          {allowedSelfService.map((action) => {
                            const isDanger = action === "close";
                            const isPrimary = action === "renew" || action === "resume";

                            return (
                              <button
                                key={action}
                                type="button"
                                className={`${styles.selfServiceBtn} ${
                                  isDanger
                                    ? styles.selfServiceBtnDanger
                                    : isPrimary
                                    ? styles.selfServiceBtnPrimary
                                    : ""
                                }`}
                                onClick={() => handleSelfServiceClick(subscription, action)}
                                disabled={isBusy}
                              >
                                {isBusy
                                  ? "Processing..."
                                  : action === "pause"
                                  ? "⏸ Pause Subscription"
                                  : action === "resume"
                                  ? "▶ Resume Subscription"
                                  : action === "renew"
                                  ? "↻ Renew Subscription"
                                  : "✕ Close Subscription"}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <Pagination page={subscriptionPage} total={data.subscriptionTotal} busy={loading} onPage={setSubscriptionPage}/>
          </Panel>

          {/* Invoices History Panel */}
          <Panel
            title="Billing & Invoices"
            aside={<small>{data.invoiceTotal} invoices on record</small>}
          >
            {data.invoices.length === 0 ? (
              <p className="state">No invoices issued for your account yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 16 }}>
                {data.invoices.map((invoice) => (
                  <div key={invoice.id} className={styles.invoiceCard}>
                    <div className={styles.invoiceCardHeader}>
                      <div>
                        <strong style={{ fontSize: 14 }}>{invoice.number}</strong>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                          Issued: {formatDate(invoice.issuedAt)} · Due: {formatDate(invoice.dueAt)}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {invoice.overdue && <span className={styles.overdueBadge}>Overdue</span>}
                        <Badge value={invoice.status} />
                      </div>
                    </div>

                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      Billing Period: {formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}
                    </div>

                    <div className={styles.invoiceAmountBlock}>
                      <div>
                        <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", display: "block" }}>
                          Total Amount
                        </span>
                        <strong style={{ fontSize: 15 }}>{formatMoney(invoice.total)}</strong>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", display: "block" }}>
                          Outstanding Balance
                        </span>
                        <strong style={{ fontSize: 15, color: invoice.balance > 0 ? "#a82e1e" : "inherit" }}>
                          {formatMoney(invoice.balance)}
                        </strong>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 4 }}>
                      <button
                        type="button"
                        className="button button-secondary"
                        style={{ padding: "6px 12px", fontSize: 11 }}
                        onClick={() => setSelectedInvoice(invoice)}
                      >
                        Inspect Breakdown
                      </button>

                      <button
                        type="button"
                        className="button button-secondary"
                        style={{ padding: "6px 12px", fontSize: 11 }}
                        onClick={() => handleDocumentClick(invoice, isMock ? "mock" : "http")}
                      >
                        Download / Print
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Pagination page={invoicePage} total={data.invoiceTotal} busy={loading} onPage={setInvoicePage}/>
          </Panel>
        </div>
      )}

      {/* Confirmation Dialog for disruptive self-service actions */}
      {confirmDialog && (
        <div
          className="modalBackdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(18, 46, 41, 0.45)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !actionPendingSubId) setConfirmDialog(null);
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 24,
              maxWidth: 480,
              width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
            data-dialog-root={confirmId} role="alertdialog" aria-label="Confirm subscription action"
            aria-modal="true"
          >
            <h3 style={{ fontSize: 17, marginBottom: 12 }}>
              {confirmDialog.action === "pause"
                ? `Pause ${confirmDialog.subNumber}?`
                : confirmDialog.action === "resume" ? `Resume ${confirmDialog.subNumber}?` : confirmDialog.action === "renew" ? `Renew ${confirmDialog.subNumber}?` : `Close ${confirmDialog.subNumber}?`}
            </h3>
            <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--muted)", marginBottom: 16 }}>
              {confirmDialog.action === "pause"
                ? "Pausing stops future unissued billing periods. Issued invoices remain collectible. Resume starts a fresh cycle without a refund; finite expiry must align with the new anchor."
                : confirmDialog.action === "resume" ? "Resume starts a fresh billing cycle today. Unused paid time is not refunded. Finite expiry must align with the new anchor; the server may reject an incompatible date." : confirmDialog.requiresStart ? "Renewal starts a new future cycle using the confirmed contract economics. Choose a future date within current plan availability." : "Closing terminates this subscription contract. You will not be billed for subsequent cycles. Early closure rules apply as per your plan."}
            </p>
            {confirmDialog.requiresStart && <label>New cycle start date<input aria-label="New cycle start date" type="date" value={newCycleStart} onChange={e=>setNewCycleStart(e.target.value)} disabled={Boolean(actionPendingSubId)} required/></label>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setConfirmDialog(null)}
                disabled={Boolean(actionPendingSubId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button"
                style={confirmDialog.action === "close" ? { background: "#a13627", borderColor: "#a13627" } : undefined}
                onClick={() => executeTransition(confirmDialog.subId, confirmDialog.action)}
                disabled={Boolean(actionPendingSubId) || (confirmDialog.requiresStart && !newCycleStart)}
              >
                {actionPendingSubId ? "Processing..." : "Confirm Action"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mock Document Notice Dialog */}
      {mockDocNotice && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(18, 46, 41, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setMockDocNotice(null);
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 24,
              maxWidth: 480,
              width: "100%",
            }}
            data-dialog-root={docId} role="dialog" aria-label="Invoice document notice"
          >
            <h3 style={{ fontSize: 16, marginBottom: 8 }}>Invoice Document Notice</h3>
            <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--ink)", marginBottom: 16 }}>
              {mockDocNotice}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="button"
                onClick={() => setMockDocNotice(null)}
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Breakdown Modal */}
      {selectedInvoice && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(18, 46, 41, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedInvoice(null);
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 24,
              maxWidth: 600,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            data-dialog-root={invoiceId} role="dialog" aria-label="Invoice breakdown"
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 16 }}>Invoice {selectedInvoice.number}</h3>
                <small style={{ color: "var(--muted)" }}>
                  Period: {formatDate(selectedInvoice.periodStart)} – {formatDate(selectedInvoice.periodEnd)}
                </small>
              </div>
              <Badge value={selectedInvoice.status} />
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line)", background: "#f8faf9" }}>
                  <th style={{ padding: 8, textAlign: "left", fontSize: 10 }}>Item</th>
                  <th style={{ padding: 8, textAlign: "right", fontSize: 10 }}>Qty</th>
                  <th style={{ padding: 8, textAlign: "right", fontSize: 10 }}>Subtotal</th>
                  <th style={{ padding: 8, textAlign: "right", fontSize: 10 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {selectedInvoice.lines.map((line) => (
                  <tr key={line.id} style={{ borderBottom: "1px solid #f0f2ee" }}>
                    <td style={{ padding: 8, fontSize: 12 }}>{line.description}</td>
                    <td style={{ padding: 8, textAlign: "right", fontSize: 12 }}>{line.quantity}</td>
                    <td style={{ padding: 8, textAlign: "right", fontSize: 12 }}>{formatMoney(line.subtotal)}</td>
                    <td style={{ padding: 8, textAlign: "right", fontSize: 12, fontWeight: 600 }}>{formatMoney(line.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>Subtotal:</span>
                <strong>{formatMoney(selectedInvoice.subtotal)}</strong>
              </div>
              {selectedInvoice.discount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#1b7340" }}>
                  <span>Discount:</span>
                  <strong>-{formatMoney(selectedInvoice.discount)}</strong>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span>Taxes:</span>
                <strong>{formatMoney(selectedInvoice.tax)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, borderTop: "1px solid var(--line)", paddingTop: 6 }}>
                <span>Total:</span>
                <strong>{formatMoney(selectedInvoice.total)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span>Amount Paid:</span>
                <strong>{formatMoney(selectedInvoice.paid)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, color: selectedInvoice.balance > 0 ? "#a82e1e" : "inherit" }}>
                <span>Remaining Balance:</span>
                <strong>{formatMoney(selectedInvoice.balance)}</strong>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setSelectedInvoice(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
