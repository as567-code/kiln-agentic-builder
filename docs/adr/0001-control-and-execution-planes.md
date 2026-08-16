# ADR 0001: Separate control and execution planes

**Status:** Accepted
**Date:** 2026-08-16

## Context

Kiln must execute code produced from untrusted user and model input. Running that code in the web/API process would expose sessions, credentials, stored projects, and the host.

## Decision

The control plane may schedule work but cannot execute generated code. A sandbox gateway on a separate execution plane creates one disposable environment per run. Hosted execution requires a gVisor or microVM-class boundary; rootless Docker is a local-development adapter only.

## Consequences

- Infrastructure is more complex and a public demo needs a sandbox provider.
- The boundary is testable and replaceable through a provider interface.
- A compromised generated application does not automatically inherit control-plane identity or network access.
