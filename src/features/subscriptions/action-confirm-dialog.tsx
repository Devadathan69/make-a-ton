"use client";

import { useDialog } from "@/components/use-dialog";
import styles from "./subscriptions.module.css";
import type { SubscriptionAction } from "@/lib/contracts";

interface ActionConfirmDialogProps {
  isOpen: boolean;
  action: SubscriptionAction | null;
  subscriptionNumber: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  requiresStartDate?: boolean;
  startDate?: string;
  onStartDateChange?: (value: string) => void;
}

export function ActionConfirmDialog({
  isOpen,
  action,
  subscriptionNumber,
  onConfirm,
  onCancel,
  loading,
  requiresStartDate = false,
  startDate = "",
  onStartDateChange,
}: ActionConfirmDialogProps) {
  const dialogId = useDialog(isOpen && Boolean(action), onCancel, loading);

  if (!isOpen || !action) return null;

  const isPause = action === "pause";
  const isClose = action === "close";
  const isResume = action === "resume";

  const title = isPause
    ? `Pause Subscription ${subscriptionNumber}?`
    : isClose
    ? `Close Subscription ${subscriptionNumber}?`
    : isResume ? `Resume Subscription ${subscriptionNumber}?` : `Confirm Action: ${action}`;

  const description = requiresStartDate ? "Renewal starts a new future cycle under the confirmed contract economics. Choose an explicit future start date; current plan availability is validated by the server." : isPause
    ? "Pausing this subscription will hold future recurring billing cycles from generating invoices until resumed. Any previously issued invoices remain collectible."
    : isClose
    ? "Closing this subscription terminates the contract. Early closure is governed by the subscription plan's policy, and future billing will cease permanently."
    : isResume ? "Resume starts a fresh billing cycle today. Unused paid time is not refunded. A finite expiry must align with the new billing anchor; the server validates the boundary." : `Are you sure you want to proceed with the "${action}" transition?`;

  return (
    <div className={styles.modalBackdrop} onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel(); }}>
      <div className={styles.modalDialog} data-dialog-root={dialogId} role="alertdialog" aria-modal="true" aria-labelledby="confirm-action-title">
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

        {requiresStartDate && <label className={styles.modalBody}>New cycle start date<input aria-label="New cycle start date" type="date" value={startDate} onChange={e=>onStartDateChange?.(e.target.value)} disabled={loading} required/></label>}
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
            disabled={loading || (requiresStartDate && !startDate)}
          >
            {loading ? "Processing..." : isPause ? "Confirm Pause" : isClose ? "Confirm Closure" : "Proceed"}
          </button>
        </div>
      </div>
    </div>
  );
}
