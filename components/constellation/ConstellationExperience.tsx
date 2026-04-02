"use client";

import { startTransition, useEffect, useMemo, useState, type ReactNode } from "react";
import type { FilterState } from "./FilterBar";
import { FilterBar } from "./FilterBar";
import { SearchBox } from "./SearchBox";
import { SceneCanvas } from "./SceneCanvas";
import { DetailDrawer } from "./DetailDrawer";
import { MiniMap } from "./MiniMap";
import { DiegeticHud } from "./DiegeticHud";
import { HangarPanel } from "./HangarPanel";
import { HangarCustomizationPanel } from "./HangarPanel";
import { AchievementToast } from "./AchievementToast";
import { FuelGauge } from "./FuelGauge";
import { LeaderboardPanel } from "./LeaderboardPanel";
import { MobileDrawer } from "./MobileDrawer";
import {
  ConstellationProgressProvider,
  useConstellationProgress,
} from "./ProgressProvider";
import { useMediaQuery } from "./useMediaQuery";
import type { FlightTelemetry } from "../../lib/layout/focusContext";
import type { GameSessionSnapshot } from "../../lib/game/types";
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

function AtlasIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="atlas-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function FiltersIcon() {
  return (
    <AtlasIcon>
      <path d="M4 7h16" />
      <path d="M7 12h10" />
      <path d="M10 17h4" />
    </AtlasIcon>
  );
}

function MapIcon() {
  return (
    <AtlasIcon>
      <path d="M4 6.5 9 4l6 2.5L20 4v13.5L15 20l-6-2.5L4 20Z" />
      <path d="M9 4v13.5" />
      <path d="M15 6.5V20" />
    </AtlasIcon>
  );
}

function PaintIcon() {
  return (
    <AtlasIcon>
      <path d="M12 4a8 8 0 1 0 0 16h1.1a2.4 2.4 0 0 0 0-4.8H12a2.6 2.6 0 0 1 0-5.2h.5A3.5 3.5 0 0 0 12 4Z" />
      <circle cx="8" cy="10" r="1" />
      <circle cx="12.5" cy="7.5" r="1" />
      <circle cx="16" cy="10" r="1" />
    </AtlasIcon>
  );
}

function TrophyIcon() {
  return (
    <AtlasIcon>
      <path d="M8 5h8v3a4 4 0 0 1-8 0Z" />
      <path d="M8 7H5a2 2 0 0 0 2 3h1" />
      <path d="M16 7h3a2 2 0 0 1-2 3h-1" />
      <path d="M12 12v4" />
      <path d="M9 20h6" />
      <path d="M10 16h4" />
    </AtlasIcon>
  );
}

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
        if (!cancelled) {
          setScene(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setSceneError(
            error instanceof Error
              ? error.message
              : "Unable to load the public FluxCloud snapshot.",
          );
        }
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
  const isTabletLayout = useMediaQuery("(max-width: 768px)");
  const isPhoneLayout = useMediaQuery("(max-width: 480px)");
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [searchQuery, setSearchQuery] = useState("");
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
  const [panelMode, setPanelMode] = useState<"none" | "hangar" | "leaderboard">("none");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobilePanelMode, setMobilePanelMode] = useState<
    "none" | "hangar" | "leaderboard"
  >("none");

  const {
    progress,
    skins,
    activeToast,
    summary,
    playerCallsign,
    leaderboard,
    flightSettings,
    featureFlags,
    markAppInspected,
    markRareArchetypeDiscovered,
    markRegionVisited,
    markRuntimeDiscovered,
    selectSkin,
    setPlayerCallsign,
    updateFlightSettings,
    updateFeatureFlags,
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
  const showLowerPanels =
    !isTabletLayout && ((hasSearched && searchResults.length > 0) || panelMode !== "none");
  const mobileOverlayOpen =
    isTabletLayout && (mobileFiltersOpen || mobilePanelMode !== "none");

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
      activeScene.stars.filter((star) => visibleSystemIds.has(star.systemId)),
    [activeScene.stars, visibleSystemIds],
  );

  const visibleStarCount = useMemo(
    () =>
      visibleSystems.reduce(
        (total, system) => total + Math.max(1, system.instanceCount),
        0,
      ),
    [visibleSystems],
  );
  const searchMatchAppNames = useMemo(
    () => searchResults.map((item) => item.appName),
    [searchResults],
  );

  const visibleClusters = useMemo(
    () =>
      activeScene.clusters
        .map((cluster) => {
          const systemIds = cluster.systemIds.filter((id) => visibleSystemIds.has(id));
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
            counts: {
              apps: new Set(visibleClusterSystems.map((system) => system.appName)).size,
              systems: visibleClusterSystems.length,
              instances: visibleClusterSystems.reduce(
                (total, system) => total + Math.max(system.instanceCount, 1),
                0,
              ),
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
    [activeScene.clusters, systemsById, visibleSystemIds],
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
    if (telemetry?.activeRegionId) {
      markRegionVisited(telemetry.activeRegionId);
    }
  }, [markRegionVisited, telemetry?.activeRegionId]);

  useEffect(() => {
    if (telemetry?.activeRuntimeId) {
      markRuntimeDiscovered(telemetry.activeRuntimeId);
    }
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

  useEffect(() => {
    if (!isTabletLayout) {
      setMobileFiltersOpen(false);
      setMobilePanelMode("none");
    }
  }, [isTabletLayout]);

  const handleSearch = async (query: string) => {
    const trimmed = query.trim();
    setSearchQuery(query);
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
    if (isTabletLayout) {
      setMobileFiltersOpen(false);
      setMobilePanelMode("none");
    }
    const system = systemsByApp.get(appName);
    if (!system) {
      return;
    }

    setFocusTarget({
      key: `select:${appName}:${Date.now()}`,
      x: system.x,
      y: system.y,
      zoom: 0.34,
    });
  };

  const handleFocusCluster = (cluster: Cluster) => {
    setFocusTarget({
      key: `cluster:${cluster.clusterId}:${Date.now()}`,
      x: cluster.centroid.x,
      y: cluster.centroid.y,
      zoom: cluster.level === "region" ? 0.23 : 0.31,
    });
  };

  const toggleMobileFilters = () => {
    setMobilePanelMode("none");
    setMobileFiltersOpen((current) => !current);
  };

  const toggleMobilePanel = (next: "hangar" | "leaderboard") => {
    setMobileFiltersOpen(false);
    setMobilePanelMode((current) => (current === next ? "none" : next));
  };

  const handleResetProgress = () => {
    resetProgress();
    setGameSnapshot(null);
    setSearchQuery("");
    setSearchResults([]);
    setHasSearched(false);
    setStatusMessage("");
    setPanelMode("none");
    setMobilePanelMode("none");
    setMobileFiltersOpen(false);
  };

  const searchResultsPanel =
    hasSearched && searchResults.length > 0 ? (
      <section className="panel-card panel-card--compact">
        <div className="panel-card-header panel-card-header--compact">
          <h2>Search hits</h2>
          <span>{searchResults.length}</span>
        </div>
        <ul className="result-list result-list--compact">
          {searchResults.map((result) => (
            <li key={result.appName}>
              <button type="button" onClick={() => handleSelectApp(result.appName)}>
                <strong>{result.appName}</strong>
                <span data-owner={result.owner} data-runtime={result.runtimeFamily}>
                  {result.owner} Â· {result.runtimeFamily}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <>
      <main className="atlas-page" aria-hidden={mobileOverlayOpen ? true : undefined}>
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
            Fly through FluxCloud deployments, chart the busiest sectors, refuel in the
            cloud lanes, and rescue stranded pilots without letting the exploration layer
            overpower the live deployment map.
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
                {(sceneLoading ? activeScene.counts.stars : visibleStarCount).toLocaleString()}
              </strong>
            </article>
          </div>
        </div>
      </section>

      <section className="atlas-grid">
        <div className="atlas-main">
          <div className="mobile-control-header" aria-label="Mobile search and filters">
            <div className="mobile-control-header__brand">
              <img
                className="flux-logo mobile-control-header__logo"
                src="/flux-logo.svg"
                alt="FluxCloud Explore"
                width={96}
                height={30}
                decoding="async"
              />
              <div className="mobile-control-header__copy">
                <span>FluxCloud</span>
                <strong>Explore</strong>
              </div>
            </div>
            <button
              type="button"
              className="icon-button mobile-control-header__toggle"
              onClick={toggleMobileFilters}
              aria-haspopup="dialog"
              aria-expanded={mobileFiltersOpen}
            >
              <FiltersIcon />
              <span>Search / Filter</span>
            </button>
          </div>

          <div className="control-bar">
            <SearchBox
              onSearch={handleSearch}
              busy={searchBusy || sceneLoading}
              value={searchQuery}
              onQueryChange={setSearchQuery}
            />
            <FilterBar filters={activeScene.filters} value={filters} onChange={setFilters} />
          </div>

          <SceneCanvas
            stars={visibleStars}
            clusters={visibleClusters}
            systems={visibleSystems}
            bounds={activeScene.bounds}
            selectedAppName={selectedAppName}
            selectedSkinId={progress.selectedSkinId}
            searchMatches={searchMatchAppNames}
            focusTarget={focusTarget}
            mapDataLoading={sceneLoading}
            snapshotError={!!sceneError}
            flightSettings={flightSettings}
            featureFlags={featureFlags}
            onUpdateFlightSettings={updateFlightSettings}
            onUpdateFeatureFlags={updateFeatureFlags}
            overlay={
              <>
                <div className="scene-mobile-status-stack">
                  <DiegeticHud
                    telemetry={telemetry}
                    snapshot={gameSnapshot}
                    selectedSkinLabel={selectedSkin?.label ?? "Classic"}
                    unlockedSkinCount={summary.unlockedSkins}
                    totalSkinCount={skins.length}
                    mode={flightSettings.hudDensity}
                  />
                  <FuelGauge snapshot={gameSnapshot} />
                  <MiniMap
                    bounds={activeScene.bounds}
                    regionClusters={visibleClusters.filter(
                      (cluster) => cluster.level === "region",
                    )}
                    telemetry={telemetry}
                    snapshot={gameSnapshot}
                    visitedRegionIds={progress.visitedRegionIds}
                    mode={flightSettings.hudDensity}
                    onSelectCluster={handleFocusCluster}
                  />
                </div>
                <div className="flight-disclaimer">Tip: Click deployments to discover them.</div>
                <AchievementToast toast={activeToast} onDismiss={dismissToast} />
              </>
            }
            onSelectApp={handleSelectApp}
            onFocusCluster={handleFocusCluster}
            onHoverEntity={() => {
              // Hover copy stays inside the canvas tooltip.
            }}
            onTelemetry={(nextTelemetry) => {
              startTransition(() => {
                setTelemetry(nextTelemetry);
              });
            }}
            onGameStateChange={(nextSnapshot) => {
              startTransition(() => {
                setGameSnapshot(nextSnapshot);
              });
            }}
            onRunComplete={featureFlags.leaderboard ? recordRun : undefined}
          />

          <div className="atlas-panel-toggles" aria-label="Secondary panel toggles">
            <button
              type="button"
              className={`secondary-action ${panelMode === "none" ? "secondary-action--active" : ""}`}
              onClick={() => setPanelMode("none")}
            >
              Hide panels
            </button>
            <button
              type="button"
              className={`secondary-action ${panelMode === "hangar" ? "secondary-action--active" : ""}`}
              onClick={() => setPanelMode((current) => (current === "hangar" ? "none" : "hangar"))}
            >
              Customize
            </button>
            {featureFlags.leaderboard ? (
              <button
                type="button"
                className={`secondary-action ${panelMode === "leaderboard" ? "secondary-action--active" : ""}`}
                onClick={() =>
                  setPanelMode((current) => (current === "leaderboard" ? "none" : "leaderboard"))
                }
              >
                Leaderboard
              </button>
            ) : null}
          </div>

          <nav className="atlas-mobile-nav" aria-label="Mobile panel navigation">
            <button
              type="button"
              className={`atlas-mobile-nav__item ${
                mobilePanelMode === "none" ? "atlas-mobile-nav__item--active" : ""
              }`}
              onClick={() => setMobilePanelMode("none")}
            >
              <MapIcon />
              <span>Map</span>
            </button>
            <button
              type="button"
              className={`atlas-mobile-nav__item ${
                mobilePanelMode === "hangar" ? "atlas-mobile-nav__item--active" : ""
              }`}
              onClick={() => toggleMobilePanel("hangar")}
              aria-expanded={mobilePanelMode === "hangar"}
            >
              <PaintIcon />
              <span>Customize</span>
            </button>
            {featureFlags.leaderboard ? (
              <button
                type="button"
                className={`atlas-mobile-nav__item ${
                  mobilePanelMode === "leaderboard"
                    ? "atlas-mobile-nav__item--active"
                    : ""
                }`}
                onClick={() => toggleMobilePanel("leaderboard")}
                aria-expanded={mobilePanelMode === "leaderboard"}
              >
                <TrophyIcon />
                <span>Leaderboard</span>
              </button>
            ) : null}
          </nav>

          <div
            className={`atlas-lower-grid atlas-lower-grid--minimal atlas-lower-grid--game ${
              hasSearched && searchResults.length > 0
                ? "atlas-lower-grid--split"
                : "atlas-lower-grid--solo"
            }`}
            style={{
              display: showLowerPanels ? undefined : "none",
            }}
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
                      <button type="button" onClick={() => handleSelectApp(result.appName)}>
                        <strong>{result.appName}</strong>
                        <span data-owner={result.owner} data-runtime={result.runtimeFamily}>
                          {result.owner} · {result.runtimeFamily}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {panelMode === "hangar" ? (
              <HangarPanel
                skins={skins}
                onSelectSkin={selectSkin}
                onResetProgress={handleResetProgress}
              />
            ) : null}

            {featureFlags.leaderboard && panelMode === "leaderboard" ? (
              <LeaderboardPanel
                callsign={playerCallsign}
                onChangeCallsign={setPlayerCallsign}
                leaderboard={leaderboard}
                snapshot={gameSnapshot}
              />
            ) : null}
          </div>

          {sceneError ? (
            <div className="status-banner status-banner--error">
              <p>{sceneError}</p>
              <button type="button" className="primary-action" onClick={onRetryScene}>
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

      {isTabletLayout ? (
        <MobileDrawer
          open={mobileFiltersOpen}
          title="Search and filters"
          description="Search by app or owner, then narrow the sky with runtime, category, tier, and status filters."
          onClose={() => setMobileFiltersOpen(false)}
          placement="right"
          className={isPhoneLayout ? "mobile-drawer--phone" : "mobile-drawer--filters"}
        >
          <div className="mobile-controls-panel">
            <SearchBox
              onSearch={handleSearch}
              busy={searchBusy || sceneLoading}
              value={searchQuery}
              onQueryChange={setSearchQuery}
              autoFocus
              submitLabel="Find"
            />
            <FilterBar filters={activeScene.filters} value={filters} onChange={setFilters} />
            {searchResultsPanel ? (
              <div className="mobile-controls-panel__results">{searchResultsPanel}</div>
            ) : null}
          </div>
        </MobileDrawer>
      ) : null}

      {isTabletLayout ? (
        <MobileDrawer
          open={mobilePanelMode !== "none"}
          title={mobilePanelMode === "leaderboard" ? "Leaderboard" : "Customize aircraft"}
          description={
            mobilePanelMode === "leaderboard"
              ? "Track weekly runs and update your pilot callsign without leaving the map."
              : "Swap paint styles and reset progress from a mobile-friendly drawer."
          }
          onClose={() => setMobilePanelMode("none")}
          placement="bottom"
          className={isPhoneLayout ? "mobile-drawer--phone" : "mobile-drawer--panel"}
        >
          {mobilePanelMode === "hangar" ? (
            <HangarCustomizationPanel
              skins={skins}
              onSelectSkin={selectSkin}
              onResetProgress={handleResetProgress}
            />
          ) : null}
          {featureFlags.leaderboard && mobilePanelMode === "leaderboard" ? (
            <LeaderboardPanel
              callsign={playerCallsign}
              onChangeCallsign={setPlayerCallsign}
              leaderboard={leaderboard}
              snapshot={gameSnapshot}
            />
          ) : null}
        </MobileDrawer>
      ) : null}
    </>
  );
}

async function fetchAppDetail(appName: string) {
  const response = await fetch(`/api/detail/${encodeURIComponent(appName)}`);
  if (!response.ok) {
    throw new Error("Unable to load app detail.");
  }

  return (await response.json()) as AppDetail;
}
