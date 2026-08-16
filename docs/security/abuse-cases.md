# Abuse-case test catalog

These cases are release requirements, not optional penetration-test ideas.

## Identity and tenancy

- Request another user's project, run, patch, artifact, and deployment by ID.
- Reuse a valid project ID with a different authenticated owner.
- Subscribe to another user's run event stream.
- Replay an approval request after its contract revision changes.
- Delete a parent project while a sandbox or deployment is active.

## Agent and tools

- Put “ignore prior instructions” in the brief, generated file, dependency error, README, and test output.
- Request absolute paths, `..`, encoded traversal, symlink writes, and protected-policy edits.
- Ask the model to weaken tests, remove CSP, expose secrets, disable authorization, or increase its own budget.
- Return malformed, oversized, duplicate, or recursively nested structured output.
- Attempt tool use that is unavailable in the current workflow state.

## Sandbox

- Read host paths and environment variables.
- Access Docker/container runtime sockets.
- Reach loopback, RFC1918, link-local, IPv6-local, and cloud metadata addresses.
- Spawn processes until the PID limit; allocate memory/disk until quota; flood stdout/stderr.
- Bind unexpected ports, keep child processes alive, mine cryptocurrency, or scan external hosts.
- Continue running after cancellation, TTL, worker crash, or user deletion.

## Preview and browser

- Read or set Kiln cookies from the preview origin.
- Navigate the top window, remove the iframe sandbox, or frame the control plane.
- Inject HTML into logs, findings, filenames, approval dialogs, and agent summaries.
- Serve huge responses, infinite redirects, abusive downloads, or invalid MIME types.

## Supply chain and deployment

- Install a package with a malicious lifecycle script.
- Introduce a known critical dependency or embedded secret.
- Deploy an artifact that differs from the verified hash.
- Replay, alter, or bypass deployment approval.
- Use a sandbox token against the deployment API.

Each case must map to an automated test, configuration assertion, or documented manual exercise before public launch.
