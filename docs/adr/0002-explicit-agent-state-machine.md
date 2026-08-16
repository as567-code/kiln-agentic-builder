# ADR 0002: Use an explicit, durable agent state machine

**Status:** Accepted
**Date:** 2026-08-16

## Context

An open-ended loop is difficult to resume, budget, audit, and secure. It also lets the model decide when consequential work is allowed.

## Decision

Application code owns a finite run-state transition table. Each state exposes only its required tools. User approvals are version-bound records. Repairs are limited to three attempts and cannot modify contracts, protected policy, or trusted evaluation fixtures.

## Consequences

- New capabilities require explicit states and policy changes.
- Runs can resume after worker failure and produce a complete timeline.
- Model behavior remains flexible inside a state without becoming the authorization layer.
