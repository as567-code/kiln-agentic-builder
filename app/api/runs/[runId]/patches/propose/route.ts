import { requireApiPrincipal } from "../../../../../../lib/server/auth.ts";
import {
  digestText,
  getArtifactRepository,
} from "../../../../../../lib/server/artifacts.ts";
import { getKilnStore } from "../../../../../../lib/server/db.ts";
import {
  blueprintManifest,
  languageForPath,
  targetsForStage,
} from "../../../../../../lib/domain/generation.ts";
import {
  handleApi,
  jsonData,
  readJsonObject,
} from "../../../../../../lib/server/http.ts";
import { parseProposePatch } from "../../../../../../lib/server/input.ts";
import { getOrchestratorClient } from "../../../../../../lib/server/orchestrator.ts";
import {
  requireRouteId,
  type RouteContext,
} from "../../../../../../lib/server/route-params.ts";
import { ApiError, conflict } from "../../../../../../lib/server/api-error.ts";
import type { RepairDiagnostic } from "../../../../../../lib/server/orchestrator.ts";

type Params = { runId: string };

export async function POST(
  request: Request,
  context: RouteContext<Params>,
): Promise<Response> {
  return handleApi(request, async ({ requestId }) => {
    const principal = requireApiPrincipal(request);
    const { runId: rawRunId } = await context.params;
    const runId = requireRouteId(rawRunId, "run");
    const { stage } = parseProposePatch(await readJsonObject(request));
    const store = getKilnStore();
    const artifacts = getArtifactRepository();
    await store.consumeRateLimit(principal.id, "patches.propose", 12);

    let run = await store.getRun(principal.id, runId);
    if (stage === "repair") {
      if (run.status !== "repair_patch") {
        conflict("A bounded repair must be started first", "repair_not_active");
      }
    } else {
      run = await store.startGeneration(principal.id, runId);
      if (run.status === "scaffold") {
        const manifestObject = await artifacts.putJson(
          `runs/${runId}/blueprint/manifest.json`,
          blueprintManifest,
        );
        run = await store.completeScaffold(principal.id, runId, manifestObject);
      }
      if (run.status !== "generate_patches") {
        conflict("Patch generation is not active", "patch_generation_not_active");
      }
    }

    const targetPaths = targetsForStage(stage);
    const currentSnapshots = await store.listLatestFileSnapshots(
      principal.id,
      runId,
      targetPaths,
    );
    const currentFiles = await Promise.all(
      currentSnapshots
        .filter((snapshot) => !snapshot.deleted)
        .map(async (snapshot) => {
          const content = await artifacts.getText(snapshot.objectKey);
          if ((await digestText(content)) !== snapshot.sha256) {
            throw new ApiError(
              500,
              "snapshot_integrity_failed",
              "A source snapshot failed its integrity check",
              false,
            );
          }
          return { path: snapshot.path, sha256: snapshot.sha256, content };
        }),
    );
    const sequence = await store.nextPatchSequence(principal.id, runId);
    const contract = await store.getRunContract(principal.id, runId);
    const diagnostics = stage === "repair"
      ? await loadRepairDiagnostics(principal.id, runId)
      : undefined;
    const proposal = await getOrchestratorClient().proposePatch({
      runId,
      sequence,
      stage,
      contract,
      files: currentFiles,
      targetPaths,
      diagnostics,
      requestId,
    });
    assertPatchPreconditions(proposal.draft.changes, currentFiles);

    const nonce = crypto.randomUUID();
    const patchObject = await artifacts.putJson(
      `runs/${runId}/patches/${String(sequence).padStart(3, "0")}-${nonce}.json`,
      {
        version: 1,
        runId,
        sequence,
        stage,
        blueprint: blueprintManifest.id,
        blueprintVersion: blueprintManifest.version,
        ...proposal.draft,
        provenance: proposal.provenance,
      },
    );
    const snapshots = await Promise.all(
      proposal.draft.changes.map(async (change) => {
        if (change.operation === "delete") {
          return {
            path: change.path,
            objectKey: patchObject.objectKey,
            contentType: patchObject.contentType,
            sha256: change.expectedSha256!,
            sizeBytes: 0,
            language: languageForPath(change.path),
            deleted: true,
          };
        }
        const sourceObject = await artifacts.putSource(
          `runs/${runId}/files/${String(sequence).padStart(3, "0")}/${change.path}`,
          change.content!,
        );
        return {
          ...sourceObject,
          path: change.path,
          language: languageForPath(change.path),
          deleted: false,
        };
      }),
    );
    const patch = await store.recordPatch(principal.id, runId, {
      sequence,
      draft: proposal.draft,
      artifact: patchObject,
      snapshots,
      provenance: proposal.provenance,
    });

    return jsonData(
      {
        run: await store.getRun(principal.id, runId),
        patch,
        proposal: proposal.draft,
        snapshots: snapshots.map((snapshot) => ({
          path: snapshot.path,
          contentType: snapshot.contentType,
          sha256: snapshot.sha256,
          sizeBytes: snapshot.sizeBytes,
          language: snapshot.language,
          deleted: snapshot.deleted,
        })),
        planner: {
          name: proposal.provenance.planner,
          model: proposal.provenance.model,
          usage: {
            inputTokens: proposal.provenance.inputTokens,
            outputTokens: proposal.provenance.outputTokens,
            totalTokens: proposal.provenance.totalTokens,
          },
        },
      },
      requestId,
      { status: 201 },
    );
  });
}

async function loadRepairDiagnostics(
  ownerId: string,
  runId: string,
): Promise<RepairDiagnostic[]> {
  const detail = await getKilnStore().getRunDetails(ownerId, runId);
  const reportArtifact = [...detail.artifacts]
    .reverse()
    .find((artifact) => artifact.kind === "verification_report");
  if (!reportArtifact) {
    conflict("Trusted failure evidence is required before repair", "repair_evidence_required");
  }
  const stored = await getArtifactRepository().getJson<unknown>(reportArtifact.objectKey);
  if (!isRecord(stored) || !isRecord(stored.report) || !Array.isArray(stored.report.checks)) {
    throw new ApiError(
      500,
      "repair_evidence_corrupt",
      "Stored failure evidence cannot be used for repair",
      false,
    );
  }
  const diagnostics = stored.report.checks
    .filter(isFailedDiagnostic)
    .slice(0, 8)
    .map((check) => ({
      checkId: check.checkId,
      status: check.status,
      exitCode: check.exitCode,
      stdout: check.stdout.slice(0, 4_000),
      stderr: check.stderr.slice(0, 4_000),
      outputTruncated: check.outputTruncated,
    }));
  if (diagnostics.length === 0) {
    conflict("Trusted failure evidence is required before repair", "repair_evidence_required");
  }
  return diagnostics;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFailedDiagnostic(value: unknown): value is {
  checkId: string;
  status: "failed" | "timed_out";
  exitCode: number | null;
  stdout: string;
  stderr: string;
  outputTruncated: boolean;
} {
  return isRecord(value) &&
    typeof value.checkId === "string" &&
    (value.status === "failed" || value.status === "timed_out") &&
    (value.exitCode === null || Number.isInteger(value.exitCode)) &&
    typeof value.stdout === "string" &&
    typeof value.stderr === "string" &&
    typeof value.outputTruncated === "boolean";
}

function assertPatchPreconditions(
  changes: Array<{
    path: string;
    operation: "add" | "replace" | "delete";
    expectedSha256?: string;
  }>,
  currentFiles: Array<{ path: string; sha256: string }>,
): void {
  const current = new Map(currentFiles.map((file) => [file.path, file.sha256]));
  for (const change of changes) {
    const sha256 = current.get(change.path);
    if (change.operation === "add" && sha256) {
      conflict("Patch add precondition is stale", "patch_precondition_failed");
    }
    if (
      change.operation !== "add" &&
      (!sha256 || sha256 !== change.expectedSha256)
    ) {
      conflict("Patch source precondition is stale", "patch_precondition_failed");
    }
  }
}
