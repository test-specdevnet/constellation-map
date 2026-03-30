"use client";

import { useEffect, useMemo, useState } from "react";
import type { FilterState } from "./FilterBar";
import { FilterBar } from "./FilterBar";
import { SearchBox } from "./SearchBox";
import { SceneCanvas } from "./SceneCanvas";
import { DetailDrawer } from "./DetailDrawer";
import { MiniMap } from "./MiniMap";
import { DiegeticHud } from "./DiegeticHud";
import { HangarPanel } from "./HangarPanel";
import { AchievementToast } from "./AchievementToast";
import { FuelGauge } from "./FuelGauge";
import { LeaderboardPanel } from "./LeaderboardPanel";
import {
  ConstellationProgressProvider,
  useConstellationProgress,
} from "./ProgressProvider";
import type { FlightTelemetry } from "../../lib/layout/focusContext";
import type { GameSessionSnapshot } from "../../lib/game/arcade";
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
  const [focusTarget, setFocusTarget] = useState<{
    key: string;
    x: number;
    y: number;
    zoom: number;
  } | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [detail, setDetail] = useState<AppDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [telemetry, setTelemetry] = useState<FlightTelemetry | null>(null);
  const [gameSnapshot, setGameSnapshot] = useState<GameSessionSnapshot | null>(null);

  const {
    progress,
    skins,
    activeToast,
    summary,
    playerCallsign,
    leaderboard,
    markAppInspected,
    markRareArchetypeDiscovered,
    markRegionVisited,
    markRuntimeDiscovered,
    selectSkin,
    setPlayerCallsign,
    recordRun,
    resetProgress,
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
  const selectedSkin = useMemo(
    () => skins.find((skin) => skin.selected) ?? skins[0] ?? null,
    [skins],
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
    const trimmed = query.trim();
    if (!trimmed) {
      setHasSearched(false);
      setSearchResults([]);
      setStatusMessage("");
      return;
    }

    setHasSearched(true);
    setSearchBusy(true);
    setStatusMessage("");

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
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
        setStatusMessage("No matching app or owner was found in this snapshot.");
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Search failed.");
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

  return (
    <main className="atlas-page">
      <section className="hero-shell">
        <div className="hero-copy">
          <div className="brand-row">
            <img
              className="flux-logo"
              src="/flux-logo.svg"
              alt="FluxCloud Explore"
              width={128}
              height={40}
              decoding="async"
            />
          </div>
          <h1>FluxCloud Explore</h1>
          <p className="hero-text">
            Literally fly through the FluxCloud and explore network deployments,
            unlocking plane skins as you discover new datapoints with this
            interactive data visualization tool.
          </p>

          <div className="hero-metrics hero-metrics--compact" aria-label="Atlas totals">
            <article>
              <span>Apps</span>
              <strong>
                {(sceneLoading ? activeScene.counts.apps : visibleSystems.length).toLocaleString()}
              </strong>
            </article>
            <article>
              <span>Deployments</span>
              <strong>
                {(sceneLoading ? activeScene.counts.stars : visibleStars.length).toLocaleString()}
              </strong>
            </article>
          </div>
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
                  onSelectCluster={handleFocusCluster}
                />
                <DiegeticHud
                  telemetry={telemetry}
                  snapshot={gameSnapshot}
                  selectedSkinLabel={selectedSkin?.label ?? "Classic"}
                  unlockedSkinCount={summary.unlockedSkins}
                  totalSkinCount={skins.length}
                />
                <FuelGauge snapshot={gameSnapshot} />
                <AchievementToast toast={activeToast} onDismiss={dismissToast} />
              </>
            }
            onSelectApp={handleSelectApp}
            onFocusCluster={handleFocusCluster}
            onHoverEntity={() => {
              // Hover copy stays inside the canvas tooltip.
            }}
            onTelemetry={setTelemetry}
            onGameStateChange={setGameSnapshot}
            onRunComplete={recordRun}
          />

          <div
            className={`atlas-lower-grid atlas-lower-grid--minimal atlas-lower-grid--game ${
              hasSearched && searchResults.length > 0
                ? "atlas-lower-grid--split"
                : "atlas-lower-grid--solo"
            }`}
          >
            {hasSearched && searchResults.length > 0 ? (
              <section className="panel-card panel-card--compact">
                <div className="panel-card-header panel-card-header--compact">
                  <h2>Search hits</h2>
                  <span>{searchResults.length}</span>
                </div>
                <ul className="result-list result-list--compact">
                  {searchResults.map((result) => (
                    <li key={result.appName}>
                      <button
                        type="button"
                        onClick={() => handleSelectApp(result.appName)}
                      >
                        <strong>{result.appName}</strong>
                        <span>
                          {result.owner} · {result.runtimeFamily}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <HangarPanel
              skins={skins}
              onSelectSkin={selectSkin}
              onResetProgress={() => {
                resetProgress();
                setGameSnapshot(null);
                setSearchResults([]);
                setHasSearched(false);
                setStatusMessage("");
              }}
            />

            <LeaderboardPanel
              callsign={playerCallsign}
              onChangeCallsign={setPlayerCallsign}
              leaderboard={leaderboard}
              snapshot={gameSnapshot}
            />
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
