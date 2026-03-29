"use client";

import type { ProgressToast } from "./ProgressProvider";

export function AchievementToast({
  toast,
  onDismiss,
}: {
  toast: ProgressToast | null;
  onDismiss: () => void;
}) {
  if (!toast) {
    return null;
  }

  return (
    <div className={`achievement-toast achievement-toast--${toast.tone}`} role="status">
      <div className="achievement-toast-copy">
        <strong>{toast.title}</strong>
        <span>{toast.body}</span>
      </div>
      <button type="button" className="icon-button" onClick={onDismiss} aria-label="Dismiss notice">
        Close
      </button>
    </div>
  );
}
