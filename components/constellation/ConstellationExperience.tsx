"use client";

import { useEffect, useMemo, useState } from "react";
import type { FilterState } from "./FilterBar";
import { FilterBar } from "./FilterBar";
import { SearchBox } from "./SearchBox";
import { SceneCanvas, type HoveredEntity } from "./SceneCanvas";
import { DetailDrawer } from "./DetailDrawer";
import { MiniMap } from "./MiniMap";
import { DiegeticHud } from "./DiegeticHud";
import { QuestLog } from "./QuestLog";
import { HangarPanel } from "./HangarPanel";
import { AchievementToast } from "./AchievementToast";
import {
  ConstellationProgressProvider,
  useConstellationProgress,
} from "./ProgressProvider";
import { BUILD_STAMP } from "../../lib/buildStamp";
import type { FlightTelemetry } from "../../lib/layout/focusContext";
import type {
  AppDetail,
  AppSystem,
  ArchetypeSummary,
  Cluster,
  FilterMetadata,
  SceneBounds,
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
  bounds: SceneBounds;
  rareArchetypes: ArchetypeSummary[];
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
  bounds: {
    minX: -1_000,
    minY: -1_000,
    maxX: 1_000,
    maxY: 1_000,
    width: 2_000,
    height: 2_000,
  },
  rareArchetypes: [],
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
  const totalRegionCount = activeScene.clusters.filter(
    (cluster) => cluster.level === "region",
  ).length;

  return (
    <ConstellationProgressProvider totalRegionCount={totalRegionCount}>
      <ConstellationExperienceBody
        activeScene={activeScene}
        sceneLoading={sceneLoading}
        sceneError={sceneError}
        onRetryScene={() => {
          setSceneError("");
          setSceneReloadNonce((current) => current + 1);
        }}
      />
    </ConstellationProgressProvider>
  );
}

function ConstellationExperienceBody({
  activeScene,
  sceneLoading,
  sceneError,
  onRetryScene,
}: {
  activeScene: InitialScene;
  sceneLoading: boolean;
  sceneError: string;
  onRetryScene: () => void;
}) {
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [selectedAppName, setSelectedAppName] = useState<string | null>(null);
  const [hoveredEntity, setHoveredEntity] = useState<HoveredEntity | null>(null);
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
  const [telemetry, setTelemetry] = useState<FlightTelemetry | null>(null);

  const {
    progress,
    quests,
    skins,
    activeToast,
    summary,
    markAppInspected,
    markRareArchetypeDiscovered,
    markRegionVisited,
    markRuntimeDiscovered,
    selectSkin,
    dismissToast,
  } = useConstellationProgress();

  const systemsById = useMemo(
    () => new Map(activeScene.systems.map((system) => [system.systemId, system])),
    [activeScene.systems],
  );
  const systemsByApp = useMemo(
    () => new Map(activeScene.systems.map((system) => [system.appName, system])),
    [activeScene.systems],
  );
  const clustersById = useMemo(
    () => new Map(activeScene.clusters.map((cluster) => [cluster.clusterId, cluster])),
    [activeScene.clusters],
  );

  const visibleSystems = useMemo(
    () =>
      activeScene.systems.filter((system) => {
        if (
          filters.runtimeFamily !== "all" &&
          system.runtimeFamily !== filters.runtimeFamily
        ) {
          return false;
        }
        if (
          filters.projectCategory !== "all" &&
          system.projectCategory !== filters.projectCategory
        ) {
          return false;
        }
        if (
          filters.resourceTier !== "all" &&
          system.resourceTier !== filters.resourceTier
        ) {
          return false;
        }
        if (filters.status !== "all" && system.status !== filters.status) {
          return false;
        }
        return true;
      }),
    [activeScene.systems, filters],
  );

  const visibleSystemIds = useMemo(
    () => new Set(visibleSystems.map((system) => system.systemId)),
    [visibleSystems],
  );

  const visibleStars = useMemo(
    () =>
      activeScene.stars.filter(
        (star) =>
          visibleSystemIds.has(star.systemId) &&
          (filters.status === "all" || star.status === filters.status),
      ),
    [activeScene.stars, filters.status, visibleSystemIds],
  );

  const visibleStarIds = useMemo(
    () => new Set(visibleStars.map((star) => star.id)),
    [visibleStars],
  );

  const visibleClusters = useMemo(
    () =>
      activeScene.clusters
        .map((cluster) => {
          const systemIds = cluster.systemIds.filter((id) => visibleSystemIds.has(id));
          const starIds = cluster.starIds.filter((id) => visibleStarIds.has(id));

          if (!systemIds.length) {
            return null;
          }

          const visibleClusterSystems = systemIds
            .map((id) => systemsById.get(id))
            .filter((value): value is AppSystem => Boolean(value));
          const rareIds = [
            ...new Set(
              visibleClusterSystems
                .filter((system) => system.rarityFlags.isRareArchetype)
                .map((system) => system.archetypeId),
            ),
          ];

          return {
            ...cluster,
            systemIds,
            starIds,
            counts: {
              apps: new Set(visibleClusterSystems.map((system) => system.appName)).size,
              systems: visibleClusterSystems.length,
              instances: starIds.length,
              runtimes:
                cluster.level === "region"
                  ? new Set(
                      visibleClusterSystems.map((system) => system.runtimeFamily),
                    ).size
                  : 1,
            },
            rarityFlags: {
              hasRareArchetype: rareIds.length > 0,
              rareArchetypeCount: rareIds.length,
              rareArchetypeIds: rareIds,
            },
          } satisfies Cluster;
        })
        .filter((cluster): cluster is Cluster => Boolean(cluster)),
    [activeScene.clusters, systemsById, visibleStarIds, visibleSystemIds],
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
        if (!cancelled) {
          setDetail(payload);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDetailError(
            error instanceof Error ? error.message : "Unable to load app detail.",
          );
        }
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

  useEffect(() => {
    if (!telemetry?.activeRegionId) {
      return;
    }

    markRegionVisited(telemetry.activeRegionId);
  }, [markRegionVisited, telemetry?.activeRegionId]);

  useEffect(() => {
    if (!telemetry?.activeRuntimeId) {
      return;
    }

    markRuntimeDiscovered(telemetry.activeRuntimeId);
  }, [markRuntimeDiscovered, telemetry?.activeRuntimeId]);

  useEffect(() => {
    if (!telemetry?.nearbySystemId) {
      return;
    }

    const system = systemsById.get(telemetry.nearbySystemId);
    if (!system) {
      return;
    }

    markAppInspected(system.appName, system.runtimeFamily);
    if (system.rarityFlags.rareArchetypeId) {
      markRareArchetypeDiscovered(system.rarityFlags.rareArchetypeId);
    }
  }, [
    markAppInspected,
    markRareArchetypeDiscovered,
    systemsById,
    telemetry?.nearbySystemId,
  ]);

  useEffect(() => {
    if (!selectedAppName) {
      return;
    }

    const system = systemsByApp.get(selectedAppName);
    if (!system) {
      return;
    }

    markAppInspected(system.appName, system.runtimeFamily);
    if (system.rarityFlags.rareArchetypeId) {
      markRareArchetypeDiscovered(system.rarityFlags.rareArchetypeId);
    }
  }, [
    markAppInspected,
    markRareArchetypeDiscovered,
    selectedAppName,
    systemsByApp,
  ]);

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
          zoom: 0.32,
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
    const system = systemsByApp.get(appName);

    if (system) {
      setFocusTarget({
        key: `select:${appName}:${Date.now()}`,
        x: system.x,
        y: system.y,
        zoom: 0.34,
      });
    }
  };

  const handleFocusCluster = (cluster: Cluster) => {
    setFocusTarget({
      key: `cluster:${cluster.clusterId}:${Date.now()}`,
      x: cluster.centroid.x,
      y: cluster.centroid.y,
      zoom: cluster.level === "region" ? 0.23 : 0.31,
    });
  };

  const activeRegionLabel = telemetry?.activeRegionId
    ? clustersById.get(telemetry.activeRegionId)?.label ?? null
    : null;
  const activeRuntimeLabel = telemetry?.activeRuntimeId
    ? clustersById.get(telemetry.activeRuntimeId)?.label ?? null
    : null;

  const featuredFallback = useMemo(
    () => activeScene.featureSystems.slice(0, 8),
    [activeScene.featureSystems],
  );

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
            Start with high-level region clouds, zoom or fly into them to split
            runtime neighborhoods, then inspect individual deployment buoys only when
            you want the detail. Quest badges and unlockable plane skins reward the
            tour without changing the data itself.
          </p>
        </div>

        <div className="hero-metrics">
          <article>
            <span>Apps</span>
            <strong>{activeScene.counts.apps}</strong>
          </article>
          <article>
            <span>Regions</span>
            <strong>
              {activeScene.clusters.filter((cluster) => cluster.level === "region").length}
            </strong>
          </article>
          <article>
            <span>Rare archetypes</span>
            <strong>{activeScene.rareArchetypes.length}</strong>
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
              {visibleSystems.length} visible apps | {visibleStars.length} visible instances
              <span
                className="build-stamp"
                title="If this does not match Git, Flux has not deployed the latest build."
              >
                {" "}
                | Build {BUILD_STAMP}
              </span>
            </span>
          </div>

          <SceneCanvas
            stars={visibleStars}
            clusters={visibleClusters}
            systems={visibleSystems}
            bounds={activeScene.bounds}
            selectedAppName={selectedAppName}
            selectedSkinId={progress.selectedSkinId}
            searchMatches={searchResults.map((item) => item.appName)}
            focusTarget={focusTarget}
            mapDataLoading={sceneLoading}
            snapshotError={!!sceneError}
            overlay={
              <>
                <MiniMap
                  bounds={activeScene.bounds}
                  regionClusters={visibleClusters.filter(
                    (cluster) => cluster.level === "region",
                  )}
                  telemetry={telemetry}
                  visitedRegionIds={progress.visitedRegionIds}
                  onFocusCluster={handleFocusCluster}
                />
                <DiegeticHud
                  telemetry={telemetry}
                  activeRegionLabel={activeRegionLabel}
                  activeRuntimeLabel={activeRuntimeLabel}
                  hoveredLabel={hoveredEntity?.label ?? null}
                  completedQuests={summary.completedQuests}
                  totalQuests={summary.totalQuests}
                />
                <AchievementToast toast={activeToast} onDismiss={dismissToast} />
              </>
            }
            onSelectApp={handleSelectApp}
            onFocusCluster={handleFocusCluster}
            onHoverEntity={setHoveredEntity}
            onTelemetry={setTelemetry}
          />

          <div className="atlas-lower-grid atlas-lower-grid--triple">
            <section className="panel-card">
              <div className="panel-card-header">
                <div>
                  <p className="eyebrow">Atlas search</p>
                  <h2>Search results</h2>
                </div>
                <span>{searchResults.length || featuredFallback.length} entries</span>
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
                          {result.owner} | {result.runtimeFamily} | {result.projectCategory}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="result-list compact">
                  {featuredFallback.map((system) => (
                    <li key={system.systemId}>
                      <button
                        type="button"
                        onClick={() => handleSelectApp(system.appName)}
                      >
                        <strong>{system.appName}</strong>
                        <span>
                          {system.regionLabel} | {system.instanceCount} instances
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <QuestLog quests={quests} completedQuests={summary.completedQuests} />

            <HangarPanel skins={skins} onSelectSkin={selectSkin} />
          </div>

          {sceneError ? (
            <div className="status-banner status-banner--error">
              <p>{sceneError}</p>
              <button
                type="button"
                className="primary-action"
                onClick={onRetryScene}
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
