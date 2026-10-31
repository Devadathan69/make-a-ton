"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, PageHeader, Panel, ResourceState, StarterNote, Table } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type {
  DiscountInput,
  DiscountRule,
  Product,
  Role,
  TaxInput,
  TaxRule,
} from "@/lib/contracts";
import { formatDate, formatMoney } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import {
  bpsToInputString,
  formatRateBps,
  isValidDateString,
  paiseToInputString,
  parseRateBps,
  parseRupeesToPaise,
} from "./catalog-utils";
import { Dialog } from "./dialog";
import styles from "./catalog.module.css";

// Tax form state
interface TaxFormData {
  id?: string;
  name: string;
  rateInput: string;
  active: boolean;
}

const initialTaxData: TaxFormData = {
  name: "",
  rateInput: "10",
  active: true,
};

// Discount form state
interface DiscountFormData {
  id?: string;
  name: string;
  kind: "FIXED" | "PERCENTAGE";
  valueInput: string;
  scope: "PRODUCT" | "SUBSCRIPTION";
  productIds: string[];
  minimumPurchaseInput: string;
  minimumQuantityInput: string;
  startsAt: string;
  endsAt: string;
  usageLimitInput: string;
  usageCount: number;
  active: boolean;
}

const initialDiscountData: DiscountFormData = {
  name: "",
  kind: "PERCENTAGE",
  valueInput: "10",
  scope: "SUBSCRIPTION",
  productIds: [],
  minimumPurchaseInput: "0",
  minimumQuantityInput: "1",
  startsAt: new Date().toISOString().slice(0, 10),
  endsAt: "",
  usageLimitInput: "",
  usageCount: 0,
  active: true,
};

export function RulesPage() {
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [referenceRevision, setReferenceRevision] = useState(0);
  const [role, setRole] = useState<Role | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  // Success banner
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Available products for discount scope selection
  const [productList, setProductList] = useState<Product[]>([]);

  // Tax filter & pagination
  const [taxSearch, setTaxSearch] = useState("");
  const [taxActiveSearch, setTaxActiveSearch] = useState("");

  // Discount filter & pagination
  const [discountSearch, setDiscountSearch] = useState("");
  const [discountActiveSearch, setDiscountActiveSearch] = useState("");

  // Tax Dialog state
  const [isTaxDialogOpen, setIsTaxDialogOpen] = useState(false);
  const [isTaxReadOnly, setIsTaxReadOnly] = useState(false);
  const [taxFormData, setTaxFormData] = useState<TaxFormData>(initialTaxData);
  const [taxFieldErrors, setTaxFieldErrors] = useState<Record<string, string>>({});
  const [taxGeneralError, setTaxGeneralError] = useState<string | null>(null);
  const [taxSubmitting, setTaxSubmitting] = useState(false);

  // Discount Dialog state
  const [isDiscountDialogOpen, setIsDiscountDialogOpen] = useState(false);
  const [isDiscountReadOnly, setIsDiscountReadOnly] = useState(false);
  const [discountFormData, setDiscountFormData] = useState<DiscountFormData>(initialDiscountData);
  const [discountFieldErrors, setDiscountFieldErrors] = useState<Record<string, string>>({});
  const [discountGeneralError, setDiscountGeneralError] = useState<string | null>(null);
  const [discountSubmitting, setDiscountSubmitting] = useState(false);

  // Load session role and products
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.session.get(),
      api.products.list({ pageSize: 100 }),
    ]).then(([session, prodRes]) => {
      if (!cancelled) {
        setReferenceError(null);
        setRole(session?.user?.role ?? null);
        setRoleLoading(false);
        if (prodRes?.items) {
          setProductList(prodRes.items);
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

  // Load Taxes and Discounts
  const loadRules = useCallback(async () => {
    const [taxesRes, discountsRes] = await Promise.all([
      api.taxes.list({ search: taxActiveSearch.trim() || undefined, pageSize: 100 }),
      api.discounts.list({ search: discountActiveSearch.trim() || undefined, pageSize: 100 }),
    ]);
    return { taxes: taxesRes, discounts: discountsRes };
  }, [taxActiveSearch, discountActiveSearch]);

  const { data, loading, error, refresh } = useResource(loadRules);

  /* ------------------- Tax Form Handlers ------------------- */
  const openCreateTaxDialog = () => {
    setTaxFormData(initialTaxData);
    setTaxFieldErrors({});
    setTaxGeneralError(null);
    setIsTaxReadOnly(false);
    setIsTaxDialogOpen(true);
  };

  const openEditTaxDialog = (tax: TaxRule, readOnly = false) => {
    setTaxFormData({
      id: tax.id,
      name: tax.name,
      rateInput: bpsToInputString(tax.rateBps),
      active: tax.active,
    });
    setTaxFieldErrors({});
    setTaxGeneralError(null);
    setIsTaxReadOnly(readOnly);
    setIsTaxDialogOpen(true);
  };

  const handleTaxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isTaxReadOnly || !isAdmin) return;

    setTaxGeneralError(null);
    const errors: Record<string, string> = {};

    if (!taxFormData.name.trim()) {
      errors.name = "Tax rule name is required.";
    }

    const rateResult = parseRateBps(taxFormData.rateInput);
    if (!rateResult.ok || rateResult.value === undefined) {
      errors.rate = rateResult.error || "Enter a valid percentage with at most two decimal places (0% to 100%).";
    }

    if (Object.keys(errors).length > 0) {
      setTaxFieldErrors(errors);
      return;
    }

    setTaxFieldErrors({});
    setTaxSubmitting(true);

    const payload: TaxInput = {
      name: taxFormData.name.trim(),
      rateBps: rateResult.value!,
      active: taxFormData.active,
    };

    try {
      if (taxFormData.id) {
        await api.taxes.update(taxFormData.id, payload);
        setSuccessBanner(`Tax rule "${payload.name}" updated successfully.`);
      } else {
        await api.taxes.create(payload);
        setSuccessBanner(`Tax rule "${payload.name}" created successfully.`);
      }
      setIsTaxDialogOpen(false);
      refresh();
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setTaxGeneralError(err.message);
        if (err.fields) {
          setTaxFieldErrors((prev) => ({ ...prev, ...err.fields }));
        }
      } else if (err instanceof Error) {
        setTaxGeneralError(err.message);
      } else {
        setTaxGeneralError("An unexpected error occurred while saving the tax rule.");
      }
    } finally {
      setTaxSubmitting(false);
    }
  };

  /* ------------------- Discount Form Handlers ------------------- */
  const openCreateDiscountDialog = () => {
    setDiscountFormData(initialDiscountData);
    setDiscountFieldErrors({});
    setDiscountGeneralError(null);
    setIsDiscountReadOnly(false);
    setIsDiscountDialogOpen(true);
  };

  const openEditDiscountDialog = (discount: DiscountRule, readOnly = false) => {
    setDiscountFormData({
      id: discount.id,
      name: discount.name,
      kind: discount.kind,
      valueInput:
        discount.kind === "FIXED"
          ? paiseToInputString(discount.value)
          : bpsToInputString(discount.value),
      scope: discount.scope,
      productIds: [...discount.productIds],
      minimumPurchaseInput: paiseToInputString(discount.minimumPurchase),
      minimumQuantityInput: String(discount.minimumQuantity),
      startsAt: discount.startsAt || "",
      endsAt: discount.endsAt || "",
      usageLimitInput: discount.usageLimit !== null ? String(discount.usageLimit) : "",
      usageCount: discount.usageCount ?? 0,
      active: discount.active,
    });
    setDiscountFieldErrors({});
    setDiscountGeneralError(null);
    setIsDiscountReadOnly(readOnly);
    setIsDiscountDialogOpen(true);
  };

  // Reset value when changing kind so rupees are not misread as a percentage!
  const handleDiscountKindChange = (newKind: "FIXED" | "PERCENTAGE") => {
    setDiscountFormData((prev) => ({
      ...prev,
      kind: newKind,
      valueInput: newKind === "PERCENTAGE" ? "10" : "100",
    }));
    setDiscountFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy.value;
      return copy;
    });
  };

  const handleProductToggle = (productId: string) => {
    setDiscountFormData((prev) => {
      const exists = prev.productIds.includes(productId);
      return {
        ...prev,
        productIds: exists
          ? prev.productIds.filter((id) => id !== productId)
          : [...prev.productIds, productId],
      };
    });
  };

  const handleDiscountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDiscountReadOnly || !isAdmin) return;

    setDiscountGeneralError(null);
    const errors: Record<string, string> = {};

    if (!discountFormData.name.trim()) {
      errors.name = "Discount rule name is required.";
    }

    let calculatedValue = 0;
    if (discountFormData.kind === "PERCENTAGE") {
      const rateRes = parseRateBps(discountFormData.valueInput);
      if (!rateRes.ok || rateRes.value === undefined) {
        errors.value = rateRes.error || "Enter a valid percentage between 0% and 100%.";
      } else {
        calculatedValue = rateRes.value;
      }
    } else {
      const paiseRes = parseRupeesToPaise(discountFormData.valueInput);
      if (!paiseRes.ok || paiseRes.value === undefined || paiseRes.value < 0) {
        errors.value = paiseRes.error || "Enter a valid non-negative rupee amount.";
      } else {
        calculatedValue = paiseRes.value;
      }
    }

    if (discountFormData.scope === "PRODUCT") {
      if (discountFormData.productIds.length === 0) {
        errors.productIds = "Select at least one product for a product-scoped discount.";
      }
    }

    const minPurchaseRes = parseRupeesToPaise(discountFormData.minimumPurchaseInput);
    if (!minPurchaseRes.ok || minPurchaseRes.value === undefined || minPurchaseRes.value < 0) {
      errors.minimumPurchase = "Minimum purchase must be a valid non-negative rupee amount.";
    }

    const minQty = parseInt(discountFormData.minimumQuantityInput, 10);
    if (isNaN(minQty) || minQty < 1) {
      errors.minimumQuantity = "Minimum quantity must be an integer of at least 1.";
    }

    if (!discountFormData.startsAt.trim() || !isValidDateString(discountFormData.startsAt.trim())) {
      errors.startsAt = "Valid start date (YYYY-MM-DD) is required.";
    }

    let parsedEndsAt: string | null = null;
    if (discountFormData.endsAt.trim()) {
      if (!isValidDateString(discountFormData.endsAt.trim())) {
        errors.endsAt = "End date must be a valid date (YYYY-MM-DD) or empty.";
      } else {
        parsedEndsAt = discountFormData.endsAt.trim();
        if (discountFormData.startsAt.trim() && parsedEndsAt < discountFormData.startsAt.trim()) {
          errors.endsAt = "End date cannot be earlier than start date.";
        }
      }
    }

    let parsedUsageLimit: number | null = null;
    if (discountFormData.usageLimitInput.trim()) {
      const limit = parseInt(discountFormData.usageLimitInput.trim(), 10);
      if (isNaN(limit) || limit < 1) {
        errors.usageLimit = "Usage limit must be a positive integer or empty for unlimited.";
      } else {
        parsedUsageLimit = limit;
      }
    }

    if (Object.keys(errors).length > 0) {
      setDiscountFieldErrors(errors);
      return;
    }

    setDiscountFieldErrors({});
    setDiscountSubmitting(true);

    const payload: DiscountInput = {
      name: discountFormData.name.trim(),
      kind: discountFormData.kind,
      value: calculatedValue,
      scope: discountFormData.scope,
      productIds: discountFormData.scope === "PRODUCT" ? discountFormData.productIds : [],
      minimumPurchase: minPurchaseRes.value!,
      minimumQuantity: minQty,
      startsAt: discountFormData.startsAt.trim(),
      endsAt: parsedEndsAt,
      usageLimit: parsedUsageLimit,
      active: discountFormData.active,
    };

    try {
      if (discountFormData.id) {
        await api.discounts.update(discountFormData.id, payload);
        setSuccessBanner(`Discount rule "${payload.name}" updated successfully.`);
      } else {
        await api.discounts.create(payload);
        setSuccessBanner(`Discount rule "${payload.name}" created successfully.`);
      }
      setIsDiscountDialogOpen(false);
      refresh();
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setDiscountGeneralError(err.message);
        if (err.fields) {
          setDiscountFieldErrors((prev) => ({ ...prev, ...err.fields }));
        }
      } else if (err instanceof Error) {
        setDiscountGeneralError(err.message);
      } else {
        setDiscountGeneralError("An unexpected error occurred while saving the discount rule.");
      }
    } finally {
      setDiscountSubmitting(false);
    }
  };

  return (
    <>
      {referenceError && <div role="alert" className="state state-error">Reference data could not be loaded: {referenceError} <button type="button" className="button button-secondary" onClick={() => setReferenceRevision(n => n + 1)}>Retry reference data</button></div>}
      <PageHeader
        eyebrow="Catalog / Rules"
        title="Every charge, explained."
        description="Configure tax and discount rules that billing can apply consistently."
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

        <ResourceState loading={loading} error={error} />

        {/* Section 1: Tax Rules */}
        <Panel
          title="Tax rules"
          aside={
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              {!roleLoading && (
                <span className={styles.subtleTag}>
                  {isAdmin ? "Admin (Full Access)" : "Staff (Read-Only)"}
                </span>
              )}
              {isAdmin && (
                <button
                  type="button"
                  className="button"
                  style={{ padding: "6px 12px", fontSize: "11px" }}
                  onClick={openCreateTaxDialog}
                  aria-label="Create new tax rule"
                >
                  + Add Tax Rule
                </button>
              )}
            </div>
          }
        >
          <div className={styles.variantNotice} style={{ margin: "16px 20px 0" }}>
            <strong>Illustrative tax configuration:</strong> Configured tax rates are illustrative
            demonstrations and do not constitute legal or statutory tax advice. Taxes are snapshot
            at contract confirmation and computed deterministically per line item.
          </div>

          <div className={styles.filterBar} style={{ margin: "14px 20px" }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setTaxActiveSearch(taxSearch);
              }}
              className={styles.searchGroup}
              role="search"
            >
              <input
                type="search"
                className={styles.searchInput}
                placeholder="Search tax rules…"
                value={taxSearch}
                onChange={(e) => setTaxSearch(e.target.value)}
                aria-label="Search tax rules"
              />
              <button type="submit" className="button button-secondary" style={{ padding: "6px 12px" }}>
                Filter
              </button>
              {taxActiveSearch && (
                <button
                  type="button"
                  className={styles.clearSearchBtn}
                  onClick={() => {
                    setTaxSearch("");
                    setTaxActiveSearch("");
                  }}
                >
                  Clear
                </button>
              )}
            </form>
          </div>

          {data && data.taxes.items.length > 0 ? (
            <Table headings={["Name", "Percentage Rate", "Basis Points", "Status", "Actions"]}>
              {data.taxes.items.map((tax) => (
                <tr key={tax.id}>
                  <td>
                    <strong>{tax.name}</strong>
                  </td>
                  <td>{formatRateBps(tax.rateBps)}</td>
                  <td>
                    <code>{tax.rateBps} bps</code>
                  </td>
                  <td>
                    <Badge value={tax.active ? "ACTIVE" : "CLOSED"} />
                  </td>
                  <td>
                    <div className={styles.actionsCell}>
                      {isAdmin ? (
                        <button
                          type="button"
                          className={styles.editBtn}
                          onClick={() => openEditTaxDialog(tax, false)}
                          aria-label={`Edit ${tax.name}`}
                        >
                          Edit
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.editBtn}
                          onClick={() => openEditTaxDialog(tax, true)}
                          aria-label={`View ${tax.name}`}
                        >
                          View
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            data && (
              <div className={styles.emptyState}>
                <p>No tax rules found.</p>
              </div>
            )
          )}
        </Panel>

        {/* Section 2: Discount Rules */}
        <Panel
          title="Discount rules"
          aside={
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              {!roleLoading && (
                <span className={styles.subtleTag}>
                  {isAdmin ? "Admin (Full Access)" : "Staff (Read-Only)"}
                </span>
              )}
              {isAdmin && (
                <button
                  type="button"
                  className="button"
                  style={{ padding: "6px 12px", fontSize: "11px" }}
                  onClick={openCreateDiscountDialog}
                  aria-label="Create new discount rule"
                >
                  + Add Discount Rule
                </button>
              )}
            </div>
          }
        >
          <div className={styles.variantNotice} style={{ margin: "16px 20px 0" }}>
            <strong>Automatic billing application:</strong> Discount rules are evaluated
            automatically during billing invoice generation. Application depends on invoice subtotal,
            minimum seat count, and validity period. Discounts are never manually triggered or altered.
          </div>

          <div className={styles.filterBar} style={{ margin: "14px 20px" }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setDiscountActiveSearch(discountSearch);
              }}
              className={styles.searchGroup}
              role="search"
            >
              <input
                type="search"
                className={styles.searchInput}
                placeholder="Search discount rules by name, scope…"
                value={discountSearch}
                onChange={(e) => setDiscountSearch(e.target.value)}
                aria-label="Search discounts"
              />
              <button type="submit" className="button button-secondary" style={{ padding: "6px 12px" }}>
                Filter
              </button>
              {discountActiveSearch && (
                <button
                  type="button"
                  className={styles.clearSearchBtn}
                  onClick={() => {
                    setDiscountSearch("");
                    setDiscountActiveSearch("");
                  }}
                >
                  Clear
                </button>
              )}
            </form>
          </div>

          {data && data.discounts.items.length > 0 ? (
            <Table
              headings={[
                "Rule",
                "Value",
                "Scope",
                "Eligibility & Minimums",
                "Validity Dates",
                "Usage (Uses / Cap)",
                "Status",
                "Actions",
              ]}
            >
              {data.discounts.items.map((discount) => {
                const isFixed = discount.kind === "FIXED";
                const displayValue = isFixed
                  ? formatMoney(discount.value)
                  : formatRateBps(discount.value);
                const remainingUses =
                  discount.usageLimit !== null
                    ? Math.max(0, discount.usageLimit - discount.usageCount)
                    : null;

                return (
                  <tr key={discount.id}>
                    <td>
                      <strong>{discount.name}</strong>
                    </td>
                    <td>
                      <strong>{displayValue}</strong>
                      <small style={{ color: "var(--muted)" }}>{discount.kind}</small>
                    </td>
                    <td>
                      <Badge value={discount.scope} />
                      {discount.scope === "PRODUCT" && (
                        <small style={{ color: "var(--muted)" }}>
                          {discount.productIds.length} product
                          {discount.productIds.length === 1 ? "" : "s"}
                        </small>
                      )}
                    </td>
                    <td>
                      <div>Min Seats: {discount.minimumQuantity}</div>
                      {discount.minimumPurchase > 0 && (
                        <small style={{ color: "var(--muted)" }}>
                          Min Spend: {formatMoney(discount.minimumPurchase)}
                        </small>
                      )}
                    </td>
                    <td>
                      <span>{formatDate(discount.startsAt)}</span>
                      <small style={{ color: "var(--muted)" }}>
                        until {discount.endsAt ? formatDate(discount.endsAt) : "Open-ended"}
                      </small>
                    </td>
                    <td>
                      <span>
                        {discount.usageCount} / {discount.usageLimit ?? "Unlimited"}
                      </span>
                      {remainingUses !== null && (
                        <small style={{ color: "var(--muted)" }}>
                          {remainingUses} left
                        </small>
                      )}
                    </td>
                    <td>
                      <Badge value={discount.active ? "ACTIVE" : "CLOSED"} />
                    </td>
                    <td>
                      <div className={styles.actionsCell}>
                        {isAdmin ? (
                          <button
                            type="button"
                            className={styles.editBtn}
                            onClick={() => openEditDiscountDialog(discount, false)}
                            aria-label={`Edit ${discount.name}`}
                          >
                            Edit
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.editBtn}
                            onClick={() => openEditDiscountDialog(discount, true)}
                            aria-label={`View ${discount.name}`}
                          >
                            View
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            data && (
              <div className={styles.emptyState}>
                <p>No discount rules found.</p>
              </div>
            )
          )}
        </Panel>
      </div>

      {/* Tax Dialog */}
      <Dialog
        busy={taxSubmitting}
        isOpen={isTaxDialogOpen}
        onClose={() => setIsTaxDialogOpen(false)}
        title={
          isTaxReadOnly
            ? `View Tax Rule: ${taxFormData.name}`
            : taxFormData.id
            ? `Edit Tax Rule: ${taxFormData.name}`
            : "Add Illustrative Tax Rule"
        }
        description={
          isTaxReadOnly
            ? "Configured rate percentage in basis points (Read-only for Staff)."
            : "Define tax rate in percentage (0% to 100%, max 2 decimals, stored as basis points)."
        }
      >
        <form onSubmit={handleTaxSubmit} noValidate>
          <div className={styles.modalBody}>
            {taxGeneralError && (
              <div className={`${styles.alertBanner} ${styles.alertError}`} role="alert">
                <span>⚠ {taxGeneralError}</span>
              </div>
            )}

            <div className={styles.formGrid}>
              <div className={`${styles.formGroup} ${styles.formGridFull}`}>
                <label className={styles.formLabel} htmlFor="tax-name">
                  <span>
                    Tax Rule Name {!isTaxReadOnly && <span className={styles.requiredAsterisk}>*</span>}
                  </span>
                </label>
                <input
                  id="tax-name"
                  type="text"
                  className={`${styles.formInput} ${taxFieldErrors.name ? styles.inputError : ""}`}
                  placeholder="e.g. Standard GST, Illustrative Demo Tax"
                  value={taxFormData.name}
                  disabled={isTaxReadOnly || taxSubmitting}
                  onChange={(e) => setTaxFormData({ ...taxFormData, name: e.target.value })}
                  aria-invalid={Boolean(taxFieldErrors.name)}
                  aria-describedby={taxFieldErrors.name ? "tax-name-err" : undefined}
                />
                {taxFieldErrors.name && (
                  <span id="tax-name-err" className={styles.fieldError} role="alert">
                    {taxFieldErrors.name}
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="tax-rate">
                  <span>
                    Tax Rate (%) {!isTaxReadOnly && <span className={styles.requiredAsterisk}>*</span>}
                  </span>
                  <span className={styles.labelHint}>0 to 100% (max 2 decimals)</span>
                </label>
                <input
                  id="tax-rate"
                  type="text"
                  inputMode="decimal"
                  className={`${styles.formInput} ${taxFieldErrors.rate ? styles.inputError : ""}`}
                  placeholder="e.g. 10 or 10.25"
                  value={taxFormData.rateInput}
                  disabled={isTaxReadOnly || taxSubmitting}
                  onChange={(e) => setTaxFormData({ ...taxFormData, rateInput: e.target.value })}
                  aria-invalid={Boolean(taxFieldErrors.rate)}
                  aria-describedby={taxFieldErrors.rate ? "tax-rate-err" : undefined}
                />
                {taxFieldErrors.rate && (
                  <span id="tax-rate-err" className={styles.fieldError} role="alert">
                    {taxFieldErrors.rate}
                  </span>
                )}
                <span className={styles.fieldHelp}>
                  Converted to exact integer basis points (e.g. 10.25% = 1025 bps).
                </span>
              </div>

              <div className={styles.formGroup}>
                <div className={styles.switchCard} style={{ marginTop: "18px" }}>
                  <input
                    type="checkbox"
                    id="tax-active"
                    className={styles.checkboxInput}
                    checked={taxFormData.active}
                    disabled={isTaxReadOnly || taxSubmitting}
                    onChange={(e) => setTaxFormData({ ...taxFormData, active: e.target.checked })}
                  />
                  <div className={styles.switchContent}>
                    <label htmlFor="tax-active" className={styles.switchTitle}>
                      Active Tax Rule
                    </label>
                    <span className={styles.switchDescription}>
                      Active taxes can be attached to products and plans.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setIsTaxDialogOpen(false)}
              disabled={taxSubmitting}
            >
              {isTaxReadOnly ? "Close" : "Cancel"}
            </button>
            {!isTaxReadOnly && (
              <button
                type="submit"
                className="button"
                disabled={taxSubmitting}
                aria-busy={taxSubmitting}
              >
                {taxSubmitting ? "Saving…" : taxFormData.id ? "Update Tax Rule" : "Create Tax Rule"}
              </button>
            )}
          </div>
        </form>
      </Dialog>

      {/* Discount Dialog */}
      <Dialog
        busy={discountSubmitting}
        isOpen={isDiscountDialogOpen}
        onClose={() => setIsDiscountDialogOpen(false)}
        title={
          isDiscountReadOnly
            ? `View Discount Rule: ${discountFormData.name}`
            : discountFormData.id
            ? `Edit Discount Rule: ${discountFormData.name}`
            : "Add Discount Rule"
        }
        description={
          isDiscountReadOnly
            ? "Thresholds, scope, and read-only redemption history (Read-only for Staff)."
            : "Configure automatic discount terms, thresholds, customer limits, and product scoping."
        }
      >
        <form onSubmit={handleDiscountSubmit} noValidate>
          <div className={styles.modalBody}>
            {discountGeneralError && (
              <div className={`${styles.alertBanner} ${styles.alertError}`} role="alert">
                <span>⚠ {discountGeneralError}</span>
              </div>
            )}

            <div className={styles.formGrid}>
              <div className={`${styles.formGroup} ${styles.formGridFull}`}>
                <label className={styles.formLabel} htmlFor="disc-name">
                  <span>
                    Rule Name {!isDiscountReadOnly && <span className={styles.requiredAsterisk}>*</span>}
                  </span>
                </label>
                <input
                  id="disc-name"
                  type="text"
                  className={`${styles.formInput} ${
                    discountFieldErrors.name ? styles.inputError : ""
                  }`}
                  placeholder="e.g. Team launch offer, Summer savings"
                  value={discountFormData.name}
                  disabled={isDiscountReadOnly || discountSubmitting}
                  onChange={(e) =>
                    setDiscountFormData({ ...discountFormData, name: e.target.value })
                  }
                  aria-invalid={Boolean(discountFieldErrors.name)}
                  aria-describedby={discountFieldErrors.name ? "disc-name-err" : undefined}
                />
                {discountFieldErrors.name && (
                  <span id="disc-name-err" className={styles.fieldError} role="alert">
                    {discountFieldErrors.name}
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="disc-kind">
                  <span>Discount Kind</span>
                </label>
                <select
                  id="disc-kind"
                  className={styles.formSelect}
                  value={discountFormData.kind}
                  disabled={isDiscountReadOnly || discountSubmitting}
                  onChange={(e) =>
                    handleDiscountKindChange(e.target.value as "FIXED" | "PERCENTAGE")
                  }
                >
                  <option value="PERCENTAGE">PERCENTAGE (e.g. 10%)</option>
                  <option value="FIXED">FIXED AMOUNT (₹ in Rupees)</option>
                </select>
                <span className={styles.fieldHelp}>
                  Changing kind resets the value to prevent misinterpreting currency as percentage.
                </span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="disc-value">
                  <span>
                    {discountFormData.kind === "PERCENTAGE" ? "Percentage Rate (%)" : "Fixed Amount (₹)"}{" "}
                    {!isDiscountReadOnly && <span className={styles.requiredAsterisk}>*</span>}
                  </span>
                  <span className={styles.labelHint}>
                    {discountFormData.kind === "PERCENTAGE" ? "0 to 100%" : "Paise internally"}
                  </span>
                </label>
                <input
                  id="disc-value"
                  type="text"
                  inputMode="decimal"
                  className={`${styles.formInput} ${
                    discountFieldErrors.value ? styles.inputError : ""
                  }`}
                  placeholder={discountFormData.kind === "PERCENTAGE" ? "10.00" : "500.00"}
                  value={discountFormData.valueInput}
                  disabled={isDiscountReadOnly || discountSubmitting}
                  onChange={(e) =>
                    setDiscountFormData({ ...discountFormData, valueInput: e.target.value })
                  }
                  aria-invalid={Boolean(discountFieldErrors.value)}
                  aria-describedby={discountFieldErrors.value ? "disc-value-err" : undefined}
                />
                {discountFieldErrors.value && (
                  <span id="disc-value-err" className={styles.fieldError} role="alert">
                    {discountFieldErrors.value}
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="disc-scope">
                  <span>Application Scope</span>
                </label>
                <select
                  id="disc-scope"
                  className={styles.formSelect}
                  value={discountFormData.scope}
                  disabled={isDiscountReadOnly || discountSubmitting}
                  onChange={(e) => {
                    const newScope = e.target.value as "PRODUCT" | "SUBSCRIPTION";
                    setDiscountFormData((prev) => ({
                      ...prev,
                      scope: newScope,
                      productIds: newScope === "SUBSCRIPTION" ? [] : prev.productIds,
                    }));
                  }}
                >
                  <option value="SUBSCRIPTION">SUBSCRIPTION (Total cycle invoice)</option>
                  <option value="PRODUCT">PRODUCT (Specific line items)</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <div className={styles.switchCard} style={{ marginTop: "18px" }}>
                  <input
                    type="checkbox"
                    id="disc-active"
                    className={styles.checkboxInput}
                    checked={discountFormData.active}
                    disabled={isDiscountReadOnly || discountSubmitting}
                    onChange={(e) =>
                      setDiscountFormData({ ...discountFormData, active: e.target.checked })
                    }
                  />
                  <div className={styles.switchContent}>
                    <label htmlFor="disc-active" className={styles.switchTitle}>
                      Discount Active
                    </label>
                    <span className={styles.switchDescription}>
                      Active discounts can be matched and applied by billing automation.
                    </span>
                  </div>
                </div>
              </div>

              {/* Product selector if scope === PRODUCT */}
              {discountFormData.scope === "PRODUCT" && (
                <div className={`${styles.formGroup} ${styles.formGridFull}`}>
                  <label className={styles.formLabel}>
                    <span>
                      Applicable Products {!isDiscountReadOnly && <span className={styles.requiredAsterisk}>*</span>}
                    </span>
                    <span className={styles.labelHint}>
                      Select products eligible for this discount
                    </span>
                  </label>
                  <div className={styles.selectionList}>
                    {productList.map((prod) => (
                      <label key={prod.id} className={styles.selectionItem}>
                        <input
                          type="checkbox"
                          checked={discountFormData.productIds.includes(prod.id)}
                          disabled={isDiscountReadOnly || discountSubmitting}
                          onChange={() => handleProductToggle(prod.id)}
                          className={styles.checkboxInput}
                        />
                        <span>
                          <strong>{prod.name}</strong> ({prod.type}) · {formatMoney(prod.salesPrice)}
                        </span>
                      </label>
                    ))}
                  </div>
                  {discountFieldErrors.productIds && (
                    <span className={styles.fieldError} role="alert">
                      {discountFieldErrors.productIds}
                    </span>
                  )}
                </div>
              )}

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="disc-min-purchase">
                  <span>Minimum Purchase (₹)</span>
                  <span className={styles.labelHint}>Subtotal threshold</span>
                </label>
                <input
                  id="disc-min-purchase"
                  type="text"
                  inputMode="decimal"
                  className={`${styles.formInput} ${
                    discountFieldErrors.minimumPurchase ? styles.inputError : ""
                  }`}
                  value={discountFormData.minimumPurchaseInput}
                  disabled={isDiscountReadOnly || discountSubmitting}
                  onChange={(e) =>
                    setDiscountFormData({
                      ...discountFormData,
                      minimumPurchaseInput: e.target.value,
                    })
                  }
                  aria-invalid={Boolean(discountFieldErrors.minimumPurchase)}
                  aria-describedby={
                    discountFieldErrors.minimumPurchase ? "disc-min-purchase-err" : undefined
                  }
                />
                {discountFieldErrors.minimumPurchase && (
                  <span id="disc-min-purchase-err" className={styles.fieldError} role="alert">
                    {discountFieldErrors.minimumPurchase}
                  </span>
                )}
                <span className={styles.fieldHelp}>Set 0 for no spend minimum.</span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="disc-min-qty">
                  <span>Minimum Seats / Quantity</span>
                  <span className={styles.labelHint}>Line item threshold</span>
                </label>
                <input
                  id="disc-min-qty"
                  type="number"
                  min="1"
                  step="1"
                  className={`${styles.formInput} ${
                    discountFieldErrors.minimumQuantity ? styles.inputError : ""
                  }`}
                  value={discountFormData.minimumQuantityInput}
                  disabled={isDiscountReadOnly || discountSubmitting}
                  onChange={(e) =>
                    setDiscountFormData({
                      ...discountFormData,
                      minimumQuantityInput: e.target.value,
                    })
                  }
                  aria-invalid={Boolean(discountFieldErrors.minimumQuantity)}
                  aria-describedby={
                    discountFieldErrors.minimumQuantity ? "disc-min-qty-err" : undefined
                  }
                />
                {discountFieldErrors.minimumQuantity && (
                  <span id="disc-min-qty-err" className={styles.fieldError} role="alert">
                    {discountFieldErrors.minimumQuantity}
                  </span>
                )}
                <span className={styles.fieldHelp}>Must be at least 1.</span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="disc-starts-at">
                  <span>
                    Valid From {!isDiscountReadOnly && <span className={styles.requiredAsterisk}>*</span>}
                  </span>
                </label>
                <input
                  id="disc-starts-at"
                  type="date"
                  className={`${styles.formInput} ${
                    discountFieldErrors.startsAt ? styles.inputError : ""
                  }`}
                  value={discountFormData.startsAt}
                  disabled={isDiscountReadOnly || discountSubmitting}
                  onChange={(e) =>
                    setDiscountFormData({ ...discountFormData, startsAt: e.target.value })
                  }
                  aria-invalid={Boolean(discountFieldErrors.startsAt)}
                  aria-describedby={discountFieldErrors.startsAt ? "disc-starts-at-err" : undefined}
                />
                {discountFieldErrors.startsAt && (
                  <span id="disc-starts-at-err" className={styles.fieldError} role="alert">
                    {discountFieldErrors.startsAt}
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="disc-ends-at">
                  <span>Valid Until (Optional)</span>
                </label>
                <input
                  id="disc-ends-at"
                  type="date"
                  className={`${styles.formInput} ${
                    discountFieldErrors.endsAt ? styles.inputError : ""
                  }`}
                  value={discountFormData.endsAt}
                  disabled={isDiscountReadOnly || discountSubmitting}
                  onChange={(e) =>
                    setDiscountFormData({ ...discountFormData, endsAt: e.target.value })
                  }
                  aria-invalid={Boolean(discountFieldErrors.endsAt)}
                  aria-describedby={discountFieldErrors.endsAt ? "disc-ends-at-err" : undefined}
                />
                {discountFieldErrors.endsAt && (
                  <span id="disc-ends-at-err" className={styles.fieldError} role="alert">
                    {discountFieldErrors.endsAt}
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="disc-usage-limit">
                  <span>Usage Limit (Cap)</span>
                  <span className={styles.labelHint}>Leave blank for unlimited</span>
                </label>
                <input
                  id="disc-usage-limit"
                  type="number"
                  min="1"
                  step="1"
                  className={`${styles.formInput} ${
                    discountFieldErrors.usageLimit ? styles.inputError : ""
                  }`}
                  placeholder="Unlimited"
                  value={discountFormData.usageLimitInput}
                  disabled={isDiscountReadOnly || discountSubmitting}
                  onChange={(e) =>
                    setDiscountFormData({
                      ...discountFormData,
                      usageLimitInput: e.target.value,
                    })
                  }
                  aria-invalid={Boolean(discountFieldErrors.usageLimit)}
                  aria-describedby={
                    discountFieldErrors.usageLimit ? "disc-usage-limit-err" : undefined
                  }
                />
                {discountFieldErrors.usageLimit && (
                  <span id="disc-usage-limit-err" className={styles.fieldError} role="alert">
                    {discountFieldErrors.usageLimit}
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <span>Redemption Count (System Read-Only)</span>
                </label>
                <div
                  style={{
                    padding: "9px 12px",
                    background: "var(--canvas)",
                    borderRadius: "8px",
                    border: "1px solid var(--line)",
                    fontSize: "13px",
                  }}
                >
                  <strong>{discountFormData.usageCount}</strong> redemptions recorded
                  {discountFormData.usageLimitInput && (
                    <span style={{ color: "var(--muted)", marginLeft: "6px" }}>
                      / Cap: {discountFormData.usageLimitInput}
                    </span>
                  )}
                </div>
                <span className={styles.fieldHelp}>
                  Usage count is tracked by the server invoice engine and cannot be edited.
                </span>
              </div>
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setIsDiscountDialogOpen(false)}
              disabled={discountSubmitting}
            >
              {isDiscountReadOnly ? "Close" : "Cancel"}
            </button>
            {!isDiscountReadOnly && (
              <button
                type="submit"
                className="button"
                disabled={discountSubmitting}
                aria-busy={discountSubmitting}
              >
                {discountSubmitting
                  ? "Saving…"
                  : discountFormData.id
                  ? "Update Discount Rule"
                  : "Create Discount Rule"}
              </button>
            )}
          </div>
        </form>
      </Dialog>

      <StarterNote owner="Athul">
        Tax and discount rules configuration is operational. All rates use integer basis points and
        money values use integer paise in the data layer. Application on future invoices is automatic.
      </StarterNote>
    </>
  );
}
