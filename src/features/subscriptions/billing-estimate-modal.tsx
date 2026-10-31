"use client";

import { useEffect, useState } from "react";
import type { Invoice } from "@/lib/contracts";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import styles from "./subscriptions.module.css";

interface BillingEstimateModalProps {
  isOpen: boolean;
  subscriptionId: string;
  subscriptionNumber: string;
  onClose: () => void;
}

export function BillingEstimateModal({
  isOpen,
  subscriptionId,
  subscriptionNumber,
  onClose,
}: BillingEstimateModalProps) {
  const [estimate, setEstimate] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isOpen || !subscriptionId) return;

    let cancelled = false;
    api.subscriptions
      .preview(subscriptionId)
      .then((result) => {
        if (!cancelled) {
          setEstimate(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else if (err instanceof Error) {
            setError(err.message);
          } else {
            setError("Unable to compute billing estimate");
          }
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, subscriptionId, reloadKey]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    setReloadKey((k) => k + 1);
  };

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.modalBackdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className={`${styles.modalDialog} ${styles.modalDialogWide}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="estimate-modal-title"
      >
        <div className={styles.modalHeader}>
          <div>
            <span className="eyebrow" style={{ fontSize: 9, display: "block" }}>
              Cycle Billing Preview
            </span>
            <h2 id="estimate-modal-title">Billing Estimate · {subscriptionNumber}</h2>
          </div>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={`${styles.alertBox} ${styles.alertInfo}`} style={{ marginBottom: 20 }}>
            <strong>Non-persisting Estimate Only</strong>
            <p style={{ margin: "4px 0 0", fontSize: 11 }}>
              This is a dynamic calculation estimate simulating the upcoming billing cycle. It is never an issued invoice, creates no financial obligation, and consumes no discount redemptions.
            </p>
          </div>

          {loading && <p className="state">Calculating invoice estimate from server...</p>}

          {error && (
            <div className={`${styles.alertBox} ${styles.alertWarning}`}>
              <strong>Estimate Notice:</strong>
              <p style={{ marginTop: 4 }}>{error}</p>
              <p style={{ marginTop: 8, fontSize: 11, color: "var(--muted)" }}>
                In local mock mode, lifecycle calculations intentionally return NOT_IMPLEMENTED. Devadathan implements the live calculation engine in connected HTTP mode.
              </p>
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={handleRetry}
                  style={{ padding: "6px 12px", fontSize: 11 }}
                >
                  ↻ Retry Estimate
                </button>
              </div>
            </div>
          )}

          {estimate && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Estimated Period</span>
                  <span className={styles.detailValue}>
                    {formatDate(estimate.periodStart)} – {formatDate(estimate.periodEnd)}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Projected Due Date</span>
                  <span className={styles.detailValue}>{formatDate(estimate.dueAt)}</span>
                </div>
              </div>

              {/* Estimate Lines */}
              <div className={styles.lineItemsBox}>
                <div className={styles.lineItemsHeader}>
                  <h3>Projected Line Breakdown</h3>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8faf9", borderBottom: "1px solid var(--line)" }}>
                      <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 10 }}>Description</th>
                      <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 10 }}>Qty</th>
                      <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 10 }}>Unit Price</th>
                      <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 10 }}>Subtotal</th>
                      <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 10 }}>Discount</th>
                      <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 10 }}>Tax</th>
                      <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 10 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimate.lines.map((line) => (
                      <tr key={line.id} style={{ borderBottom: "1px solid #f0f2ee" }}>
                        <td style={{ padding: "12px 14px", fontSize: 12 }}>{line.description}</td>
                        <td style={{ padding: "12px 14px", textAlign: "right", fontSize: 12 }}>{line.quantity}</td>
                        <td style={{ padding: "12px 14px", textAlign: "right", fontSize: 12 }}>{formatMoney(line.unitPrice)}</td>
                        <td style={{ padding: "12px 14px", textAlign: "right", fontSize: 12 }}>{formatMoney(line.subtotal)}</td>
                        <td style={{ padding: "12px 14px", textAlign: "right", fontSize: 12, color: line.discount > 0 ? "#1b7340" : "inherit" }}>
                          {line.discount > 0 ? `-${formatMoney(line.discount)}` : "—"}
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "right", fontSize: 12 }}>{formatMoney(line.tax)}</td>
                        <td style={{ padding: "12px 14px", textAlign: "right", fontSize: 12, fontWeight: 600 }}>{formatMoney(line.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div style={{ marginLeft: "auto", width: 280, display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Gross Subtotal:</span>
                  <strong>{formatMoney(estimate.subtotal)}</strong>
                </div>
                {estimate.discount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#1b7340" }}>
                    <span>Applied Discounts:</span>
                    <strong>-{formatMoney(estimate.discount)}</strong>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Configured Taxes:</span>
                  <strong>{formatMoney(estimate.tax)}</strong>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 14,
                    borderTop: "2px solid var(--line)",
                    paddingTop: 8,
                    marginTop: 4,
                  }}
                >
                  <span>Projected Cycle Total:</span>
                  <strong style={{ color: "var(--accent)" }}>{formatMoney(estimate.total)}</strong>
                </div>
              </div>

              {/* Explanations */}
              {estimate.explanation && estimate.explanation.length > 0 && (
                <div style={{ background: "#f8faf9", padding: 14, borderRadius: 8, border: "1px solid var(--line)" }}>
                  <h4 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--muted)", margin: "0 0 6px" }}>
                    Calculation Breakdown & Explanations
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: "var(--ink)", lineHeight: 1.6 }}>
                    {estimate.explanation.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}
