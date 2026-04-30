import { buildSeededSceneLayout } from "../layout/seededLayout";
import type {
  AppLocation,
  AppSpec,
  ProjectCategory,
  ResourceTier,
  RuntimeFamily,
} from "../types/app";
import type { NodeProfile } from "../types/node";
import type {
  AppDetail,
  AppSystem,
  ConstellationSnapshot,
  FilterMetadata,
  SnapshotSourceMetadata,
} from "../types/star";
import {
  getBenchmarkTier,
  getFreshness,
  inferFitTags,
  inferProjectCategory,
  inferResourceTier,
  inferRuntimeFamily,
} from "./classify";
import { clearCache, readCache, writeCache } from "./cache";
import { extractArray, extractObject, fetchFluxJson } from "./client";
import { fluxEndpoints } from "./endpoints";

const snapshotCacheKey = "snapshot:global";
const detailCachePrefix = "detail:";
const snapshotTtlMs = 1000 * 60 * 5;
const detailTtlMs = 1000 * 60 * 15;

const snapshotSource: SnapshotSourceMetadata = {
  coverage: "flux-public-global-snapshot",
  cacheTtlMs: snapshotTtlMs,
  endpoints: {
    appSpecifications: fluxEndpoints.globalAppSpecifications,
    locations: fluxEndpoints.locations,
    runningApps: fluxEndpoints.listRunningApps,
    benchmarks: fluxEndpoints.benchmarks,
  },
};

const toString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => toString(item)).filter(Boolean);
  }

  if (typeof value === "string" && value.length > 0) {
    return [value];
  }

  return [];
};

const roundTo = (value: number, precision = 2) => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const parseMemoryToMb = (raw: string): number | null => {
  const match = raw.match(/([\d.]+)\s*(mb|mib|gb|gib)?/i);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return null;
  }

  const unit = (match[2] || "mb").toLowerCase();
  if (unit.startsWith("g")) {
    return Math.round(amount * 1024);
  }
  return Math.round(amount);
};

const parseStorageToGb = (raw: string): number | null => {
  const match = raw.match(/([\d.]+)\s*(mb|mib|gb|gib|tb|tib)?/i);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return null;
  }

  const unit = (match[2] || "gb").toLowerCase();
  if (unit.startsWith("t")) {
    return roundTo(amount * 1024, 1);
  }
  if (unit.startsWith("m")) {
    return roundTo(amount / 1024, 2);
  }
  return roundTo(amount, 2);
};

const estimateRuntimeUsage = (app: AppSpec, instanceCount: number) => {
  let cpuPerInstance: number | null = null;
  let memoryPerInstanceMb: number | null = null;
  let storagePerInstanceGb: number | null = null;

  for (const entry of app.compose) {
    const cpuMatch = entry.match(/cpu[s]?\s*[:=]\s*([\d.]+)/i);
    if (!cpuPerInstance && cpuMatch) {
      const parsed = Number(cpuMatch[1]);
      if (Number.isFinite(parsed)) {
        cpuPerInstance = parsed;
      }
    }

    const memoryMatch = entry.match(/(?:ram|memory|mem)\s*[:=]\s*([\d.]+\s*(?:mb|mib|gb|gib)?)/i);
    if (!memoryPerInstanceMb && memoryMatch) {
      memoryPerInstanceMb = parseMemoryToMb(memoryMatch[1]);
    }

    const storageMatch = entry.match(/(?:storage|disk|ssd|hdd)\s*[:=]\s*([\d.]+\s*(?:mb|mib|gb|gib|tb|tib)?)/i);
    if (!storagePerInstanceGb && storageMatch) {
      storagePerInstanceGb = parseStorageToGb(storageMatch[1]);
    }
  }

  return {
    estimatedCpuCores:
      cpuPerInstance !== null ? roundTo(cpuPerInstance * Math.max(instanceCount, 1), 2) : null,
    estimatedMemoryMb:
      memoryPerInstanceMb !== null
        ? Math.round(memoryPerInstanceMb * Math.max(instanceCount, 1))
        : null,
    estimatedStorageGb:
      storagePerInstanceGb !== null
        ? roundTo(storagePerInstanceGb * Math.max(instanceCount, 1), 2)
        : null,
  };
};

const normalizeAppSpec = (record: Record<string, unknown>): AppSpec | null => {
  const appName =
    toString(record.appName) ||
    toString(record.name) ||
    toString(record.appname) ||
    toString(record["app"]);

  if (!appName) {
    return null;
  }

  const description = toString(record.description);
  const owner = toString(record.owner) || "Unknown owner";
  const compose = toStringArray(record.compose);
  const runtimeFamily = inferRuntimeFamily(appName, description, compose);
  const projectCategory = inferProjectCategory(appName, description, compose);
  const instances = toNumber(record.instances) ?? 0;
  const resourceTier = inferResourceTier(compose, instances);

  const spec: AppSpec = {
    appName,
    description,
    owner,
    instances,
    version: toNumber(record.version),
    hash: toString(record.hash),
    staticIp: Boolean(record.staticip ?? record.staticIp),
    expire: toNumber(record.expire),
    contacts: toStringArray(record.contacts),
    geolocationRules: toStringArray(record.geolocation),
    compose,
    runtimeFamily,
    projectCategory,
    resourceTier,
    fitTags: [],
  };

  spec.fitTags = inferFitTags(spec);
  return spec;
};

const normalizeLocation = (record: Record<string, unknown>): AppLocation | null => {
  const appName =
    toString(record.appName) || toString(record.name) || toString(record.appname);
  if (!appName) {
    return null;
  }

  const ip = toString(record.ip) || toString(record.ipaddress);
  const id = `${appName}:${ip || toString(record.hash) || "unknown"}:${toString(record.status)}`;
  const location: AppLocation = {
    id,
    appName,
    ip,
    hash: toString(record.hash),
    broadcastedAt: toNumber(record.broadcastedAt ?? record.broadcasted),
    expireAt: toNumber(record.expireAt ?? record.expire),
    status: toString(record.status) || "unknown",
    locationKey: `${appName}:${ip || "unknown"}`,
    freshness: "unknown",
    nodeJoinKey: ip,
  };

  location.freshness = getFreshness(location);
  return location;
};

const normalizeNodeProfile = (record: Record<string, unknown>): NodeProfile | null => {
  const ip = toString(record.ipaddress) || toString(record.ip);
  if (!ip) {
    return null;
  }

  const status = toString(record.status) || "unknown";
  const ddwrite = toNumber(record.ddwrite);
  const downloadSpeed = toNumber(record.download_speed ?? record.downloadSpeed);

  return {
    id: ip,
    ip,
    uptime: toNumber(record.uptime),
    geolocation: {
      continent: toString(record.continent),
      country: toString(record.country),
      countryCode: toString(record.countryCode),
      region: toString(record.region),
      regionName: toString(record.regionName),
      lat: toNumber(record.lat) ?? undefined,
      lon: toNumber(record.lon) ?? undefined,
      org: toString(record.org) || undefined,
    },
    benchmarkStatus: status,
    benchmarkTier: getBenchmarkTier(status, ddwrite, downloadSpeed),
    architecture: toString(record.architecture),
    realCores: toNumber(record.real_cores ?? record.realCores),
    cores: toNumber(record.cores),
    ramGb: toNumber(record.ram),
    ssdGb: toNumber(record.ssd),
    hddGb: toNumber(record.hdd),
    ddwrite,
    ping: toNumber(record.ping),
    downloadSpeed,
    uploadSpeed: toNumber(record.upload_speed ?? record.uploadSpeed),
    org: toString(record.org),
  };
};

const safeArrayFetch = async (path: string) => {
  try {
    const payload = await fetchFluxJson<unknown>(path);
    return extractArray(payload);
  } catch {
    return [];
  }
};

const safeObjectFetch = async (path: string) => {
  try {
    const payload = await fetchFluxJson<unknown>(path);
    return extractObject(payload);
  } catch {
    return {};
  }
};

const getStatusByAppName = (records: unknown[]) => {
  const statusMap = new Map<string, string>();

  for (const item of records) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const appName =
      toString(record.appName) || toString(record.name) || toString(record.appname);
    const status = toString(record.status) || "running";

    if (appName) {
      statusMap.set(appName, status);
    }
  }

  return statusMap;
};

const mergeStatusesIntoLocations = (
  locations: AppLocation[],
  statusByAppName: Map<string, string>,
) =>
  locations.map((location) =>
    location.status === "unknown" && statusByAppName.has(location.appName)
      ? { ...location, status: statusByAppName.get(location.appName) ?? location.status }
      : location,
  );

const buildFilterMetadata = (snapshot: ConstellationSnapshot): FilterMetadata => {
  const countValues = <T extends string>(values: T[]) =>
    [...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<T, number>()).entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((left, right) => String(left.value).localeCompare(String(right.value)));

  return {
    runtimeFamilies: countValues(snapshot.apps.map((app) => app.runtimeFamily)),
    projectCategories: countValues(snapshot.apps.map((app) => app.projectCategory)),
    resourceTiers: countValues(snapshot.apps.map((app) => app.resourceTier)),
    statuses: countValues(snapshot.stars.map((star) => star.status || "unknown")),
    countries: countValues(
      snapshot.nodes.map((node) => node.geolocation.country || "Unknown country"),
    ),
  };
};

export const buildConstellationSnapshot = async (force = false): Promise<ConstellationSnapshot> => {
  if (!force) {
    const cached = readCache<ConstellationSnapshot>(snapshotCacheKey);
    if (cached) {
      return cached;
    }
  }

  const [globalSpecsRaw, locationsRaw, runningAppsRaw, benchmarksRaw, deploymentInfo] =
    await Promise.all([
      safeArrayFetch(fluxEndpoints.globalAppSpecifications),
      safeArrayFetch(fluxEndpoints.locations),
      safeArrayFetch(fluxEndpoints.listRunningApps),
      safeArrayFetch(fluxEndpoints.benchmarks),
      safeObjectFetch(fluxEndpoints.deploymentInformation),
    ]);

  const apps = globalSpecsRaw
    .map((record) => normalizeAppSpec(record as Record<string, unknown>))
    .filter((app): app is AppSpec => Boolean(app));
  const statusByAppName = getStatusByAppName(runningAppsRaw);
  const locations = mergeStatusesIntoLocations(
    locationsRaw
      .map((record) => normalizeLocation(record as Record<string, unknown>))
      .filter((location): location is AppLocation => Boolean(location)),
    statusByAppName,
  );
  const nodes = benchmarksRaw
    .map((record) => normalizeNodeProfile(record as Record<string, unknown>))
    .filter((node): node is NodeProfile => Boolean(node));

  const { clusters, systems, stars, featureSystems, bounds, rareArchetypes } =
    buildSeededSceneLayout({
      apps,
      locations,
      nodes,
    });

  const constraints = extractObject(deploymentInfo);

  const snapshot: ConstellationSnapshot = {
    generatedAt: new Date().toISOString(),
    deploymentConstraints: {
      minimumInstances: toNumber(
        constraints.minimumInstances ?? constraints.minimuminstances,
      ),
      maximumInstances: toNumber(
        constraints.maximumInstances ?? constraints.maximuminstances,
      ),
    },
    apps,
    locations,
    nodes,
    clusters,
    systems,
    stars,
    featureSystems,
    bounds,
    rareArchetypes,
    counts: {
      apps: apps.length,
      locations: locations.length,
      stars: stars.length,
    },
  };

  writeCache(snapshotCacheKey, snapshot, snapshotTtlMs);
  return snapshot;
};

export const getFilterMetadata = async () => buildFilterMetadata(await buildConstellationSnapshot());

const buildFallbackAppDetail = (
  appName: string,
  snapshot: ConstellationSnapshot,
): AppDetail | null => {
  const app = snapshot.apps.find((candidate) => candidate.appName === appName);
  if (!app) {
    return null;
  }

  const locations = snapshot.locations.filter((location) => location.appName === appName);
  const relatedStars = snapshot.stars.filter((star) => star.appName === appName);
  const relatedRuntimeClusterId =
    snapshot.systems.find((system) => system.appName === appName)?.runtimeClusterId ??
    relatedStars[0]?.runtimeClusterId;
  const relatedSystems = snapshot.systems.filter(
    (system) =>
      system.runtimeClusterId === relatedRuntimeClusterId &&
      system.appName !== appName,
  ).slice(0, 6);
  const nodes = snapshot.nodes.filter((node) =>
    locations.some((location) => location.nodeJoinKey === node.id),
  );
  const regions = [...new Set(
    nodes
      .map((node) => node.geolocation.regionName || node.geolocation.country || node.org || "")
      .filter(Boolean),
  )].slice(0, 12);
  const instanceCount = Math.max(app.instances, locations.length);
  const runtimeUsage = estimateRuntimeUsage(app, instanceCount);
  const avgNodeDownloadMbps = nodes.length
    ? roundTo(
        nodes.reduce((total, node) => total + (node.downloadSpeed ?? 0), 0) / nodes.length,
        1,
      )
    : null;

  return {
    app,
    locations,
    nodes,
    relatedSystems,
    relatedStars,
    rationale: {
      constellationReason: `This app is grouped into the ${app.projectCategory} / ${app.runtimeFamily} constellation because its normalized runtime and project signals align most closely there.`,
      sizingReason: `Star size is based on requested footprint, instance count, and any benchmark context available from public Flux surfaces.`,
      neighborhoodReason: `Nearby systems share similar runtime, category, or deployment envelope traits.`,
    },
    summary: {
      instanceCount,
      liveStatus: locations[0]?.status || "unknown",
      owner: app.owner,
      freshness: locations[0]?.freshness || "unknown",
      regions,
      runtimeUsage: {
        ...runtimeUsage,
        activeNodes: nodes.length,
        avgNodeDownloadMbps,
      },
    },
  };
};

export const getAppDetail = async (appName: string, force = false): Promise<AppDetail | null> => {
  const cacheKey = `${detailCachePrefix}${appName}`;
  if (!force) {
    const cached = readCache<AppDetail>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const snapshot = await buildConstellationSnapshot(force);
  const fallback = buildFallbackAppDetail(appName, snapshot);

  if (!fallback) {
    return null;
  }

  try {
    const [specRaw, locationRaw] = await Promise.all([
      safeArrayFetch(fluxEndpoints.appSpecifications(appName)),
      safeArrayFetch(fluxEndpoints.appLocation(appName)),
    ]);

    const directSpec =
      specRaw
        .map((record) => normalizeAppSpec(record as Record<string, unknown>))
        .find((app): app is AppSpec => Boolean(app)) ?? fallback.app;
    const directLocations = locationRaw
      .map((record) => normalizeLocation(record as Record<string, unknown>))
      .filter((location): location is AppLocation => Boolean(location));

    const nodes = snapshot.nodes.filter((node) =>
      directLocations.some((location) => location.nodeJoinKey === node.id),
    );
    const detailLocations = directLocations.length > 0 ? directLocations : fallback.locations;
    const detailNodes = nodes.length > 0 ? nodes : fallback.nodes;
    const instanceCount = Math.max(directSpec.instances, detailLocations.length);
    const regions = [...new Set(
      detailNodes
        .map((node) => node.geolocation.regionName || node.geolocation.country || node.org || "")
        .filter(Boolean),
    )].slice(0, 12);
    const runtimeUsage = estimateRuntimeUsage(directSpec, instanceCount);
    const avgNodeDownloadMbps = detailNodes.length
      ? roundTo(
          detailNodes.reduce((total, node) => total + (node.downloadSpeed ?? 0), 0) /
            detailNodes.length,
          1,
        )
      : null;

    const detail: AppDetail = {
      ...fallback,
      app: directSpec,
      locations: detailLocations,
      nodes: detailNodes,
      summary: {
        instanceCount,
        liveStatus: detailLocations[0]?.status || fallback.summary.liveStatus,
        owner: directSpec.owner,
        freshness: detailLocations[0]?.freshness || fallback.summary.freshness,
        regions,
        runtimeUsage: {
          ...runtimeUsage,
          activeNodes: detailNodes.length,
          avgNodeDownloadMbps,
        },
      },
    };

    writeCache(cacheKey, detail, detailTtlMs);
    return detail;
  } catch {
    writeCache(cacheKey, fallback, detailTtlMs);
    return fallback;
  }
};

export const searchApps = async (query: string) => {
  const snapshot = await buildConstellationSnapshot();
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  return snapshot.apps
    .map((app) => {
      const haystack = `${app.appName} ${app.owner} ${app.description} ${app.runtimeFamily} ${app.projectCategory}`.toLowerCase();
      const directName = app.appName.toLowerCase().includes(normalized) ? 40 : 0;
      const directOwner = app.owner.toLowerCase().includes(normalized) ? 18 : 0;
      const directDescription = app.description.toLowerCase().includes(normalized) ? 12 : 0;
      const prefix = app.appName.toLowerCase().startsWith(normalized) ? 24 : 0;
      const score = haystack.includes(normalized)
        ? directName + directOwner + directDescription + prefix + app.instances
        : 0;

      const system = snapshot.systems.find((entry) => entry.appName === app.appName);

      return {
        appName: app.appName,
        owner: app.owner,
        description: app.description,
        runtimeFamily: app.runtimeFamily,
        projectCategory: app.projectCategory,
        resourceTier: app.resourceTier,
        systemId: system?.systemId ?? `system:${app.appName}`,
        clusterId: system?.clusterId ?? "",
        x: system?.x ?? 0,
        y: system?.y ?? 0,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.appName.localeCompare(right.appName))
    .slice(0, 15);
};

export const refreshFluxSnapshot = async () => {
  clearCache(snapshotCacheKey);
  clearCache(detailCachePrefix);
  return buildConstellationSnapshot(true);
};

export const getSceneSummary = async (force = false) => {
  const snapshot = await buildConstellationSnapshot(force);
  const filters = buildFilterMetadata(snapshot);

  return {
    generatedAt: snapshot.generatedAt,
    deploymentConstraints: snapshot.deploymentConstraints,
    clusters: snapshot.clusters,
    systems: snapshot.systems,
    stars: snapshot.stars,
    featureSystems: snapshot.featureSystems,
    bounds: snapshot.bounds,
    rareArchetypes: snapshot.rareArchetypes,
    counts: snapshot.counts,
    source: snapshotSource,
    filters,
  };
};
