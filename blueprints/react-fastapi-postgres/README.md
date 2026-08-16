# React + FastAPI + PostgreSQL blueprint

This is Kiln's first supported generated-application shape. It intentionally favors reliability and inspectability over framework breadth.

The included example is a bakery inventory application with:

- a React and TypeScript interface;
- a FastAPI REST API;
- PostgreSQL persistence and an Alembic migration;
- validation, health checks, unit/API tests, and container definitions; and
- non-root production containers with explicit health probes.

Generated projects keep the same commands and protected-path policy so the verifier can make deterministic decisions.
