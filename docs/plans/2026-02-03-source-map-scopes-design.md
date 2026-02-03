# Source Map Scopes Implementation Design

## Overview

This document describes the design for implementing the Source Map Scopes proposal (ECMA-426 Stage 3) in Terser. The feature enables debuggers to reconstruct original scope and variable information from minified code.

## Scope of Implementation

**Included in initial implementation:**
- Global and function scopes (no block scopes)
- Variable bindings with mangled name mapping
- Detection of removed/unavailable variables
- Scope names (function names, including inferred)
- `isStackFrame` flag for function scopes
- Scope kinds: `"Global"` and `"Function"` only

**Not included (future work):**
- Block scopes (`let`/`const` boundaries)
- Inlining detection and callsite information
- Expression bindings for folded constants
- Arrow function distinction

## Configuration

New opt-in option under `sourceMap`:

```javascript
minify(code, {
    sourceMap: {
        scopes: true,  // default: false
    }
});
```

## Architecture

### Two-Phase Collection

**Phase 1 (after parsing, before compression):**
Capture all original scopes and their variables as a snapshot of the "truth" before any transformations.

**Phase 2 (during output):**
Track which scopes survive in the generated code and compute variable bindings by comparing against the original snapshot.

### New File: `lib/scope-map.js`

Factory function following Terser's `SourceMap` pattern:

```javascript
function ScopeMap(options) {
    options = defaults(options, {
        orig: null,  // original source map for chaining
    });

    var original_scopes = [];  // flat list for O(1) index lookup
    var scope_to_index = new Map();  // AST_Scope -> index
    var root = null;  // tree structure
    var generated_ranges = [];
    var range_stack = [];

    function capture(toplevel) { /* Phase 1 */ }
    function enter_scope(node, line, col) { /* Phase 2 - on scope entry */ }
    function exit_scope(node, line, col) { /* Phase 2 - on scope exit */ }
    function get() { /* Build codec structure */ }

    return {
        capture: capture,
        enter_scope: enter_scope,
        exit_scope: exit_scope,
        get: get,
    };
}
```

## Data Structures

### Captured Scope (Phase 1)

Tree-based structure with children:

```javascript
{
    index: number,
    kind: "Global" | "Function",
    name: string | null,
    is_stack_frame: boolean,
    start: { line, column },
    end: { line, column },
    variables: Map<string, {
        name: string,
        def: SymbolDef,
    }>,
    children: [],  // nested scope objects
    node: AST_Scope,  // reference for matching during output
}
```

### Generated Range (Phase 2)

```javascript
{
    original_scope: scope_info,  // reference to captured scope
    start: { line, column },
    end: { line, column },
    bindings: Map<string, string | null>,  // original_name -> mangled_name or null
}
```

## Phase 1: Capturing Original Scopes

Uses TreeWalker to build a tree of scopes:

```javascript
function capture(toplevel) {
    var scope_stack = [];

    var tw = new TreeWalker((node) => {
        if (node instanceof AST_Scope && !node.is_block_scope()) {
            var scope_info = {
                index: original_scopes.length,
                kind: node instanceof AST_Toplevel ? "Global" : "Function",
                name: node.name ? node.name.name : null,
                is_stack_frame: !(node instanceof AST_Toplevel),
                start: { line: node.start.line, column: node.start.col },
                end: { line: node.end.endline, column: node.end.endcol },
                variables: new Map(),
                children: [],
                node: node,
            };

            node.variables.forEach((def, name) => {
                scope_info.variables.set(name, { name, def });
            });

            scope_to_index.set(node, scope_info.index);
            original_scopes.push(scope_info);

            if (scope_stack.length > 0) {
                scope_stack[scope_stack.length - 1].children.push(scope_info);
            } else {
                root = scope_info;
            }

            scope_stack.push(scope_info);
        }
    });

    toplevel.walk(tw);
}
```

## Phase 2: Tracking Generated Ranges

### Scope Entry/Exit in OutputStream

```javascript
function enter_scope(node, line, col) {
    var index = scope_to_index.get(node);
    if (index === undefined) return;  // scope was removed

    range_stack.push({
        original_scope: original_scopes[index],
        start: { line, column: col },
        end: null,
        bindings: new Map(),
    });
}

function exit_scope(node, line, col) {
    var range = range_stack.pop();
    if (!range) return;

    range.end = { line, column: col };
    compute_bindings(range, node);
    generated_ranges.push(range);
}
```

### Computing Variable Bindings

```javascript
function compute_bindings(range, node) {
    var original_scope = range.original_scope;
    var surviving_vars = node.variables;

    original_scope.variables.forEach((var_info, original_name) => {
        var def = var_info.def;
        var surviving_def = surviving_vars.get(original_name);

        if (surviving_def && surviving_def.id === def.id) {
            // Variable survived
            var mangled = def.mangled_name || original_name;
            range.bindings.set(original_name, mangled);
        } else {
            // Variable was removed
            range.bindings.set(original_name, null);
        }
    });
}
```

## Encoding with the Codec

Uses `@chrome-devtools/source-map-scopes-codec`:

```javascript
import { ScopeInfoBuilder } from "@jsr/chrome-devtools__source-map-scopes-codec";

function get() {
    var builder = new ScopeInfoBuilder();

    function build_scope(scope_info) {
        builder.startScope(scope_info.start.line, scope_info.start.column, {
            kind: scope_info.kind,
            name: scope_info.name,
            isStackFrame: scope_info.is_stack_frame,
            variables: Array.from(scope_info.variables.keys()),
        });

        scope_info.children.forEach(build_scope);

        builder.endScope(scope_info.end.line, scope_info.end.column);
    }

    if (root) build_scope(root);

    generated_ranges.forEach((range) => {
        var bindings = {};
        range.bindings.forEach((mangled, original) => {
            bindings[original] = mangled;
        });

        builder.startRange(range.start.line, range.start.column, {
            scope: range.original_scope.index,
            bindings: bindings,
        });
        builder.endRange(range.end.line, range.end.column);
    });

    return builder.build();
}
```

## Pipeline Integration

### Changes to minify.js

```javascript
async function minify(files, options) {
    // ... existing setup ...

    var scope_map = null;

    // After parsing and figure_out_scope, before compression:
    if (options.sourceMap && options.sourceMap.scopes) {
        scope_map = ScopeMap({
            orig: options.sourceMap.content,
        });
        scope_map.capture(toplevel);
    }

    // ... existing compress and mangle ...

    // During output setup:
    var stream = OutputStream({
        // ... existing options ...
        scope_map: scope_map,
    });

    toplevel.print(stream);

    // After output, encode scopes into source map:
    if (scope_map) {
        var scope_info = scope_map.get();
        result.map = encode(scope_info, result.map);
    }

    return result;
}
```

### Changes to output.js

Add scope tracking to AST_Scope print methods:

```javascript
DEFPRINT(AST_Toplevel, function(self, output) {
    if (output.option("scope_map")) {
        output.option("scope_map").enter_scope(self, output.line(), output.col());
    }
    // ... existing print logic ...
    if (output.option("scope_map")) {
        output.option("scope_map").exit_scope(self, output.line(), output.col());
    }
});
```

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `lib/scope-map.js` | ScopeMap factory with capture/tracking/encoding |
| `test/mocha/scopes.js` | Unit tests and round-trip validation |

### Modified Files

| File | Changes |
|------|---------|
| `lib/minify.js` | Option handling, ScopeMap creation, encoding |
| `lib/output.js` | Scope entry/exit callbacks in print methods |
| `lib/sourcemap.js` | Merge encoded scopes into source map JSON |
| `package.json` | Add codec dependency |
| `.npmrc` | Add JSR registry for codec package |
| `tools/terser.d.ts` | TypeScript types for new option |

## Testing Strategy

### Unit Tests

```javascript
describe("sourceMap.scopes", function() {
    it("captures global scope with variables", async function() {
        var result = await minify("var a = 1; var b = 2;", {
            sourceMap: { scopes: true },
        });

        var scopes = decode(JSON.parse(result.map));

        assert.equal(scopes.originalScopes.length, 1);
        assert.equal(scopes.originalScopes[0].kind, "Global");
        assert.deepEqual(scopes.originalScopes[0].variables, ["a", "b"]);
    });

    it("captures nested function scopes", async function() {
        var result = await minify("function foo(x) { var y = x; }", {
            sourceMap: { scopes: true },
            mangle: true,
        });

        var scopes = decode(JSON.parse(result.map));

        assert.equal(scopes.originalScopes[0].children.length, 1);
        assert.equal(scopes.originalScopes[0].children[0].name, "foo");
    });

    it("marks removed variables as unavailable", async function() {
        var result = await minify("function foo() { var unused = 1; return 42; }", {
            sourceMap: { scopes: true },
            compress: { unused: true },
        });

        var scopes = decode(JSON.parse(result.map));
        var range = scopes.generatedRanges[1];

        assert.equal(range.bindings.unused, null);
    });
});
```

### Round-Trip Validation

```javascript
function validate_round_trip(code, options) {
    var result = minify(code, { ...options, sourceMap: { scopes: true } });
    var scopes = decode(JSON.parse(result.map));

    assert(scopes.originalScopes.length > 0, "has original scopes");
    assert(scopes.generatedRanges.length > 0, "has generated ranges");

    scopes.generatedRanges.forEach((range) => {
        assert(range.scope < scopes.originalScopes.length, "valid scope reference");
    });

    var re_encoded = encode(scopes);
    assert.deepEqual(re_encoded.scopes, JSON.parse(result.map).scopes);
}
```

## Implementation Checkpoints

1. **Dependency setup** - Add codec package and .npmrc configuration
2. **Phase 1 capture** - Create scope-map.js with capture() only, verify scopes are captured
3. **Pipeline integration** - Wire up in minify.js, test encoding works
4. **Phase 2 tracking** - Add enter_scope/exit_scope in output.js, test generated ranges
5. **Binding computation** - Implement compute_bindings(), test variable mapping
6. **Removed variable detection** - Test unavailable bindings for dead code
7. **Full test suite** - Complete unit tests and round-trip validation
8. **TypeScript types** - Update terser.d.ts

## Dependencies

```json
{
  "dependencies": {
    "@jsr/chrome-devtools__source-map-scopes-codec": "^0.x.x"
  }
}
```

**.npmrc addition:**
```
@jsr:registry=https://npm.jsr.io
```
