"use client";

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
  return (
    <aside className={`detail-drawer ${appName ? "open" : ""}`} aria-live="polite">
      <div className="detail-drawer-header">
        <div>
          <p className="eyebrow">Deployment detail</p>
          <h2>{appName ?? "Select a deployment"}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close detail drawer"
        >
          Close
        </button>
      </div>

      {!appName ? (
        <p className="drawer-empty">Select a buoy to inspect its deployment profile.</p>
      ) : null}

      {loading ? <p className="drawer-message">Loading deployment detail...</p> : null}
      {error ? <p className="drawer-message danger">{error}</p> : null}

      {detail ? (
        <div className="drawer-content">
          <div className="drawer-status-row">
            <span
              className={`status-pill ${detail.summary.liveStatus
                .toLowerCase()
                .replace(/\s+/g, "-")}`}
            >
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
                <strong>Runtime and compose hints</strong>
                <ul className="plain-list">
                  {detail.app.compose.slice(0, 6).map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <dl className="definition-grid">
              <div>
                <dt>Estimated CPU usage</dt>
                <dd>
                  {detail.summary.runtimeUsage.estimatedCpuCores !== null
                    ? `${detail.summary.runtimeUsage.estimatedCpuCores} cores`
                    : "Not published"}
                </dd>
              </div>
              <div>
                <dt>Estimated memory usage</dt>
                <dd>
                  {detail.summary.runtimeUsage.estimatedMemoryMb !== null
                    ? `${detail.summary.runtimeUsage.estimatedMemoryMb} MB`
                    : "Not published"}
                </dd>
              </div>
              <div>
                <dt>Estimated storage usage</dt>
                <dd>
                  {detail.summary.runtimeUsage.estimatedStorageGb !== null
                    ? `${detail.summary.runtimeUsage.estimatedStorageGb} GB`
                    : "Not published"}
                </dd>
              </div>
              <div>
                <dt>Active nodes</dt>
                <dd>{detail.summary.runtimeUsage.activeNodes}</dd>
              </div>
              <div>
                <dt>Observed regions</dt>
                <dd>
                  {detail.summary.regions.length > 0
                    ? detail.summary.regions.slice(0, 6).join(", ")
                    : "Unknown"}
                </dd>
              </div>
              <div>
                <dt>Avg node download</dt>
                <dd>
                  {detail.summary.runtimeUsage.avgNodeDownloadMbps !== null
                    ? `${detail.summary.runtimeUsage.avgNodeDownloadMbps} Mbps`
                    : "Unknown"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="drawer-section">
            <h3>Node and hardware context</h3>
            {detail.nodes.length > 0 ? (
              <div className="node-list">
                {detail.nodes.slice(0, 5).map((node) => (
                  <article key={node.id} className="node-card">
                    <strong>{node.ip}</strong>
                    <p>
                      {node.geolocation.country || "Unknown country"}
                      {node.org ? ` | ${node.org}` : ""}
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
        </div>
      ) : null}
    </aside>
  );
}
