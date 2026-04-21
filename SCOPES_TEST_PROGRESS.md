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
| 21 | Arrow functions as scopes | done | fails (AST_Arrow crashes scopes builder — node.end undefined), session-2026-04-21 |
| 22 | Default parameter values | done | passes; terser emits IIFE (not inline) — default preserved in generated param list, session-2026-04-21 |
| 23 | Destructuring parameters | done | passes, session-2026-04-21 |
| 24 | For-loop block scoping | done | passes; two nested block scopes (for-init + body), session-2026-04-21 |
| 25 | isHidden generated range | done | fails (enclose wrapper not reflected in scopes — sources.length mismatch in codec), session-2026-04-21 |
| 26 | Sub-range bindings | skipped | see explanation below |
| 27 | Class method scoping | done | fails (AST_Accessor crashes — gen_start undefined; class scope also missing), session-2026-04-21 |
| 28 | Try/catch scope | done | passes; catch block shadows function scope, session-2026-04-21 |

## Test 26 — Sub-range bindings: why skipped

The spec's `BindingRange` lets one generated variable map to different
source variables (or values) across sub-ranges of a scope range, so a
minifier can reuse a register for non-overlapping lifetimes, or
propagate distinct constant values per program point.

Terser doesn't exercise this for two reasons:

1. **No generated-name reuse.** Each source variable in a scope gets its
   own distinct mangled name; no name is ever reused for a different
   variable, so sub-range BindingRanges for name-reuse are never needed.

2. **Constant propagation isn't flow-sensitive across reassignments.**
   Given:
   ```js
   var x = "foo"; log1(x); x = "bar"; log2(x);
   ```
   a flow-sensitive analysis could fold each call site separately to
   `console.log("foo"); console.log("bar");`, but terser stops folding
   as soon as `x` is reassigned, and emits something like
   `var ...="foo"; console.log(l), l="bar", console.log(l)`. The
   binding for the inlined `msg` is the call-site expression (`"x"`) in
   both ranges — same binding text at both sites, resolved against the
   live `x` at each range's position.

Because terser produces neither register coalescing nor per-site folded
values, no terser output naturally exercises `BindingRange`. This slot
is reserved in case future optimizations introduce either.
