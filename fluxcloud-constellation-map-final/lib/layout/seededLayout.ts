import { getColorBucket, getVisualMass, inferHealthBand } from "../flux/classify";
import type { AppLocation, AppSpec } from "../types/app";
import type { NodeProfile } from "../types/node";
import type { AppSystem, Cluster, ClusterKind, Star } from "../types/star";

const clusterRadius = 2200;
const systemOrbitBase = 320;
const starOrbitBase = 26;

const hashString = (value: string) => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0);
};

const seeded = (value: string, mod = 1000) => hashString(value) % mod;

const polar = (angle: number, radius: number) => ({
  x: Math.cos(angle) * radius,
  y: Math.sin(angle) * radius,
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
  uniqueClusters.forEach((cluster, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(uniqueClusters.length, 1) - Math.PI / 2;
    const jitter = seeded(cluster.clusterId, 120) - 60;
    const point = polar(angle, clusterRadius + jitter);
    clusterCenters.set(cluster.clusterId, point);
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

    clusterApps.forEach((app, systemIndex) => {
      const systemId = `system:${app.appName}`;
      const systemAngle =
        (Math.PI * 2 * systemIndex) / Math.max(clusterApps.length, 1) +
        seeded(app.appName, 100) / 100;
      const systemRadius = systemOrbitBase + seeded(`${app.appName}:orbit`, 260);
      const systemOffset = polar(systemAngle, systemRadius);
      const systemX = centroid.x + systemOffset.x;
      const systemY = centroid.y + systemOffset.y;
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
        const angle =
          (Math.PI * 2 * locationIndex) / Math.max(renderLocations.length, 1) +
          seeded(location.id, 100) / 100;
        const radius = starOrbitBase + seeded(`${location.id}:orbit`, 80);
        const offset = polar(angle, radius);
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
