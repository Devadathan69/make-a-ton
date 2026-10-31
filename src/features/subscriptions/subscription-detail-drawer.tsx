"use client";

import { useEffect, useState } from "react";
import type { Subscription, SubscriptionAction, SubscriptionStatus } from "@/lib/contracts";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { ActionConfirmDialog } from "./action-confirm-dialog";
import { BillingEstimateModal } from "./billing-estimate-modal";
import styles from "./subscriptions.module.css";

interface SubscriptionDetailDrawerProps {
  subscriptionId: string | null;
  onClose: () => void;
  onRefreshList: () => void;
  onEditDraft?: (sub: Subscription) => void;
}

export function SubscriptionDetailDrawer({
  subscriptionId,
  onClose,
  onRefreshList,
  onEditDraft,
}: SubscriptionDetailDrawerProps) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Transition state
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<SubscriptionAction | null>(null);

  // Estimate modal
  const [isEstimateOpen, setIsEstimateOpen] = useState(false);

  // Fetch subscription detail
  useEffect(() => {
    if (!subscriptionId) return;

    let cancelled = false;

    api.subscriptions
      .get(subscriptionId)
      .then((data) => {
        if (!cancelled) {
          setSubscription(data);
          setError(null);
          setTransitionError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 404) {
            setError("Subscription record not found or inaccessible.");
          } else {
            setError(err instanceof Error ? err.message : "Unable to load subscription details");
          }
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [subscriptionId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !confirmingAction && !isEstimateOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmingAction, isEstimateOpen, onClose]);

  if (!subscriptionId) return null;

  // Execute transition
  const executeTransition = async (action: SubscriptionAction) => {
    if (!subscription) return;
    setTransitioning(true);
    setTransitionError(null);

    try {
      const updated = await api.subscriptions.transition(subscription.id, action);
      setSubscription(updated);
      setConfirmingAction(null);
      onRefreshList();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setTransitionError(err.message);
      } else if (err instanceof Error) {
        setTransitionError(err.message);
      } else {
        setTransitionError(`Transition '${action}' failed on server`);
      }
    } finally {
      setTransitioning(false);
    }
  };

  const handleActionClick = (action: SubscriptionAction) => {
    if (action === "pause" || action === "close") {
      setConfirmingAction(action);
    } else {
      executeTransition(action);
    }
  };

  // Human-readable labels for allowed actions
  const actionLabels: Record<SubscriptionAction, { label: string; primary?: boolean; warning?: boolean; danger?: boolean }> = {
    quote: { label: "Send as Quotation", primary: true },
    confirm: { label: "Confirm Subscription", primary: true },
    activate: { label: "Activate Contract", primary: true },
    pause: { label: "Pause Subscription", warning: true },
    resume: { label: "Resume Subscription", primary: true },
    renew: { label: "Renew Contract", primary: true },
    close: { label: "Close Contract", danger: true },
  };

  const isEditable = subscription?.status === "DRAFT" || subscription?.status === "QUOTATION";

  return (
    <div
      className={styles.drawerOverlay}
      onClick={(e) => {
        if (e.target === e.currentTarget && !transitioning) onClose();
      }}
    >
      <div className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className={styles.drawerHeader}>
          <div className={styles.drawerTitleGroup}>
            <span className="eyebrow" style={{ fontSize: 9 }}>
              Subscription Details
            </span>
            <h2 id="drawer-title">
              {loading ? "Loading..." : subscription?.number ?? "Subscription"}
            </h2>
          </div>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onClose}
            disabled={transitioning}
            aria-label="Close details"
          >
            ✕
          </button>
        </div>

        <div className={styles.drawerContent}>
          {loading && <p className="state">Retrieving subscription details...</p>}

          {error && (
            <div className={`${styles.alertBox} ${styles.alertError}`} role="alert">
              <strong>Error:</strong> {error}
            </div>
          )}

          {transitionError && (
            <div className={`${styles.alertBox} ${styles.alertWarning}`} role="alert">
              <strong>Lifecycle Action Notice:</strong>
              <p style={{ margin: "4px 0 0" }}>{transitionError}</p>
              <p style={{ margin: "4px 0 0", fontSize: 11, opacity: 0.85 }}>
                Current state is preserved. In mock mode, lifecycle state machines require connected backend.
              </p>
            </div>
          )}

          {subscription && (
            <>
              {/* Lifecycle Stage Visual Stepper */}
              <div>
                <span className={styles.detailLabel} style={{ marginBottom: 6, display: "block" }}>
                  Lifecycle Stage Progression
                </span>
                <div className={styles.stageStepper}>
                  {(["DRAFT", "QUOTATION", "CONFIRMED", "ACTIVE", "CLOSED"] as SubscriptionStatus[]).map(
                    (stage, idx, arr) => {
                      const isCurrent = subscription.status === stage;
                      const isPast =
                        arr.indexOf(stage) < arr.indexOf(subscription.status as SubscriptionStatus) &&
                        subscription.status !== "PAUSED";

                      return (
                        <div key={stage} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span
                            className={`${styles.stageStep} ${
                              isCurrent
                                ? stage === "CLOSED"
                                  ? styles.stageStepClosed
                                  : styles.stageStepCurrent
                                : isPast
                                ? styles.stageStepActive
                                : ""
                            }`}
                          >
                            {stage}
                          </span>
                          {idx < arr.length - 1 && <span className={styles.stageArrow}>→</span>}
                        </div>
                      );
                    }
                  )}
                  {subscription.status === "PAUSED" && (
                    <div style={{ marginLeft: 8 }}>
                      <span className={`${styles.stageStep} ${styles.stageStepPaused}`}>
                        ⏸ PAUSED (On Hold)
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Controls from allowedActions ONLY */}
              <div className={styles.lineItemsBox} style={{ background: "#fcfdfc" }}>
                <div className={styles.lineItemsHeader}>
                  <h3>Permitted Lifecycle Actions</h3>
                  <small style={{ color: "var(--muted)" }}>Driven by server policy</small>
                </div>
                <div style={{ padding: 16 }}>
                  {subscription.allowedActions && subscription.allowedActions.length > 0 ? (
                    <div className={styles.actionBar}>
                      {subscription.allowedActions.map((action) => {
                        const meta = actionLabels[action] || { label: action };
                        const btnClass = meta.danger
                          ? styles.actionBtnDanger
                          : meta.warning
                          ? styles.actionBtnWarning
                          : meta.primary
                          ? styles.actionBtnPrimary
                          : "";

                        return (
                          <button
                            key={action}
                            type="button"
                            className={`${styles.actionBtn} ${btnClass}`}
                            onClick={() => handleActionClick(action)}
                            disabled={transitioning}
                          >
                            {transitioning ? "Processing..." : meta.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                      No stage actions currently permitted for this contract state.
                    </p>
                  )}
                </div>
              </div>

              {/* General Metadata Grid */}
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Customer</span>
                  <span className={styles.detailValue}>{subscription.customerName}</span>
                  <small style={{ color: "var(--muted)", fontSize: 10 }}>ID: {subscription.customerId}</small>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Plan</span>
                  <span className={styles.detailValue}>{subscription.planName}</span>
                  <small style={{ color: "var(--muted)", fontSize: 10 }}>ID: {subscription.planId}</small>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Start Date</span>
                  <span className={styles.detailValue}>{formatDate(subscription.startDate)}</span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Next Billing Date</span>
                  <span className={styles.detailValue}>
                    {subscription.nextBillingDate ? formatDate(subscription.nextBillingDate) : "None scheduled"}
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Payment Terms</span>
                  <span className={styles.detailValue}>{subscription.paymentTermsDays} days</span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Quotation Validity</span>
                  <span className={styles.detailValue}>
                    {subscription.quotationValidUntil ? formatDate(subscription.quotationValidUntil) : "—"}
                  </span>
                </div>

                {subscription.expiryDate && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Contract Expiry</span>
                    <span className={styles.detailValue}>{formatDate(subscription.expiryDate)}</span>
                  </div>
                )}
              </div>

              {/* Lines table */}
              <div className={styles.lineItemsBox}>
                <div className={styles.lineItemsHeader}>
                  <h3>Contract Product Lines ({subscription.lines.length})</h3>
                  {isEditable && onEditDraft && (
                    <button
                      type="button"
                      className="button button-secondary"
                      style={{ padding: "4px 10px", fontSize: 11 }}
                      onClick={() => onEditDraft(subscription)}
                    >
                      Edit Lines / Draft
                    </button>
                  )}
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8faf9", borderBottom: "1px solid var(--line)" }}>
                      <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 10 }}>Description</th>
                      <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 10 }}>Qty</th>
                      <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 10 }}>Unit Price</th>
                      <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 10 }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscription.lines.map((line) => (
                      <tr key={line.id} style={{ borderBottom: "1px solid #f0f2ee" }}>
                        <td style={{ padding: "12px 14px", fontSize: 12 }}>
                          <strong>{line.description}</strong>
                          {line.taxIds?.length > 0 && (
                            <small style={{ display: "block", color: "var(--muted)", fontSize: 10 }}>
                              Taxes: {line.taxIds.join(", ")}
                            </small>
                          )}
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "right", fontSize: 12 }}>{line.quantity}</td>
                        <td style={{ padding: "12px 14px", textAlign: "right", fontSize: 12 }}>
                          {formatMoney(line.unitPrice)}
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "right", fontSize: 12, fontWeight: 600 }}>
                          {formatMoney(line.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className={styles.drawerFooter}>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setIsEstimateOpen(true)}
            disabled={!subscription || loading}
          >
            📋 Preview Billing Estimate
          </button>

          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>

      {/* Confirmation Dialog for disruptive transitions */}
      <ActionConfirmDialog
        isOpen={Boolean(confirmingAction)}
        action={confirmingAction}
        subscriptionNumber={subscription?.number ?? ""}
        onConfirm={() => confirmingAction && executeTransition(confirmingAction)}
        onCancel={() => setConfirmingAction(null)}
        loading={transitioning}
      />

      {/* Billing Estimate Modal */}
      {subscription && (
        <BillingEstimateModal
          isOpen={isEstimateOpen}
          subscriptionId={subscription.id}
          subscriptionNumber={subscription.number}
          onClose={() => setIsEstimateOpen(false)}
        />
      )}
    </div>
  );
}
