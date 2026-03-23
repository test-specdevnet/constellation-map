import { NextResponse } from "next/server";
import { getAppDetail } from "../../../../lib/flux/normalize";

type RouteContext = {
  params: Promise<{
    appName: string;
  }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 900;

export async function GET(_: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const detail = await getAppDetail(decodeURIComponent(params.appName));

    if (!detail) {
      return NextResponse.json(
        {
          error: "App not found.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to hydrate Flux app detail.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
