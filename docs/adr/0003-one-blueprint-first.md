# ADR 0003: Support one generated-app blueprint first

**Status:** Accepted
**Date:** 2026-08-16

## Context

Arbitrary framework support would expand installation behavior, security policy, verification, and deployment combinations before reliability is measurable.

## Decision

The first release generates React/TypeScript frontends, FastAPI/Python APIs, and PostgreSQL persistence from a maintained blueprint with pinned tools and known checks.

## Consequences

- Marketing language must clearly state the supported scope.
- The evaluator can test depth and reliability rather than breadth.
- Additional blueprints require their own dependency policy, sandbox image, checks, and golden prompt set.
