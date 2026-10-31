"use client";

import styles from "./subscriptions.module.css";
import type { SubscriptionAction } from "@/lib/contracts";

interface ActionConfirmDialogProps {
  isOpen: boolean;
  action: SubscriptionAction | null;
  subscriptionNumber: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

export function ActionConfirmDialog({
  isOpen,
  action,
  subscriptionNumber,
  onConfirm,
  onCancel,
  loading,
}: ActionConfirmDialogProps) {
  if (!isOpen || !action) return null;

  const isPause = action === "pause";
  const isClose = action === "close";

  const title = isPause
    ? `Pause Subscription ${subscriptionNumber}?`
    : isClose
    ? `Close Subscription ${subscriptionNumber}?`
    : `Confirm Action: ${action}`;

  const description = isPause
    ? "Pausing this subscription will hold future recurring billing cycles from generating invoices until resumed. Any previously issued invoices remain collectible."
    : isClose
    ? "Closing this subscription terminates the contract. Early closure is governed by the subscription plan's policy, and future billing will cease permanently."
    : `Are you sure you want to proceed with the "${action}" transition?`;

  return (
    <div className={styles.modalBackdrop} onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel(); }}>
      <div className={styles.modalDialog} role="alertdialog" aria-modal="true" aria-labelledby="confirm-action-title">
        <div className={styles.modalHeader}>
          <h2 id="confirm-action-title">{title}</h2>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onCancel}
            disabled={loading}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={`${styles.alertBox} ${isClose ? styles.alertError : styles.alertWarning}`}>
            <p style={{ margin: 0 }}>{description}</p>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
            This state change will be validated and processed by the server lifecycle engine.
          </p>
        </div>

        <div className={styles.modalFooter}>
          <button
            type="button"
            className="button button-secondary"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`button ${isClose ? styles.actionBtnDanger : ""}`}
            style={isClose ? { background: "#a13627", borderColor: "#a13627" } : undefined}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Processing..." : isPause ? "Confirm Pause" : isClose ? "Confirm Closure" : "Proceed"}
          </button>
        </div>
      </div>
    </div>
  );
}
