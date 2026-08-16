# ADR 0004: Keep model, storage, sandbox, and deployment providers behind interfaces

**Status:** Accepted
**Date:** 2026-08-16

## Context

The portfolio demo should run locally and on managed infrastructure without putting provider assumptions inside product logic.

## Decision

Domain services depend on narrow interfaces for model generation, project repositories, artifact storage, sandbox execution, and deployment. The initial hosted web uses the platform's relational and object-storage bindings; the generated application blueprint uses PostgreSQL. Provider responses are normalized before entering domain state.

## Consequences

- Interface tests become part of the release gate.
- The hosted MVP can use cost-effective platform storage without misrepresenting the generated app stack.
- Provider-specific functionality cannot leak into core authorization or workflow rules.
