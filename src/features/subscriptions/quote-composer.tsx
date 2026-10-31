"use client";

import { useEffect, useState, useCallback } from "react";
import type { Customer, LineInput, Plan, Product, QuoteTemplate, Subscription, SubscriptionInput, TaxRule } from "@/lib/contracts";
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { addDays, cloneLines, getIndicativeSubtotal, getIndicativeUnitPrice, getTodayDateString, sanitizeLineVariant } from "./quote-helpers";
import styles from "./subscriptions.module.css";

interface QuoteComposerProps {
  initialDraft?: Subscription | null;
  initialTemplateId?: string;
  onSuccess: (sub: Subscription) => void;
  onCancel: () => void;
}

export function QuoteComposer({ initialDraft, initialTemplateId, onSuccess, onCancel }: QuoteComposerProps) {
  // Lookups
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [taxes, setTaxes] = useState<TaxRule[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [lookupsError, setLookupsError] = useState<string | null>(null);

  // Form state
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialDraft?.customerId ?? "");
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplateId ?? "");
  const [selectedPlanId, setSelectedPlanId] = useState(initialDraft?.planId ?? "");
  const [startDate, setStartDate] = useState(initialDraft?.startDate ?? getTodayDateString());
  const [expiryDate, setExpiryDate] = useState(initialDraft?.expiryDate ?? "");
  const [paymentTermsDays, setPaymentTermsDays] = useState(initialDraft?.paymentTermsDays ?? 30);
  const [quotationValidUntil, setQuotationValidUntil] = useState(
    initialDraft?.quotationValidUntil ?? addDays(getTodayDateString(), 30)
  );
  const [lines, setLines] = useState<LineInput[]>(
    initialDraft ? cloneLines(initialDraft.lines) : []
  );

  // Draft & transition tracking
  const [savedDraft, setSavedDraft] = useState<Subscription | null>(initialDraft ?? null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  // Fetch lookups
  const fetchLookups = useCallback(async () => {
    setLookupsLoading(true);
    setLookupsError(null);
    try {
      const [custRes, tmplRes, planRes, prodRes, taxRes] = await Promise.all([
        api.customers.list({ pageSize: 100 }),
        api.templates.list({ pageSize: 100 }),
        api.plans.list({ pageSize: 100 }),
        api.products.list({ pageSize: 100 }),
        api.taxes.list({ pageSize: 100 }),
      ]);
      setCustomers(custRes.items);
      setTemplates(tmplRes.items);
      setPlans(planRes.items.filter((p) => p.active));
      setProducts(prodRes.items.filter((p) => p.active));
      setTaxes(taxRes.items.filter((t) => t.active));

      if (initialTemplateId) {
        const tmpl = tmplRes.items.find((t) => t.id === initialTemplateId);
        if (tmpl) {
          setSelectedPlanId(tmpl.planId);
          setLines(cloneLines(tmpl.lines));
          if (tmpl.validDays > 0) {
            setQuotationValidUntil(addDays(startDate, tmpl.validDays));
          }
        }
      } else if (!initialDraft && lines.length === 0 && prodRes.items.length > 0) {
        const firstProd = prodRes.items[0];
        setLines([
          {
            productId: firstProd.id,
            variantId: firstProd.variants?.[0]?.id ?? null,
            quantity: 1,
            taxIds: [],
          },
        ]);
      }
    } catch (err: unknown) {
      setLookupsError(err instanceof Error ? err.message : "Failed to load reference selectors");
    } finally {
      setLookupsLoading(false);
    }
  }, [initialDraft, initialTemplateId, lines.length, startDate]);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  // Handle template selection
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;

    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) return;

    // Independent draft copy: deep clone lines so edits do not mutate stored template
    setSelectedPlanId(tmpl.planId);
    setLines(cloneLines(tmpl.lines));
    if (tmpl.validDays > 0) {
      setQuotationValidUntil(addDays(startDate, tmpl.validDays));
    }
  };

  // Handle start date change and adjust quotation valid date accordingly
  const handleStartDateChange = (newStartDate: string) => {
    setStartDate(newStartDate);
    if (selectedTemplateId) {
      const tmpl = templates.find((t) => t.id === selectedTemplateId);
      if (tmpl?.validDays) {
        setQuotationValidUntil(addDays(newStartDate, tmpl.validDays));
      }
    }
  };

  // Line item handlers
  const handleAddLine = () => {
    if (products.length === 0) return;
    const defaultProduct = products[0];
    const defaultVariant = defaultProduct.variants?.[0]?.id ?? null;
    setLines((prev) => [
      ...prev,
      {
        productId: defaultProduct.id,
        variantId: defaultVariant,
        quantity: 1,
        taxIds: [],
      },
    ]);
  };

  const handleProductChange = (index: number, newProductId: string) => {
    setLines((prev) => {
      const next = [...prev];
      const updatedLine: LineInput = {
        ...next[index],
        productId: newProductId,
      };
      // Reset invalid/incompatible variant!
      next[index] = sanitizeLineVariant(updatedLine, products);
      return next;
    });
  };

  const handleVariantChange = (index: number, variantId: string | null) => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], variantId: variantId || null };
      return next;
    });
  };

  const handleQuantityChange = (index: number, qty: number) => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], quantity: Math.max(1, Math.floor(qty || 1)) };
      return next;
    });
  };

  const handleTaxToggle = (index: number, taxId: string) => {
    setLines((prev) => {
      const next = [...prev];
      const current = next[index].taxIds || [];
      const hasTax = current.includes(taxId);
      next[index] = {
        ...next[index],
        taxIds: hasTax ? current.filter((id) => id !== taxId) : [...current, taxId],
      };
      return next;
    });
  };

  const handleRemoveLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  // Validation
  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    if (!selectedCustomerId) nextErrors.customerId = "Customer is required";
    if (!selectedPlanId) nextErrors.planId = "Plan is required";
    if (!startDate) nextErrors.startDate = "Start date is required";
    if (!quotationValidUntil) nextErrors.quotationValidUntil = "Quotation validity date is required";
    if (startDate && quotationValidUntil && quotationValidUntil < startDate) {
      nextErrors.quotationValidUntil = "Quotation validity date cannot be before start date";
    }
    if (lines.length === 0) {
      nextErrors.lines = "Quotation must have at least one product line";
    } else {
      lines.forEach((line, idx) => {
        if (!line.productId) nextErrors[`line_prod_${idx}`] = "Product is required";
        if (!line.quantity || line.quantity <= 0) nextErrors[`line_qty_${idx}`] = "Quantity must be positive";
      });
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  // Transition retry handler
  const handleRetryTransition = async () => {
    if (!savedDraft) return;
    setTransitioning(true);
    setTransitionError(null);
    try {
      const transitioned = await api.subscriptions.transition(savedDraft.id, "quote");
      onSuccess(transitioned);
    } catch (err: unknown) {
      setTransitionError(
        err instanceof Error
          ? err.message
          : "Quotation transition rejected by server. (In mock mode, lifecycle actions require connected backend)."
      );
    } finally {
      setTransitioning(false);
    }
  };

  // Submit draft and attempt transition
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);
    setTransitionError(null);

    if (!validate()) return;

    setSubmitting(true);
    let createdSub: Subscription | null = savedDraft;

    try {
      const payload: SubscriptionInput = {
        customerId: selectedCustomerId,
        planId: selectedPlanId,
        templateId: selectedTemplateId || undefined,
        startDate,
        expiryDate: expiryDate || null,
        paymentTermsDays: Number(paymentTermsDays) || 0,
        quotationValidUntil: quotationValidUntil || null,
        lines: cloneLines(lines),
      };

      if (savedDraft?.id) {
        // Updating existing draft
        createdSub = await api.subscriptions.update(savedDraft.id, payload);
      } else {
        // Creating new draft
        createdSub = await api.subscriptions.create(payload);
        setSavedDraft(createdSub);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setGlobalError(err.message);
        if (err.fields) setErrors((prev) => ({ ...prev, ...err.fields }));
      } else if (err instanceof Error) {
        setGlobalError(err.message);
      } else {
        setGlobalError("Failed to save draft subscription");
      }
      setSubmitting(false);
      return;
    }

    setSubmitting(false);

    // Explicit second step: Transition to QUOTATION
    if (createdSub) {
      setTransitioning(true);
      try {
        const transitioned = await api.subscriptions.transition(createdSub.id, "quote");
        onSuccess(transitioned);
      } catch (err: unknown) {
        // AVOID losing the created draft: display the saved draft and retry action!
        setTransitionError(
          err instanceof Error
            ? err.message
            : "Transition to quotation failed. Your draft is safely saved and accessible."
        );
      } finally {
        setTransitioning(false);
      }
    }
  };

  // Calculate indicative estimates
  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const totalLinesEstimate = lines.reduce((acc, line) => acc + getIndicativeSubtotal(line, products), 0);
  const totalEstimate = (selectedPlan?.price ?? 0) + totalLinesEstimate;

  return (
    <div className={styles.lineItemsBox} style={{ border: "none", boxShadow: "none" }}>
      {lookupsError && (
        <div className={`${styles.alertBox} ${styles.alertWarning}`}>
          <span>{lookupsError}</span>
          <button
            type="button"
            className="button button-secondary"
            style={{ marginLeft: 12, padding: "4px 8px", fontSize: 11 }}
            onClick={fetchLookups}
          >
            Retry Lookups
          </button>
        </div>
      )}

      {globalError && (
        <div className={`${styles.alertBox} ${styles.alertError}`} role="alert">
          <strong>Draft Error:</strong> {globalError}
        </div>
      )}

      {/* When transition to quotation fails after draft creation, show saved draft alert and retry */}
      {savedDraft && transitionError && (
        <div className={`${styles.alertBox} ${styles.alertWarning}`} role="alert">
          <div>
            <strong>Draft Saved Successfully as {savedDraft.number}!</strong>
            <p style={{ marginTop: 4 }}>
              However, the quotation stage transition could not be completed: <em>{transitionError}</em>
            </p>
            <p style={{ marginTop: 4, fontSize: 11 }}>
              Your draft is preserved. You can retry the quotation transition below or view it in the draft list.
            </p>
          </div>
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="button"
              onClick={handleRetryTransition}
              disabled={transitioning}
            >
              {transitioning ? "Sending Quote..." : "Retry Send as Quote"}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.formGrid}>
          {/* Top row: Customer & Template */}
          <div className={`${styles.formGrid} ${styles.formGridTwoCol}`}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="quote-cust">
                Customer <span className={styles.requiredIndicator}>*</span>
              </label>
              <select
                id="quote-cust"
                className={`${styles.formSelect} ${errors.customerId ? styles.inputError : ""}`}
                value={selectedCustomerId}
                onChange={(e) => {
                  setSelectedCustomerId(e.target.value);
                  if (errors.customerId) setErrors((prev) => ({ ...prev, customerId: "" }));
                }}
                disabled={submitting || transitioning || lookupsLoading}
              >
                <option value="">-- Choose Customer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company} ({c.name})
                  </option>
                ))}
              </select>
              {errors.customerId && <span className={styles.errorText}>{errors.customerId}</span>}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="quote-tmpl">
                Start with a Template <small style={{ color: "var(--muted)" }}>(Optional prefill)</small>
              </label>
              <select
                id="quote-tmpl"
                className={styles.formSelect}
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                disabled={submitting || transitioning || lookupsLoading}
              >
                <option value="">-- No Template (Manual setup) --</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.lines.length} lines · {t.validDays}d validity)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Second row: Plan and Payment Terms */}
          <div className={`${styles.formGrid} ${styles.formGridTwoCol}`}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="quote-plan">
                Subscription Plan <span className={styles.requiredIndicator}>*</span>
              </label>
              <select
                id="quote-plan"
                className={`${styles.formSelect} ${errors.planId ? styles.inputError : ""}`}
                value={selectedPlanId}
                onChange={(e) => {
                  setSelectedPlanId(e.target.value);
                  if (errors.planId) setErrors((prev) => ({ ...prev, planId: "" }));
                }}
                disabled={submitting || transitioning || lookupsLoading}
              >
                <option value="">-- Choose Plan --</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.interval} · Base {formatMoney(p.price)})
                  </option>
                ))}
              </select>
              {errors.planId && <span className={styles.errorText}>{errors.planId}</span>}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="quote-terms">
                Payment Terms (Days)
              </label>
              <input
                id="quote-terms"
                type="number"
                min={0}
                className={styles.formInput}
                value={paymentTermsDays}
                onChange={(e) => setPaymentTermsDays(Math.max(0, parseInt(e.target.value, 10) || 0))}
                disabled={submitting || transitioning}
              />
            </div>
          </div>

          {/* Third row: Dates */}
          <div className={`${styles.formGrid} ${styles.formGridTwoCol}`}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="quote-start">
                Effective Start Date <span className={styles.requiredIndicator}>*</span>
              </label>
              <input
                id="quote-start"
                type="date"
                className={`${styles.formInput} ${errors.startDate ? styles.inputError : ""}`}
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                disabled={submitting || transitioning}
              />
              {errors.startDate && <span className={styles.errorText}>{errors.startDate}</span>}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="quote-valid">
                Quotation Valid Until <span className={styles.requiredIndicator}>*</span>
              </label>
              <input
                id="quote-valid"
                type="date"
                className={`${styles.formInput} ${errors.quotationValidUntil ? styles.inputError : ""}`}
                value={quotationValidUntil}
                onChange={(e) => {
                  setQuotationValidUntil(e.target.value);
                  if (errors.quotationValidUntil) setErrors((prev) => ({ ...prev, quotationValidUntil: "" }));
                }}
                disabled={submitting || transitioning}
              />
              {errors.quotationValidUntil && (
                <span className={styles.errorText}>{errors.quotationValidUntil}</span>
              )}
            </div>
          </div>

          {/* Expiry Date (Optional) */}
          <div className={styles.formGroup} style={{ maxWidth: 300 }}>
            <label className={styles.formLabel} htmlFor="quote-expiry">
              Contract Expiry Date <small style={{ color: "var(--muted)" }}>(Optional)</small>
            </label>
            <input
              id="quote-expiry"
              type="date"
              className={styles.formInput}
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              disabled={submitting || transitioning}
            />
          </div>

          {/* Product Lines Editor */}
          <div className={styles.lineItemsBox}>
            <div className={styles.lineItemsHeader}>
              <h3>Product Lines & Seats ({lines.length})</h3>
              <button
                type="button"
                className={styles.addLineBtn}
                onClick={handleAddLine}
                disabled={submitting || transitioning || products.length === 0}
              >
                + Add Product Line
              </button>
            </div>

            {errors.lines && (
              <div style={{ padding: "8px 16px" }}>
                <span className={styles.errorText}>{errors.lines}</span>
              </div>
            )}

            {lines.length === 0 ? (
              <p style={{ padding: "20px", color: "var(--muted)", textAlign: "center" }}>
                No product lines added. A quotation requires at least one product line.
              </p>
            ) : (
              <div>
                {lines.map((line, idx) => {
                  const selectedProduct = products.find((p) => p.id === line.productId);
                  const availableVariants = selectedProduct?.variants || [];
                  const unitPrice = getIndicativeUnitPrice(line, products);
                  const lineSubtotal = getIndicativeSubtotal(line, products);

                  return (
                    <div key={idx} className={styles.lineRow}>
                      <div>
                        <label style={{ fontSize: 10, color: "var(--muted)", display: "block" }}>
                          Product
                        </label>
                        <select
                          className={styles.formSelect}
                          value={line.productId}
                          onChange={(e) => handleProductChange(idx, e.target.value)}
                          disabled={submitting || transitioning}
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({formatMoney(p.salesPrice)})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: 10, color: "var(--muted)", display: "block" }}>
                          Variant / Edition
                        </label>
                        <select
                          className={styles.formSelect}
                          value={line.variantId ?? ""}
                          onChange={(e) => handleVariantChange(idx, e.target.value || null)}
                          disabled={submitting || transitioning || availableVariants.length === 0}
                        >
                          <option value="">Standard Edition</option>
                          {availableVariants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name} (+{formatMoney(v.priceAdjustment)})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: 10, color: "var(--muted)", display: "block" }}>
                          Quantity
                        </label>
                        <input
                          type="number"
                          min={1}
                          className={styles.formInput}
                          value={line.quantity}
                          onChange={(e) => handleQuantityChange(idx, parseInt(e.target.value, 10))}
                          disabled={submitting || transitioning}
                        >
                        </input>
                      </div>

                      <div className={styles.lineEstimateBadge}>
                        <div>
                          <strong>{formatMoney(lineSubtotal)}</strong>
                          <span style={{ fontSize: 10, display: "block", color: "var(--muted)" }}>
                            {formatMoney(unitPrice)} × {line.quantity}
                          </span>
                        </div>
                        <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 3 }}>
                          {taxes.map((t) => (
                            <label
                              key={t.id}
                              style={{
                                fontSize: 9,
                                cursor: "pointer",
                                padding: "1px 4px",
                                border: "1px solid var(--line)",
                                borderRadius: 3,
                                background: line.taxIds.includes(t.id) ? "var(--accent-light)" : "#fff",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={line.taxIds.includes(t.id)}
                                onChange={() => handleTaxToggle(idx, t.id)}
                                style={{ display: "none" }}
                              />
                              {t.name}
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <button
                          type="button"
                          className={styles.removeLineBtn}
                          onClick={() => handleRemoveLine(idx)}
                          disabled={submitting || transitioning}
                          title="Remove line"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Indicative estimate summary */}
          <div className={styles.estimateNote}>
            <strong>Estimated Cycle Subtotal: {formatMoney(totalEstimate)}</strong>
            {selectedPlan && (
              <span> (Plan base: {formatMoney(selectedPlan.price)} + Products: {formatMoney(totalLinesEstimate)})</span>
            )}
            <p style={{ marginTop: 4, opacity: 0.85, fontSize: 10 }}>
              * Indicative catalog estimate based on configured sales prices. Exact promotional discounts, tiered pricing, and tax calculation are resolved at invoice generation or preview time by the server.
            </p>
          </div>
        </div>

        <div className={styles.modalFooter} style={{ padding: "20px 0 0", background: "transparent" }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={onCancel}
            disabled={submitting || transitioning}
          >
            Cancel
          </button>

          {savedDraft && (
            <button
              type="button"
              className="button button-secondary"
              onClick={handleRetryTransition}
              disabled={transitioning || submitting}
            >
              {transitioning ? "Sending Quotation..." : "Retry Send as Quote"}
            </button>
          )}

          <button
            type="submit"
            className="button"
            disabled={submitting || transitioning}
          >
            {submitting
              ? "Saving Draft..."
              : transitioning
              ? "Transitioning to Quote..."
              : savedDraft
              ? "Update Draft & Send Quote"
              : "Create Draft & Send Quote"}
          </button>
        </div>
      </form>
    </div>
  );
}
