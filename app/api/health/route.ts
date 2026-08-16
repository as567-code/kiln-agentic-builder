import { getKilnStore } from "../../../lib/server/db.ts";
import { handleApi, jsonData } from "../../../lib/server/http.ts";

export async function GET(request: Request): Promise<Response> {
  return handleApi(request, async ({ requestId }) => {
    getKilnStore();
    return jsonData(
      {
        status: "ok",
        service: "kiln-control-plane",
        database: "configured",
      },
      requestId,
    );
  });
}
