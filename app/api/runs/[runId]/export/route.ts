import { ApiError, conflict } from "../../../../../lib/server/api-error.ts";
import {
  digestText,
  getArtifactRepository,
} from "../../../../../lib/server/artifacts.ts";
import { requireApiPrincipal } from "../../../../../lib/server/auth.ts";
import { getKilnStore } from "../../../../../lib/server/db.ts";
import { handleApi } from "../../../../../lib/server/http.ts";
import {
  buildRepositoryArchive,
  RepositoryExportTooLargeError,
} from "../../../../../lib/server/repository-export.ts";
import {
  requireRouteId,
  type RouteContext,
} from "../../../../../lib/server/route-params.ts";

type Params = { runId: string };

export async function GET(
  request: Request,
  context: RouteContext<Params>,
): Promise<Response> {
  return handleApi(request, async () => {
    const principal = requireApiPrincipal(request);
    const { runId: rawRunId } = await context.params;
    const runId = requireRouteId(rawRunId, "run");
    const store = getKilnStore();
    await store.consumeRateLimit(principal.id, "repository.export", 4);
    const run = await store.getRun(principal.id, runId);
    const [project, contract, snapshots] = await Promise.all([
      store.getProject(principal.id, run.projectId),
      store.getRunContract(principal.id, runId),
      store.listCurrentFileSnapshots(principal.id, runId),
    ]);
    const current = snapshots.filter((snapshot) => !snapshot.deleted);
    if (current.length === 0) {
      conflict("Generated source is required before repository export", "source_required");
    }
    const artifacts = getArtifactRepository();
    const files = await Promise.all(current.map(async (snapshot) => {
      const content = await artifacts.getText(snapshot.objectKey);
      if ((await digestText(content)) !== snapshot.sha256) {
        throw new ApiError(
          500,
          "snapshot_integrity_failed",
          "A source snapshot failed its integrity check",
          false,
        );
      }
      return { path: snapshot.path, content, sha256: snapshot.sha256 };
    }));
    const exportedAt = new Date().toISOString();
    let archive: Uint8Array;
    try {
      archive = buildRepositoryArchive({ contract, run, files, exportedAt });
    } catch (error) {
      if (error instanceof RepositoryExportTooLargeError) {
        throw new ApiError(413, "export_too_large", error.message);
      }
      throw error;
    }
    const stored = await artifacts.putArchive(
      `runs/${runId}/exports/repository-${crypto.randomUUID()}.zip`,
      archive,
    );
    await store.recordRepositoryExport(principal.id, runId, stored);
    const filename = `${project.slug}-${run.id.slice(-6)}.zip`;
    const responseBody = Uint8Array.from(archive).buffer;
    return new Response(responseBody, {
      headers: {
        "content-type": "application/zip",
        "content-length": String(archive.byteLength),
        "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "x-kiln-artifact-sha256": stored.sha256,
      },
    });
  });
}
