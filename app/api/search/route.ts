import { NextResponse } from "next/server";
import { searchApps } from "../../../lib/flux/normalize";

export const dynamic = "force-dynamic";
export const revalidate = 120;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") ?? "";
    const results = await searchApps(query);

    return NextResponse.json({
      query,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to search FluxCloud apps.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
