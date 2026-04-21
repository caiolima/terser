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
| 10 | Pure constant folding | done | passes, session-2026-04-17 |
| 11 | Pure variable renaming | done | passes, session-2026-04-17 |
| 12 | Dead code elimination | done | passes; cascading DCE with live/reconstructible/unreconstructible bindings, session-2026-04-17 |
| 13 | Block scope flattening | skipped | terser never flattens let/const blocks (can_be_evicted_from_block gate); var case is just var hoisting, not block merging |
| 14 | Unused variable dropping | done | passes; dropped binding emitted as original name (spec gap), session-2026-04-17 |
| 15 | Toplevel IIFE wrapping | done | passes; requires inline:false to force IIFE, session-2026-04-17 |
| 16 | Minifier-introduced shadowing | done | passes, session-2026-04-21 |
| 17 | Minifier-introduced shadowing with block scope | done | passes, session-2026-04-21 |
| 18 | Original source already has shadowing | done | passes, session-2026-04-21 |
| 19 | Block scope shadowing resolved by flattening | done | passes; terser doesn't flatten but uses same mangled name (scope structure disambiguates), session-2026-04-21 |
| 20 | Shadowing with inlining | done | fails (scale binding text reordered + missing inlined range), session-2026-04-21 |
| 21 | Arrow functions as scopes | not-started | |
| 22 | Default parameter values | not-started | |
| 23 | Destructuring parameters | not-started | |
| 24 | For-loop block scoping | not-started | |
| 25 | isHidden generated range | not-started | |
| 26 | Sub-range bindings | not-started | |
| 27 | Class method scoping | not-started | |
| 28 | Try/catch scope | not-started | |
