import { getColorBucket, getVisualMass, inferHealthBand } from "../flux/classify";
import type { AppLocation, AppSpec, ProjectCategory, RuntimeFamily } from "../types/app";
import type { NodeProfile } from "../types/node";
import type {
  AppSystem,
  ArchetypeSummary,
  Cluster,
  JitterVector,
  SceneBounds,
  Star,
} from "../types/star";

const REGION_RADIUS = 13_200;
const RUNTIME_ORBIT_BASE = 1_860;
const SYSTEM_ORBIT_BASE = 420;
const STAR_ORBIT_BASE = 48;
const MIN_SYSTEM_SEP = 320;
const MIN_STAR_SEP = 92;
const SCENE_MARGIN = 1_400;
const UNKNOWN_REGION_LABEL = "Unknown Sector";

const hashString = (value: string) => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0);
};

const seeded = (value: string, mod = 1000) => hashString(value) % mod;
const rand01 = (seed: string) => seeded(seed, 1_000_000) / 1_000_000;
const randSigned = (seed: string) => rand01(seed) * 2 - 1;
const gaussianLike = (seedA: string, seedB: string) =>
  (randSigned(seedA) + randSigned(seedB)) * 0.55;

const polar = (angle: number, radius: number) => ({
  x: Math.cos(angle) * radius,
  y: Math.sin(angle) * radius,
});

const rotate = (point: { x: number; y: number }, angle: number) => ({
  x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
  y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
});

const titleCase = (value: string) =>
  value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const cleanRegionLabel = (value: string | undefined) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }

  if (/^[a-z0-9-_\s]+$/i.test(trimmed) && trimmed === trimmed.toLowerCase()) {
    return titleCase(trimmed);
  }

  return trimmed;
};

type LayoutInput = {
  apps: AppSpec[];
  locations: AppLocation[];
  nodes: NodeProfile[];
};

type LayoutOutput = {
  clusters: Cluster[];
  systems: AppSystem[];
  stars: Star[];
  featureSystems: AppSystem[];
  bounds: SceneBounds;
  rareArchetypes: ArchetypeSummary[];
};

type DraftSystem = {
  app: AppSpec;
  x: number;
  y: number;
  status: string;
  appLocations: AppLocation[];
  primaryNode?: NodeProfile;
  regionLabel: string;
  regionClusterId: string;
  runtimeClusterId: string;
  jitterSeed: string;
  jitterOffset: JitterVector;
  archetypeId: string;
  isRareArchetype: boolean;
};

const getNodeById = (nodes: NodeProfile[]) =>
  Object.fromEntries(nodes.map((node) => [node.id, node]));

const groupBy = <T, K extends string>(items: T[], keyOf: (item: T) => K) => {
  const map = new Map<K, T[]>();

  for (const item of items) {
    const key = keyOf(item);
    const existing = map.get(key);
    if (existing) {
      existing.push(item);
    } else {
      map.set(key, [item]);
    }
  }

  return map;
};

const buildJitterVector = (seed: string, strength: number): JitterVector => ({
  x: gaussianLike(`${seed}:jxA`, `${seed}:jxB`) * strength,
  y: gaussianLike(`${seed}:jyA`, `${seed}:jyB`) * strength,
});

const resolveRegionLabel = (
  app: AppSpec,
  appLocations: AppLocation[],
  nodesById: Record<string, NodeProfile>,
) => {
  const counts = new Map<string, number>();

  const addCandidate = (candidate: string | undefined) => {
    const normalized = cleanRegionLabel(candidate);
    if (!normalized) {
      return;
    }

    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  };

  for (const location of appLocations) {
    const node = nodesById[location.nodeJoinKey];
    addCandidate(node?.geolocation.regionName);
    addCandidate(node?.geolocation.country);
    addCandidate(node?.org);
    addCandidate(node?.geolocation.org);
  }

  if (!counts.size && app.geolocationRules.length > 0) {
    addCandidate(app.geolocationRules[0]);
  }

  const top = [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )[0]?.[0];

  return top || UNKNOWN_REGION_LABEL;
};

const buildRareArchetypes = (apps: AppSpec[]) => {
  const counts = apps.reduce((map, app) => {
    const key = `${app.runtimeFamily}:${app.projectCategory}`;
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  const sorted = [...counts.entries()]
    .map(([id, systemCount]) => {
      const [runtimeFamily, projectCategory] = id.split(":") as [
        RuntimeFamily,
        ProjectCategory,
      ];

      return {
        id,
        runtimeFamily,
        projectCategory,
        systemCount,
      } satisfies ArchetypeSummary;
    })
    .sort(
      (left, right) =>
        left.systemCount - right.systemCount || left.id.localeCompare(right.id),
    );

  if (!sorted.length) {
    return [];
  }

  const percentileIndex = Math.max(0, Math.ceil(sorted.length * 0.1) - 1);
  const percentileThreshold = sorted[percentileIndex]?.systemCount ?? 1;
  const rareCutoff = Math.max(1, Math.min(3, percentileThreshold));

  return sorted.filter((entry) => entry.systemCount <= rareCutoff);
};

const relaxPointSeparation = <T extends { x: number; y: number }>(
  points: T[],
  minimumSeparation: number,
  passes = 3,
) => {
  for (let pass = 0; pass < passes; pass += 1) {
    for (let index = 0; index < points.length; index += 1) {
      for (let peerIndex = index + 1; peerIndex < points.length; peerIndex += 1) {
        const left = points[index];
        const right = points[peerIndex];
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const distance = Math.hypot(dx, dy);

        if (distance >= minimumSeparation || distance < 1e-6) {
          continue;
        }

        const push = (minimumSeparation - distance) * 0.52;
        const nx = dx / distance;
        const ny = dy / distance;

        left.x -= nx * push;
        left.y -= ny * push;
        right.x += nx * push;
        right.y += ny * push;
      }
    }
  }
};

const computeBounds = (clusters: Cluster[], systems: AppSystem[], stars: Star[]): SceneBounds => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const include = (x: number, y: number, radius = 0) => {
    minX = Math.min(minX, x - radius);
    minY = Math.min(minY, y - radius);
    maxX = Math.max(maxX, x + radius);
    maxY = Math.max(maxY, y + radius);
  };

  for (const cluster of clusters) {
    include(cluster.centroid.x, cluster.centroid.y, cluster.radius);
  }

  for (const system of systems) {
    include(system.x, system.y, 220);
  }

  for (const star of stars) {
    include(star.x, star.y, 86);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return {
      minX: -1_000,
      minY: -1_000,
      maxX: 1_000,
      maxY: 1_000,
      width: 2_000,
      height: 2_000,
    };
  }

  minX -= SCENE_MARGIN;
  minY -= SCENE_MARGIN;
  maxX += SCENE_MARGIN;
  maxY += SCENE_MARGIN;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

export const buildSeededSceneLayout = ({
  apps,
  locations,
  nodes,
}: LayoutInput): LayoutOutput => {
  const locationsByApp = groupBy(locations, (location) => location.appName);
  const nodesById = getNodeById(nodes);
  const rareArchetypes = buildRareArchetypes(apps);
  const rareArchetypeIds = new Set(rareArchetypes.map((entry) => entry.id));

  const appsWithRegion = apps
    .map((app) => {
      const appLocations = locationsByApp.get(app.appName) ?? [];
      return {
        app,
        regionLabel: resolveRegionLabel(app, appLocations, nodesById),
        appLocations,
      };
    })
    .sort(
      (left, right) =>
        left.regionLabel.localeCompare(right.regionLabel) ||
        left.app.runtimeFamily.localeCompare(right.app.runtimeFamily) ||
        left.app.appName.localeCompare(right.app.appName),
    );

  const regionGroups = groupBy(appsWithRegion, (entry) => entry.regionLabel);
  const orderedRegionLabels = [...regionGroups.keys()].sort((left, right) =>
    left.localeCompare(right),
  );

  const regionCenters = new Map<string, { x: number; y: number }>();
  const armCount = Math.max(3, Math.min(6, Math.round(Math.sqrt(orderedRegionLabels.length)) + 1));
  const globalRotation = randSigned("flux:regions:rotation") * 0.8;
  const tilt = randSigned("flux:regions:tilt") * 0.2;

  orderedRegionLabels.forEach((regionLabel, index) => {
    const regionId = `region:${regionLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const arm = seeded(`${regionId}:arm`, armCount);
    const armPhase = (arm / Math.max(armCount, 1)) * Math.PI * 2;
    const t =
      0.7 +
      (index / Math.max(orderedRegionLabels.length - 1, 1)) *
        (4.2 + rand01(`${regionId}:span`) * 1.1) +
      randSigned(`${regionId}:tJitter`) * 0.28;
    const radius =
      REGION_RADIUS *
      (0.42 + Math.pow(rand01(`${regionId}:rad`) * 0.94 + 0.06, 0.78) * 0.8);
    const angle =
      armPhase +
      t * (1.16 + rand01(`${regionId}:tight`) * 0.18) +
      randSigned(`${regionId}:angle`) * 0.32;
    const spiral = polar(angle, radius + t * 420);
    const drift = {
      x: gaussianLike(`${regionId}:dxA`, `${regionId}:dxB`) * 760,
      y: gaussianLike(`${regionId}:dyA`, `${regionId}:dyB`) * 760,
    };
    const rotated = rotate(
      {
        x: spiral.x + drift.x,
        y: spiral.y + drift.y,
      },
      globalRotation,
    );

    regionCenters.set(regionLabel, {
      x: rotated.x,
      y: rotated.y * (1 + tilt),
    });
  });

  const clusters: Cluster[] = [];
  const systems: AppSystem[] = [];
  const stars: Star[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (const regionLabel of orderedRegionLabels) {
    const regionClusterId = `region:${regionLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const regionCenter = regionCenters.get(regionLabel) ?? { x: 0, y: 0 };
    const regionEntries = regionGroups.get(regionLabel) ?? [];
    const runtimeGroups = groupBy(regionEntries, (entry) => entry.app.runtimeFamily);
    const orderedRuntimes = [...runtimeGroups.keys()].sort((left, right) =>
      left.localeCompare(right),
    );
    const regionSystemIds: string[] = [];
    const regionStarIds: string[] = [];
    let regionRadius = 1_800;

    orderedRuntimes.forEach((runtimeFamily, runtimeIndex) => {
      const runtimeEntries = runtimeGroups.get(runtimeFamily) ?? [];
      const runtimeClusterId = `${regionClusterId}:runtime:${runtimeFamily}`;
      const runtimeAngle =
        (runtimeIndex / Math.max(orderedRuntimes.length, 1)) * Math.PI * 2 +
        randSigned(`${runtimeClusterId}:angle`) * 0.22;
      const runtimeDistance =
        RUNTIME_ORBIT_BASE +
        Math.sqrt(runtimeEntries.length) * 230 +
        rand01(`${runtimeClusterId}:distance`) * 420;
      const runtimeCentroid = {
        x: regionCenter.x + Math.cos(runtimeAngle) * runtimeDistance,
        y: regionCenter.y + Math.sin(runtimeAngle) * runtimeDistance * 0.78,
      };
      const runtimeSystemIds: string[] = [];
      const runtimeStarIds: string[] = [];

      const draftSystems = runtimeEntries.map((entry, systemIndex) => {
        const app = entry.app;
        const systemAngle =
          systemIndex * goldenAngle + randSigned(`${app.appName}:system-angle`) * 0.5;
        const spread =
          SYSTEM_ORBIT_BASE +
          Math.pow(rand01(`${app.appName}:system-rad`) * 0.98 + 0.02, 0.62) *
            (480 + runtimeEntries.length * 42);
        const ellipse = 0.72 + rand01(`${app.appName}:system-ellipse`) * 0.42;
        const base = polar(systemAngle, spread);
        const offset = rotate(
          {
            x: base.x * (1.08 + rand01(`${app.appName}:system-squash`) * 0.22),
            y: base.y * ellipse,
          },
          randSigned(`${app.appName}:system-rot`) * 0.7,
        );
        const primaryLocation = entry.appLocations[0];
        const primaryNode = primaryLocation
          ? nodesById[primaryLocation.nodeJoinKey]
          : undefined;
        const status = primaryLocation?.status || "unknown";
        const archetypeId = `${app.runtimeFamily}:${app.projectCategory}`;

        return {
          app,
          x: runtimeCentroid.x + offset.x,
          y: runtimeCentroid.y + offset.y,
          status,
          appLocations: entry.appLocations,
          primaryNode,
          regionLabel,
          regionClusterId,
          runtimeClusterId,
          jitterSeed: `system:${app.appName}`,
          jitterOffset: buildJitterVector(`system:${app.appName}`, 44),
          archetypeId,
          isRareArchetype: rareArchetypeIds.has(archetypeId),
        } satisfies DraftSystem;
      });

      relaxPointSeparation(draftSystems, MIN_SYSTEM_SEP, 3);

      let runtimeRadius = 780;

      for (const draft of draftSystems.sort((left, right) =>
        left.app.appName.localeCompare(right.app.appName),
      )) {
        const systemId = `system:${draft.app.appName}`;
        const system: AppSystem = {
          systemId,
          appName: draft.app.appName,
          label: draft.app.appName,
          clusterId: draft.runtimeClusterId,
          regionClusterId: draft.regionClusterId,
          runtimeClusterId: draft.runtimeClusterId,
          regionLabel: draft.regionLabel,
          x: draft.x,
          y: draft.y,
          instanceCount: Math.max(draft.app.instances, draft.appLocations.length || 1),
          runtimeFamily: draft.app.runtimeFamily,
          projectCategory: draft.app.projectCategory,
          resourceTier: draft.app.resourceTier,
          status: draft.status,
          jitterSeed: draft.jitterSeed,
          jitterOffset: draft.jitterOffset,
          archetypeId: draft.archetypeId,
          rarityFlags: {
            isRareArchetype: draft.isRareArchetype,
            rareArchetypeId: draft.isRareArchetype ? draft.archetypeId : null,
          },
        };

        systems.push(system);
        runtimeSystemIds.push(systemId);
        regionSystemIds.push(systemId);

        const renderLocations =
          draft.appLocations.length > 0
            ? draft.appLocations
            : [
                {
                  id: `${draft.app.appName}:app`,
                  appName: draft.app.appName,
                  ip: "",
                  hash: draft.app.hash,
                  broadcastedAt: null,
                  expireAt: null,
                  status: "unknown",
                  locationKey: `${draft.app.appName}:app`,
                  freshness: "unknown",
                  nodeJoinKey: "",
                } satisfies AppLocation,
              ];

        const draftStars = renderLocations.map((location, locationIndex) => {
          const angle = rand01(`${location.id}:theta`) * Math.PI * 2;
          const radius =
            STAR_ORBIT_BASE +
            Math.pow(rand01(`${location.id}:rad`) * 0.98 + 0.02, 0.58) *
              (96 + renderLocations.length * 8);
          const offset = rotate(
            {
              x: Math.cos(angle) * radius,
              y:
                Math.sin(angle) *
                radius *
                (0.7 + rand01(`${location.id}:ecc`) * 0.52),
            },
            randSigned(`${location.id}:rot`) * 0.7,
          );

          return {
            location,
            x: draft.x + offset.x,
            y: draft.y + offset.y,
          };
        });

        relaxPointSeparation(draftStars, MIN_STAR_SEP, 3);

        draftStars.forEach(({ location, x, y }, locationIndex) => {
          const node = location.nodeJoinKey
            ? nodesById[location.nodeJoinKey]
            : draft.primaryNode;
          const visualMass = getVisualMass(draft.app, renderLocations.length, node);
          const starId = `star:${location.id}`;
          const region =
            cleanRegionLabel(node?.geolocation.regionName) ||
            cleanRegionLabel(node?.geolocation.country) ||
            cleanRegionLabel(node?.org) ||
            draft.regionLabel;

          stars.push({
            id: starId,
            type: "instance",
            x,
            y,
            size: Math.max(3, Math.min(18, 3 + visualMass * 0.12)),
            brightness: Math.max(0.4, Math.min(1, 0.42 + visualMass / 70)),
            colorBucket: getColorBucket(draft.app),
            appName: draft.app.appName,
            appId: draft.app.appName,
            locationId: location.id,
            nodeProfileId: node?.id,
            clusterId: draft.runtimeClusterId,
            regionClusterId: draft.regionClusterId,
            runtimeClusterId: draft.runtimeClusterId,
            systemId,
            label: draft.app.appName,
            isRecommended:
              draft.app.projectCategory === "api" ||
              draft.app.projectCategory === "website",
            status: location.status || draft.status,
            healthBand: inferHealthBand(location.status || draft.status),
            runtimeFamily: draft.app.runtimeFamily,
            projectCategory: draft.app.projectCategory,
            resourceTier: draft.app.resourceTier,
            region,
            jitterSeed: `star:${location.id}`,
            jitterOffset: buildJitterVector(
              `star:${location.id}:${locationIndex}`,
              12,
            ),
            archetypeId: draft.archetypeId,
            rarityFlags: {
              isRareArchetype: draft.isRareArchetype,
              rareArchetypeId: draft.isRareArchetype ? draft.archetypeId : null,
            },
            metadata: {
              owner: draft.app.owner,
              instances: draft.app.instances,
              benchmarkTier: node?.benchmarkTier ?? null,
              country: node?.geolocation.country ?? null,
              regionLabel: draft.regionLabel,
            },
          });

          runtimeStarIds.push(starId);
          regionStarIds.push(starId);
        });

        const systemDistance = Math.hypot(draft.x - runtimeCentroid.x, draft.y - runtimeCentroid.y);
        runtimeRadius = Math.max(runtimeRadius, systemDistance + 420);
        regionRadius = Math.max(
          regionRadius,
          Math.hypot(draft.x - regionCenter.x, draft.y - regionCenter.y) + 860,
        );
      }

      const runtimeRareIds = [
        ...new Set(
          runtimeEntries
            .map((entry) => `${entry.app.runtimeFamily}:${entry.app.projectCategory}`)
            .filter((id) => rareArchetypeIds.has(id)),
        ),
      ];

      clusters.push({
        clusterId: runtimeClusterId,
        level: "runtime",
        parentId: regionClusterId,
        label: `${titleCase(runtimeFamily)} Runtime`,
        kind: "runtime",
        centroid: runtimeCentroid,
        radius: runtimeRadius,
        systemIds: runtimeSystemIds,
        starIds: runtimeStarIds,
        counts: {
          apps: runtimeEntries.length,
          systems: runtimeSystemIds.length,
          instances: runtimeStarIds.length,
          runtimes: 1,
        },
        rarityFlags: {
          hasRareArchetype: runtimeRareIds.length > 0,
          rareArchetypeCount: runtimeRareIds.length,
          rareArchetypeIds: runtimeRareIds,
        },
        runtimeFamily,
        regionLabel,
      });
    });

    const regionRareIds = [
      ...new Set(
        regionEntries
          .map((entry) => `${entry.app.runtimeFamily}:${entry.app.projectCategory}`)
          .filter((id) => rareArchetypeIds.has(id)),
      ),
    ];

    clusters.push({
      clusterId: regionClusterId,
      level: "region",
      parentId: null,
      label: regionLabel,
      kind: "region",
      centroid: regionCenter,
      radius: regionRadius,
      systemIds: regionSystemIds,
      starIds: regionStarIds,
      counts: {
        apps: regionEntries.length,
        systems: regionSystemIds.length,
        instances: regionStarIds.length,
        runtimes: new Set(regionEntries.map((entry) => entry.app.runtimeFamily)).size,
      },
      rarityFlags: {
        hasRareArchetype: regionRareIds.length > 0,
        rareArchetypeCount: regionRareIds.length,
        rareArchetypeIds: regionRareIds,
      },
      runtimeFamily: "mixed",
      regionLabel,
    });
  }

  const featureSystems = [...systems]
    .sort(
      (left, right) =>
        right.instanceCount - left.instanceCount ||
        left.appName.localeCompare(right.appName),
    )
    .slice(0, 12);

  const bounds = computeBounds(clusters, systems, stars);

  return {
    clusters,
    systems,
    stars,
    featureSystems,
    bounds,
    rareArchetypes,
  };
};
