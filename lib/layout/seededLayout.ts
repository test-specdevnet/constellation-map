import { getColorBucket, getVisualMass, inferHealthBand } from "../flux/classify";
import type { AppLocation, AppSpec } from "../types/app";
import type { NodeProfile } from "../types/node";
import type { AppSystem, Cluster, ClusterKind, Star } from "../types/star";

const clusterRadius = 2600;
const systemOrbitBase = 260;
const starOrbitBase = 18;

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
};

type ClusterAssignment = {
  clusterId: string;
  label: string;
  kind: ClusterKind;
};

const getClusterAssignment = (app: AppSpec): ClusterAssignment => {
  if (app.projectCategory !== "misc") {
    return {
      clusterId: `project:${app.projectCategory}`,
      label: titleCase(app.projectCategory),
      kind: "project-category",
    };
  }

  if (app.runtimeFamily !== "unknown") {
    return {
      clusterId: `runtime:${app.runtimeFamily}`,
      label: `${titleCase(app.runtimeFamily)} Runtime`,
      kind: "runtime",
    };
  }

  return {
    clusterId: `resource:${app.resourceTier}`,
    label: `${titleCase(app.resourceTier)} Footprint`,
    kind: "resource",
  };
};

const getNodeById = (nodes: NodeProfile[]) =>
  Object.fromEntries(nodes.map((node) => [node.id, node]));

export const buildSeededSceneLayout = ({
  apps,
  locations,
  nodes,
}: LayoutInput): LayoutOutput => {
  const locationsByApp = new Map<string, AppLocation[]>();
  const nodesById = getNodeById(nodes);

  for (const location of locations) {
    const group = locationsByApp.get(location.appName) ?? [];
    group.push(location);
    locationsByApp.set(location.appName, group);
  }

  const clusterAssignments = apps.map((app) => ({
    app,
    assignment: getClusterAssignment(app),
  }));
  const uniqueClusters = [...new Map(clusterAssignments.map((entry) => [entry.assignment.clusterId, entry.assignment])).values()]
    .sort((left, right) => left.label.localeCompare(right.label));

  const clusterCenters = new Map<string, { x: number; y: number }>();
  const armCount = Math.max(3, Math.min(5, Math.round(Math.sqrt(uniqueClusters.length))));
  const globalRotation = randSigned("flux:galaxy:rotation") * 0.8;
  const tilt = randSigned("flux:galaxy:tilt") * 0.22;
  const coreBias = 0.55 + rand01("flux:galaxy:coreBias") * 0.15;

  uniqueClusters.forEach((cluster, index) => {
    const arm = seeded(`${cluster.clusterId}:arm`, armCount);
    const armPhase = (arm / Math.max(armCount, 1)) * Math.PI * 2;
    const t =
      0.6 +
      (index / Math.max(uniqueClusters.length - 1, 1)) * (3.8 + rand01(`${cluster.clusterId}:tSpan`) * 1.6) +
      randSigned(`${cluster.clusterId}:tJitter`) * 0.35;

    const armTightness = 0.36 + rand01(`${cluster.clusterId}:tight`) * 0.22;
    const baseRadius =
      clusterRadius *
      Math.pow(rand01(`${cluster.clusterId}:rad`) * 0.95 + 0.05, coreBias) *
      (0.78 + rand01(`${cluster.clusterId}:radGain`) * 0.58);

    const angle =
      armPhase +
      t * (1.1 + armTightness) +
      randSigned(`${cluster.clusterId}:angNoise`) * 0.38;

    const spiral = polar(angle, baseRadius + t * 240);
    const lobe =
      (arm % 2 === 0 ? 1 : -1) *
      gaussianLike(`${cluster.clusterId}:lobeA`, `${cluster.clusterId}:lobeB`) *
      420;
    const drift = {
      x:
        gaussianLike(`${cluster.clusterId}:dxA`, `${cluster.clusterId}:dxB`) *
          360 +
        lobe,
      y:
        gaussianLike(`${cluster.clusterId}:dyA`, `${cluster.clusterId}:dyB`) *
          360 +
        gaussianLike(`${cluster.clusterId}:dyC`, `${cluster.clusterId}:dyD`) *
          180,
    };

    const rotated = rotate(
      {
        x: spiral.x + drift.x,
        y: spiral.y + drift.y,
      },
      globalRotation,
    );

    const projected = {
      x: rotated.x,
      y: rotated.y * (1 + tilt),
    };

    clusterCenters.set(cluster.clusterId, projected);
  });

  const clusters: Cluster[] = [];
  const systems: AppSystem[] = [];
  const stars: Star[] = [];

  for (const cluster of uniqueClusters) {
    const clusterApps = clusterAssignments
      .filter((entry) => entry.assignment.clusterId === cluster.clusterId)
      .map((entry) => entry.app)
      .sort((left, right) => left.appName.localeCompare(right.appName));
    const centroid = clusterCenters.get(cluster.clusterId) ?? { x: 0, y: 0 };
    const clusterStarIds: string[] = [];
    const clusterResource = new Set(clusterApps.map((app) => app.resourceTier));
    const clusterRuntime = new Set(clusterApps.map((app) => app.runtimeFamily));

    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const ellipseAngle = randSigned(`${cluster.clusterId}:ellipse`) * 0.7;
    const ellipseScale = 0.75 + rand01(`${cluster.clusterId}:ellipseScale`) * 0.35;

    clusterApps.forEach((app, systemIndex) => {
      const systemId = `system:${app.appName}`;
      const jitter = randSigned(`${app.appName}:sysJitter`);
      const systemAngle = systemIndex * goldenAngle + jitter * 0.55;
      const spread =
        systemOrbitBase +
        Math.pow(rand01(`${app.appName}:sysRad`) * 0.98 + 0.02, 0.62) * 880;
      const base = polar(systemAngle, spread);
      const warped = rotate({ x: base.x * (1.08 + ellipseScale), y: base.y * ellipseScale }, ellipseAngle);
      const systemX = centroid.x + warped.x;
      const systemY = centroid.y + warped.y;
      const appLocations = locationsByApp.get(app.appName) ?? [];
      const primaryLocation = appLocations[0];
      const primaryNode = primaryLocation ? nodesById[primaryLocation.nodeJoinKey] : undefined;
      const status = primaryLocation?.status || "unknown";

      const system: AppSystem = {
        systemId,
        appName: app.appName,
        label: app.appName,
        clusterId: cluster.clusterId,
        x: systemX,
        y: systemY,
        instanceCount: Math.max(app.instances, appLocations.length || 1),
        runtimeFamily: app.runtimeFamily,
        projectCategory: app.projectCategory,
        resourceTier: app.resourceTier,
        status,
      };

      systems.push(system);

      const renderLocations =
        appLocations.length > 0
          ? appLocations
          : [
              {
                id: `${app.appName}:app`,
                appName: app.appName,
                ip: "",
                hash: app.hash,
                broadcastedAt: null,
                expireAt: null,
                status: "unknown",
                locationKey: `${app.appName}:app`,
                freshness: "unknown",
                nodeJoinKey: "",
              } satisfies AppLocation,
            ];

      renderLocations.forEach((location, locationIndex) => {
        const angle = rand01(`${location.id}:theta`) * Math.PI * 2;
        const radius =
          starOrbitBase +
          Math.pow(rand01(`${location.id}:rad`) * 0.98 + 0.02, 0.6) * (42 + rand01(`${location.id}:radGain`) * 34);
        const offset = rotate(
          {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius * (0.72 + rand01(`${location.id}:ecc`) * 0.55),
          },
          randSigned(`${location.id}:rot`) * 0.8,
        );
        const node = location.nodeJoinKey ? nodesById[location.nodeJoinKey] : primaryNode;
        const visualMass = getVisualMass(app, renderLocations.length, node);
        const starId = `star:${location.id}`;
        const region =
          node?.geolocation.regionName ?? node?.geolocation.country ?? node?.org ?? undefined;

        stars.push({
          id: starId,
          type: "instance",
          x: systemX + offset.x,
          y: systemY + offset.y,
          size: Math.max(3, Math.min(18, 3 + visualMass * 0.12)),
          brightness: Math.max(0.4, Math.min(1, 0.42 + visualMass / 70)),
          colorBucket: getColorBucket(app),
          appName: app.appName,
          appId: app.appName,
          locationId: location.id,
          nodeProfileId: node?.id,
          clusterId: cluster.clusterId,
          systemId,
          label: app.appName,
          isRecommended: app.projectCategory === "api" || app.projectCategory === "website",
          status,
          healthBand: inferHealthBand(status),
          runtimeFamily: app.runtimeFamily,
          projectCategory: app.projectCategory,
          resourceTier: app.resourceTier,
          region,
          metadata: {
            owner: app.owner,
            instances: app.instances,
            benchmarkTier: node?.benchmarkTier ?? null,
            country: node?.geolocation.country ?? null,
          },
        });
        clusterStarIds.push(starId);
      });
    });

    clusters.push({
      clusterId: cluster.clusterId,
      label: cluster.label,
      kind: cluster.kind,
      centroid,
      starIds: clusterStarIds,
      summaryMetrics: {
        apps: clusterApps.length,
        instances: clusterStarIds.length,
        runtimeFamily: clusterRuntime.size === 1 ? [...clusterRuntime][0] : "mixed",
        resourceTier: clusterResource.size === 1 ? [...clusterResource][0] : "mixed",
      },
    });
  }

  const featureSystems = [...systems]
    .sort((left, right) => right.instanceCount - left.instanceCount || left.appName.localeCompare(right.appName))
    .slice(0, 12);

  return { clusters, systems, stars, featureSystems };
};
