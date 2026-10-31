"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, PageHeader, Panel, ResourceState, StarterNote, Table } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { BillingInterval, Plan, PlanInput, Role, TaxRule } from "@/lib/contracts";
import { formatDate, formatMoney } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import {
  isValidDateString,
  paiseToInputString,
  parseRupeesToPaise,
} from "./catalog-utils";
import { Dialog } from "./dialog";
import styles from "./catalog.module.css";

interface PlanFormData {
  id?: string;
  name: string;
  priceInput: string;
  interval: BillingInterval;
  minimumQuantityInput: string;
  availableFrom: string;
  availableUntil: string;
  autoClose: boolean;
  allowEarlyClose: boolean;
  allowPause: boolean;
  allowRenew: boolean;
  active: boolean;
  taxIds: string[];
}

const DEFAULT_PAGE_SIZE = 10;

const initialPlanData: PlanFormData = {
  name: "",
  priceInput: "0",
  interval: "MONTHLY",
  minimumQuantityInput: "1",
  availableFrom: new Date().toISOString().slice(0, 10),
  availableUntil: "",
  autoClose: true,
  allowEarlyClose: true,
  allowPause: true,
  allowRenew: true,
  active: true,
  taxIds: [],
};

export function PlansPage() {
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [referenceRevision, setReferenceRevision] = useState(0);
  const [role, setRole] = useState<Role | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  // Search & Pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Available taxes for selection
  const [taxesList, setTaxesList] = useState<TaxRule[]>([]);

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isReadOnlyView, setIsReadOnlyView] = useState(false);
  const [formData, setFormData] = useState<PlanFormData>(initialPlanData);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load session role and taxes
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.session.get(),
      api.taxes.list({ pageSize: 100 }),
    ]).then(([session, taxesRes]) => {
      if (!cancelled) {
        setReferenceError(null);
        setRole(session?.user?.role ?? null);
        setRoleLoading(false);
        if (taxesRes?.items) {
          setTaxesList(taxesRes.items);
        }
      }
    }).catch((error: unknown) => {
      if (!cancelled) { setReferenceError(error instanceof Error ? error.message : "Reference data unavailable"); setRoleLoading(false); }
    });
    return () => {
      cancelled = true;
    };
  }, [referenceRevision]);

  const isAdmin = !roleLoading && role === "ADMIN" && !referenceError;

  // Load plans list
  const loadPlans = useCallback(() => {
    return api.plans.list({
      page: currentPage,
      pageSize: DEFAULT_PAGE_SIZE,
      search: activeSearch.trim() || undefined,
    });
  }, [currentPage, activeSearch]);

  const { data, loading, error, refresh } = useResource(loadPlans);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / DEFAULT_PAGE_SIZE)) : 1;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    setActiveSearch(searchTerm);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    setActiveSearch("");
    setCurrentPage(1);
  };

  const openCreateDialog = () => {
    setFormData(initialPlanData);
    setFieldErrors({});
    setGeneralError(null);
    setIsReadOnlyView(false);
    setIsDialogOpen(true);
  };

  const openEditDialog = (plan: Plan, readOnly = false) => {
    setFormData({
      id: plan.id,
      name: plan.name,
      priceInput: paiseToInputString(plan.price),
      interval: plan.interval,
      minimumQuantityInput: String(plan.minimumQuantity),
      availableFrom: plan.availableFrom || "",
      availableUntil: plan.availableUntil || "",
      autoClose: plan.autoClose,
      allowEarlyClose: plan.allowEarlyClose,
      allowPause: plan.allowPause,
      allowRenew: plan.allowRenew,
      active: plan.active,
      taxIds: [...plan.taxIds],
    });
    setFieldErrors({});
    setGeneralError(null);
    setIsReadOnlyView(readOnly);
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setFieldErrors({});
    setGeneralError(null);
  };

  const handleTaxToggle = (taxId: string) => {
    setFormData((prev) => {
      const exists = prev.taxIds.includes(taxId);
      return {
        ...prev,
        taxIds: exists
          ? prev.taxIds.filter((id) => id !== taxId)
          : [...prev.taxIds, taxId],
      };
    });
  };

  const validateForm = (): { valid: boolean; payload?: PlanInput } => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = "Plan name is required.";
    }

    const priceResult = parseRupeesToPaise(formData.priceInput);
    if (!priceResult.ok || priceResult.value === undefined || priceResult.value < 0) {
      errors.price = priceResult.error || "Base fee must be a valid non-negative rupee amount.";
    }

    const minQty = parseInt(formData.minimumQuantityInput, 10);
    if (isNaN(minQty) || minQty < 1) {
      errors.minimumQuantity = "Minimum seats / quantity must be an integer of at least 1.";
    }

    if (!formData.availableFrom.trim() || !isValidDateString(formData.availableFrom.trim())) {
      errors.availableFrom = "Valid available from date (YYYY-MM-DD) is required.";
    }

    let parsedUntil: string | null = null;
    if (formData.availableUntil.trim()) {
      if (!isValidDateString(formData.availableUntil.trim())) {
        errors.availableUntil = "Available until must be a valid date (YYYY-MM-DD) or empty.";
      } else {
        parsedUntil = formData.availableUntil.trim();
        if (formData.availableFrom.trim() && parsedUntil < formData.availableFrom.trim()) {
          errors.availableUntil = "Available until date cannot be earlier than available from date.";
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return { valid: false };
    }

    setFieldErrors({});
    return {
      valid: true,
      payload: {
        name: formData.name.trim(),
        price: priceResult.value!,
        interval: formData.interval,
        minimumQuantity: minQty,
        availableFrom: formData.availableFrom.trim(),
        availableUntil: parsedUntil,
        autoClose: formData.autoClose,
        allowEarlyClose: formData.allowEarlyClose,
        allowPause: formData.allowPause,
        allowRenew: formData.allowRenew,
        active: formData.active,
        taxIds: formData.taxIds,
      },
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnlyView || !isAdmin) return;

    setGeneralError(null);
    const { valid, payload } = validateForm();
    if (!valid || !payload) return;

    setSubmitting(true);
    try {
      if (formData.id) {
        await api.plans.update(formData.id, payload);
        setSuccessBanner(`Plan "${payload.name}" updated successfully.`);
      } else {
        await api.plans.create(payload);
        setSuccessBanner(`Plan "${payload.name}" created successfully.`);
      }
      setIsDialogOpen(false);
      refresh();
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setGeneralError(err.message);
        if (err.fields) {
          setFieldErrors((prev) => ({ ...prev, ...err.fields }));
        }
      } else if (err instanceof Error) {
        setGeneralError(err.message);
      } else {
        setGeneralError("An unexpected error occurred while saving the plan.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {referenceError && <div role="alert" className="state state-error">Reference data could not be loaded: {referenceError} <button type="button" className="button button-secondary" onClick={() => setReferenceRevision(n => n + 1)}>Retry reference data</button></div>}
      <PageHeader
        eyebrow="Catalog / Plans"
        title="A plan for every cycle."
        description="Set recurring base fees, billing intervals, and subscription policies."
        action={
          isAdmin ? (
            <button
              type="button"
              className="button"
              onClick={openCreateDialog}
              aria-label="Create new plan"
            >
              + Add Plan
            </button>
          ) : undefined
        }
      />

      <div className={styles.container}>
        {successBanner && (
          <div className={`${styles.alertBanner} ${styles.alertSuccess}`} role="status">
            <span>✓ {successBanner}</span>
            <button
              type="button"
              className={styles.clearSearchBtn}
              onClick={() => setSuccessBanner(null)}
              aria-label="Dismiss message"
            >
              ✕
            </button>
          </div>
        )}

        <div className={styles.filterBar}>
          <form onSubmit={handleSearchSubmit} className={styles.searchGroup} role="search">
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search plans by name, interval…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search plans"
            />
            <button type="submit" className="button button-secondary" style={{ padding: "8px 14px" }}>
              Search
            </button>
            {activeSearch && (
              <button
                type="button"
                className={styles.clearSearchBtn}
                onClick={handleClearSearch}
                aria-label="Clear search"
              >
                Clear
              </button>
            )}
          </form>

          {data && (
            <div className={styles.pagination}>
              <span>
                {data.total} {data.total === 1 ? "plan" : "plans"}
                {activeSearch && ` matching "${activeSearch}"`}
              </span>
              {totalPages > 1 && (
                <div className={styles.pageControls}>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    disabled={currentPage <= 1 || loading}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    ‹ Prev
                  </button>
                  <span style={{ margin: "0 4px" }}>
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    disabled={currentPage >= totalPages || loading}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="Next page"
                  >
                    Next ›
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <Panel
          title="Subscription plans"
          aside={
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {!roleLoading && (
                <span className={styles.subtleTag}>
                  {isAdmin ? "Admin (Full Access)" : "Staff (Read-Only)"}
                </span>
              )}
            </div>
          }
        >
          <ResourceState
            loading={loading}
            error={error}
            empty={!loading && !error && data?.total === 0}
          />

          {data && data.items.length > 0 && (
            <Table
              headings={[
                "Plan",
                "Base fee / cycle",
                "Interval",
                "Min seats",
                "Availability",
                "Policy Summary",
                "Status",
                "Actions",
              ]}
            >
              {data.items.map((plan) => (
                <tr key={plan.id}>
                  <td>
                    <strong>{plan.name}</strong>
                  </td>
                  <td>
                    {formatMoney(plan.price)}
                    <small style={{ color: "var(--muted)" }}>Once per cycle</small>
                  </td>
                  <td>
                    <Badge value={plan.interval} />
                  </td>
                  <td>{plan.minimumQuantity}</td>
                  <td>
                    <span>{formatDate(plan.availableFrom)}</span>
                    <small style={{ color: "var(--muted)" }}>
                      until {plan.availableUntil ? formatDate(plan.availableUntil) : "Open-ended"}
                    </small>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                      <span className={styles.subtleTag}>
                        Pause: {plan.allowPause ? "Allowed" : "No"}
                      </span>
                      <span className={styles.subtleTag}>
                        Renew: {plan.allowRenew ? "Allowed" : "No"}
                      </span>
                      <span className={styles.subtleTag}>
                        Early Close: {plan.allowEarlyClose ? "Allowed" : "No"}
                      </span>
                      {plan.autoClose && <span className={styles.subtleTag}>Auto-close</span>}
                    </div>
                  </td>
                  <td>
                    <Badge value={plan.active ? "ACTIVE" : "CLOSED"} />
                  </td>
                  <td>
                    <div className={styles.actionsCell}>
                      {isAdmin ? (
                        <button
                          type="button"
                          className={styles.editBtn}
                          onClick={() => openEditDialog(plan, false)}
                          aria-label={`Edit ${plan.name}`}
                        >
                          Edit
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.editBtn}
                          onClick={() => openEditDialog(plan, true)}
                          aria-label={`View ${plan.name}`}
                        >
                          View
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}

          {data && data.items.length === 0 && !loading && (
            <div className={styles.emptyState}>
              <p>No plans found {activeSearch ? `for "${activeSearch}"` : ""}.</p>
              {activeSearch && (
                <button
                  type="button"
                  className="button button-secondary"
                  style={{ marginTop: "12px" }}
                  onClick={handleClearSearch}
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
        </Panel>
      </div>

      <Dialog
        busy={submitting}
        isOpen={isDialogOpen}
        onClose={closeDialog}
        title={
          isReadOnlyView
            ? `View Plan: ${formData.name}`
            : formData.id
            ? `Edit Plan: ${formData.name}`
            : "Add Subscription Plan"
        }
        description={
          isReadOnlyView
            ? "Billing frequency, minimum seats, and contract policies (Read-only for Staff)."
            : "Define recurring cycle parameters, baseline fees, and customer lifecycle privileges."
        }
      >
        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.modalBody}>
            {generalError && (
              <div className={`${styles.alertBanner} ${styles.alertError}`} role="alert">
                <span>⚠ {generalError}</span>
              </div>
            )}

            <div className={styles.formGrid}>
              <div className={`${styles.formGroup} ${styles.formGridFull}`}>
                <label className={styles.formLabel} htmlFor="plan-name">
                  <span>
                    Plan Name {!isReadOnlyView && <span className={styles.requiredAsterisk}>*</span>}
                  </span>
                </label>
                <input
                  id="plan-name"
                  type="text"
                  className={`${styles.formInput} ${fieldErrors.name ? styles.inputError : ""}`}
                  placeholder="e.g. Business Monthly, Enterprise Yearly"
                  value={formData.name}
                  disabled={isReadOnlyView || submitting}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? "plan-name-err" : undefined}
                />
                {fieldErrors.name && (
                  <span id="plan-name-err" className={styles.fieldError} role="alert">
                    {fieldErrors.name}
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="plan-price">
                  <span>
                    Base Fee per Cycle (₹) {!isReadOnlyView && <span className={styles.requiredAsterisk}>*</span>}
                  </span>
                  <span className={styles.labelHint}>Charged once/cycle</span>
                </label>
                <input
                  id="plan-price"
                  type="text"
                  inputMode="decimal"
                  className={`${styles.formInput} ${fieldErrors.price ? styles.inputError : ""}`}
                  placeholder="0.00"
                  value={formData.priceInput}
                  disabled={isReadOnlyView || submitting}
                  onChange={(e) => setFormData({ ...formData, priceInput: e.target.value })}
                  aria-invalid={Boolean(fieldErrors.price)}
                  aria-describedby={fieldErrors.price ? "plan-price-err" : undefined}
                />
                {fieldErrors.price && (
                  <span id="plan-price-err" className={styles.fieldError} role="alert">
                    {fieldErrors.price}
                  </span>
                )}
                <span className={styles.fieldHelp}>
                  Base fee is charged once per cycle in addition to product lines (not multiplied by seat quantity). Can be ₹0.
                </span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="plan-interval">
                  <span>Billing Interval</span>
                </label>
                <select
                  id="plan-interval"
                  className={styles.formSelect}
                  value={formData.interval}
                  disabled={isReadOnlyView || submitting}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      interval: e.target.value as BillingInterval,
                    })
                  }
                >
                  <option value="DAILY">DAILY</option>
                  <option value="WEEKLY">WEEKLY</option>
                  <option value="MONTHLY">MONTHLY</option>
                  <option value="YEARLY">YEARLY</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="plan-min-qty">
                  <span>
                    Minimum Seats / Quantity {!isReadOnlyView && <span className={styles.requiredAsterisk}>*</span>}
                  </span>
                </label>
                <input
                  id="plan-min-qty"
                  type="number"
                  min="1"
                  step="1"
                  className={`${styles.formInput} ${
                    fieldErrors.minimumQuantity ? styles.inputError : ""
                  }`}
                  value={formData.minimumQuantityInput}
                  disabled={isReadOnlyView || submitting}
                  onChange={(e) =>
                    setFormData({ ...formData, minimumQuantityInput: e.target.value })
                  }
                  aria-invalid={Boolean(fieldErrors.minimumQuantity)}
                  aria-describedby={fieldErrors.minimumQuantity ? "plan-min-qty-err" : undefined}
                />
                {fieldErrors.minimumQuantity && (
                  <span id="plan-min-qty-err" className={styles.fieldError} role="alert">
                    {fieldErrors.minimumQuantity}
                  </span>
                )}
                <span className={styles.fieldHelp}>Must be at least 1.</span>
              </div>

              <div className={styles.formGroup}>
                <div className={styles.switchCard} style={{ marginTop: "18px" }}>
                  <input
                    type="checkbox"
                    id="plan-active"
                    className={styles.checkboxInput}
                    checked={formData.active}
                    disabled={isReadOnlyView || submitting}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  />
                  <div className={styles.switchContent}>
                    <label htmlFor="plan-active" className={styles.switchTitle}>
                      Plan Active
                    </label>
                    <span className={styles.switchDescription}>
                      Active plans can be selected for new quotation templates and contracts.
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="plan-avail-from">
                  <span>
                    Available From {!isReadOnlyView && <span className={styles.requiredAsterisk}>*</span>}
                  </span>
                </label>
                <input
                  id="plan-avail-from"
                  type="date"
                  className={`${styles.formInput} ${
                    fieldErrors.availableFrom ? styles.inputError : ""
                  }`}
                  value={formData.availableFrom}
                  disabled={isReadOnlyView || submitting}
                  onChange={(e) =>
                    setFormData({ ...formData, availableFrom: e.target.value })
                  }
                  aria-invalid={Boolean(fieldErrors.availableFrom)}
                  aria-describedby={fieldErrors.availableFrom ? "plan-avail-from-err" : undefined}
                />
                {fieldErrors.availableFrom && (
                  <span id="plan-avail-from-err" className={styles.fieldError} role="alert">
                    {fieldErrors.availableFrom}
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="plan-avail-until">
                  <span>Available Until (Optional)</span>
                </label>
                <input
                  id="plan-avail-until"
                  type="date"
                  className={`${styles.formInput} ${
                    fieldErrors.availableUntil ? styles.inputError : ""
                  }`}
                  value={formData.availableUntil}
                  disabled={isReadOnlyView || submitting}
                  onChange={(e) =>
                    setFormData({ ...formData, availableUntil: e.target.value })
                  }
                  aria-invalid={Boolean(fieldErrors.availableUntil)}
                  aria-describedby={fieldErrors.availableUntil ? "plan-avail-until-err" : undefined}
                />
                {fieldErrors.availableUntil && (
                  <span id="plan-avail-until-err" className={styles.fieldError} role="alert">
                    {fieldErrors.availableUntil}
                  </span>
                )}
                <span className={styles.fieldHelp}>
                  Leave blank for open-ended availability. Restricts new signups, not existing subscription expiry.
                </span>
              </div>

              {/* Tax selection for base fee */}
              <div className={`${styles.formGroup} ${styles.formGridFull}`}>
                <label className={styles.formLabel}>
                  <span>Base Fee Applicable Taxes</span>
                  <span className={styles.labelHint}>Taxes applied to plan base fee</span>
                </label>
                <div className={styles.selectionList}>
                  {taxesList.length > 0 ? (
                    taxesList.map((tax) => {
                      const isChecked = formData.taxIds.includes(tax.id);
                      return (
                        <label key={tax.id} className={styles.selectionItem}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isReadOnlyView || submitting}
                            onChange={() => handleTaxToggle(tax.id)}
                            className={styles.checkboxInput}
                          />
                          <span>
                            <strong>{tax.name}</strong> ({tax.rateBps / 100}%)
                            {!tax.active && (
                              <span style={{ color: "#a14536", marginLeft: "6px", fontSize: "10px" }}>
                                [Inactive]
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })
                  ) : (
                    <p style={{ margin: "4px", fontSize: "11px", color: "var(--muted)" }}>
                      No configured taxes found in the system.
                    </p>
                  )}
                  {/* Handle tax IDs stored in plan that are no longer in taxesList */}
                  {formData.taxIds
                    .filter((tid) => !taxesList.some((t) => t.id === tid))
                    .map((missingId) => (
                      <label key={missingId} className={styles.selectionItem}>
                        <input
                          type="checkbox"
                          checked={true}
                          disabled={isReadOnlyView || submitting}
                          onChange={() => handleTaxToggle(missingId)}
                          className={styles.checkboxInput}
                        />
                        <span style={{ color: "#a14536" }}>
                          Referenced Tax ID: <code>{missingId}</code> (Unavailable in catalog)
                        </span>
                      </label>
                    ))}
                </div>
              </div>

              {/* Policy Switches */}
              <div className={`${styles.formGroup} ${styles.formGridFull}`}>
                <label className={styles.formLabel}>
                  <span>Lifecycle Policies & Customer Permissions</span>
                </label>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div className={styles.switchCard}>
                    <input
                      type="checkbox"
                      id="policy-auto-close"
                      className={styles.checkboxInput}
                      checked={formData.autoClose}
                      disabled={isReadOnlyView || submitting}
                      onChange={(e) => setFormData({ ...formData, autoClose: e.target.checked })}
                    />
                    <div className={styles.switchContent}>
                      <label htmlFor="policy-auto-close" className={styles.switchTitle}>
                        Automatic Expiry Closure (autoClose)
                      </label>
                      <span className={styles.switchDescription}>
                        Automatically close subscription when contract expiry date is reached. If disabled, contracts await manual renewal.
                      </span>
                    </div>
                  </div>

                  <div className={styles.switchCard}>
                    <input
                      type="checkbox"
                      id="policy-early-close"
                      className={styles.checkboxInput}
                      checked={formData.allowEarlyClose}
                      disabled={isReadOnlyView || submitting}
                      onChange={(e) =>
                        setFormData({ ...formData, allowEarlyClose: e.target.checked })
                      }
                    />
                    <div className={styles.switchContent}>
                      <label htmlFor="policy-early-close" className={styles.switchTitle}>
                        Allow Early Closure (allowEarlyClose)
                      </label>
                      <span className={styles.switchDescription}>
                        Permit customer or staff to close an active subscription before scheduled contract expiry.
                      </span>
                    </div>
                  </div>

                  <div className={styles.switchCard}>
                    <input
                      type="checkbox"
                      id="policy-pause"
                      className={styles.checkboxInput}
                      checked={formData.allowPause}
                      disabled={isReadOnlyView || submitting}
                      onChange={(e) => setFormData({ ...formData, allowPause: e.target.checked })}
                    />
                    <div className={styles.switchContent}>
                      <label htmlFor="policy-pause" className={styles.switchTitle}>
                        Allow Billing Pause (allowPause)
                      </label>
                      <span className={styles.switchDescription}>
                        Permit customers or staff to pause future billing cycles.
                      </span>
                    </div>
                  </div>

                  <div className={styles.switchCard}>
                    <input
                      type="checkbox"
                      id="policy-renew"
                      className={styles.checkboxInput}
                      checked={formData.allowRenew}
                      disabled={isReadOnlyView || submitting}
                      onChange={(e) => setFormData({ ...formData, allowRenew: e.target.checked })}
                    />
                    <div className={styles.switchContent}>
                      <label htmlFor="policy-renew" className={styles.switchTitle}>
                        Allow Renewal (allowRenew)
                      </label>
                      <span className={styles.switchDescription}>
                        Permit customer or staff to renew or extend the contract term at cycle end.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className="button button-secondary"
              onClick={closeDialog}
              disabled={submitting}
            >
              {isReadOnlyView ? "Close" : "Cancel"}
            </button>
            {!isReadOnlyView && (
              <button
                type="submit"
                className="button"
                disabled={submitting}
                aria-busy={submitting}
              >
                {submitting ? "Saving…" : formData.id ? "Update Plan" : "Create Plan"}
              </button>
            )}
          </div>
        </form>
      </Dialog>

      <StarterNote owner="Athul">
        Plan creation, editing, availability windows, and policy switches are fully implemented.
        Base fee is charged once per cycle in addition to product lines.
      </StarterNote>
    </>
  );
}
