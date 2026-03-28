"use client";

import { useEffect, useMemo, useState } from "react";
import type { FilterState } from "./FilterBar";
import { FilterBar } from "./FilterBar";
import { SearchBox } from "./SearchBox";
import { SceneCanvas } from "./SceneCanvas";
import { DetailDrawer } from "./DetailDrawer";
import { BUILD_STAMP } from "../../lib/buildStamp";
import type {
  AppDetail,
  AppSystem,
  Cluster,
  FilterMetadata,
  Star,
} from "../../lib/types/star";

type SearchResult = {
  appName: string;
  owner: string;
  description: string;
  runtimeFamily: string;
  projectCategory: string;
  resourceTier: string;
  systemId: string;
  clusterId: string;
  x: number;
  y: number;
  score: number;
};

type InitialScene = {
  generatedAt: string;
  deploymentConstraints: {
    minimumInstances: number | null;
    maximumInstances: number | null;
  };
  clusters: Cluster[];
  systems: AppSystem[];
  stars: Star[];
  featureSystems: AppSystem[];
  counts: {
    apps: number;
    locations: number;
    stars: number;
  };
  filters: FilterMetadata;
};

const initialFilters: FilterState = {
  runtimeFamily: "all",
  projectCategory: "all",
  resourceTier: "all",
  status: "all",
};

const emptyScene: InitialScene = {
  generatedAt: new Date(0).toISOString(),
  deploymentConstraints: {
    minimumInstances: null,
    maximumInstances: null,
  },
  clusters: [],
  systems: [],
  stars: [],
  featureSystems: [],
  counts: {
    apps: 0,
    locations: 0,
    stars: 0,
  },
  filters: {
    runtimeFamilies: [],
    projectCategories: [],
    resourceTiers: [],
    statuses: [],
    countries: [],
  },
};

export function ConstellationExperience() {
  const [scene, setScene] = useState<InitialScene | null>(null);
  const [sceneLoading, setSceneLoading] = useState(true);
  const [sceneError, setSceneError] = useState("");
  const [sceneReloadNonce, setSceneReloadNonce] = useState(0);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [selectedAppName, setSelectedAppName] = useState<string | null>(null);
  const [hoveredStar, setHoveredStar] = useState<Star | null>(null);
  const [focusTarget, setFocusTarget] = useState<{
    key: string;
    x: number;
    y: number;
    zoom: number;
  } | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [detail, setDetail] = useState<AppDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadScene = async () => {
      setSceneLoading(true);
      setSceneError("");

      try {
        const response = await fetch("/api/stars", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Unable to load the public FluxCloud snapshot.");
        }

        const payload = (await response.json()) as InitialScene;
        if (cancelled) {
          return;
        }

        setScene(payload);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setSceneError(
          error instanceof Error
            ? error.message
            : "Unable to load the public FluxCloud snapshot.",
        );
      } finally {
        if (!cancelled) {
          setSceneLoading(false);
        }
      }
    };

    void loadScene();

    return () => {
      cancelled = true;
    };
  }, [sceneReloadNonce]);

  const activeScene = scene ?? emptyScene;

  const visibleStars = useMemo(
    () =>
      activeScene.stars.filter((star) => {
        if (
          filters.runtimeFamily !== "all" &&
          star.runtimeFamily !== filters.runtimeFamily
        ) {
          return false;
        }
        if (
          filters.projectCategory !== "all" &&
          star.projectCategory !== filters.projectCategory
        ) {
          return false;
        }
        if (
          filters.resourceTier !== "all" &&
          star.resourceTier !== filters.resourceTier
        ) {
          return false;
        }
        if (filters.status !== "all" && star.status !== filters.status) {
          return false;
        }
        return true;
      }),
    [activeScene.stars, filters],
  );

  const visibleStarIds = useMemo(
    () => new Set(visibleStars.map((star) => star.id)),
    [visibleStars],
  );

  const visibleAppNames = useMemo(
    () => new Set(visibleStars.map((star) => star.appName)),
    [visibleStars],
  );

  const visibleSystems = useMemo(
    () =>
      activeScene.systems.filter((system) => visibleAppNames.has(system.appName)),
    [activeScene.systems, visibleAppNames],
  );

  const visibleClusters = useMemo(
    () =>
      activeScene.clusters.filter((cluster) => cluster.starIds.some((starId) => visibleStarIds.has(starId))),
    [activeScene.clusters, visibleStarIds],
  );

  useEffect(() => {
    if (!selectedAppName) {
      setDetail(null);
      setDetailError("");
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError("");

    fetchAppDetail(selectedAppName)
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setDetail(payload);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setDetailError(
          error instanceof Error ? error.message : "Unable to load app detail.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAppName]);

  const handleSearch = async (query: string) => {
    setSearchBusy(true);
    setStatusMessage("");

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error("Search request failed.");
      }

      const payload = (await response.json()) as { results: SearchResult[] };
      setSearchResults(payload.results);

      if (payload.results[0]) {
        const top = payload.results[0];
        setSelectedAppName(top.appName);
        setFocusTarget({
          key: `search:${top.appName}:${Date.now()}`,
          x: top.x,
          y: top.y,
          zoom: 0.95,
        });
      } else {
        setStatusMessage(
          "No matching app or owner was found in the current public snapshot.",
        );
      }
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Search failed.",
      );
    } finally {
      setSearchBusy(false);
    }
  };

  const handleSelectApp = (appName: string) => {
    setSelectedAppName(appName);
    const system = activeScene.systems.find((entry) => entry.appName === appName);

    if (system) {
      setFocusTarget({
        key: `select:${appName}:${Date.now()}`,
        x: system.x,
        y: system.y,
        zoom: 1.15,
      });
    }
  };

  return (
    <main className="atlas-page">
      <section className="hero-shell">
        <div className="hero-copy">
          <div className="brand-row">
            <img
              className="flux-logo"
              src="/flux-logo.svg"
              alt="Flux"
              width={128}
              height={40}
              decoding="async"
            />
            <p className="eyebrow">FluxCloud public atlas</p>
          </div>
          <h1>Explore public FluxCloud deployments in a flyable sky map.</h1>
          <p className="hero-text">
            Click the map, then use arrow keys or <strong>WASD</strong> to fly; scroll
            to zoom. Color-coded <strong>buoys</strong> mark deployments—fly near one to
            see its name, then click for details. Search and filters jump your plane to
            matches. Phones: use the on-screen direction pad.
          </p>
        </div>

        <div className="hero-metrics">
          <article>
            <span>Apps</span>
            <strong>{activeScene.counts.apps}</strong>
          </article>
          <article>
            <span>Stars</span>
            <strong>{activeScene.counts.stars}</strong>
          </article>
          <article>
            <span>Constraints</span>
            <strong>
              {activeScene.deploymentConstraints.minimumInstances ?? "?"}-
              {activeScene.deploymentConstraints.maximumInstances ?? "?"} instances
            </strong>
          </article>
        </div>
      </section>

      <section className="atlas-grid">
        <div className="atlas-main">
          <div className="control-bar">
            <SearchBox onSearch={handleSearch} busy={searchBusy || sceneLoading} />
            <FilterBar
              filters={activeScene.filters}
              value={filters}
              onChange={setFilters}
            />
          </div>

          <div className="atlas-status-row">
            <span>
              {sceneLoading
                ? "Loading public FluxCloud snapshot..."
                : `Snapshot generated ${new Date(activeScene.generatedAt).toLocaleString()}`}
            </span>
            <span>
              {visibleStars.length} visible stars after filtering
              <span className="build-stamp" title="If this does not match Git, Flux has not deployed the latest build.">
                {" "}
                · Build {BUILD_STAMP}
              </span>
            </span>
          </div>

          <SceneCanvas
            stars={visibleStars}
            clusters={visibleClusters}
            systems={visibleSystems}
            selectedAppName={selectedAppName}
            searchMatches={searchResults.map((item) => item.appName)}
            focusTarget={focusTarget}
            mapDataLoading={sceneLoading}
            snapshotError={!!sceneError}
            onSelectApp={handleSelectApp}
            onHoverStar={setHoveredStar}
          />

          <div className="atlas-lower-grid">
            <section className="panel-card">
              <div className="panel-card-header">
                <h2>Search and filter results</h2>
                <span>{searchResults.length} matches</span>
              </div>
              {searchResults.length > 0 ? (
                <ul className="result-list">
                  {searchResults.map((result) => (
                    <li key={result.appName}>
                      <button
                        type="button"
                        onClick={() => handleSelectApp(result.appName)}
                      >
                        <strong>{result.appName}</strong>
                        <span>
                          {result.owner} - {result.runtimeFamily} -{" "}
                          {result.projectCategory}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="panel-copy">
                  Use search or filters to jump your plane near apps, owners, or
                  runtime cohorts, then fly to explore nearby deployments.
                </p>
              )}
            </section>

            <section className="panel-card">
              <div className="panel-card-header">
                <h2>{hoveredStar ? "Hover preview" : "Featured systems"}</h2>
                <span>
                  {hoveredStar
                    ? hoveredStar.runtimeFamily
                    : activeScene.featureSystems.length}
                </span>
              </div>
              {hoveredStar ? (
                <div className="hover-card">
                  <strong>{hoveredStar.appName}</strong>
                  <p>
                    {hoveredStar.projectCategory} - {hoveredStar.resourceTier} -{" "}
                    {hoveredStar.status}
                  </p>
                  <span>
                    Observed region: {hoveredStar.region || "Unknown"} - owner
                    context {String(hoveredStar.metadata.owner || "Unknown")}
                  </span>
                </div>
              ) : (
                <ul className="result-list compact">
                  {activeScene.featureSystems.map((system) => (
                    <li key={system.systemId}>
                      <button
                        type="button"
                        onClick={() => handleSelectApp(system.appName)}
                      >
                        <strong>{system.appName}</strong>
                        <span>
                          {system.projectCategory} - {system.instanceCount} instances
                          - {system.status}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {sceneError ? (
            <div className="status-banner status-banner--error">
              <p>{sceneError}</p>
              <button
                type="button"
                className="primary-action"
                onClick={() => {
                  setSceneError("");
                  setSceneReloadNonce((n) => n + 1);
                }}
              >
                Retry loading snapshot
              </button>
            </div>
          ) : null}
          {statusMessage ? <p className="status-banner">{statusMessage}</p> : null}
        </div>

        <DetailDrawer
          appName={selectedAppName}
          detail={detail}
          loading={detailLoading}
          error={detailError}
          onClose={() => setSelectedAppName(null)}
        />
      </section>
    </main>
  );
}

async function fetchAppDetail(appName: string) {
  const response = await fetch(`/api/detail/${encodeURIComponent(appName)}`);
  if (!response.ok) {
    throw new Error("Unable to load app detail.");
  }

  return (await response.json()) as AppDetail;
}
