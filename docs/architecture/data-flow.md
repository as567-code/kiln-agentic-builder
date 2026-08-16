# Data-flow and retention

## Build flow

| Step | Input | Trusted processor | Durable output | Security notes |
|---|---|---|---|---|
| Intake | User brief | Contract service | Brief revision | Size-limited and treated as untrusted text |
| Specify | Brief | Model gateway + schema validator | Build Contract | Model output cannot set permissions |
| Approve | Contract revision | Authorization service | Approval audit event | User and project scope checked server-side |
| Generate | Approved contract | Orchestrator | Patch proposals | Normalized paths; no binary or out-of-root writes |
| Apply | Valid patch | Revision service | File snapshots and hashes | Prior snapshot retained for rollback |
| Execute | Verified snapshot | Sandbox gateway | Sanitized logs and result bundle | Separate identity, quotas, TTL, denied private egress |
| Verify | Runtime artifact | Verification worker | Test and security findings | Evidence is tool-produced, not model-authored |
| Deploy | Verified artifact | Deployment adapter | Deployment record and provenance | Explicit approval and short-lived cloud identity |

## Sensitive-data rules

- Secrets are referenced by opaque IDs; plaintext values do not enter prompts, project files, audit events, or browser payloads.
- Raw sandbox output is bounded and redacted before persistence or streaming.
- Hidden model reasoning is neither requested nor stored. Kiln stores concise action summaries and tool facts.
- Project deletion removes relational records and schedules artifact deletion. Deletion status is auditable.
- Default development retention: 30 days for logs, 90 days for run metadata, and until deletion for user-owned source snapshots. Hosted policy may shorten these values.

## Ownership invariant

Every project-owned query includes both `owner_id` and resource ID. Resource lookup by ID alone is prohibited outside migration and administrative maintenance code.
