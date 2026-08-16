import { blueprintChecks } from "./policy.ts";
import type {
  ExecutionContract,
  GeneratedFile,
  SandboxProvider,
  VerificationReport,
} from "./types.ts";

export async function verifyGeneratedWorkspace(input: {
  provider: SandboxProvider;
  providerName: string;
  runId: string;
  files: GeneratedFile[];
  contract: ExecutionContract;
}): Promise<VerificationReport> {
  const startedAt = new Date().toISOString();
  const sandbox = await input.provider.create({
    runId: input.runId,
    timeoutMs: 10 * 60_000,
    vcpus: 2,
    ports: [],
  });
  const checks: VerificationReport["checks"] = [];
  try {
    await sandbox.writeTrustedContract(input.contract);
    await sandbox.writeGeneratedFiles(input.files);
    await sandbox.lockNetwork();
    for (const checkId of blueprintChecks) {
      const evidence = await sandbox.runCheck(checkId);
      checks.push(evidence);
      if (evidence.status !== "passed") break;
    }
  } finally {
    await sandbox.stop();
  }
  return {
    provider: input.providerName,
    sandboxId: sandbox.id,
    status: checks.length === blueprintChecks.length && checks.every(
      (check) => check.status === "passed",
    )
      ? "passed"
      : "failed",
    checks,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}
