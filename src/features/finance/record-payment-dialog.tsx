"use client";

import { useCallback, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Invoice, Payment, PaymentMethod } from "@/lib/contracts";
import { formatMoney, parseMoney } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import styles from "./invoices.module.css";

interface RecordPaymentDialogProps {
  initialInvoiceId?: string;
  onClose: () => void;
  onPaymentRecorded?: (payment: Payment) => void;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "BANK_TRANSFER", label: "Bank Transfer (NEFT / RTGS / IMPS)" },
  { value: "UPI", label: "UPI (Unified Payments Interface)" },
  { value: "CARD", label: "Corporate Credit / Debit Card" },
  { value: "CASH", label: "Cash Receipt" },
  { value: "OTHER", label: "Other / Cheque" },
];

export function RecordPaymentDialog({
  initialInvoiceId,
  onClose,
  onPaymentRecorded,
}: RecordPaymentDialogProps) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>(initialInvoiceId ?? "");

  // Load candidate confirmed invoices if not preselected
  const loadCandidates = useCallback(async () => {
    if (initialInvoiceId) return [];
    const res = await api.invoices.list({ status: "CONFIRMED" });
    return res.items.filter((inv) => inv.balance > 0);
  }, [initialInvoiceId]);

  const { data: candidatesData, loading: loadingCandidates } = useResource<Invoice[]>(loadCandidates);
  const candidateInvoices = candidatesData ?? [];

  // If candidate invoices load and no selected id is set, choose first candidate
  const effectiveInvoiceId = selectedInvoiceId || (candidateInvoices.length > 0 ? candidateInvoices[0].id : "");

  // Fetch authoritative fresh invoice details from server
  const loadInvoice = useCallback(async () => {
    if (!effectiveInvoiceId) return null;
    return api.invoices.get(effectiveInvoiceId);
  }, [effectiveInvoiceId]);

  const { data: selectedInvoice, loading: loadingInvoice, error: invoiceError } = useResource<Invoice | null>(loadInvoice);

  // Form fields
  const [amountInput, setAmountInput] = useState<string>("");
  const [method, setMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [paidAt, setPaidAt] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  });
  const [note, setNote] = useState<string>("");

  // Submission state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successPayment, setSuccessPayment] = useState<Payment | null>(null);



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveInvoiceId || !selectedInvoice) {
      setSubmitError("Please select a valid confirmed invoice.");
      return;
    }

    const paise = parseMoney(amountInput);
    if (paise === null || paise <= 0) {
      setSubmitError("Please enter a valid positive payment amount (e.g. 500.00).");
      return;
    }

    if (paise > selectedInvoice.balance) {
      setSubmitError(
        `Payment amount (${formatMoney(paise)}) exceeds current outstanding balance (${formatMoney(selectedInvoice.balance)}). Overpayment is disallowed.`
      );
      return;
    }

    if (!paidAt) {
      setSubmitError("Payment date is required.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const created = await api.payments.create({
        invoiceId: effectiveInvoiceId,
        amount: paise,
        method,
        paidAt,
        note: note.trim() || `Payment against ${selectedInvoice.number}`,
      });

      setSuccessPayment(created);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("loopledger:refresh"));
      }
      onPaymentRecorded?.(created);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setSubmitError(`Server error (${err.code}): ${err.message}`);
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError("Failed to record payment. Please verify connection and retry.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const displayedError = submitError || invoiceError;

  return (
    <div className={styles.dialogOverlay} role="dialog" aria-modal="true" aria-labelledby="record-payment-title">
      <div className={styles.dialogCard} style={{ maxWidth: 540 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 id="record-payment-title">Record Invoice Payment</h2>
          <button
            type="button"
            className={styles.drawerClose}
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {successPayment ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className={`${styles.alertBox} ${styles.alertSuccess}`} role="status">
              <strong>✓ Payment recorded successfully!</strong>
              <p style={{ marginTop: 6 }}>
                Reference ID: <code>{successPayment.id}</code>
              </p>
              <p>
                Settled amount: <strong>{formatMoney(successPayment.amount)}</strong> against invoice{" "}
                <strong>{successPayment.invoiceNumber}</strong>.
              </p>
            </div>
            <div className={styles.dialogActions}>
              <button
                type="button"
                className="button"
                onClick={onClose}
              >
                Close & View Records
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {displayedError && (
              <div className={`${styles.alertBox} ${styles.alertError}`} role="alert">
                <strong>Payment Error:</strong> {displayedError}
              </div>
            )}

            {/* Invoice Selector */}
            {!initialInvoiceId && (
              <div className={styles.filterGroup}>
                <label htmlFor="payment-invoice-select" className={styles.filterLabel}>
                  Select confirmed invoice with balance
                </label>
                {loadingCandidates ? (
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>Loading eligible invoices…</p>
                ) : candidateInvoices.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>
                    No confirmed invoices with outstanding balance found.
                  </p>
                ) : (
                  <select
                    id="payment-invoice-select"
                    className={styles.filterInput}
                    value={effectiveInvoiceId}
                    onChange={(e) => {
                      setSelectedInvoiceId(e.target.value);
                      setAmountInput("");
                    }}
                    disabled={submitting}
                  >
                    {candidateInvoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.number} — {inv.customerName} (Bal: {formatMoney(inv.balance)})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Authoritative Live Invoice Balance Card */}
            {loadingInvoice ? (
              <p style={{ fontSize: 12, color: "var(--muted)" }}>Fetching fresh invoice balances…</p>
            ) : selectedInvoice ? (
              <div className={styles.metaGrid}>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Invoice</span>
                  <span className={styles.metaValue}>{selectedInvoice.number}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Customer</span>
                  <span className={styles.metaValue}>{selectedInvoice.customerName}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Total Invoiced</span>
                  <span className={styles.metaValue}>{formatMoney(selectedInvoice.total)}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Already Paid</span>
                  <span className={styles.metaValue}>{formatMoney(selectedInvoice.paid)}</span>
                </div>
                <div className={styles.metaItem} style={{ gridColumn: "span 2" }}>
                  <span className={styles.metaLabel}>Outstanding Balance to Settle</span>
                  <span className={styles.metaValue} style={{ color: "#a14536", fontSize: 15 }}>
                    {formatMoney(selectedInvoice.balance)}
                  </span>
                </div>
              </div>
            ) : null}

            {/* Amount input in Rupees */}
            <div className={styles.filterGroup}>
              <label htmlFor="payment-amount" className={styles.filterLabel}>
                Payment Amount (INR ₹)
              </label>
              <input
                id="payment-amount"
                type="text"
                className={styles.filterInput}
                placeholder="e.g. 4000.00"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                disabled={submitting || !selectedInvoice || selectedInvoice.balance <= 0}
                required
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <small style={{ color: "var(--muted)", fontSize: 10 }}>
                  Enter rupees (up to 2 decimals). Maximum:{" "}
                  {selectedInvoice ? formatMoney(selectedInvoice.balance) : "₹0.00"}
                </small>
                {selectedInvoice && selectedInvoice.balance > 0 && (
                  <button
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--accent)",
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: "pointer",
                      textDecoration: "underline",
                      padding: 0,
                    }}
                    onClick={() => setAmountInput((selectedInvoice.balance / 100).toFixed(2))}
                  >
                    Pay full remaining ({formatMoney(selectedInvoice.balance)})
                  </button>
                )}
              </div>
            </div>

            {/* Payment Method */}
            <div className={styles.filterGroup}>
              <label htmlFor="payment-method" className={styles.filterLabel}>
                Payment Method
              </label>
              <select
                id="payment-method"
                className={styles.filterInput}
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                disabled={submitting}
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm.value} value={pm.value}>
                    {pm.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Date */}
            <div className={styles.filterGroup}>
              <label htmlFor="payment-date" className={styles.filterLabel}>
                Payment Date
              </label>
              <input
                id="payment-date"
                type="date"
                className={styles.filterInput}
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                disabled={submitting}
                required
              />
            </div>

            {/* Note */}
            <div className={styles.filterGroup}>
              <label htmlFor="payment-note" className={styles.filterLabel}>
                Payment Note / Reference
              </label>
              <input
                id="payment-note"
                type="text"
                className={styles.filterInput}
                placeholder="e.g. UTR / Transaction reference or installment note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className={styles.dialogActions}>
              <button
                type="button"
                className="button button-secondary"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button"
                disabled={
                  submitting ||
                  !selectedInvoice ||
                  selectedInvoice.balance <= 0 ||
                  loadingInvoice
                }
              >
                {submitting ? "Recording…" : "Record Payment"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
