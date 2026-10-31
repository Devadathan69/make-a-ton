"use client";

import { type ReactNode } from "react";
import { useDialog } from "@/components/use-dialog";
import styles from "./catalog.module.css";

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  id?: string;
  busy?: boolean;
}

export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  id = "catalog-dialog",
  busy = false,
}: DialogProps) {
  const dialogId = useDialog(isOpen, onClose, busy);

  if (!isOpen) return null;

  const titleId = `${id}-title`;
  const descId = `${id}-desc`;

  return (
    <div
      className={styles.modalBackdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div
        data-dialog-root={dialogId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={styles.modalDialog}
      >
        <div className={styles.modalHeader}>
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descId}>{description}</p>}
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close dialog"
            disabled={busy}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
