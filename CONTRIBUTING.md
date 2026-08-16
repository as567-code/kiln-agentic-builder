# Contributing to Kiln

## Development rules

- Keep user, project, and run authorization in server-side domain services.
- Do not add a generic shell tool to the model gateway.
- Do not log prompts, secrets, cookies, authorization headers, or raw model responses.
- Add an ADR for changes to trust boundaries, persistence ownership, sandboxing, approvals, or deployment.
- Add tests for every workflow transition and every new tenant-owned query.
- Pin dependencies and commit lockfiles.

## Required checks

Before merging, run the web lint, type check, build, and test suite plus the orchestrator's formatter, type checker, and tests. Security-sensitive changes also require the mapped abuse-case tests.

The checked-in SQL migration is authoritative. When the Drizzle schema changes, temporarily run the pinned migration generator, inspect the SQL, add `PRAGMA optimize` after index changes, then remove the generator from installed dependencies so the routine web toolchain does not retain its vulnerable legacy loader chain.

## Commit scope

Prefer small changes that preserve a runnable main branch. Generated snapshots, logs, credentials, local databases, and preview artifacts must not be committed.
