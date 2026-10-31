"use client";
import { useEffect, useLayoutEffect, useId } from 'react';

/** Focus, keyboard containment and restoration for a modal root marked data-dialog-root. */
export function useDialog(open: boolean, onClose: () => void, busy = false) {
  const id = useId();
  useLayoutEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const roots = document.querySelectorAll<HTMLElement>('[data-dialog-root]');
    const root = roots[roots.length - 1];
    if (root?.getAttribute("data-dialog-root") === id) root.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled),[tabindex="0"]')?.focus();
    return () => { previous?.focus(); };
  }, [open, id]);
  useEffect(() => {
    if (!open) return;
    function key(event: KeyboardEvent) {
      const roots = document.querySelectorAll<HTMLElement>('[data-dialog-root]');
      const root = roots[roots.length - 1];
      if (!root || root.getAttribute("data-dialog-root") !== id) return;
      if (event.key === 'Escape') {event.preventDefault(); event.stopImmediatePropagation(); if (!busy) onClose();}
      if (event.key === 'Tab') {
        const fields = [...root.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el => el.getClientRects().length);
        const first = fields[0], last = fields.at(-1);
        if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {event.preventDefault();last?.focus();}
        else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {event.preventDefault();first?.focus();}
      }
    }
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [open, onClose, busy, id]);
  return id;
}
