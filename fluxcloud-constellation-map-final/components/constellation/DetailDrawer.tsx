"use client";

import { useState } from "react";
import type { AppDetail } from "../../lib/types/star";

type DetailDrawerProps = {
  appName: string | null;
  detail: AppDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
};

export function DetailDrawer({
  appName,
  detail,
  loading,
  error,
  onClose,
}: DetailDrawerProps) {
  const [message, setMessage] = useState("");

  const copyAppName = async () => {
    if (!appName) {
      return;
    }

    try {
      await navigator.clipboard.writeText(appName);
      setMessage("App name copied.");
    } catch {
      setMessage("Clipboard access is unavailable in this browser.");
    }
  };

  const placeholderAction = (label: string) => {
    setMessage(`${label} hook reserved for a later workflow.`);
  };

  return (
    <aside className={`detail-drawer ${appName ? "open" : ""}`} aria-live="polite">
      <div className="detail-drawer-header">
        <div>
          <p className="eyebrow">Deployment detail</p>
          <h2>{appName ?? "Select a system"}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close detail drawer">
          Close
        </button>
      </div>

      {!appName ? (
        <p className="drawer-empty">
          Select a star or search result to inspect the normalized FluxCloud deployment profile.
        </p>
      ) : null}

      {loading ? <p className="drawer-message">Loading deployment detail...</p> : null}
      {error ? <p className="drawer-message danger">{error}</p> : null}

      {detail ? (
        <div className="drawer-content">
          <div className="drawer-status-row">
            <span className={`status-pill ${detail.summary.liveStatus.toLowerCase().replace(/\s+/g, "-")}`}>
              {detail.summary.liveStatus}
            </span>
            <span className="status-pill subtle">{detail.app.projectCategory}</span>
            <span className="status-pill subtle">{detail.app.runtimeFamily}</span>
          </div>

          <section className="drawer-section">
            <h3>App overview</h3>
            <p>{detail.app.description || "No public description was available for this app."}</p>
            <dl className="definition-grid">
              <div>
                <dt>Owner</dt>
                <dd>{detail.summary.owner}</dd>
              </div>
              <div>
                <dt>Instances</dt>
                <dd>{detail.summary.instanceCount}</dd>
              </div>
              <div>
                <dt>Static IP</dt>
                <dd>{detail.app.staticIp ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Freshness</dt>
                <dd>{detail.summary.freshness}</dd>
              </div>
            </dl>
          </section>

          <section className="drawer-section">
            <h3>Deployment profile</h3>
            <dl className="definition-grid">
              <div>
                <dt>Runtime family</dt>
                <dd>{detail.app.runtimeFamily}</dd>
              </div>
              <div>
                <dt>Project category</dt>
                <dd>{detail.app.projectCategory}</dd>
              </div>
              <div>
                <dt>Resource tier</dt>
                <dd>{detail.app.resourceTier}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{detail.app.version ?? "Unknown"}</dd>
              </div>
            </dl>

            {detail.app.compose.length > 0 ? (
              <div className="text-block">
                <strong>Compose and image hints</strong>
                <ul className="plain-list">
                  {detail.app.compose.slice(0, 6).map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="drawer-section">
            <h3>Node and hardware context</h3>
            {detail.nodes.length > 0 ? (
              <div className="node-list">
                {detail.nodes.slice(0, 5).map((node) => (
                  <article key={node.id} className="node-card">
                    <strong>{node.ip}</strong>
                    <p>
                      {node.geolocation.country || "Unknown country"} {node.org ? `• ${node.org}` : ""}
                    </p>
                    <dl className="definition-grid compact">
                      <div>
                        <dt>Benchmark tier</dt>
                        <dd>{node.benchmarkTier}</dd>
                      </div>
                      <div>
                        <dt>Architecture</dt>
                        <dd>{node.architecture || "Unknown"}</dd>
                      </div>
                      <div>
                        <dt>RAM</dt>
                        <dd>{node.ramGb ?? "Unknown"} GB</dd>
                      </div>
                      <div>
                        <dt>Download</dt>
                        <dd>{node.downloadSpeed ?? "Unknown"} Mbps</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <p className="drawer-message">
                Public node enrichment was not available for this app right now.
              </p>
            )}
          </section>

          <section className="drawer-section">
            <h3>Visualization rationale</h3>
            <ul className="plain-list">
              <li>{detail.rationale.constellationReason}</li>
              <li>{detail.rationale.sizingReason}</li>
              <li>{detail.rationale.neighborhoodReason}</li>
            </ul>
          </section>

          <section className="drawer-section">
            <h3>Observed deployment context</h3>
            <p>
              This atlas shows observed deployment context from public Flux surfaces. It is not a
              manual single-node pinning interface.
            </p>
          </section>

          <section className="drawer-section">
            <h3>Action hooks</h3>
            <div className="drawer-actions">
              <button type="button" className="secondary-action" onClick={() => placeholderAction("Save")}>
                Save
              </button>
              <button type="button" className="secondary-action" onClick={() => placeholderAction("Compare")}>
                Compare
              </button>
              <button type="button" className="secondary-action" onClick={copyAppName}>
                Copy app name
              </button>
              <button
                type="button"
                className="primary-action"
                onClick={() => placeholderAction("Deploy handoff")}
              >
                Open deploy handoff
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {message ? <p className="drawer-message">{message}</p> : null}
    </aside>
  );
}
