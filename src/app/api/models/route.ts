import { getModels } from "@/lib/photos";
import {
  buildModelsPagePayload,
  parseModelsPageRequest,
} from "@/lib/models-pagination";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { sort, offset, limit } = parseModelsPageRequest(searchParams);
  const rows = await getModels(sort, limit + 1, offset);

  return Response.json(buildModelsPagePayload(rows, offset, limit), {
    headers: {
      "Cache-Control": "public, max-age=10, s-maxage=30, stale-while-revalidate=60",
    },
  });
}
