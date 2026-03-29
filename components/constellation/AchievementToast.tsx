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
      <div>
        <p className="eyebrow">
          {toast.tone === "quest" ? "Quest complete" : "Hangar update"}
        </p>
        <strong>{toast.title}</strong>
        <p>{toast.body}</p>
      </div>
      <button type="button" className="icon-button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
