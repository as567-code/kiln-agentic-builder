# Security policy

Kiln is an experimental agentic developer platform. Do not use generated applications for sensitive production workloads without independent review.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Send a private report to the repository owner with:

- affected component and revision;
- reproduction steps or proof of concept;
- expected and observed behavior;
- potential impact; and
- any suggested mitigation.

Avoid accessing data that is not yours, degrading shared services, or retaining secrets obtained during testing.

## Supported version

Only the latest revision of the default branch is supported during active development.

## Security invariants

- Generated code never executes on the control-plane host.
- Generated code never receives platform or deployment credentials.
- Authorization is deterministic server-side code, not an LLM instruction.
- Previews do not share an origin or authentication cookies with Kiln.
- Public deployment requires explicit, revision-bound human approval.
- Critical security findings block release.

See `docs/security/threat-model.md` and `docs/security/abuse-cases.md` for the current model and verification catalog.
