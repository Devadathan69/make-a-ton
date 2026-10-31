"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, PageHeader, Panel, ResourceState, StarterNote, Table } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Product, ProductInput, Role } from "@/lib/contracts";
import { formatMoney } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import {
  paiseToInputString,
  parseRupeesToPaise,
} from "./catalog-utils";
import { Dialog } from "./dialog";
import styles from "./catalog.module.css";

interface VariantFormItem {
  id?: string;
  name: string;
  priceAdjustmentInput: string;
  tempKey: string;
}

interface ProductFormData {
  id?: string;
  name: string;
  type: "SOFTWARE" | "SERVICE" | "ADDON";
  salesPriceInput: string;
  costPriceInput: string;
  notes: string;
  active: boolean;
  variants: VariantFormItem[];
}

const DEFAULT_PAGE_SIZE = 10;

const initialFormData: ProductFormData = {
  name: "",
  type: "SOFTWARE",
  salesPriceInput: "0",
  costPriceInput: "0",
  notes: "",
  active: true,
  variants: [],
};

export function ProductsPage() {
  const [role, setRole] = useState<Role | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  // Search & Pagination state
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isReadOnlyView, setIsReadOnlyView] = useState(false);
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load session role
  useEffect(() => {
    let cancelled = false;
    api.session
      .get()
      .then((session) => {
        if (!cancelled) {
          setRole(session?.user?.role ?? null);
          setRoleLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRole(null);
          setRoleLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdmin = !roleLoading && role === "ADMIN";

  // Load products list with stable callback
  const loadProducts = useCallback(() => {
    return api.products.list({
      page: currentPage,
      pageSize: DEFAULT_PAGE_SIZE,
      search: activeSearch.trim() || undefined,
    });
  }, [currentPage, activeSearch]);

  const { data, loading, error, refresh } = useResource(loadProducts);

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
    setFormData(initialFormData);
    setFieldErrors({});
    setGeneralError(null);
    setIsReadOnlyView(false);
    setIsDialogOpen(true);
  };

  const openEditDialog = (product: Product, readOnly = false) => {
    setFormData({
      id: product.id,
      name: product.name,
      type: product.type,
      salesPriceInput: paiseToInputString(product.salesPrice),
      costPriceInput: paiseToInputString(product.costPrice),
      notes: product.notes || "",
      active: product.active,
      variants: product.variants.map((v) => ({
        id: v.id,
        name: v.name,
        priceAdjustmentInput: paiseToInputString(v.priceAdjustment),
        tempKey: v.id,
      })),
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

  const handleAddVariant = () => {
    setFormData((prev) => ({
      ...prev,
      variants: [
        ...prev.variants,
        {
          name: "",
          priceAdjustmentInput: "0",
          tempKey: `new-${Date.now()}-${Math.random()}`,
        },
      ],
    }));
  };

  const handleRemoveVariant = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index),
    }));
  };

  const handleVariantChange = (
    index: number,
    field: "name" | "priceAdjustmentInput",
    value: string,
  ) => {
    setFormData((prev) => {
      const nextVariants = [...prev.variants];
      nextVariants[index] = { ...nextVariants[index], [field]: value };
      return { ...prev, variants: nextVariants };
    });
  };

  const validateForm = (): { valid: boolean; payload?: ProductInput } => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = "Product name is required.";
    }

    const salesPriceResult = parseRupeesToPaise(formData.salesPriceInput);
    if (!salesPriceResult.ok || salesPriceResult.value === undefined) {
      errors.salesPrice = salesPriceResult.error || "Sales price is invalid.";
    }

    const costPriceResult = parseRupeesToPaise(formData.costPriceInput);
    if (!costPriceResult.ok || costPriceResult.value === undefined) {
      errors.costPrice = costPriceResult.error || "Cost price is invalid.";
    }

    // Validate variants: distinct, non-empty names and nonnegative adjustment
    const seenNames = new Set<string>();
    const sanitizedVariants: { id?: string; name: string; priceAdjustment: number }[] = [];

    formData.variants.forEach((v, index) => {
      const vName = v.name.trim();
      if (!vName) {
        errors[`variant_${index}_name`] = "Variant name is required.";
      } else if (seenNames.has(vName.toLowerCase())) {
        errors[`variant_${index}_name`] = `Variant name "${vName}" is duplicated. Names must be unique.`;
      } else {
        seenNames.add(vName.toLowerCase());
      }

      const adjResult = parseRupeesToPaise(v.priceAdjustmentInput);
      if (!adjResult.ok || adjResult.value === undefined || adjResult.value < 0) {
        errors[`variant_${index}_adjustment`] =
          adjResult.error || "Adjustment must be non-negative.";
      } else {
        sanitizedVariants.push({
          id: v.id,
          name: vName,
          priceAdjustment: adjResult.value,
        });
      }
    });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return { valid: false };
    }

    setFieldErrors({});
    return {
      valid: true,
      payload: {
        name: formData.name.trim(),
        type: formData.type,
        salesPrice: salesPriceResult.value!,
        costPrice: costPriceResult.value!,
        notes: formData.notes.trim(),
        active: formData.active,
        variants: sanitizedVariants,
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
        await api.products.update(formData.id, payload);
        setSuccessBanner(`Product "${payload.name}" updated successfully.`);
      } else {
        await api.products.create(payload);
        setSuccessBanner(`Product "${payload.name}" created successfully.`);
      }
      setIsDialogOpen(false);
      refresh();
      // Auto-clear success message after 4s
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
        setGeneralError("An unexpected error occurred while saving the product.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate base unit price in paise for previewing adjustments
  const baseSalesPaise = parseRupeesToPaise(formData.salesPriceInput).value ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Catalog / Products"
        title="Built for every offering."
        description="Your software, services, and add-ons, ready for the next billing cycle."
        action={
          isAdmin ? (
            <button
              type="button"
              className="button"
              onClick={openCreateDialog}
              aria-label="Create new product"
            >
              + Add Product
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
              placeholder="Search products by name, notes, or variants…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search products"
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
                {data.total} {data.total === 1 ? "product" : "products"}
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
          title="Product catalog"
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
                "Product",
                "Type",
                "Sales price",
                "Cost price",
                "Variants",
                "Status",
                "Actions",
              ]}
            >
              {data.items.map((product) => (
                <tr key={product.id}>
                  <td>
                    <strong>{product.name}</strong>
                    {product.notes && <small>{product.notes}</small>}
                  </td>
                  <td>
                    <Badge value={product.type} />
                  </td>
                  <td>{formatMoney(product.salesPrice)}</td>
                  <td>{formatMoney(product.costPrice)}</td>
                  <td>
                    {product.variants.length > 0 ? (
                      <div>
                        <span>{product.variants.length} variant{product.variants.length > 1 ? "s" : ""}</span>
                        <small style={{ color: "var(--muted)" }}>
                          {product.variants.map((v) => v.name).join(", ")}
                        </small>
                      </div>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>0</span>
                    )}
                  </td>
                  <td>
                    <Badge value={product.active ? "ACTIVE" : "CLOSED"} />
                  </td>
                  <td>
                    <div className={styles.actionsCell}>
                      {isAdmin ? (
                        <button
                          type="button"
                          className={styles.editBtn}
                          onClick={() => openEditDialog(product, false)}
                          aria-label={`Edit ${product.name}`}
                        >
                          Edit
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.editBtn}
                          onClick={() => openEditDialog(product, true)}
                          aria-label={`View ${product.name}`}
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
              <p>No products found {activeSearch ? `for "${activeSearch}"` : ""}.</p>
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
            ? `View Product: ${formData.name}`
            : formData.id
            ? `Edit Product: ${formData.name}`
            : "Add New Product"
        }
        description={
          isReadOnlyView
            ? "Product specifications and variant pricing (Read-only for Staff role)."
            : "Configure product unit pricing, line item classification, and add-on variants."
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
                <label className={styles.formLabel} htmlFor="prod-name">
                  <span>
                    Product Name {!isReadOnlyView && <span className={styles.requiredAsterisk}>*</span>}
                  </span>
                </label>
                <input
                  id="prod-name"
                  type="text"
                  className={`${styles.formInput} ${fieldErrors.name ? styles.inputError : ""}`}
                  placeholder="e.g. Workspace Suite, Cloud Storage"
                  value={formData.name}
                  disabled={isReadOnlyView || submitting}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? "prod-name-err" : undefined}
                />
                {fieldErrors.name && (
                  <span id="prod-name-err" className={styles.fieldError} role="alert">
                    {fieldErrors.name}
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="prod-type">
                  <span>Type</span>
                </label>
                <select
                  id="prod-type"
                  className={styles.formSelect}
                  value={formData.type}
                  disabled={isReadOnlyView || submitting}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      type: e.target.value as "SOFTWARE" | "SERVICE" | "ADDON",
                    })
                  }
                >
                  <option value="SOFTWARE">SOFTWARE</option>
                  <option value="SERVICE">SERVICE</option>
                  <option value="ADDON">ADDON</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <div className={styles.switchCard} style={{ marginTop: "18px" }}>
                  <input
                    type="checkbox"
                    id="prod-active"
                    className={styles.checkboxInput}
                    checked={formData.active}
                    disabled={isReadOnlyView || submitting}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  />
                  <div className={styles.switchContent}>
                    <label htmlFor="prod-active" className={styles.switchTitle}>
                      Active in Catalog
                    </label>
                    <span className={styles.switchDescription}>
                      Active products can be quoted and added to new subscriptions.
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="prod-sales-price">
                  <span>
                    Sales Price (₹) {!isReadOnlyView && <span className={styles.requiredAsterisk}>*</span>}
                  </span>
                  <span className={styles.labelHint}>Base unit price</span>
                </label>
                <input
                  id="prod-sales-price"
                  type="text"
                  inputMode="decimal"
                  className={`${styles.formInput} ${
                    fieldErrors.salesPrice ? styles.inputError : ""
                  }`}
                  placeholder="e.g. 1000.00"
                  value={formData.salesPriceInput}
                  disabled={isReadOnlyView || submitting}
                  onChange={(e) =>
                    setFormData({ ...formData, salesPriceInput: e.target.value })
                  }
                  aria-invalid={Boolean(fieldErrors.salesPrice)}
                  aria-describedby={fieldErrors.salesPrice ? "prod-sales-price-err" : undefined}
                />
                {fieldErrors.salesPrice && (
                  <span id="prod-sales-price-err" className={styles.fieldError} role="alert">
                    {fieldErrors.salesPrice}
                  </span>
                )}
                <span className={styles.fieldHelp}>
                  Entered in Rupees, saved as integer paise.
                </span>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="prod-cost-price">
                  <span>
                    Cost Price (₹) {!isReadOnlyView && <span className={styles.requiredAsterisk}>*</span>}
                  </span>
                  <span className={styles.labelHint}>Direct internal cost</span>
                </label>
                <input
                  id="prod-cost-price"
                  type="text"
                  inputMode="decimal"
                  className={`${styles.formInput} ${
                    fieldErrors.costPrice ? styles.inputError : ""
                  }`}
                  placeholder="e.g. 350.00"
                  value={formData.costPriceInput}
                  disabled={isReadOnlyView || submitting}
                  onChange={(e) =>
                    setFormData({ ...formData, costPriceInput: e.target.value })
                  }
                  aria-invalid={Boolean(fieldErrors.costPrice)}
                  aria-describedby={fieldErrors.costPrice ? "prod-cost-price-err" : undefined}
                />
                {fieldErrors.costPrice && (
                  <span id="prod-cost-price-err" className={styles.fieldError} role="alert">
                    {fieldErrors.costPrice}
                  </span>
                )}
              </div>

              <div className={`${styles.formGroup} ${styles.formGridFull}`}>
                <label className={styles.formLabel} htmlFor="prod-notes">
                  <span>Notes & Description</span>
                </label>
                <textarea
                  id="prod-notes"
                  rows={2}
                  className={styles.formTextarea}
                  placeholder="Helpful details, e.g. 'Per seat, billed per cycle'..."
                  value={formData.notes}
                  disabled={isReadOnlyView || submitting}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
            </div>

            {/* Variants Section */}
            <div className={styles.variantsSection}>
              <div className={styles.variantsHeader}>
                <div>
                  <h3>Product Variants & Upgrades</h3>
                  <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                    Configure optional editions or add-on specifications.
                  </p>
                </div>
                {!isReadOnlyView && (
                  <button
                    type="button"
                    className={styles.addVariantBtn}
                    onClick={handleAddVariant}
                    disabled={submitting}
                    aria-label="Add variant"
                  >
                    + Add Variant
                  </button>
                )}
              </div>

              <div className={styles.variantNotice}>
                <strong>How variant pricing works:</strong> A variant&apos;s price adjustment is added
                to the base sales price. For example, if base sales price is{" "}
                <strong>{formatMoney(baseSalesPaise)}</strong>, a variant with +₹560 adjustment
                yields payload <code>priceAdjustment: 56000</code> and effective unit price{" "}
                <strong>{formatMoney(baseSalesPaise + 56000)}</strong>.
              </div>

              {formData.variants.length > 0 ? (
                <div style={{ overflowX: "auto" }}>
                  <table className={styles.variantsTable}>
                    <thead>
                      <tr>
                        <th style={{ width: "35%" }}>Variant Name</th>
                        <th style={{ width: "30%" }}>Price Adjustment (₹)</th>
                        <th style={{ width: "25%" }}>Effective Unit Price</th>
                        {!isReadOnlyView && <th style={{ width: "10%" }}>Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {formData.variants.map((variant, idx) => {
                        const adjPaise =
                          parseRupeesToPaise(variant.priceAdjustmentInput).value ?? 0;
                        const effectiveUnitPaise = baseSalesPaise + adjPaise;
                        const nameError = fieldErrors[`variant_${idx}_name`];
                        const adjError = fieldErrors[`variant_${idx}_adjustment`];

                        return (
                          <tr key={variant.tempKey}>
                            <td>
                              <input
                                type="text"
                                className={`${styles.formInput} ${
                                  nameError ? styles.inputError : ""
                                }`}
                                placeholder="e.g. Odoo, Enterprise Edition"
                                value={variant.name}
                                disabled={isReadOnlyView || submitting}
                                onChange={(e) =>
                                  handleVariantChange(idx, "name", e.target.value)
                                }
                                aria-label={`Variant ${idx + 1} Name`}
                              />
                              {nameError && (
                                <span className={styles.fieldError} role="alert">
                                  {nameError}
                                </span>
                              )}
                            </td>
                            <td>
                              <input
                                type="text"
                                inputMode="decimal"
                                className={`${styles.formInput} ${
                                  adjError ? styles.inputError : ""
                                }`}
                                placeholder="0.00"
                                value={variant.priceAdjustmentInput}
                                disabled={isReadOnlyView || submitting}
                                onChange={(e) =>
                                  handleVariantChange(idx, "priceAdjustmentInput", e.target.value)
                                }
                                aria-label={`Variant ${idx + 1} Price Adjustment`}
                              />
                              {adjError && (
                                <span className={styles.fieldError} role="alert">
                                  {adjError}
                                </span>
                              )}
                            </td>
                            <td>
                              <strong>{formatMoney(effectiveUnitPaise)}</strong>
                              <small style={{ display: "block", color: "var(--muted)" }}>
                                {formatMoney(baseSalesPaise)} + {formatMoney(adjPaise)}
                              </small>
                            </td>
                            {!isReadOnlyView && (
                              <td>
                                <button
                                  type="button"
                                  className={styles.removeBtn}
                                  onClick={() => handleRemoveVariant(idx)}
                                  disabled={submitting}
                                  aria-label={`Remove variant ${variant.name || idx + 1}`}
                                >
                                  Delete
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ fontSize: "12px", color: "var(--muted)", fontStyle: "italic", margin: 0 }}>
                  No variants configured for this product. Base unit price applies to all orders.
                </p>
              )}
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
                {submitting ? "Saving…" : formData.id ? "Update Product" : "Create Product"}
              </button>
            )}
          </div>
        </form>
      </Dialog>

      <StarterNote owner="Athul">
        Product and variant editor is active. All money amounts use integer paise in the data layer
        while displaying in standard Indian Rupees.
      </StarterNote>
    </>
  );
}
