"use client";

import { useEffect, useState } from "react";
import type { Customer, CustomerInput } from "@/lib/contracts";
import { api, ApiError } from "@/lib/api";
import { useDialog } from "@/components/use-dialog";
import styles from "./subscriptions.module.css";

interface CustomerDialogProps {
  isOpen: boolean;
  customer?: Customer | null;
  onClose: () => void;
  onSuccess: (saved: Customer) => void;
}

export function CustomerDialog({ isOpen, customer, onClose, onSuccess }: CustomerDialogProps) {
  const isEdit = Boolean(customer);
  const [formData, setFormData] = useState<CustomerInput>({
    name: "",
    email: "",
    company: "",
    address: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (customer) {
        setFormData({
          name: customer.name ?? "",
          email: customer.email ?? "",
          company: customer.company ?? "",
          address: customer.address ?? "",
        });
      } else {
        setFormData({ name: "", email: "", company: "", address: "" });
      }
      setErrors({});
      setGlobalError(null);
      setSubmitting(false);

      // Focus first input
    }
  }, [isOpen, customer]);

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

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    if (!formData.company.trim()) {
      nextErrors.company = "Company name is required";
    }
    if (!formData.name.trim()) {
      nextErrors.name = "Contact person name is required";
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) {
      nextErrors.email = "Email address is required";
    } else if (!emailRegex.test(formData.email.trim())) {
      nextErrors.email = "Please enter a valid email address";
    }
    if (!formData.address.trim()) {
      nextErrors.address = "Address is required";
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
      const payload: CustomerInput = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        company: formData.company.trim(),
        address: formData.address.trim(),
      };

      let result: Customer;
      if (isEdit && customer?.id) {
        result = await api.customers.update(customer.id, payload);
      } else {
        result = await api.customers.create(payload);
      }

      onSuccess(result);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setGlobalError(err.message);
        if (err.fields) {
          setErrors((prev) => ({ ...prev, ...err.fields }));
        }
      } else if (err instanceof Error) {
        setGlobalError(err.message);
      } else {
        setGlobalError("Failed to save customer. Please check your connection and try again.");
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
        className={styles.modalDialog}
        data-dialog-root={dialogId} role="dialog"
        aria-modal="true"
        aria-labelledby="customer-dialog-title"
      >
        <div className={styles.modalHeader}>
          <h2 id="customer-dialog-title">{isEdit ? "Edit Customer" : "New Customer"}</h2>
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

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="cust-company">
                  Company Name <span className={styles.requiredIndicator}>*</span>
                </label>
                <input
                  id="cust-company"
                  type="text"
                  className={`${styles.formInput} ${errors.company ? styles.inputError : ""}`}
                  placeholder="e.g. Acme Corporation"
                  value={formData.company}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, company: e.target.value }));
                    if (errors.company) setErrors((prev) => ({ ...prev, company: "" }));
                  }}
                  aria-invalid={Boolean(errors.company)}
                  aria-describedby={errors.company ? "cust-company-err" : undefined}
                  disabled={submitting}
                  required
                />
                {errors.company && (
                  <span id="cust-company-err" className={styles.errorText} role="alert">
                    {errors.company}
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="cust-name">
                  Contact Person <span className={styles.requiredIndicator}>*</span>
                </label>
                <input
                  id="cust-name"
                  type="text"
                  className={`${styles.formInput} ${errors.name ? styles.inputError : ""}`}
                  placeholder="e.g. Jane Doe"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, name: e.target.value }));
                    if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
                  }}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? "cust-name-err" : undefined}
                  disabled={submitting}
                  required
                />
                {errors.name && (
                  <span id="cust-name-err" className={styles.errorText} role="alert">
                    {errors.name}
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="cust-email">
                  Email Address <span className={styles.requiredIndicator}>*</span>
                </label>
                <input
                  id="cust-email"
                  type="email"
                  className={`${styles.formInput} ${errors.email ? styles.inputError : ""}`}
                  placeholder="e.g. jane@acme.com"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, email: e.target.value }));
                    if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
                  }}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "cust-email-err" : undefined}
                  disabled={submitting}
                  required
                />
                {errors.email && (
                  <span id="cust-email-err" className={styles.errorText} role="alert">
                    {errors.email}
                  </span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="cust-address">
                  Billing Address <span className={styles.requiredIndicator}>*</span>
                </label>
                <textarea
                  id="cust-address"
                  rows={3}
                  className={`${styles.formTextarea} ${errors.address ? styles.inputError : ""}`}
                  placeholder="Street, City, Postal Code, Country"
                  value={formData.address}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, address: e.target.value }));
                    if (errors.address) setErrors((prev) => ({ ...prev, address: "" }));
                  }}
                  aria-invalid={Boolean(errors.address)}
                  aria-describedby={errors.address ? "cust-address-err" : undefined}
                  disabled={submitting}
                  required
                />
                {errors.address && (
                  <span id="cust-address-err" className={styles.errorText} role="alert">
                    {errors.address}
                  </span>
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
              {submitting ? "Saving..." : isEdit ? "Update Customer" : "Create Customer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
