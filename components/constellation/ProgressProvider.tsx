"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RuntimeFamily } from "../../lib/types/app";
import type { PlaneSkinId } from "../../lib/canvas/cartoonMarkers";
import type {
  FeatureFlags,
  FlightSettings,
  LeaderboardEntry,
  RunRecord,
} from "../../lib/game/types";
import {
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_FLIGHT_SETTINGS,
  getWeeklyLeaderboardKey,
} from "../../lib/game/config";

const STORAGE_KEY = "flux-constellation-progress-v4";

type QuestId = "regional-surveyor" | "rare-signal" | "runtime-rambler";

type ProgressState = {
  visitedRegionIds: string[];
  discoveredRuntimeIds: string[];
  inspectedAppIds: string[];
  inspectedRuntimeFamilies: RuntimeFamily[];
  rareArchetypeIds: string[];
  completedQuestIds: QuestId[];
  unlockedSkinIds: PlaneSkinId[];
  selectedSkinId: PlaneSkinId;
  playerCallsign: string;
  weeklyLeaderboards: Record<string, LeaderboardEntry[]>;
  flightSettings: FlightSettings;
  featureFlags: FeatureFlags;
};

export type QuestView = {
  id: QuestId;
  title: string;
  description: string;
  reward: string;
  progressLabel: string;
  complete: boolean;
};

export type SkinView = {
  id: PlaneSkinId;
  label: string;
  description: string;
  unlockHint: string;
  unlocked: boolean;
  selected: boolean;
};

export type ProgressToast = {
  id: string;
  title: string;
  body: string;
  tone: "quest" | "unlock";
};

export type LeaderboardWeekView = {
  weekKey: string;
  label: string;
  entries: LeaderboardEntry[];
};

type ProgressContextValue = {
  progress: ProgressState;
  quests: QuestView[];
  skins: SkinView[];
  activeToast: ProgressToast | null;
  summary: {
    completedQuests: number;
    totalQuests: number;
    unlockedSkins: number;
    visitedRegions: number;
    bestWeeklyScore: number;
  };
  playerCallsign: string;
  leaderboard: {
    currentWeekKey: string;
    weeks: LeaderboardWeekView[];
  };
  flightSettings: FlightSettings;
  featureFlags: FeatureFlags;
  markRegionVisited: (regionId: string | null) => void;
  markRuntimeDiscovered: (runtimeClusterId: string | null) => void;
  markAppInspected: (
    appId: string | null,
    runtimeFamily: RuntimeFamily | null,
  ) => void;
  markRareArchetypeDiscovered: (rareArchetypeId: string | null) => void;
  selectSkin: (skinId: PlaneSkinId) => void;
  setPlayerCallsign: (callsign: string) => void;
  updateFlightSettings: (settings: Partial<FlightSettings>) => void;
  updateFeatureFlags: (flags: Partial<FeatureFlags>) => void;
  recordRun: (record: RunRecord) => void;
  resetProgress: () => void;
  dismissToast: () => void;
};

const defaultProgress: ProgressState = {
  visitedRegionIds: [],
  discoveredRuntimeIds: [],
  inspectedAppIds: [],
  inspectedRuntimeFamilies: [],
  rareArchetypeIds: [],
  completedQuestIds: [],
  unlockedSkinIds: ["classic"],
  selectedSkinId: "classic",
  playerCallsign: "Pilot",
  weeklyLeaderboards: {},
  flightSettings: DEFAULT_FLIGHT_SETTINGS,
  featureFlags: DEFAULT_FEATURE_FLAGS,
};

const skinCatalog: Array<{
  id: PlaneSkinId;
  label: string;
  description: string;
  unlockHint: string;
}> = [
  {
    id: "classic",
    label: "Classic",
    description: "The original candy-red patrol plane.",
    unlockHint: "Available from the start.",
  },
  {
    id: "sunset-scout",
    label: "Sunset Scout",
    description: "A warm expedition paint job for first-quest pilots.",
    unlockHint: "Unlock by completing any quest.",
  },
  {
    id: "mint-radar",
    label: "Mint Radar",
    description: "A cool radar-sweep finish for full regional coverage.",
    unlockHint: "Unlock by visiting every region cloud.",
  },
  {
    id: "midnight-courier",
    label: "Midnight Courier",
    description: "A deep-space livery for rare deployment hunters.",
    unlockHint: "Unlock by completing the rare signal quest.",
  },
];

const ProgressContext = createContext<ProgressContextValue | null>(null);

const unique = <T,>(values: T[]) => [...new Set(values)];

const normalizeLeaderboardEntry = (entry: Partial<LeaderboardEntry>): LeaderboardEntry | null => {
  if (!entry.id || !entry.weekKey || !entry.recordedAt || typeof entry.score !== "number") {
    return null;
  }

  return {
    id: entry.id,
    callsign: typeof entry.callsign === "string" && entry.callsign.trim() ? entry.callsign.trim() : "Pilot",
    score: entry.score,
    kills: typeof entry.kills === "number" ? entry.kills : 0,
    discoveries: typeof entry.discoveries === "number" ? entry.discoveries : 0,
    durationMs: typeof entry.durationMs === "number" ? entry.durationMs : 0,
    weekKey: entry.weekKey,
    recordedAt: entry.recordedAt,
  };
};

const normalizeLeaderboards = (
  input: Record<string, LeaderboardEntry[] | Partial<LeaderboardEntry>[] | undefined> | undefined,
) =>
  Object.fromEntries(
    Object.entries(input ?? {}).map(([weekKey, entries]) => [
      weekKey,
      (entries ?? [])
        .map((entry) => normalizeLeaderboardEntry(entry))
        .filter((entry): entry is LeaderboardEntry => Boolean(entry))
        .sort((left, right) => right.score - left.score || right.kills - left.kills)
        .slice(0, 10),
    ]),
  ) as Record<string, LeaderboardEntry[]>;

const normalizeProgress = (input: Partial<ProgressState> | null | undefined): ProgressState => ({
  visitedRegionIds: unique(input?.visitedRegionIds ?? []),
  discoveredRuntimeIds: unique(input?.discoveredRuntimeIds ?? []),
  inspectedAppIds: unique(input?.inspectedAppIds ?? []),
  inspectedRuntimeFamilies: unique(input?.inspectedRuntimeFamilies ?? []),
  rareArchetypeIds: unique(input?.rareArchetypeIds ?? []),
  completedQuestIds: unique(input?.completedQuestIds ?? []) as QuestId[],
  unlockedSkinIds: unique(["classic", ...(input?.unlockedSkinIds ?? [])]) as PlaneSkinId[],
  selectedSkinId:
    input?.selectedSkinId && skinCatalog.some((skin) => skin.id === input.selectedSkinId)
      ? input.selectedSkinId
      : "classic",
  playerCallsign:
    typeof input?.playerCallsign === "string" && input.playerCallsign.trim()
      ? input.playerCallsign.trim().slice(0, 18)
      : "Pilot",
  weeklyLeaderboards: normalizeLeaderboards(input?.weeklyLeaderboards),
  flightSettings: {
    quality:
      input?.flightSettings?.quality === "low" ||
      input?.flightSettings?.quality === "medium" ||
      input?.flightSettings?.quality === "high" ||
      input?.flightSettings?.quality === "auto"
        ? input.flightSettings.quality
        : DEFAULT_FLIGHT_SETTINGS.quality,
    enemyDensity:
      input?.flightSettings?.enemyDensity === "low" ||
      input?.flightSettings?.enemyDensity === "medium" ||
      input?.flightSettings?.enemyDensity === "high"
        ? input.flightSettings.enemyDensity
        : DEFAULT_FLIGHT_SETTINGS.enemyDensity,
    mouseSensitivity:
      typeof input?.flightSettings?.mouseSensitivity === "number"
        ? Math.max(0.2, Math.min(1.4, input.flightSettings.mouseSensitivity))
        : DEFAULT_FLIGHT_SETTINGS.mouseSensitivity,
  },
  featureFlags: {
    enemyPlanes:
      typeof input?.featureFlags?.enemyPlanes === "boolean"
        ? input.featureFlags.enemyPlanes
        : DEFAULT_FEATURE_FLAGS.enemyPlanes,
    fuelSystem:
      typeof input?.featureFlags?.fuelSystem === "boolean"
        ? input.featureFlags.fuelSystem
        : DEFAULT_FEATURE_FLAGS.fuelSystem,
    combat:
      typeof input?.featureFlags?.combat === "boolean"
        ? input.featureFlags.combat
        : DEFAULT_FEATURE_FLAGS.combat,
    pickups:
      typeof input?.featureFlags?.pickups === "boolean"
        ? input.featureFlags.pickups
        : typeof (input?.featureFlags as { speedBoosts?: boolean } | undefined)?.speedBoosts ===
              "boolean" || typeof input?.featureFlags?.fuelSystem === "boolean"
          ? Boolean(
              (input?.featureFlags as { speedBoosts?: boolean } | undefined)?.speedBoosts ??
                input?.featureFlags?.fuelSystem,
            )
          : DEFAULT_FEATURE_FLAGS.pickups,
    leaderboard:
      typeof input?.featureFlags?.leaderboard === "boolean"
        ? input.featureFlags.leaderboard
        : DEFAULT_FEATURE_FLAGS.leaderboard,
    clouds:
      typeof input?.featureFlags?.clouds === "boolean"
        ? input.featureFlags.clouds
        : typeof (input?.featureFlags as { advancedClouds?: boolean } | undefined)
              ?.advancedClouds === "boolean"
          ? Boolean(
              (input?.featureFlags as { advancedClouds?: boolean } | undefined)
                ?.advancedClouds,
            )
          : DEFAULT_FEATURE_FLAGS.clouds,
    deploymentClustering:
      typeof input?.featureFlags?.deploymentClustering === "boolean"
        ? input.featureFlags.deploymentClustering
        : typeof (input?.featureFlags as { deploymentDensityLimits?: boolean } | undefined)
              ?.deploymentDensityLimits === "boolean"
          ? Boolean(
              (input?.featureFlags as { deploymentDensityLimits?: boolean } | undefined)
                ?.deploymentDensityLimits,
            )
          : DEFAULT_FEATURE_FLAGS.deploymentClustering,
    debugHud:
      typeof input?.featureFlags?.debugHud === "boolean"
        ? input.featureFlags.debugHud
        : DEFAULT_FEATURE_FLAGS.debugHud,
  },
});

const buildQuestViews = (progress: ProgressState) => {
  const regionQuestComplete = progress.visitedRegionIds.length >= 3;
  const rareQuestComplete = progress.rareArchetypeIds.length >= 2;
  const runtimeQuestComplete =
    progress.inspectedAppIds.length >= 5 &&
    progress.inspectedRuntimeFamilies.length >= 3;

  return [
    {
      id: "regional-surveyor",
      title: "Regional Surveyor",
      description: "Visit three unique region clouds.",
      reward: "Unlocks early hangar prestige.",
      progressLabel: `${Math.min(3, progress.visitedRegionIds.length)}/3 regions`,
      complete: regionQuestComplete,
    },
    {
      id: "rare-signal",
      title: "Rare Signal",
      description: "Discover two rare runtime-category archetypes.",
      reward: "Unlocks the Midnight Courier skin.",
      progressLabel: `${Math.min(2, progress.rareArchetypeIds.length)}/2 rare finds`,
      complete: rareQuestComplete,
    },
    {
      id: "runtime-rambler",
      title: "Runtime Rambler",
      description: "Inspect five apps spanning at least three runtime families.",
      reward: "Boosts your explorer status.",
      progressLabel: `${Math.min(5, progress.inspectedAppIds.length)}/5 apps · ${Math.min(3, progress.inspectedRuntimeFamilies.length)}/3 runtimes`,
      complete: runtimeQuestComplete,
    },
  ] satisfies QuestView[];
};

const createToast = (
  title: string,
  body: string,
  tone: ProgressToast["tone"],
): ProgressToast => ({
  id: `${tone}:${title}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
  title,
  body,
  tone,
});

const formatWeekLabel = (weekKey: string) => {
  const parsed = new Date(`${weekKey}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? weekKey
    : parsed.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
};

const reconcileProgress = (
  source: ProgressState,
  totalRegionCount: number,
) => {
  const progress = normalizeProgress(source);
  const questViews = buildQuestViews(progress);
  const nextCompletedQuestIds = new Set(progress.completedQuestIds);
  const nextUnlockedSkinIds = new Set(progress.unlockedSkinIds);
  const toasts: ProgressToast[] = [];

  for (const quest of questViews) {
    if (quest.complete && !nextCompletedQuestIds.has(quest.id)) {
      nextCompletedQuestIds.add(quest.id);
    }
  }

  if (nextCompletedQuestIds.size > 0) {
    nextUnlockedSkinIds.add("sunset-scout");
  }
  if (totalRegionCount > 0 && progress.visitedRegionIds.length >= totalRegionCount) {
    nextUnlockedSkinIds.add("mint-radar");
  }
  if (nextCompletedQuestIds.has("rare-signal")) {
    nextUnlockedSkinIds.add("midnight-courier");
  }

  for (const skin of skinCatalog) {
    if (skin.id === "classic") {
      continue;
    }

    if (
      nextUnlockedSkinIds.has(skin.id) &&
      !progress.unlockedSkinIds.includes(skin.id)
    ) {
      toasts.push(
        createToast(
          `${skin.label} ready`,
          "Unlocked in the hangar.",
          "unlock",
        ),
      );
    }
  }

  const selectedSkinId = nextUnlockedSkinIds.has(progress.selectedSkinId)
    ? progress.selectedSkinId
    : "classic";

  return {
    progress: {
      ...progress,
      completedQuestIds: [...nextCompletedQuestIds] as QuestId[],
      unlockedSkinIds: [...nextUnlockedSkinIds] as PlaneSkinId[],
      selectedSkinId,
    },
    quests: buildQuestViews({
      ...progress,
      completedQuestIds: [...nextCompletedQuestIds] as QuestId[],
    }),
    toasts,
  };
};

export function ConstellationProgressProvider({
  children,
  totalRegionCount,
}: {
  children: ReactNode;
  totalRegionCount: number;
}) {
  const [progress, setProgress] = useState<ProgressState>(defaultProgress);
  const [toastQueue, setToastQueue] = useState<ProgressToast[]>([]);
  const hydratedRef = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ProgressState>;
        const next = reconcileProgress(normalizeProgress(parsed), totalRegionCount);
        setProgress(next.progress);
        if (next.toasts.length > 0) {
          setToastQueue((current) => [...current, ...next.toasts]);
        }
      }
    } catch {
      setProgress(defaultProgress);
    } finally {
      hydratedRef.current = true;
    }
  }, [totalRegionCount]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

    setProgress((current) => {
      const next = reconcileProgress(current, totalRegionCount);
      if (next.toasts.length > 0) {
        setToastQueue((queue) => [...queue, ...next.toasts]);
      }
      return next.progress;
    });
  }, [totalRegionCount]);

  useEffect(() => {
    if (!toastQueue.length) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToastQueue((current) => current.slice(1));
    }, 3_800);

    return () => window.clearTimeout(timeout);
  }, [toastQueue]);

  const updateProgress = useCallback(
    (updater: (current: ProgressState) => ProgressState) => {
      setProgress((current) => {
        const candidate = updater(current);
        const next = reconcileProgress(candidate, totalRegionCount);
        if (next.toasts.length > 0) {
          setToastQueue((queue) => [...queue, ...next.toasts]);
        }
        return next.progress;
      });
    },
    [totalRegionCount],
  );

  const markRegionVisited = useCallback(
    (regionId: string | null) => {
      if (!regionId) {
        return;
      }

      updateProgress((current) => ({
        ...current,
        visitedRegionIds: unique([...current.visitedRegionIds, regionId]),
      }));
    },
    [updateProgress],
  );

  const markRuntimeDiscovered = useCallback(
    (runtimeClusterId: string | null) => {
      if (!runtimeClusterId) {
        return;
      }

      updateProgress((current) => ({
        ...current,
        discoveredRuntimeIds: unique([...current.discoveredRuntimeIds, runtimeClusterId]),
      }));
    },
    [updateProgress],
  );

  const markAppInspected = useCallback(
    (appId: string | null, runtimeFamily: RuntimeFamily | null) => {
      if (!appId || !runtimeFamily) {
        return;
      }

      updateProgress((current) => ({
        ...current,
        inspectedAppIds: unique([...current.inspectedAppIds, appId]),
        inspectedRuntimeFamilies: unique([
          ...current.inspectedRuntimeFamilies,
          runtimeFamily,
        ]),
      }));
    },
    [updateProgress],
  );

  const markRareArchetypeDiscovered = useCallback(
    (rareArchetypeId: string | null) => {
      if (!rareArchetypeId) {
        return;
      }

      updateProgress((current) => ({
        ...current,
        rareArchetypeIds: unique([...current.rareArchetypeIds, rareArchetypeId]),
      }));
    },
    [updateProgress],
  );

  const selectSkin = useCallback(
    (skinId: PlaneSkinId) => {
      updateProgress((current) =>
        current.unlockedSkinIds.includes(skinId)
          ? {
              ...current,
              selectedSkinId: skinId,
            }
          : current,
      );
    },
    [updateProgress],
  );

  const setPlayerCallsign = useCallback(
    (callsign: string) => {
      const nextCallsign = callsign.trim().slice(0, 18) || "Pilot";
      updateProgress((current) => ({
        ...current,
        playerCallsign: nextCallsign,
      }));
    },
    [updateProgress],
  );

  const updateFlightSettings = useCallback(
    (settings: Partial<FlightSettings>) => {
      updateProgress((current) => ({
        ...current,
        flightSettings: {
          ...current.flightSettings,
          ...settings,
          mouseSensitivity:
            typeof settings.mouseSensitivity === "number"
              ? Math.max(0.2, Math.min(1.4, settings.mouseSensitivity))
              : current.flightSettings.mouseSensitivity,
        },
      }));
    },
    [updateProgress],
  );

  const updateFeatureFlags = useCallback(
    (flags: Partial<FeatureFlags>) => {
      updateProgress((current) => ({
        ...current,
        featureFlags: {
          ...current.featureFlags,
          ...flags,
        },
      }));
    },
    [updateProgress],
  );

  const recordRun = useCallback(
    (record: RunRecord) => {
      if (record.score <= 0) {
        return;
      }

      updateProgress((current) => {
        const weekKey = record.weekKey || getWeeklyLeaderboardKey(new Date(record.recordedAt));
        const entry: LeaderboardEntry = {
          id: `leader:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          callsign: current.playerCallsign || "Pilot",
          score: record.score,
          kills: record.kills,
          discoveries: record.discoveries,
          durationMs: record.durationMs,
          weekKey,
          recordedAt: record.recordedAt,
        };

        const nextEntries = [...(current.weeklyLeaderboards[weekKey] ?? []), entry]
          .sort(
            (left, right) =>
              right.score - left.score ||
              right.kills - left.kills ||
              right.discoveries - left.discoveries,
          )
          .slice(0, 10);

        return {
          ...current,
          weeklyLeaderboards: {
            ...current.weeklyLeaderboards,
            [weekKey]: nextEntries,
          },
        };
      });
    },
    [updateProgress],
  );

  const resetProgress = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setToastQueue([]);
    setProgress(defaultProgress);
  }, []);

  const dismissToast = useCallback(() => {
    setToastQueue((current) => current.slice(1));
  }, []);

  const quests = useMemo(() => buildQuestViews(progress), [progress]);

  const skins = useMemo(
    () =>
      skinCatalog.map((skin) => ({
        ...skin,
        unlocked: progress.unlockedSkinIds.includes(skin.id),
        selected: progress.selectedSkinId === skin.id,
      })),
    [progress.selectedSkinId, progress.unlockedSkinIds],
  );
  const currentWeekKey = useMemo(() => getWeeklyLeaderboardKey(), []);
  const leaderboardWeeks = useMemo(
    () =>
      Object.entries(progress.weeklyLeaderboards)
        .map(([weekKey, entries]) => ({
          weekKey,
          label: formatWeekLabel(weekKey),
          entries,
        }))
        .sort((left, right) => right.weekKey.localeCompare(left.weekKey)),
    [progress.weeklyLeaderboards],
  );
  const bestWeeklyScore = progress.weeklyLeaderboards[currentWeekKey]?.[0]?.score ?? 0;

  const value = useMemo(
    () => ({
      progress,
      quests,
      skins,
      activeToast: toastQueue[0] ?? null,
      summary: {
        completedQuests: progress.completedQuestIds.length,
        totalQuests: quests.length,
        unlockedSkins: progress.unlockedSkinIds.length,
        visitedRegions: progress.visitedRegionIds.length,
        bestWeeklyScore,
      },
      playerCallsign: progress.playerCallsign,
      leaderboard: {
        currentWeekKey,
        weeks: leaderboardWeeks,
      },
      flightSettings: progress.flightSettings,
      featureFlags: progress.featureFlags,
      markRegionVisited,
      markRuntimeDiscovered,
      markAppInspected,
      markRareArchetypeDiscovered,
      selectSkin,
      setPlayerCallsign,
      updateFlightSettings,
      updateFeatureFlags,
      recordRun,
      resetProgress,
      dismissToast,
    }),
    [
      bestWeeklyScore,
      currentWeekKey,
      dismissToast,
      leaderboardWeeks,
      markAppInspected,
      markRareArchetypeDiscovered,
      markRegionVisited,
      markRuntimeDiscovered,
      progress,
      quests,
      recordRun,
      resetProgress,
      selectSkin,
      setPlayerCallsign,
      updateFlightSettings,
      updateFeatureFlags,
      toastQueue,
    ],
  );

  return (
    <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>
  );
}

export function useConstellationProgress() {
  const context = useContext(ProgressContext);

  if (!context) {
    throw new Error(
      "useConstellationProgress must be used within ConstellationProgressProvider.",
    );
  }

  return context;
}
