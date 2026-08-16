# Kiln threat model

**Method:** STRIDE plus agent-specific abuse cases
**Reviewed scope:** browser, control plane, model boundary, execution plane, preview, artifact store, and deployment adapter

## Protected assets

- User identity and session state
- Project briefs, source, revisions, and artifacts
- Model-provider, storage, and deployment credentials
- Control-plane database and internal network
- Sandbox capacity and model budget
- Verification results and artifact provenance
- Other tenants' data and running sandboxes

## Threat actors

- Anonymous or authenticated abusive user
- Compromised dependency or generated package
- Prompt-injected file, webpage, log line, or package output
- Malicious generated application
- Stolen user session
- Compromised worker or deployment token
- Accidental operator or model action

## STRIDE register

| ID | Threat | Boundary | Required controls | Verification |
|---|---|---|---|---|
| S-01 | Session or identity spoofing | Browser → control plane | Dispatcher identity headers or trusted auth; secure cookies; server-side checks | Missing/forged identity tests |
| T-01 | Cross-project modification | API/data | Owner-scoped repositories; unguessable IDs; database constraints | IDOR matrix across every mutation |
| T-02 | Model edits protected paths | Model → revision service | Normalized workspace root; protected-file policy; typed patches | Traversal, symlink, absolute-path tests |
| R-01 | User/model denies a high-impact action | Control plane | Append-only audit events with actor, scope, hash, and policy result | Audit completeness test |
| I-01 | Secret leaks through prompt or logs | Model/logging | Opaque secret references; redaction; no prompt secrets; secret scanning | Canary-secret tests across all sinks |
| I-02 | Preview steals Kiln session | Preview → browser | Separate origin; no shared cookies; sandboxed iframe; CSP | Cross-origin and cookie-access tests |
| D-01 | Fork bomb, output flood, disk exhaustion | Sandbox | PID/CPU/memory/disk/log/time quotas and kill switch | Adversarial fixture suite |
| D-02 | Model spend exhaustion | Model gateway | Per-run call/token/cost limits; rate limits; cancellation | Budget-exhaustion tests |
| E-01 | Container escape or host access | Execution plane | Non-root; no privilege/socket; seccomp; gVisor/microVM; separate host | Configuration assertions and red-team fixtures |
| E-02 | Cloud privilege escalation | Deployment | Short-lived scoped identity; deterministic policy; approval | Forbidden-scope and replay tests |
| E-03 | Prompt injection triggers tools | Agent | Stage-scoped granular tools; external authorization; provenance tagging | Direct and indirect injection evaluation set |

## Highest-risk scenarios

### Generated code attacks the platform

Generated code attempts metadata-service access, local-network scanning, filesystem escape, Docker socket access, process exhaustion, or data exfiltration. The execution plane must assume the code is hostile. A plain shared container is not an acceptable hosted boundary.

### Indirect prompt injection abuses the agent

A package error, README, imported file, or fetched page tells the model to disclose secrets or deploy unexpected code. Content provenance remains untrusted; tools are stage-scoped; secrets are not model-readable; high-impact actions require truthful server-rendered approval details.

### False verification

The model claims a build passed or edits tests to obtain a green result. Verification state can be written only by trusted runners. The repair agent cannot edit evaluation fixtures, CI policy, or approved requirements.

## Residual risks

- gVisor and microVM implementations can still contain vulnerabilities.
- Dependency scanners do not identify every malicious package.
- LLM prompt injection cannot be solved by prompting alone.
- Generated applications require human review before production use.

Kiln must publish these limitations and avoid absolute security claims.
