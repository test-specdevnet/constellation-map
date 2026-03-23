export type NodeProfile = {
  id: string;
  ip: string;
  uptime: number | null;
  geolocation: {
    continent?: string;
    country?: string;
    countryCode?: string;
    region?: string;
    regionName?: string;
    lat?: number;
    lon?: number;
    org?: string;
  };
  benchmarkStatus: string;
  benchmarkTier: "basic" | "verified" | "high-performance" | "unknown";
  architecture: string;
  realCores: number | null;
  cores: number | null;
  ramGb: number | null;
  ssdGb: number | null;
  hddGb: number | null;
  ddwrite: number | null;
  ping: number | null;
  downloadSpeed: number | null;
  uploadSpeed: number | null;
  org: string;
};
