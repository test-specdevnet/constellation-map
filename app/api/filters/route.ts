import { NextResponse } from "next/server";
import { getFilterMetadata } from "../../../lib/flux/normalize";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export async function GET() {
  try {
    const filters = await getFilterMetadata();
    return NextResponse.json(filters);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to derive filter metadata.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
