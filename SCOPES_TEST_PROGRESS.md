# Scopes Test Implementation Progress

Tracks which test cases from `SCOPES_TEST_PLAN.md` have been implemented in `test/mocha/sourcemap-scopes.js`.

| # | Test Name | Status | Notes |
|---|-----------|--------|-------|
| 1 | Global scope only | done | session-2026-04-07 |
| 2 | Function scope nested in global | done | session-2026-04-07 |
| 3 | Block scope nested in function | done | session-2026-04-07 |
| 4 | Multiple sibling block scopes | done | session-2026-04-07 |
| 5 | Single-call function inlining | done | passes, session-2026-04-08 |
| 6 | Multi-call inlining | skipped | terser won't inline multi-call functions |
| 7 | Nested inlining | done | fails (missing nested add range), session-2026-04-08 |
| 8 | Partial inlining | done | passes, session-2026-04-08 |
| 9 | Inlining with closure capture | done | fails (multiplier binding wrong), session-2026-04-08 |
| 10 | Pure constant folding | not-started | |
| 11 | Pure variable renaming | not-started | |
| 12 | Dead code elimination | not-started | |
| 13 | Block scope flattening | not-started | |
| 14 | Unused variable dropping | not-started | |
| 15 | Toplevel IIFE wrapping | not-started | |
| 16 | Minifier-introduced shadowing | not-started | |
| 17 | Minifier-introduced shadowing with block scope | not-started | |
| 18 | Original source already has shadowing | not-started | |
| 19 | Block scope shadowing resolved by flattening | not-started | |
| 20 | Shadowing with inlining | not-started | |
| 21 | Arrow functions as scopes | not-started | |
| 22 | Default parameter values | not-started | |
| 23 | Destructuring parameters | not-started | |
| 24 | For-loop block scoping | not-started | |
| 25 | isHidden generated range | not-started | |
| 26 | Sub-range bindings | not-started | |
| 27 | Class method scoping | not-started | |
| 28 | Try/catch scope | not-started | |
