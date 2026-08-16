export const runStates = [
  "intake",
  "specify",
  "contract_review",
  "plan",
  "user_approval",
  "scaffold",
  "generate_patches",
  "static_check",
  "build",
  "test",
  "diagnose",
  "repair_patch",
  "preview",
  "security_scan",
  "ready",
  "deploy_approval",
  "deployed",
  "failed_with_evidence",
  "cancelled",
] as const;

export type RunState = (typeof runStates)[number];

const transitions: Readonly<Record<RunState, readonly RunState[]>> = {
  intake: ["specify", "cancelled"],
  specify: ["contract_review", "failed_with_evidence", "cancelled"],
  contract_review: ["plan", "specify", "cancelled"],
  plan: ["user_approval", "failed_with_evidence", "cancelled"],
  user_approval: ["scaffold", "plan", "cancelled"],
  scaffold: ["generate_patches", "diagnose", "cancelled"],
  generate_patches: ["static_check", "diagnose", "cancelled"],
  static_check: ["build", "diagnose", "cancelled"],
  build: ["test", "diagnose", "cancelled"],
  test: ["preview", "diagnose", "cancelled"],
  diagnose: ["repair_patch", "failed_with_evidence", "cancelled"],
  repair_patch: ["static_check", "failed_with_evidence", "cancelled"],
  preview: ["security_scan", "diagnose", "cancelled"],
  security_scan: ["ready", "failed_with_evidence", "cancelled"],
  ready: ["deploy_approval"],
  deploy_approval: ["deployed", "ready", "cancelled"],
  deployed: [],
  failed_with_evidence: [],
  cancelled: [],
};

export function isRunState(value: unknown): value is RunState {
  return typeof value === "string" && runStates.includes(value as RunState);
}

export function canTransition(from: RunState, to: RunState): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: RunState, to: RunState): void {
  if (!canTransition(from, to)) {
    throw new InvalidRunTransitionError(from, to);
  }
}

export class InvalidRunTransitionError extends Error {
  readonly from: RunState;
  readonly to: RunState;

  constructor(from: RunState, to: RunState) {
    super(`Run cannot transition from ${from} to ${to}`);
    this.name = "InvalidRunTransitionError";
    this.from = from;
    this.to = to;
  }
}
