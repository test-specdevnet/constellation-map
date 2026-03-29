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

const STORAGE_KEY = "flux-constellation-progress-v1";

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
};

export type QuestView = {
  id: QuestId;
  title: string;
  description: string;
  reward: string;
  progressLabel: string;
  progressFraction: number;
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
    discoveredRuntimes: number;
    inspectedApps: number;
    rareSignals: number;
  };
  markRegionVisited: (regionId: string | null) => void;
  markRuntimeDiscovered: (runtimeClusterId: string | null) => void;
  markAppInspected: (
    appId: string | null,
    runtimeFamily: RuntimeFamily | null,
  ) => void;
  markRareArchetypeDiscovered: (rareArchetypeId: string | null) => void;
  selectSkin: (skinId: PlaneSkinId) => void;
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
      progressFraction: Math.min(1, progress.visitedRegionIds.length / 3),
      complete: regionQuestComplete,
    },
    {
      id: "rare-signal",
      title: "Rare Signal",
      description: "Discover two rare runtime-category archetypes.",
      reward: "Unlocks the Midnight Courier skin.",
      progressLabel: `${Math.min(2, progress.rareArchetypeIds.length)}/2 rare finds`,
      progressFraction: Math.min(1, progress.rareArchetypeIds.length / 2),
      complete: rareQuestComplete,
    },
    {
      id: "runtime-rambler",
      title: "Runtime Rambler",
      description: "Inspect five apps spanning at least three runtime families.",
      reward: "Boosts your explorer status.",
      progressLabel: `${Math.min(5, progress.inspectedAppIds.length)}/5 apps | ${Math.min(3, progress.inspectedRuntimeFamilies.length)}/3 runtimes`,
      progressFraction: Math.min(
        1,
        Math.min(
          progress.inspectedAppIds.length / 5,
          progress.inspectedRuntimeFamilies.length / 3,
        ),
      ),
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
      toasts.push(
        createToast(quest.title, `${quest.description} Quest complete.`, "quest"),
      );
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
          `${skin.label} Unlocked`,
          `${skin.description} Visit the hangar to equip it.`,
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

  const resetProgress = useCallback(() => {
    setToastQueue([]);
    setProgress(defaultProgress);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
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
        discoveredRuntimes: progress.discoveredRuntimeIds.length,
        inspectedApps: progress.inspectedAppIds.length,
        rareSignals: progress.rareArchetypeIds.length,
      },
      markRegionVisited,
      markRuntimeDiscovered,
      markAppInspected,
      markRareArchetypeDiscovered,
      selectSkin,
      resetProgress,
      dismissToast,
    }),
    [
      dismissToast,
      markAppInspected,
      markRareArchetypeDiscovered,
      markRegionVisited,
      markRuntimeDiscovered,
      progress,
      quests,
      resetProgress,
      selectSkin,
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
