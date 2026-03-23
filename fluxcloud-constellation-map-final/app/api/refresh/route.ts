import { NextResponse } from "next/server";
import { refreshFluxSnapshot } from "../../../lib/flux/normalize";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const refreshSecret = process.env.REFRESH_SECRET;
  const requestSecret = request.headers.get("x-refresh-secret");

  if (refreshSecret && requestSecret !== refreshSecret) {
    return NextResponse.json(
      {
        error: "Unauthorized refresh request.",
      },
      { status: 401 },
    );
  }

  try {
    const snapshot = await refreshFluxSnapshot();
    return NextResponse.json({
      refreshedAt: snapshot.generatedAt,
      counts: snapshot.counts,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to refresh FluxCloud snapshot.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
