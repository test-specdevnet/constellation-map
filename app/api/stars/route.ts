import { NextResponse } from "next/server";
import { getSceneSummary } from "../../../lib/flux/normalize";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export async function GET() {
  try {
    const payload = await getSceneSummary();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to build the FluxCloud constellation snapshot.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
