"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type MobileDrawerProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  placement?: "right" | "bottom";
  className?: string;
  description?: string;
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

export function MobileDrawer({
  open,
  title,
  onClose,
  children,
  placement = "right",
  className = "",
  description,
}: MobileDrawerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const getFocusable = () => {
      if (!panel) {
        return [];
      }

      return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.hasAttribute("disabled") && element.tabIndex !== -1,
      );
    };

    const focusFirstElement = window.requestAnimationFrame(() => {
      const focusable = getFocusable();
      if (focusable[0]) {
        focusable[0].focus();
        return;
      }
      panel?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        panel?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFirstElement);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previousActiveElement?.focus();
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="mobile-drawer-layer" role="presentation">
      <div className="mobile-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <section
        ref={panelRef}
        className={`mobile-drawer mobile-drawer--${placement}${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mobile-drawer__header">
          <div>
            <h2 id={titleId} className="mobile-drawer__title">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mobile-drawer__copy">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-button mobile-drawer__close"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            Close
          </button>
        </div>
        <div className="mobile-drawer__body">{children}</div>
      </section>
    </div>
  );
}
