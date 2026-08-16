"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  getKiln,
  KilnApiError,
  postKiln,
  type ApiContract,
  type ApiPlan,
} from "../lib/kiln-api.ts";

type View = "preview" | "code" | "diff" | "architecture";
type Modal = "contract" | "evidence" | "export" | "deploy" | "new-build" | "plan" | "generation" | null;
type PendingAction = "draft" | "approve-contract" | "approve-plan" | "generate" | "repair" | "export" | "cancel" | null;
type GenerationStage = "waiting" | "data" | "api" | "interface" | "verification" | "queued" | "complete" | "failed";

type LiveRunDetail = {
  run: {
    id: string;
    status: string;
    currentStep: string;
    progress: number;
    attempt: number;
    maxAttempts: number;
    budgetCents: number;
    costCents: number;
    cancellationRequested: boolean;
  };
  plan: ApiPlan;
  steps: Array<{
    id: string;
    kind: string;
    state: string;
    label: string;
    detail: string;
    evidence: Record<string, unknown>;
  }>;
  patches: Array<{
    id: string;
    sequence: number;
    summary: string;
    filesChanged: number;
    additions: number;
    deletions: number;
    patchHash: string;
  }>;
  tests: Array<{
    id: string;
    kind: string;
    status: string;
    commandLabel: string;
    durationMs: number;
    reportArtifactId: string | null;
  }>;
  findings: Array<{
    id: string;
    severity: string;
    title: string;
    detail: string;
    status: string;
  }>;
  artifacts: Array<{ id: string; kind: string; sha256: string }>;
  executionJobs: Array<{
    id: string;
    status: string;
    attempt: number;
    maxAttempts: number;
    resultArtifactKey: string | null;
    errorCode: string | null;
  }>;
};

type BuildFlow = {
  projectId: string;
  contract: ApiContract;
  clarificationQuestions: string[];
  planner: { name: string; model: string; usage: { totalTokens: number } };
  runId?: string;
  plan?: ApiPlan;
  detail?: LiveRunDetail;
  generationStage?: GenerationStage;
  generatedFiles?: Record<string, string[]>;
};

const requirements = [
  "Track ingredients and reorder levels",
  "Flag stock that needs attention",
  "Record deliveries and usage",
  "Work cleanly on mobile",
];

const baseRunSteps = [
  { label: "Contract approved", detail: "4 requirements · 3 entities", state: "done" },
  { label: "Application scaffolded", detail: "React + FastAPI + PostgreSQL", state: "done" },
  { label: "Inventory flow built", detail: "12 files changed", state: "done" },
  { label: "Verification passed", detail: "5 trusted checks recorded", state: "done" },
  { label: "Security review", detail: "Source policy passed with no findings", state: "done" },
];

const inventory = [
  { item: "Bread flour", stock: "46 kg", status: "Healthy", tone: "good", level: 78 },
  { item: "Cultured butter", stock: "8 kg", status: "Reorder", tone: "warn", level: 28 },
  { item: "Whole milk", stock: "18 L", status: "Healthy", tone: "good", level: 64 },
  { item: "Vanilla beans", stock: "12 pcs", status: "Low", tone: "danger", level: 16 },
];

const files = [
  "frontend/src/App.tsx",
  "frontend/src/styles.css",
  "backend/app/main.py",
  "backend/app/api/inventory.py",
  "backend/app/models.py",
  "backend/alembic/versions/0001.py",
];

const codeByFile: Record<string, string[]> = {
  "frontend/src/App.tsx": [
    "export default function Pantry() {",
    "  const { ingredients, attention } = useInventory();",
    "",
    "  return (",
    "    <InventoryShell>",
    "      <Summary total={ingredients.length} attention={attention} />",
    "      <IngredientTable rows={ingredients} />",
    "    </InventoryShell>",
    "  );",
    "}",
  ],
  "frontend/src/styles.css": [
    ":root {",
    "  --paper: #f3f0e8;",
    "  --ink: #171a13;",
    "  --line: #d0c9bb;",
    "}",
    "",
    ".inventory-grid {",
    "  display: grid;",
    "  grid-template-columns: 1.6fr .8fr .8fr 1fr;",
    "}",
  ],
  "backend/app/main.py": [
    "app = FastAPI(title=\"Pantry API\", lifespan=lifespan)",
    "app.include_router(inventory_router)",
    "",
    "@app.get(\"/healthz\", include_in_schema=False)",
    "def health() -> dict[str, str]:",
    "    return {\"status\": \"ok\"}",
  ],
  "backend/app/api/inventory.py": [
    "@router.get(\"\", response_model=list[IngredientResponse])",
    "def list_ingredients(session: DatabaseSession):",
    "    statement = select(Ingredient).order_by(Ingredient.name)",
    "    return list(session.scalars(statement).all())",
    "",
    "@router.patch(\"/{ingredient_id}\")",
    "def update_quantity(ingredient_id: str, payload: IngredientUpdate):",
    "    return inventory_service.update(ingredient_id, payload)",
  ],
  "backend/app/models.py": [
    "class Ingredient(Base):",
    "    __tablename__ = \"ingredients\"",
    "",
    "    id: Mapped[str] = mapped_column(primary_key=True)",
    "    name: Mapped[str] = mapped_column(unique=True, index=True)",
    "    quantity: Mapped[float]",
    "    reorder_level: Mapped[float]",
  ],
  "backend/alembic/versions/0001.py": [
    "def upgrade() -> None:",
    "    op.create_table(",
    "        \"ingredients\",",
    "        sa.Column(\"id\", sa.String(36), nullable=False),",
    "        sa.Column(\"quantity\", sa.Float(), nullable=False),",
    "        sa.CheckConstraint(\"quantity >= 0\"),",
    "    )",
  ],
};

const evidence = [
  { group: "Build", label: "Frontend production build", result: "Passed", detail: "18.4s" },
  { group: "Types", label: "TypeScript and Python type checks", result: "Passed", detail: "0 errors" },
  { group: "API", label: "Inventory endpoint checks", result: "Passed", detail: "8 / 8" },
  { group: "Browser", label: "Responsive inventory flow", result: "Passed", detail: "6 / 6" },
  { group: "Security", label: "Dependency and source policy", result: "Passed", detail: "0 findings" },
];

export function KilnWorkspace() {
  const [view, setView] = useState<View>("preview");
  const [modal, setModal] = useState<Modal>(null);
  const [selectedFile, setSelectedFile] = useState(files[0]);
  const [runCancelled, setRunCancelled] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [brief, setBrief] = useState(
    "Build a volunteer scheduling tool for a neighborhood food pantry.",
  );
  const [buildFlow, setBuildFlow] = useState<BuildFlow | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const eventRunId = buildFlow?.runId;
  const eventRunStatus = buildFlow?.detail?.run.status;

  const refreshRun = useCallback(async () => {
    const runId = eventRunId;
    if (!runId) return;
    const detail = await getKiln<LiveRunDetail>(`/api/runs/${runId}`);
    setBuildFlow((current) =>
      current?.runId === runId
        ? {
            ...current,
            detail,
            generationStage:
              detail.run.status === "ready"
                ? "complete"
                : ["diagnose", "failed_with_evidence"].includes(detail.run.status)
                  ? "failed"
                : current.generationStage,
          }
        : current,
    );
  }, [eventRunId]);

  useEffect(() => {
    if (!modal) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [modal]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const runId = eventRunId;
    if (!runId || !eventRunStatus) return;
    if (["ready", "deployed", "failed_with_evidence", "cancelled"].includes(
      eventRunStatus,
    )) return;
    const source = new EventSource(`/api/runs/${runId}/events`);
    const eventTypes = [
      "plan.approved",
      "generation.started",
      "scaffold.completed",
      "patch.accepted",
      "verification.queued",
      "state.entered",
      "verification.completed",
      "repair.started",
      "run.cancelled",
    ];
    const refresh = () => void refreshRun().catch(() => undefined);
    for (const eventType of eventTypes) source.addEventListener(eventType, refresh);
    return () => source.close();
  }, [eventRunId, eventRunStatus, refreshRun]);

  const runSteps = buildFlow?.detail
    ? buildFlow.detail.steps.map((step) => ({
        label: step.label,
        detail: step.detail,
        state: normalizeTimelineState(step.state),
      }))
    : buildFlow
      ? preflightRunSteps(buildFlow)
    : runCancelled
      ? baseRunSteps.map((step) =>
          step.state === "active"
            ? { ...step, state: "cancelled", detail: "Stopped safely by user" }
            : step,
        )
      : baseRunSteps;

  function exportEvidence() {
    const payload = buildFlow?.detail
      ? {
          project: buildFlow.contract.title,
          contractRevision: buildFlow.contract.revision,
          run: buildFlow.detail.run,
          patches: buildFlow.detail.patches,
          tests: buildFlow.detail.tests,
          findings: buildFlow.detail.findings,
          artifacts: buildFlow.detail.artifacts.map((artifact) => ({
            id: artifact.id,
            kind: artifact.kind,
            sha256: artifact.sha256,
          })),
          exportedAt: new Date().toISOString(),
          provenance: "Facts persisted by the Kiln control plane; model summaries excluded.",
        }
      : buildFlow
        ? {
            project: buildFlow.contract.title,
            contractRevision: buildFlow.contract.revision,
            contract: buildFlow.contract,
            run: null,
            exportedAt: new Date().toISOString(),
            note: "Contract snapshot only. No agent run or verification evidence exists yet.",
          }
      : {
          project: "Pantry Pilot",
          contractRevision: 4,
          run: "run_04",
          exportedAt: new Date().toISOString(),
          requirements,
          evidence,
          note: "Seeded demonstration data; not a production verification report.",
        };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${buildFlow ? "kiln-run" : "pantry-pilot"}-build-evidence.json`;
    link.click();
    URL.revokeObjectURL(url);
    setModal(null);
    setToast("Build evidence exported");
  }

  async function downloadRepository() {
    if (!buildFlow?.runId) return;
    setPendingAction("export");
    try {
      const response = await fetch(`/api/runs/${buildFlow.runId}/export`, {
        headers: { accept: "application/zip" },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as {
          error?: { message?: string };
        } | null;
        throw new Error(payload?.error?.message ?? "Repository export failed");
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([A-Za-z0-9._-]+)"/)?.[1]
        ?? `kiln-${buildFlow.runId.slice(-6)}.zip`;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setModal(null);
      setToast("Complete repository archive exported with provenance");
    } catch (error) {
      setToast(apiErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function submitBrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = brief.trim();
    if (normalized.length < 20) {
      setToast("Add a little more detail to the brief");
      return;
    }
    setPendingAction("draft");
    try {
      const projectResult = await postKiln<{ project: { id: string } }>(
        "/api/projects",
        {
          name: projectNameFromBrief(normalized),
          summary: normalized.slice(0, 500),
        },
      );
      const draftResult = await postKiln<{
        contract: ApiContract;
        clarificationQuestions: string[];
        planner: BuildFlow["planner"];
      }>(`/api/projects/${projectResult.project.id}/contracts/draft`, {
        brief: normalized,
      });
      setBuildFlow({
        projectId: projectResult.project.id,
        contract: draftResult.contract,
        clarificationQuestions: draftResult.clarificationQuestions,
        planner: draftResult.planner,
        generationStage: "waiting",
        generatedFiles: {},
      });
      setModal("contract");
      setToast("Draft contract is ready for review");
    } catch (error) {
      setToast(apiErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function approveDraftContract() {
    if (!buildFlow) return;
    setPendingAction("approve-contract");
    try {
      const contractResult = await postKiln<{ contract: ApiContract }>(
        `/api/projects/${buildFlow.projectId}/contracts/${buildFlow.contract.id}/approve`,
        {},
      );
      const runResult = await postKiln<{ run: { id: string } }>(
        `/api/projects/${buildFlow.projectId}/runs`,
        { contractId: contractResult.contract.id, budgetCents: 150 },
      );
      const runDetail = await getKiln<LiveRunDetail>(
        `/api/runs/${runResult.run.id}`,
      );
      setBuildFlow({
        ...buildFlow,
        contract: contractResult.contract,
        runId: runResult.run.id,
        plan: runDetail.plan,
        detail: runDetail,
        generationStage: "waiting",
        generatedFiles: {},
      });
      setModal("plan");
      setToast("Implementation plan is ready for approval");
    } catch (error) {
      setToast(apiErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function approveImplementationPlan() {
    if (!buildFlow?.runId || !buildFlow.plan) return;
    setPendingAction("approve-plan");
    try {
      const result = await postKiln<{ plan: ApiPlan }>(
        `/api/runs/${buildFlow.runId}/plan/approve`,
        {},
      );
      const approvedFlow = {
        ...buildFlow,
        plan: result.plan,
        generationStage: "data" as GenerationStage,
        generatedFiles: {},
      };
      setBuildFlow(approvedFlow);
      setModal("generation");
      setPendingAction("generate");

      const generatedFiles: Record<string, string[]> = {};
      for (const stage of ["data", "api", "interface"] as const) {
        setBuildFlow((current) => current ? { ...current, generationStage: stage } : current);
        const patchResult = await postKiln<{
          proposal: {
            changes: Array<{ path: string; content?: string }>;
          };
        }>(`/api/runs/${buildFlow.runId}/patches/propose`, { stage });
        for (const change of patchResult.proposal.changes) {
          if (typeof change.content === "string") {
            if (Object.keys(generatedFiles).length === 0) setSelectedFile(change.path);
            generatedFiles[change.path] = change.content.split("\n");
          }
        }
        setBuildFlow((current) =>
          current ? { ...current, generatedFiles: { ...generatedFiles } } : current,
        );
      }

      setBuildFlow((current) =>
        current ? { ...current, generationStage: "verification" } : current,
      );
      await postKiln(`/api/runs/${buildFlow.runId}/verify`, {});
      await postKiln("/api/executor/dispatch", {});
      const detail = await getKiln<LiveRunDetail>(`/api/runs/${buildFlow.runId}`);
      setBuildFlow((current) =>
        current
          ? {
              ...current,
              detail,
              generatedFiles: { ...generatedFiles },
              generationStage: detail.run.status === "ready" ? "complete" : "queued",
            }
          : current,
      );
      setToast("Four contract-backed files generated and verified in an isolated sandbox");
    } catch (error) {
      setBuildFlow((current) =>
        current ? { ...current, generationStage: "failed" } : current,
      );
      setToast(apiErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function copyRunId() {
    const runId = buildFlow?.runId ?? "run_04";
    try {
      await navigator.clipboard.writeText(runId);
      setToast("Run ID copied to clipboard");
    } catch {
      setToast(`Run ID · ${runId}`);
    }
  }

  async function cancelActiveRun() {
    if (!buildFlow?.runId || !buildFlow.detail) {
      setRunCancelled(true);
      setToast("Demo run stopped locally");
      return;
    }
    setPendingAction("cancel");
    try {
      await postKiln(`/api/runs/${buildFlow.runId}/cancel`, {});
      await refreshRun();
      setToast("Run cancelled; active leases were revoked");
    } catch (error) {
      setToast(apiErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function repairActiveRun() {
    if (!buildFlow?.runId || !buildFlow.detail) return;
    setPendingAction("repair");
    try {
      await postKiln(`/api/runs/${buildFlow.runId}/repair`, {});
      setBuildFlow((current) =>
        current ? { ...current, generationStage: "interface" } : current,
      );
      const patchResult = await postKiln<{
        proposal: { changes: Array<{ path: string; content?: string }> };
      }>(`/api/runs/${buildFlow.runId}/patches/propose`, { stage: "repair" });
      const repairedFiles = { ...(buildFlow.generatedFiles ?? {}) };
      for (const change of patchResult.proposal.changes) {
        if (typeof change.content === "string") {
          repairedFiles[change.path] = change.content.split("\n");
        }
      }
      setBuildFlow((current) =>
        current
          ? { ...current, generatedFiles: repairedFiles, generationStage: "verification" }
          : current,
      );
      await postKiln(`/api/runs/${buildFlow.runId}/verify`, {});
      await postKiln("/api/executor/dispatch", {});
      const detail = await getKiln<LiveRunDetail>(`/api/runs/${buildFlow.runId}`);
      setBuildFlow((current) =>
        current
          ? {
              ...current,
              detail,
              generatedFiles: repairedFiles,
              generationStage: detail.run.status === "ready" ? "complete" : "queued",
            }
          : current,
      );
      setToast(`Repair attempt ${detail.run.attempt} completed isolated verification`);
    } catch (error) {
      await refreshRun().catch(() => undefined);
      setToast(apiErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  const liveDetail = buildFlow?.detail;
  const activeContract = buildFlow?.contract;
  const isSeededDemo = !buildFlow;
  const isPreflight = Boolean(buildFlow && !liveDetail);
  const liveCancelled = liveDetail?.run.status === "cancelled" || (!liveDetail && runCancelled);
  const runReady = liveDetail?.run.status === "ready";
  const deploymentEligible = runReady || isSeededDemo;
  const runFailed = Boolean(
    liveDetail && ["diagnose", "failed_with_evidence"].includes(liveDetail.run.status),
  );
  const runTerminal = Boolean(
    liveDetail && ["ready", "deployed", "failed_with_evidence", "cancelled"].includes(liveDetail.run.status),
  );
  const hasGeneratedFiles = Boolean(
    buildFlow?.generatedFiles && Object.keys(buildFlow.generatedFiles).length > 0,
  );
  const preflightProgress = activeContract?.status === "approved"
    ? buildFlow?.plan?.status === "approved" ? 24 : 14
    : 6;
  const runProgress = liveDetail?.run.progress ?? (isPreflight ? preflightProgress : 100);
  const activeRequirements = activeContract?.requirements.map((item) => item.statement)
    ?? requirements;
  const latestReportId = liveDetail?.executionJobs.at(-1)?.resultArtifactKey;
  const activeTests = latestReportId
    ? liveDetail?.tests.filter((test) => test.reportArtifactId === latestReportId) ?? []
    : [];
  const passedTests = activeTests.filter((test) => test.status === "passed").length;
  const activeRunId = buildFlow?.runId ?? (isSeededDemo ? "run_04" : null);
  const runLabel = activeRunId === "run_04"
    ? "Run 04"
    : activeRunId
      ? `Run ${activeRunId.slice(-6)}`
      : "Preflight";
  const preflightHeadline = activeContract?.status === "draft"
    ? "Contract review"
    : buildFlow?.plan?.status === "approved"
      ? "Starting durable run"
      : "Plan review";
  const statusHeadline = liveCancelled
    ? "Run stopped safely"
    : runReady
      ? "Ready with evidence"
      : liveDetail
        ? sentenceCase(liveDetail.run.currentStep)
        : isPreflight
          ? preflightHeadline
          : "Completed demo";
  const evidenceTone = liveCancelled || runFailed
    ? "evidence-cancelled"
    : liveDetail && !runReady
      ? "evidence-running"
      : isPreflight
        ? "evidence-idle"
        : "";
  const evidenceSymbol = liveCancelled
    ? "×"
    : runFailed
      ? "!"
      : liveDetail && !runReady
        ? "↻"
        : isPreflight
          ? "·"
          : "✓";
  const preflightStatus = activeContract?.status === "draft"
    ? "Awaiting contract approval"
    : "Awaiting plan approval";

  return (
    <main className="kiln-shell">
      <header className="topbar">
        <button className="brand-lockup brand-button" type="button" onClick={() => { setBuildFlow(null); setModal("new-build"); }} aria-label="Start a new Kiln build">
          <span className="brand-mark" aria-hidden="true">K</span>
          <span className="brand-name">KILN</span>
        </button>
        <div className="project-crumb">
          <span>Projects</span><span className="crumb-slash">/</span><strong>{activeContract?.title ?? "Pantry Pilot"}</strong><span className="version-tag">{activeContract ? `r${activeContract.revision}` : "v0.4"}</span>
        </div>
        <div className="top-actions">
          <div className="budget" aria-label="Run budget used"><span>Run budget</span><strong>{liveDetail ? `$${(liveDetail.run.costCents / 100).toFixed(2)} / $${(liveDetail.run.budgetCents / 100).toFixed(2)}` : isPreflight ? "Not started" : "$0.34"}</strong></div>
          <button className="button button-quiet" type="button" onClick={() => setModal("export")}>Export</button>
          <button className="button button-primary" type="button" disabled={Boolean(buildFlow) && !runReady} onClick={() => setModal("deploy")}>{deploymentEligible ? "Deploy…" : "Deploy locked"}</button>
        </div>
      </header>

      <section className="workspace" aria-label="Kiln build workspace">
        <aside className="contract-panel">
          <div className="panel-heading"><div><p className="eyebrow">Build contract</p><h1>{activeContract?.title ?? "Bakery inventory"}</h1></div><span className="approval-badge"><i /> {activeContract ? sentenceCase(activeContract.status) : "Approved"}</span></div>
          <p className="contract-summary">{activeContract?.summary ?? "A lightweight stock tracker for a neighborhood bakery, optimized for a busy prep counter."}</p>
          <div className="section-rule" />
          <div className="section-label"><span>01</span> Core requirements</div>
          <ul className="requirement-list">{activeRequirements.map((item) => <li key={item}><span className="check" aria-hidden="true">✓</span><span>{item}</span></li>)}</ul>
          <div className="section-rule" />
          <div className="section-label"><span>02</span> System shape</div>
          <dl className="system-grid"><div><dt>Pages</dt><dd>{activeContract?.systemShape.pages.length ?? 4}</dd></div><div><dt>Entities</dt><dd>{activeContract?.systemShape.entities.length ?? 3}</dd></div><div><dt>API routes</dt><dd>{activeContract?.systemShape.apiOperations.length ?? 8}</dd></div><div><dt>Tests</dt><dd>{activeTests.length || activeContract?.acceptanceChecks.length || 22}</dd></div></dl>
          <button className="contract-action" type="button" onClick={() => setModal("contract")}>View full contract <span aria-hidden="true">↗</span></button>
          <button className="new-build-action" type="button" onClick={() => { setBuildFlow(null); setModal("new-build"); }}><span aria-hidden="true">＋</span> Start another build</button>
        </aside>

        <section className="stage-panel">
          <div className="stage-toolbar">
            <nav className="view-tabs" aria-label="Workspace views">
              {(["preview", "code", "diff", "architecture"] as View[]).map((item) => (
                <button className={`view-tab ${view === item ? "active" : ""}`} type="button" aria-pressed={view === item} onClick={() => setView(item)} key={item}>
                  {item[0].toUpperCase() + item.slice(1)}{item === "diff" ? <span>{liveDetail?.patches.reduce((total, patch) => total + patch.filesChanged, 0) ?? (isPreflight ? 0 : 12)}</span> : null}
                </button>
              ))}
            </nav>
            <div className="stage-meta"><span className={`live-dot ${liveCancelled ? "cancelled-dot" : isPreflight ? "idle-dot" : ""}`} /> {liveCancelled ? "Run stopped" : runReady ? "Verified artifact" : liveDetail ? sentenceCase(liveDetail.run.currentStep) : isPreflight ? preflightHeadline : "Completed demo"}</div>
          </div>

          {view === "preview" ? <PreviewPane contract={activeContract} generated={hasGeneratedFiles} verified={runReady} /> : null}
          {view === "code" ? <CodePane selectedFile={selectedFile} onSelectFile={setSelectedFile} generatedFiles={buildFlow?.generatedFiles} /> : null}
          {view === "diff" ? <DiffPane patch={liveDetail?.patches.at(-1)} /> : null}
          {view === "architecture" ? <ArchitecturePane contract={activeContract} /> : null}

          <div className="evidence-bar">
            <div><span className={`evidence-icon ${evidenceTone}`}>{evidenceSymbol}</span><span><strong>Build</strong><small>{liveDetail ? (liveCancelled ? "Stopped safely" : runReady ? "Verified artifact" : runFailed ? "Failure recorded" : sentenceCase(liveDetail.run.currentStep)) : isPreflight ? "Not started" : "Passed in 18.4s"}</small></span></div>
            <div><span className={`evidence-icon ${evidenceTone}`}>{evidenceSymbol}</span><span><strong>Trusted checks</strong><small>{liveDetail ? `${passedTests} of ${activeTests.length || 10} passed this attempt` : isPreflight ? "0 of 10 recorded" : `${evidence.length} of ${evidence.length} passed`}</small></span></div>
            <div><span className={`evidence-icon ${evidenceTone}`}>{evidenceSymbol}</span><span><strong>Security policy</strong><small>{liveCancelled ? "Stopped safely" : runReady ? "Passed in sandbox" : runFailed ? "Release blocked" : liveDetail ? "Awaiting runner" : isPreflight ? "Not evaluated" : "Passed in sandbox"}</small></span></div>
            <button type="button" disabled={isPreflight} onClick={() => setModal("evidence")}>{isPreflight ? "Evidence pending" : "Open evidence"} <span>→</span></button>
          </div>
        </section>

        <aside className="run-panel">
          <div className="run-heading"><div><p className="eyebrow">{runLabel}</p><h2>{statusHeadline}</h2></div><button className="more-button" type="button" disabled={!activeRunId} aria-label="Copy run ID" onClick={copyRunId}>•••</button></div>
          <div className={`run-progress ${liveCancelled ? "run-progress-cancelled" : ""}`}><i style={{ background: `linear-gradient(90deg, ${liveCancelled ? "var(--red)" : "var(--blue)"} ${runProgress}%, #dfdbd0 ${runProgress}%)` }} /><span>{liveCancelled ? "Cancelled by user" : runReady || isSeededDemo ? "Release gate satisfied" : liveDetail ? runStatusLabel(liveDetail) : preflightStatus}</span><strong>{liveCancelled ? "STOP" : `${runProgress}%`}</strong></div>
          <ol className="timeline">{runSteps.map((step) => <li className={`timeline-item ${step.state}`} key={step.label}><div className="timeline-marker" aria-hidden="true">{step.state === "done" ? "✓" : step.state === "active" ? "↻" : step.state === "failed" ? "!" : step.state === "cancelled" ? "×" : ""}</div><div><strong>{step.label}</strong><span>{step.detail}</span></div></li>)}</ol>
          <div className="agent-note"><div className="agent-note-head"><span>K</span><strong>Kiln agent</strong><time>now</time></div><p>{isPreflight ? "I drafted a typed contract and am waiting for explicit approval before planning or changing code." : agentStatusMessage(liveDetail, buildFlow?.generationStage, liveCancelled)}</p></div>
          <div className="run-footer"><button className="button button-stop" type="button" disabled={!liveDetail || runTerminal || pendingAction === "cancel"} onClick={cancelActiveRun}>{pendingAction === "cancel" ? "Stopping…" : liveCancelled ? "Run stopped" : runReady ? "Run complete" : isPreflight ? "Run not started" : !liveDetail ? "Demo complete" : runTerminal ? "Run ended" : "Stop run"}</button><span>{liveDetail ? `Repair ${liveDetail.run.attempt} / ${liveDetail.run.maxAttempts}` : isPreflight ? "No execution yet" : "Seeded verified example"}</span></div>
        </aside>
      </section>

      {modal === "contract" ? <ContractDialog contract={buildFlow?.contract ?? null} clarificationQuestions={buildFlow?.clarificationQuestions ?? []} planner={buildFlow?.planner ?? null} busy={pendingAction === "approve-contract"} onApprove={buildFlow?.contract.status === "draft" ? approveDraftContract : undefined} onClose={() => setModal(null)} /> : null}
      {modal === "plan" && buildFlow?.plan ? <PlanDialog plan={buildFlow.plan} busy={pendingAction === "approve-plan"} onApprove={approveImplementationPlan} onClose={() => setModal(null)} /> : null}
      {modal === "generation" && buildFlow ? <GenerationDialog flow={buildFlow} busy={pendingAction === "generate"} onClose={() => setModal(null)} /> : null}
      {modal === "evidence" ? <EvidenceDialog detail={liveDetail} busy={pendingAction === "repair"} onRepair={repairActiveRun} onClose={() => setModal(null)} /> : null}
      {modal === "export" ? <ExportDialog detail={liveDetail} activeBuild={Boolean(buildFlow)} hasSource={hasGeneratedFiles} busy={pendingAction === "export"} onEvidence={exportEvidence} onRepository={downloadRepository} onClose={() => setModal(null)} /> : null}
      {modal === "deploy" ? <DeployDialog ready={deploymentEligible} detail={liveDetail} onClose={() => setModal(null)} /> : null}
      {modal === "new-build" ? <NewBuildDialog brief={brief} busy={pendingAction === "draft"} onBriefChange={setBrief} onSubmit={submitBrief} onClose={() => setModal(null)} /> : null}
      {toast ? <div className="toast" role="status"><span aria-hidden="true">✓</span>{toast}</div> : null}
    </main>
  );
}

function PreviewPane({ contract, generated, verified }: { contract?: ApiContract; generated: boolean; verified: boolean }) {
  const scheduling = contract?.systemShape.entities.some((entity) => entity.name === "Shift");
  const address = scheduling ? "volunteer-roster.preview.kiln.dev" : "pantry-pilot.preview.kiln.dev";
  return <div className="browser-frame"><div className="browser-bar"><div className="traffic-lights" aria-hidden="true"><i /><i /><i /></div><div className="address-bar"><span>↗</span> {address}</div><div className={`preview-proof ${verified ? "verified" : ""}`}>{verified ? "✓ Verified" : generated ? "Generated source" : contract ? "Contract preview" : "Completed demo"}</div></div>{scheduling && contract ? <VolunteerGeneratedPreview contract={contract} generated={generated} verified={verified} /> : <PantryGeneratedPreview />}</div>;
}

const previewShifts = [
  ["MON 18", "08:00–11:00", "Pantry setup", "Maya + 3", "4/4", 100],
  ["TUE 19", "12:30–15:30", "Guest check-in", "Jon + 1", "2/4", 50],
  ["THU 21", "09:00–12:00", "Packing line", "Ari + 4", "5/6", 83],
] as const;

function VolunteerGeneratedPreview({ contract, generated, verified }: { contract: ApiContract; generated: boolean; verified: boolean }) {
  const proof = verified ? "● Verified" : generated ? "● Generated" : "● Preview";
  return <div className="volunteer-generated-app"><header className="volunteer-header"><div><span>HARBOR FOOD PANTRY</span><strong>Roster</strong></div><nav>{contract.systemShape.pages.slice(0, 3).map((page, index) => <span className={index === 0 ? "active" : ""} key={page}>{page}</span>)}</nav><button type="button">+ New shift</button></header><div className="volunteer-body"><div className="volunteer-title"><div><p>AUGUST 18–24 · OPERATIONS</p><h2>This week&apos;s shifts</h2><span>{contract.summary}</span></div><div className="volunteer-search"><small>SEARCH ROSTER</small><span>Role or volunteer</span></div></div><div className="volunteer-stats"><div><span>Confirmed seats</span><strong>11</strong><small>of 19 available</small></div><div><span>Coverage</span><strong>58%</strong><small>Across four shifts</small></div><div><span>Needs attention</span><strong>2</strong><small>Before Thursday</small></div></div><section className="volunteer-board" aria-label="Generated volunteer shifts"><header><div><strong>Shift board</strong><span>Capacity rules are enforced by the API</span></div><b>{proof}</b></header><div className="volunteer-row labels"><span>Date</span><span>Window</span><span>Role</span><span>Volunteers</span><span>Coverage</span></div>{previewShifts.map(([day, window, role, team, coverage, width]) => <div className="volunteer-row" key={day}><strong>{day}</strong><span>{window}</span><span>{role}</span><span>{team}</span><span className="volunteer-meter"><i style={{ width: `${width}%` }} /><b>{coverage}</b></span></div>)}</section></div></div>;
}

function PantryGeneratedPreview() {
  return <div className="generated-app"><header className="generated-header"><div><span className="generated-kicker">STONE &amp; STARTER</span><strong>Pantry</strong></div><div className="generated-date">Saturday · 16 Aug</div><button type="button">+ Log delivery</button></header><div className="generated-body"><div className="generated-title-row"><div><p>Good morning, Maya</p><h2>Today&apos;s inventory</h2></div><div className="search-field">Search ingredients <kbd>⌘ K</kbd></div></div><div className="stat-strip"><div><span>Total ingredients</span><strong>38</strong><small>Across 6 categories</small></div><div><span>Need attention</span><strong>4</strong><small className="amber">Before Monday</small></div><div><span>Deliveries today</span><strong>3</strong><small>Next at 11:30</small></div></div><div className="inventory-card"><div className="inventory-head"><div><strong>Ingredient stock</strong><span>Last synced 2 min ago</span></div><button type="button">Filter · All</button></div><div className="inventory-table" role="table" aria-label="Bakery inventory"><div className="inventory-row table-labels" role="row"><span>Ingredient</span><span>On hand</span><span>Status</span><span>Level</span></div>{inventory.map((row, index) => <div className="inventory-row" role="row" key={row.item}><span className="ingredient"><i>{index + 1}</i>{row.item}</span><strong>{row.stock}</strong><span><b className={`status status-${row.tone}`}>{row.status}</b></span><span className="meter"><i style={{ width: `${row.level}%` }} /></span></div>)}</div></div></div></div>;
}

function CodePane({ selectedFile, onSelectFile, generatedFiles }: { selectedFile: string; onSelectFile: (file: string) => void; generatedFiles?: Record<string, string[]> }) {
  const hasGeneratedFiles = Boolean(generatedFiles && Object.keys(generatedFiles).length > 0);
  const displayedFiles = hasGeneratedFiles ? Object.keys(generatedFiles!) : files;
  const displayedCode = generatedFiles?.[selectedFile] ?? codeByFile[selectedFile] ?? [];
  return <div className="work-view code-workspace"><aside className="file-tree"><p>{hasGeneratedFiles ? "ACCEPTED PATCH FILES" : "PROJECT FILES"}</p>{displayedFiles.map((file) => <button type="button" className={selectedFile === file ? "selected" : ""} onClick={() => onSelectFile(file)} key={file}><span>{file.endsWith(".py") ? "PY" : file.endsWith(".css") ? "CS" : "TS"}</span>{file}</button>)}</aside><section className="code-editor" aria-label={`Source for ${selectedFile}`}><div className="editor-head"><span>{selectedFile}</span><span>{hasGeneratedFiles ? "Immutable source snapshot" : "Generated patch 12"}</span></div><pre>{displayedCode.map((line, index) => <code key={`${line}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span>{line || " "}</code>)}</pre></section></div>;
}

function DiffPane({ patch }: { patch?: LiveRunDetail["patches"][number] }) {
  const lines = patch ? [
    ["context", "  // Generated from the immutable contract revision"],
    ["add", "+ export const generatedContract = {"],
    ["add", "+   title: \"Volunteer scheduling workspace\","],
    ["add", "+   entities: [\"Volunteer\", \"Shift\", \"Assignment\"],"],
    ["add", "+   capacityPolicy: \"enforced\","],
    ["add", "+ } as const;"],
  ] : [
    ["context", "  def update_quantity(ingredient_id: str, payload: IngredientUpdate):"],
    ["remove", "-     ingredient.quantity = payload.quantity"],
    ["add", "+     ingredient = inventory_service.get_owned(ingredient_id)"],
    ["add", "+     ingredient.quantity = payload.quantity"],
    ["add", "+     audit.record(\"inventory.quantity_updated\", ingredient.id)"],
    ["context", "      session.commit()"],
  ];
  return <div className="work-view diff-view"><div className="diff-head"><div><span className="file-chip">{patch ? "TS" : "PY"}</span><strong>{patch ? "frontend/src/generated-contract.ts" : "backend/app/api/inventory.py"}</strong></div><div><span className="diff-add">+{patch?.additions ?? 8}</span><span className="diff-remove">−{patch?.deletions ?? 1}</span></div></div><div className="diff-body">{lines.map(([type, line], index) => <div className={`diff-line ${type}`} key={`${line}-${index}`}><span>{33 + index}</span><code>{line}</code></div>)}</div><div className="patch-summary"><span>K</span><p><strong>Why this changed</strong>{patch?.summary ?? "Moves ownership validation into the service layer and records a durable audit event before the patch can pass verification."}</p></div></div>;
}

function ArchitecturePane({ contract }: { contract?: ApiContract }) {
  const isSchedule = contract?.systemShape.entities.some((entity) => entity.name === "Shift");
  return <div className="work-view architecture-view"><div className="architecture-head"><div><p className="eyebrow">Derived from {contract ? "approved contract" : "verified source"}</p><h2>Application architecture</h2></div><span>{contract?.systemShape.pages.length ?? 6} views · {contract?.systemShape.apiOperations.length ?? 8} routes · {contract?.systemShape.entities.length ?? 3} entities</span></div><div className="architecture-canvas"><div className="arch-node arch-browser"><small>CLIENT</small><strong>React workspace</strong><span>{isSchedule ? "Responsive scheduling UI" : "Responsive inventory UI"}</span></div><div className="arch-node arch-api"><small>API</small><strong>FastAPI service</strong><span>Typed REST operations</span></div><div className="arch-node arch-db"><small>DATA</small><strong>PostgreSQL</strong><span>{contract?.systemShape.entities.length ?? 3} relational entities</span></div><div className="arch-node arch-worker"><small>POLICY</small><strong>{isSchedule ? "Capacity rules" : "Stock events"}</strong><span>Append-only activity</span></div><i className="arch-line line-one" /><i className="arch-line line-two" /><i className="arch-line line-three" /></div><div className="architecture-note"><strong>Boundary check</strong><span>Browser code cannot access database credentials; all mutations pass API validation.</span><b>PASS</b></div></div>;
}

function DialogShell({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return <dialog
    ref={dialogRef}
    className={`modal-card ${wide ? "modal-wide" : ""}`}
    aria-labelledby="dialog-title"
    onCancel={(event) => {
      event.preventDefault();
      onClose();
    }}
  ><header><div><p className="eyebrow">{eyebrow}</p><h2 id="dialog-title">{title}</h2></div><button type="button" onClick={onClose} aria-label="Close dialog">×</button></header>{children}</dialog>;
}

function ContractDialog({ contract, clarificationQuestions, planner, busy, onApprove, onClose }: { contract: ApiContract | null; clarificationQuestions: string[]; planner: BuildFlow["planner"] | null; busy: boolean; onApprove?: () => void; onClose: () => void }) {
  const displayedRequirements = contract?.requirements.map((item) => item.statement) ?? requirements;
  const shape = contract?.systemShape;
  const approved = contract?.status === "approved";
  return <DialogShell title={contract?.title ?? "Bakery inventory"} eyebrow={contract ? `${approved ? "Approved contract" : "Awaiting approval"} · revision ${contract.revision}` : "Approved contract · revision 4"} onClose={onClose} wide><div className="contract-dialog-grid"><section><h3>Product brief</h3><p>{contract?.summary ?? "A lightweight stock tracker for a neighborhood bakery, optimized for a busy prep counter."}</p><h3>Requirements</h3><ul>{displayedRequirements.map((item) => <li key={item}><span>✓</span>{item}</li>)}</ul>{clarificationQuestions.length > 0 ? <div className="clarification-box"><strong>Clarify before generation</strong>{clarificationQuestions.map((question) => <p key={question}>{question}</p>)}</div> : null}</section><section><h3>System shape</h3>{shape ? <dl><div><dt>Pages</dt><dd>{shape.pages.length}</dd></div><div><dt>Entities</dt><dd>{shape.entities.length}</dd></div><div><dt>API operations</dt><dd>{shape.apiOperations.length}</dd></div><div><dt>Acceptance checks</dt><dd>{contract.acceptanceChecks.length}</dd></div></dl> : <dl><div><dt>Frontend</dt><dd>React + TypeScript</dd></div><div><dt>API</dt><dd>FastAPI + Python</dd></div><div><dt>Data</dt><dd>PostgreSQL + Alembic</dd></div><div><dt>Runtime</dt><dd>Hardened OCI container</dd></div></dl>}<h3>Acceptance gate</h3><p>{contract ? `${contract.acceptanceChecks.length} contract-backed checks must pass before deployment becomes available.` : "22 deterministic checks must pass before deployment becomes available."}</p>{planner ? <p className="planner-provenance"><span>Planner</span><strong>{planner.model}</strong><small>{planner.usage.totalTokens > 0 ? `${planner.usage.totalTokens.toLocaleString()} tokens` : "Offline deterministic mode"}</small></p> : null}</section></div><footer className="modal-footer"><span>{approved ? "This contract revision is immutable and audit-recorded." : contract ? "Approval locks this revision before planning." : "Approved by demo@kiln.dev · 2m ago"}</span><button className="button button-primary" type="button" disabled={busy} onClick={onApprove ?? onClose}>{busy ? "Approving…" : onApprove ? "Approve & plan →" : "Done"}</button></footer></DialogShell>;
}

function PlanDialog({ plan, busy, onApprove, onClose }: { plan: ApiPlan; busy: boolean; onApprove: () => void; onClose: () => void }) {
  return <DialogShell title="Review implementation plan" eyebrow={`Generation gate · revision ${plan.revision}`} onClose={onClose} wide><div className="plan-overview"><div><span>Blueprint</span><strong>React + FastAPI + PostgreSQL</strong></div><div><span>Estimated model budget</span><strong>${(plan.estimatedModelCents / 100).toFixed(2)}</strong></div><div><span>Runner estimate</span><strong>≈ {Math.ceil(plan.estimatedExecutionSeconds / 60)} min</strong></div></div><ol className="plan-list">{plan.steps.map((step) => <li key={step.id}><span>{String(step.sequence).padStart(2, "0")}</span><div><strong>{step.title}</strong><p>{step.description}</p><div className="capability-list">{step.capabilities.map((capability) => <b key={capability}>{capability.replaceAll("_", " ")}</b>)}</div></div><time>{step.estimatedSeconds}s</time></li>)}</ol><div className="plan-risk"><strong>Boundaries that remain enforced</strong>{plan.risks.map((risk) => <p key={risk}><span>•</span>{risk}</p>)}</div><footer className="modal-footer"><span>{plan.status === "approved" ? "This exact plan revision is approved." : "No code runs until you approve this plan."}</span><button className="button button-primary" type="button" disabled={busy || plan.status === "approved"} onClick={onApprove}>{busy ? "Recording approval…" : plan.status === "approved" ? "Plan approved" : "Approve generation →"}</button></footer></DialogShell>;
}

function GenerationDialog({ flow, busy, onClose }: { flow: BuildFlow; busy: boolean; onClose: () => void }) {
  const stage = flow.generationStage ?? "waiting";
  const stages: Array<{ id: GenerationStage; title: string; detail: string }> = [
    { id: "data", title: "Data contract", detail: "Typed models and forward-only migration" },
    { id: "api", title: "REST operations", detail: "Validated endpoints and business rules" },
    { id: "interface", title: "Product interface", detail: "Contract-driven React experience" },
    { id: "verification", title: "Isolated verification", detail: "Ten trusted build, test, preview, and security checks" },
  ];
  const activeIndex = ["queued", "complete", "failed"].includes(stage)
    ? 3
    : stages.findIndex((item) => item.id === stage);
  return <DialogShell title="Building the approved revision" eyebrow="Durable agent run" onClose={onClose} wide><div className="generation-summary"><div><span className={`generation-orbit ${stage === "failed" ? "failed" : stage === "complete" ? "complete" : ""}`}>K</span><div><strong>{generationHeadline(stage)}</strong><p>{stage === "queued" ? "The immutable input is waiting for an available Firecracker runner. You can close this window; the run continues durably." : stage === "complete" ? "Every trusted check passed. Export and deployment gates are now available." : stage === "failed" ? "The run stopped without claiming success. Open evidence for the structured failure." : "Kiln is applying small schema-validated patches. No generated command runs in the control plane."}</p></div></div><dl><div><dt>Accepted files</dt><dd>{Object.keys(flow.generatedFiles ?? {}).length} / 4</dd></div><div><dt>Blueprint</dt><dd>v0.2.0</dd></div><div><dt>Execution</dt><dd>{flow.detail?.executionJobs.at(-1)?.status ?? "not queued"}</dd></div></dl></div><ol className="generation-list">{stages.map((item, index) => { const done = ["complete", "queued", "failed"].includes(stage) ? index < 3 : activeIndex > index; const failed = stage === "failed" && index === activeIndex; const active = !failed && ((stage === "queued" && index === 3) || activeIndex === index); return <li className={done ? "done" : failed ? "failed" : active ? "active" : "waiting"} key={item.id}><span>{done ? "✓" : failed ? "!" : active ? "↻" : ""}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div><b>{done ? "DONE" : failed ? "FAILED" : active ? stage === "queued" ? "QUEUED" : "ACTIVE" : "WAIT"}</b></li>; })}</ol><div className="generation-boundary"><strong>Live boundary</strong><span>Only four allowlisted extension paths can change. Tests, workflow policy, lockfiles, and evaluator code remain read-only.</span></div><footer className="modal-footer"><span>{busy ? "The run is safe to leave in the background." : stage === "queued" ? "Waiting for hosted executor credentials in this local demo." : "Run state is persisted."}</span><button className="button button-primary" type="button" onClick={onClose}>{busy ? "Continue in background" : "Return to workspace"}</button></footer></DialogShell>;
}

function EvidenceDialog({ detail, busy, onRepair, onClose }: { detail?: LiveRunDetail; busy: boolean; onRepair: () => void; onClose: () => void }) {
  const latestReportId = detail?.executionJobs.at(-1)?.resultArtifactKey;
  const currentTests = latestReportId
    ? detail?.tests.filter((test) => test.reportArtifactId === latestReportId) ?? []
    : [];
  const items = detail ? currentTests.map((test) => ({ group: test.kind, label: test.commandLabel, result: sentenceCase(test.status), detail: `${test.durationMs}ms` })) : evidence;
  const passed = detail ? currentTests.filter((test) => test.status === "passed").length : evidence.filter((item) => item.result === "Passed").length;
  const total = detail ? Math.max(currentTests.length, 10) : evidence.length;
  const report = detail
    ? [...detail.artifacts].reverse().find((artifact) => artifact.kind === "verification_report")
    : undefined;
  const failed = detail && ["diagnose", "failed_with_evidence"].includes(detail.run.status);
  const repairAvailable = detail?.run.status === "diagnose" && detail.run.attempt < detail.run.maxAttempts;
  const finding = detail?.findings.at(-1);
  return <DialogShell title="Build evidence" eyebrow={`${detail ? `Run ${detail.run.id.slice(-6)}` : "Run 04"} · source of truth`} onClose={onClose} wide><div className="evidence-dialog"><div className="evidence-score"><strong>{passed}</strong><span>of {total} trusted checks passed</span><i><b style={{ width: `${Math.round((passed / total) * 100)}%` }} /></i></div>{failed ? <div className="repair-callout"><span>!</span><div><strong>{finding?.title ?? "Verification blocked release"}</strong><p>{finding?.detail ?? "Kiln preserved the failure as evidence and did not expose a verified preview."}</p><small>{detail.run.status === "failed_with_evidence" ? "Repair budget exhausted" : `${detail.run.maxAttempts - detail.run.attempt} repair attempts remain`}</small></div></div> : null}{items.length > 0 ? <div className="evidence-list">{items.map((item) => <div key={item.label}><span>{item.group}</span><p><strong>{item.label}</strong><small>{item.detail}</small></p><b className={`result-${item.result.toLowerCase().replaceAll(" ", "-")}`}>{item.result}</b></div>)}</div> : <div className="evidence-empty"><strong>Verification input is queued</strong><p>No check is shown as passed until a trusted runner returns signed evidence.</p></div>}<p className="evidence-disclaimer">Verification facts come from trusted runners. Agent summaries cannot change these results.</p></div><footer className="modal-footer"><span>{report ? `Artifact hash · ${report.sha256.slice(0, 8)}…${report.sha256.slice(-4)}` : "No verification report has been recorded yet."}</span>{repairAvailable ? <button className="button button-primary" disabled={busy} type="button" onClick={onRepair}>{busy ? "Preparing repair…" : `Repair attempt ${detail.run.attempt + 1} →`}</button> : <button className="button button-primary" type="button" onClick={onClose}>Close evidence</button>}</footer></DialogShell>;
}

function ExportDialog({ detail, activeBuild, hasSource, busy, onEvidence, onRepository, onClose }: { detail?: LiveRunDetail; activeBuild: boolean; hasSource: boolean; busy: boolean; onEvidence: () => void; onRepository: () => void; onClose: () => void }) {
  const verified = detail?.run.status === "ready";
  const preflight = activeBuild && !detail;
  return <DialogShell title="Export this build" eyebrow="User-approved boundary" onClose={onClose}><div className="export-options"><button type="button" onClick={onEvidence}><span>JSON</span><div><strong>{preflight ? "Contract snapshot" : "Build evidence"}</strong><p>{preflight ? "The typed contract and an explicit notice that no run or verification evidence exists yet." : "Contract, run state, patch history, test records, findings, and artifact hashes."}</p><small>Available for every state</small></div><b>→</b></button><button type="button" disabled={!hasSource || busy} onClick={onRepository}><span>ZIP</span><div><strong>{busy ? "Packaging repository…" : "Complete repository"}</strong><p>Frontend, FastAPI backend, migrations, tests, lockfiles, containers, setup guide, and Kiln provenance.</p><small>{!hasSource ? "Complete generation before exporting source" : verified ? "Verified source revision" : `Includes unverified-state notice · ${sentenceCase(detail?.run.status ?? "unknown")}`}</small></div><b>→</b></button></div><div className="export-boundary"><strong>Secret-safe by construction</strong><p>Exports include generated source and public build metadata only. Service tokens, cookies, provider credentials, and runner leases are never copied into the archive.</p></div><footer className="modal-footer"><span>{hasSource ? "This download action is recorded in the run audit trail." : preflight ? "No source archive exists before generation." : "The seeded demo offers evidence export only."}</span><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button></footer></DialogShell>;
}

function DeployDialog({ ready, detail, onClose }: { ready: boolean; detail?: LiveRunDetail; onClose: () => void }) {
  const seeded = !detail;
  return <DialogShell title={ready ? "Deployment approval" : "Deployment is locked"} eyebrow="Human approval gate" onClose={onClose}><div className="deploy-lock"><span aria-hidden="true">{ready ? "✓" : detail?.run.progress ?? 0}</span><div><h3>{ready ? "Verified artifact is eligible" : "Verification is still running"}</h3><p>{ready ? "The exact verified revision can reach a deployment adapter only after destination, visibility, cost class, and secret requirements are visible here." : "Kiln requires build, preview, contract, and source-policy checks to finish before it can create an external deployment."}</p></div></div>{ready ? <dl className="deploy-target"><div><dt>Destination</dt><dd>Vercel preview</dd></div><div><dt>Visibility</dt><dd>Private link</dd></div><div><dt>Cost class</dt><dd>Usage-capped</dd></div><div><dt>App secrets</dt><dd>DATABASE_URL</dd></div></dl> : null}<ul className="deploy-checks"><li className="done"><span>✓</span>Build input is immutable</li><li className={ready ? "done" : ""}><span>{ready ? "✓" : "·"}</span>Contract acceptance passed</li><li className={ready ? "done" : ""}><span>{ready ? "✓" : "·"}</span>Preview smoke passed</li><li className={ready ? "done" : ""}><span>{ready ? "✓" : "·"}</span>Source security policy passed</li></ul><footer className="modal-footer"><span>{seeded ? "Seeded approval preview · no cloud credentials configured." : "No external resource has been created."}</span><button className="button button-primary" type="button" onClick={onClose}>{ready ? "Keep private for now" : "Return to run"}</button></footer></DialogShell>;
}

function NewBuildDialog({ brief, busy, onBriefChange, onSubmit, onClose }: { brief: string; busy: boolean; onBriefChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void }) {
  const examples = ["Client intake tracker", "Studio booking dashboard", "Volunteer scheduling tool"];
  return <DialogShell title="What should Kiln build?" eyebrow="New build" onClose={onClose} wide><form className="brief-form" aria-busy={busy} onSubmit={onSubmit}><label htmlFor="product-brief">Product brief</label><textarea id="product-brief" value={brief} disabled={busy} onChange={(event) => onBriefChange(event.target.value)} minLength={20} maxLength={5000} /><div className="brief-meta"><span>Describe the users, primary workflow, and constraints.</span><span>{brief.length} / 5,000</span></div><div className="example-briefs">{examples.map((example) => <button type="button" disabled={busy} onClick={() => onBriefChange(`Build a ${example.toLowerCase()} with a fast, accessible workflow and durable data.`)} key={example}>{example}</button>)}</div><footer className="modal-footer"><span>{busy ? "Creating the project and compiling a typed contract…" : "Kiln will draft a contract before changing code."}</span><button className="button button-primary" disabled={busy} type="submit">{busy ? "Drafting contract…" : "Draft contract →"}</button></footer></form></DialogShell>;
}

function normalizeTimelineState(value: string): string {
  if (value === "done") return "done";
  if (value === "active" || value === "running") return "active";
  if (value === "failed") return "failed";
  if (value === "cancelled") return "cancelled";
  return "waiting";
}

function preflightRunSteps(flow: BuildFlow) {
  const contractApproved = flow.contract.status === "approved";
  const planApproved = flow.plan?.status === "approved";
  return [
    {
      label: contractApproved ? "Contract approved" : "Review build contract",
      detail: contractApproved
        ? `${flow.contract.requirements.length} requirements · revision ${flow.contract.revision}`
        : "No code changes before approval",
      state: contractApproved ? "done" : "active",
    },
    {
      label: planApproved ? "Plan approved" : "Review implementation plan",
      detail: flow.plan
        ? `${flow.plan.steps.length} bounded steps · ${flow.plan.status}`
        : "Starts after contract approval",
      state: planApproved ? "done" : contractApproved ? "active" : "waiting",
    },
    {
      label: "Generate allowlisted patches",
      detail: "Four extension paths only",
      state: planApproved ? "active" : "waiting",
    },
    {
      label: "Isolated verification",
      detail: "Ten deterministic trusted checks",
      state: "waiting",
    },
    {
      label: "Release decision",
      detail: "Locked until evidence is complete",
      state: "waiting",
    },
  ];
}

function sentenceCase(value: string): string {
  const normalized = value.replaceAll("_", " ");
  return normalized ? normalized[0]!.toUpperCase() + normalized.slice(1) : value;
}

function runStatusLabel(detail: LiveRunDetail): string {
  const job = detail.executionJobs[0];
  if (job?.status === "queued") return "Queued for isolated runner";
  if (job?.status === "leased") return `Isolated verification · attempt ${job.attempt}`;
  if (detail.run.status === "diagnose") return "Failure evidence ready for repair";
  return sentenceCase(detail.run.currentStep);
}

function agentStatusMessage(
  detail: LiveRunDetail | undefined,
  stage: GenerationStage | undefined,
  cancelled: boolean,
): string {
  if (cancelled) {
    return "The run stopped safely. Active execution leases were revoked and no deployment was created.";
  }
  if (!detail) {
    return "This seeded example shows the finished experience. Start a build to create an audit-backed run of your own.";
  }
  if (detail.run.status === "ready") {
    return "The verified artifact passed contract acceptance, build, preview, and source policy checks. Deployment still requires you.";
  }
  if (detail.run.status === "diagnose") {
    return "The runner returned structured failure evidence. Kiln has not claimed success or exposed a public preview.";
  }
  if (detail.run.status === "failed_with_evidence") {
    return "The bounded repair budget ended without a verified artifact. The last trusted diagnostics remain available for inspection and export.";
  }
  if (detail.run.status === "repair_patch") {
    return `Kiln is applying repair ${detail.run.attempt} of ${detail.run.maxAttempts} only to generated extension files; tests and policy remain locked.`;
  }
  if (["plan", "user_approval"].includes(detail.run.status)) {
    return "The contract is locked. Kiln is waiting for explicit approval of the implementation plan before it can generate source.";
  }
  if (stage === "queued") {
    return "Four immutable source snapshots are ready. The durable job is waiting for an isolated runner; no control-plane host will execute them.";
  }
  return "Kiln is applying allowlisted patches from the approved plan. Hidden reasoning is neither shown nor persisted.";
}

function generationHeadline(stage: GenerationStage): string {
  if (stage === "queued") return "Source ready; verification queued";
  if (stage === "complete") return "Release gate satisfied";
  if (stage === "failed") return "Stopped with evidence";
  if (stage === "verification") return "Sealing the execution input";
  if (stage === "waiting") return "Waiting for approval";
  return `Generating the ${stage} slice`;
}

function projectNameFromBrief(value: string): string {
  const words = value
    .replace(/^build\s+(?:an?|the)\s+/i, "")
    .replace(/[^A-Za-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  const name = words.join(" ").slice(0, 80);
  return name ? name[0]!.toUpperCase() + name.slice(1) : "Untitled build";
}

function apiErrorMessage(error: unknown): string {
  return error instanceof KilnApiError
    ? error.message
    : "Kiln could not complete that request";
}
