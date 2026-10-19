# Regression tests from the 2026-10-19 QA bug hunt

Each file was written as a *failing* repro for a confirmed bug (ids P1–P7 match
`qa-bug-hunt/bug-report-20261019-102547-trailz-whole-codebase.md`) and passes now that the bug is fixed.
`P1__fakeD1.ts` is a tiny in-memory D1; `P4__fake-d1.ts` runs the real migrations in `node:sqlite` (Node ≥ 22).
