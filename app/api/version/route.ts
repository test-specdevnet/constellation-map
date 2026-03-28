import { BUILD_STAMP } from "../../../lib/buildStamp";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    build: BUILD_STAMP,
    name: "fluxcloud-constellation-map",
  });
}
