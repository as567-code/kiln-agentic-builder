import {
  verificationCheckIds,
  type VerificationCheckId,
} from "../../packages/contracts/src/execution.ts";
import { badRequest } from "./api-error.ts";
import { isRecord } from "./http.ts";
import type {
  VerificationCheckInput,
  VerificationReportInput,
} from "./store.ts";

const MAX_LOG_CHARACTERS = 32_768;
const MAX_TOTAL_LOG_CHARACTERS = 196_608;
const secretPatterns = [
  /\b(?:sk|rk|pk)_[A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi,
  /\b(?:postgres(?:ql)?|mysql|redis):\/\/[^\s'"<>]+/gi,
  /\b(?:password|passwd|secret|token|api[_-]?key)\s*[=:]\s*[^\s'"<>]{6,}/gi,
] as const;

export function parseVerificationReport(value: unknown): VerificationReportInput {
  const report = record(value, "report");
  onlyKeys(report, [
    "provider",
    "sandboxId",
    "status",
    "checks",
    "startedAt",
    "completedAt",
  ]);
  const status = report.status;
  if (status !== "passed" && status !== "failed") badRequest("report.status is invalid");
  if (!Array.isArray(report.checks) || report.checks.length < 1) {
    badRequest("report.checks must not be empty");
  }
  if (report.checks.length > verificationCheckIds.length) {
    badRequest("report.checks contains too many checks");
  }
  let totalLogCharacters = 0;
  const checks = report.checks.map((item, index): VerificationCheckInput => {
    const check = record(item, `report.checks[${index}]`);
    onlyKeys(check, [
      "checkId",
      "status",
      "exitCode",
      "durationMs",
      "stdout",
      "stderr",
      "outputTruncated",
    ]);
    if (check.checkId !== verificationCheckIds[index]) {
      badRequest("Verification checks are not an approved ordered prefix");
    }
    const checkId = check.checkId as VerificationCheckId;
    if (
      check.status !== "passed" &&
      check.status !== "failed" &&
      check.status !== "timed_out"
    ) {
      badRequest(`report.checks[${index}].status is invalid`);
    }
    if (
      check.exitCode !== null &&
      (!Number.isInteger(check.exitCode) || Number(check.exitCode) < 0 || Number(check.exitCode) > 255)
    ) {
      badRequest(`report.checks[${index}].exitCode is invalid`);
    }
    if (
      !Number.isInteger(check.durationMs) ||
      Number(check.durationMs) < 0 ||
      Number(check.durationMs) > 180_000
    ) {
      badRequest(`report.checks[${index}].durationMs is invalid`);
    }
    const stdout = sanitizedLog(check.stdout, `report.checks[${index}].stdout`);
    const stderr = sanitizedLog(check.stderr, `report.checks[${index}].stderr`);
    totalLogCharacters += stdout.length + stderr.length;
    if (totalLogCharacters > MAX_TOTAL_LOG_CHARACTERS) {
      badRequest("Verification report logs are too large");
    }
    if (typeof check.outputTruncated !== "boolean") {
      badRequest(`report.checks[${index}].outputTruncated must be boolean`);
    }
    return {
      checkId,
      status: check.status,
      exitCode: check.exitCode === null ? null : Number(check.exitCode),
      durationMs: Number(check.durationMs),
      stdout,
      stderr,
      outputTruncated: check.outputTruncated,
    };
  });
  const allPassed = checks.every((check) => check.status === "passed");
  if (
    (status === "passed" &&
      (!allPassed || checks.length !== verificationCheckIds.length)) ||
    (status === "failed" && allPassed)
  ) {
    badRequest("Verification report summary does not match its checks");
  }
  const startedAt = timestamp(report.startedAt, "report.startedAt");
  const completedAt = timestamp(report.completedAt, "report.completedAt");
  if (Date.parse(completedAt) < Date.parse(startedAt)) {
    badRequest("Verification completion precedes its start");
  }
  return {
    provider: text(report.provider, "report.provider", 2, 80),
    sandboxId: text(report.sandboxId, "report.sandboxId", 2, 160),
    status,
    checks,
    startedAt,
    completedAt,
  };
}

function sanitizedLog(value: unknown, field: string): string {
  const normalized = text(value, field, 0, MAX_LOG_CHARACTERS);
  let redacted = normalized.replaceAll("\0", "�");
  for (const pattern of secretPatterns) redacted = redacted.replace(pattern, "[REDACTED]");
  return redacted;
}

function timestamp(value: unknown, field: string): string {
  const normalized = text(value, field, 20, 40);
  if (!Number.isFinite(Date.parse(normalized))) badRequest(`${field} is invalid`);
  return normalized;
}

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    badRequest(`${field} is invalid`);
  }
  return value;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) badRequest(`${field} must be an object`);
  return value;
}

function onlyKeys(value: Record<string, unknown>, allowed: string[]): void {
  const known = new Set(allowed);
  const extra = Object.keys(value).find((key) => !known.has(key));
  if (extra) badRequest(`Unexpected field: ${extra}`);
}
