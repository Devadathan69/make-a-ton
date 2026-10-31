"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Plan, Product, QuoteTemplate, TaxRule, TemplateInput, LineInput } from "@/lib/contracts";
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { cloneLines, getIndicativeSubtotal, sanitizeLineVariant } from "./quote-helpers";
import { useDialog } from "@/components/use-dialog";
import styles from "./subscriptions.module.css";

interface TemplateDialogProps {
  isOpen: boolean;
  template?: QuoteTemplate | null;
  onClose: () => void;
  onSuccess: (saved: QuoteTemplate) => void;
}

export function TemplateDialog({ isOpen, template, onClose, onSuccess }: TemplateDialogProps) {
  const isEdit = Boolean(template);
  const [name, setName] = useState("");
  const [planId, setPlanId] = useState("");
  const [validDays, setValidDays] = useState(30);
  const [lines, setLines] = useState<LineInput[]>([]);

  // Selectors
  const [plans, setPlans] = useState<Plan[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [taxes, setTaxes] = useState<TaxRule[]>([]);
  const [selectorsLoading, setSelectorsLoading] = useState(true);
  const [selectorsError, setSelectorsError] = useState<string | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const fetchSelectors = useCallback(async () => {
    setSelectorsLoading(true);
    setSelectorsError(null);
    try {
      const [plansRes, productsRes, taxesRes] = await Promise.all([
        api.plans.list({ pageSize: 100 }),
        api.products.list({ pageSize: 100 }),
        api.taxes.list({ pageSize: 100 }),
      ]);
      setPlans(plansRes.items.filter((p) => p.active));
      setProducts(productsRes.items.filter((p) => p.active));
      setTaxes(taxesRes.items.filter((t) => t.active));
    } catch (err: unknown) {
      setSelectorsError(err instanceof Error ? err.message : "Failed to load catalog selectors");
    } finally {
      setSelectorsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchSelectors();
      if (template) {
        setName(template.name ?? "");
        setPlanId(template.planId ?? "");
        setValidDays(template.validDays ?? 30);
        setLines(cloneLines(template.lines ?? []));
      } else {
        setName("");
        setPlanId("");
        setValidDays(30);
        setLines([]);
      }
      setErrors({});
      setGlobalError(null);
      setSubmitting(false);

      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [isOpen, template, fetchSelectors]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen && !submitting) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, submitting, onClose]);

  const dialogId = useDialog(isOpen, onClose, submitting);

  if (!isOpen) return null;

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
      // Reset incompatible variant selection!
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
      next[index] = { ...next[index], quantity: qty };
      return next;
    });
  };

  const handleTaxToggle = (index: number, taxId: string) => {
    setLines((prev) => {
      const next = [...prev];
      const currentTaxes = next[index].taxIds || [];
      const hasTax = currentTaxes.includes(taxId);
      const nextTaxes = hasTax ? currentTaxes.filter((id) => id !== taxId) : [...currentTaxes, taxId];
      next[index] = { ...next[index], taxIds: nextTaxes };
      return next;
    });
  };

  const handleRemoveLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) {
      nextErrors.name = "Template name is required";
    }
    if (!planId) {
      nextErrors.planId = "Plan selection is required";
    }
    if (!validDays || validDays <= 0) {
      nextErrors.validDays = "Validity must be at least 1 day";
    }
    if (lines.length === 0) {
      nextErrors.lines = "At least one product line is required";
    } else {
      lines.forEach((line, idx) => {
        if (!line.productId) {
          nextErrors[`line_${idx}`] = "Product is required";
        }
        if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
          nextErrors[`line_qty_${idx}`] = "Quantity must be a positive integer";
        }
      });
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);

    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload: TemplateInput = {
        name: name.trim(),
        planId,
        validDays: Number(validDays),
        lines: cloneLines(lines),
      };

      let result: QuoteTemplate;
      if (isEdit && template?.id) {
        result = await api.templates.update(template.id, payload);
      } else {
        result = await api.templates.create(payload);
      }

      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setGlobalError(err.message);
        if (err.fields) setErrors((prev) => ({ ...prev, ...err.fields }));
      } else if (err instanceof Error) {
        setGlobalError(err.message);
      } else {
        setGlobalError("Failed to save template");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={styles.modalBackdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className={`${styles.modalDialog} ${styles.modalDialogWide}`}
        data-dialog-root={dialogId} role="dialog"
        aria-modal="true"
        aria-labelledby="template-dialog-title"
      >
        <div className={styles.modalHeader}>
          <h2 id="template-dialog-title">{isEdit ? "Edit Quotation Template" : "New Quotation Template"}</h2>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onClose}
            disabled={submitting}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.modalBody}>
            {globalError && (
              <div className={`${styles.alertBox} ${styles.alertError}`} role="alert">
                <strong>Error:</strong> {globalError}
              </div>
            )}

            {selectorsError && (
              <div className={`${styles.alertBox} ${styles.alertWarning}`} role="alert">
                <span>{selectorsError}</span>
                <button
                  type="button"
                  className="button button-secondary"
                  style={{ marginLeft: 12, padding: "4px 8px", fontSize: 11 }}
                  onClick={fetchSelectors}
                >
                  Retry Lookups
                </button>
              </div>
            )}

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="tmpl-name">
                  Template Name <span className={styles.requiredIndicator}>*</span>
                </label>
                <input
                  ref={nameInputRef}
                  id="tmpl-name"
                  type="text"
                  className={`${styles.formInput} ${errors.name ? styles.inputError : ""}`}
                  placeholder="e.g. Standard SaaS Monthly Onboarding"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
                  }}
                  disabled={submitting}
                  required
                />
                {errors.name && <span className={styles.errorText}>{errors.name}</span>}
              </div>

              <div className={`${styles.formGrid} ${styles.formGridTwoCol}`}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="tmpl-plan">
                    Associated Plan <span className={styles.requiredIndicator}>*</span>
                  </label>
                  <select
                    id="tmpl-plan"
                    className={`${styles.formSelect} ${errors.planId ? styles.inputError : ""}`}
                    value={planId}
                    onChange={(e) => {
                      setPlanId(e.target.value);
                      if (errors.planId) setErrors((prev) => ({ ...prev, planId: "" }));
                    }}
                    disabled={submitting || selectorsLoading}
                  >
                    <option value="">-- Choose Plan --</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.interval} · {formatMoney(p.price)})
                      </option>
                    ))}
                  </select>
                  {errors.planId && <span className={styles.errorText}>{errors.planId}</span>}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="tmpl-validdays">
                    Default Validity (Days) <span className={styles.requiredIndicator}>*</span>
                  </label>
                  <input
                    id="tmpl-validdays"
                    type="number"
                    min={1}
                    className={`${styles.formInput} ${errors.validDays ? styles.inputError : ""}`}
                    value={validDays}
                    onChange={(e) => {
                      setValidDays(Math.max(1, parseInt(e.target.value, 10) || 1));
                      if (errors.validDays) setErrors((prev) => ({ ...prev, validDays: "" }));
                    }}
                    disabled={submitting}
                  />
                  {errors.validDays && <span className={styles.errorText}>{errors.validDays}</span>}
                </div>
              </div>

              {/* Product Lines */}
              <div className={styles.lineItemsBox}>
                <div className={styles.lineItemsHeader}>
                  <h3>Template Product Lines ({lines.length})</h3>
                  <button
                    type="button"
                    className={styles.addLineBtn}
                    onClick={handleAddLine}
                    disabled={submitting || products.length === 0}
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
                    No product lines configured. Add at least one product line.
                  </p>
                ) : (
                  <div>
                    {lines.map((line, idx) => {
                      const selectedProduct = products.find((p) => p.id === line.productId);
                      const availableVariants = selectedProduct?.variants || [];
                      const lineSubtotal = getIndicativeSubtotal(line, products);

                      return (
                        <div key={idx} className={styles.lineRow}>
                          <div>
                            <select
                              className={styles.formSelect}
                              value={line.productId}
                              onChange={(e) => handleProductChange(idx, e.target.value)}
                              disabled={submitting}
                              aria-label={`Product for line ${idx + 1}`}
                            >
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({formatMoney(p.salesPrice)})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <select
                              className={styles.formSelect}
                              value={line.variantId ?? ""}
                              onChange={(e) => handleVariantChange(idx, e.target.value || null)}
                              disabled={submitting || availableVariants.length === 0}
                              aria-label={`Variant for line ${idx + 1}`}
                            >
                              <option value="">Base Product (No variant)</option>
                              {availableVariants.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name} (+{formatMoney(v.priceAdjustment)})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <input
                              type="number"
                              min={1}
                              className={styles.formInput}
                              value={line.quantity}
                              onChange={(e) => handleQuantityChange(idx, Number(e.target.value))}
                              disabled={submitting}
                              aria-label={`Quantity for line ${idx + 1}`}
                            />
                          </div>

                          <div className={styles.lineEstimateBadge}>
                            <div>~{formatMoney(lineSubtotal)}</div>
                            <small style={{ fontSize: 9, color: "var(--muted)" }}>
                              {line.taxIds.length > 0 ? `${line.taxIds.length} taxes` : "Excl. taxes"}
                            </small>
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
                              title="Remove Line"
                              aria-label={`Remove line ${idx + 1}`}
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
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className="button button-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="button" disabled={submitting}>
              {submitting ? "Saving..." : isEdit ? "Update Template" : "Create Template"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
