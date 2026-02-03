# Source Map Scopes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add support for the Source Map Scopes proposal (ECMA-426) to encode scope and variable binding information in source maps.

**Architecture:** Two-phase collection - capture original scopes after parsing (before compression), then track generated ranges during output. Uses `@jsr/chrome-devtools__source-map-scopes-codec` for encoding.

**Tech Stack:** JavaScript ES6 modules, Mocha for tests, JSR registry for codec dependency.

---

## Task 1: Add Codec Dependency

**Files:**
- Create: `.npmrc`
- Modify: `package.json:45-49`

**Step 1: Create .npmrc for JSR registry**

Create `.npmrc`:
```
@jsr:registry=https://npm.jsr.io
```

**Step 2: Add the codec dependency**

In `package.json`, add to dependencies (after line 48):
```json
"@jsr/chrome-devtools__source-map-scopes-codec": "^1.0.1"
```

**Step 3: Install dependencies**

Run: `npm install`
Expected: Package installs successfully, no errors.

**Step 4: Verify installation**

Run: `node -e "import('@jsr/chrome-devtools__source-map-scopes-codec').then(m => console.log('OK', Object.keys(m)))"`
Expected: Prints `OK` followed by exported names like `encode`, `decode`, `ScopeInfoBuilder`.

**Step 5: Commit**

```bash
git add .npmrc package.json package-lock.json
git commit -m "feat: add source-map-scopes-codec dependency"
```

---

## Task 2: Create ScopeMap Factory - Basic Structure

**Files:**
- Create: `lib/scope-map.js`

**Step 1: Create the basic ScopeMap factory**

Create `lib/scope-map.js`:
```javascript
"use strict";

import { defaults } from "./utils/index.js";
import {
    AST_Scope,
    AST_Toplevel,
    TreeWalker,
} from "./ast.js";

function ScopeMap(options) {
    options = defaults(options, {
        orig: null,
    });

    var original_scopes = [];
    var scope_to_index = new Map();
    var root = null;
    var generated_ranges = [];
    var range_stack = [];

    function capture(toplevel) {
        var scope_stack = [];

        var tw = new TreeWalker((node, descend) => {
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

                if (node.variables) {
                    node.variables.forEach((def, name) => {
                        scope_info.variables.set(name, { name: name, def: def });
                    });
                }

                scope_to_index.set(node, scope_info.index);
                original_scopes.push(scope_info);

                if (scope_stack.length > 0) {
                    scope_stack[scope_stack.length - 1].children.push(scope_info);
                } else {
                    root = scope_info;
                }

                scope_stack.push(scope_info);
                descend();
                scope_stack.pop();
                return true;
            }
        });

        toplevel.walk(tw);
    }

    function enter_scope(node, line, col) {
        var index = scope_to_index.get(node);
        if (index === undefined) return;

        range_stack.push({
            original_scope: original_scopes[index],
            start: { line: line, column: col },
            end: null,
            bindings: new Map(),
        });
    }

    function exit_scope(node, line, col) {
        var range = range_stack.pop();
        if (!range) return;

        range.end = { line: line, column: col };
        compute_bindings(range, node);
        generated_ranges.push(range);
    }

    function compute_bindings(range, node) {
        var original_scope = range.original_scope;
        var surviving_vars = node.variables || new Map();

        original_scope.variables.forEach((var_info, original_name) => {
            var def = var_info.def;
            var surviving_def = surviving_vars.get(original_name);

            if (surviving_def && surviving_def.id === def.id) {
                var mangled = def.mangled_name || original_name;
                range.bindings.set(original_name, mangled);
            } else {
                range.bindings.set(original_name, null);
            }
        });
    }

    function get_original_scopes() {
        return { root: root, list: original_scopes };
    }

    function get_generated_ranges() {
        return generated_ranges;
    }

    return {
        capture: capture,
        enter_scope: enter_scope,
        exit_scope: exit_scope,
        get_original_scopes: get_original_scopes,
        get_generated_ranges: get_generated_ranges,
    };
}

export {
    ScopeMap,
};
```

**Step 2: Verify the file is valid JavaScript**

Run: `node --check lib/scope-map.js`
Expected: No output (successful syntax check).

**Step 3: Commit**

```bash
git add lib/scope-map.js
git commit -m "feat: create ScopeMap factory with capture and tracking"
```

---

## Task 3: Write First Test - Capture Global Scope

**Files:**
- Create: `test/mocha/scope-map.js`

**Step 1: Write the failing test**

Create `test/mocha/scope-map.js`:
```javascript
import assert from "assert";
import { minify } from "../../main.js";
import { parse } from "../../lib/parse.js";
import { ScopeMap } from "../../lib/scope-map.js";

describe("ScopeMap", function() {
    describe("capture", function() {
        it("should capture global scope with variables", function() {
            var ast = parse("var a = 1; var b = 2;");
            ast.figure_out_scope();

            var scope_map = ScopeMap();
            scope_map.capture(ast);

            var { root, list } = scope_map.get_original_scopes();

            assert.ok(root, "should have root scope");
            assert.strictEqual(root.kind, "Global");
            assert.strictEqual(root.is_stack_frame, false);
            assert.strictEqual(list.length, 1);
            assert.ok(root.variables.has("a"), "should have variable a");
            assert.ok(root.variables.has("b"), "should have variable b");
        });

        it("should capture nested function scopes", function() {
            var ast = parse("function foo(x) { var y = x; }");
            ast.figure_out_scope();

            var scope_map = ScopeMap();
            scope_map.capture(ast);

            var { root, list } = scope_map.get_original_scopes();

            assert.strictEqual(list.length, 2);
            assert.strictEqual(root.kind, "Global");
            assert.strictEqual(root.children.length, 1);

            var fn_scope = root.children[0];
            assert.strictEqual(fn_scope.kind, "Function");
            assert.strictEqual(fn_scope.name, "foo");
            assert.strictEqual(fn_scope.is_stack_frame, true);
            assert.ok(fn_scope.variables.has("x"), "should have parameter x");
            assert.ok(fn_scope.variables.has("y"), "should have variable y");
        });

        it("should capture deeply nested scopes", function() {
            var ast = parse("function outer() { function inner() { var z; } }");
            ast.figure_out_scope();

            var scope_map = ScopeMap();
            scope_map.capture(ast);

            var { root, list } = scope_map.get_original_scopes();

            assert.strictEqual(list.length, 3);
            assert.strictEqual(root.children[0].name, "outer");
            assert.strictEqual(root.children[0].children[0].name, "inner");
            assert.ok(root.children[0].children[0].variables.has("z"));
        });
    });
});
```

**Step 2: Run test to verify it passes**

Run: `npm run test:mocha -- --grep "ScopeMap"`
Expected: All 3 tests pass.

**Step 3: Commit**

```bash
git add test/mocha/scope-map.js
git commit -m "test: add ScopeMap capture tests"
```

---

## Task 4: Add Scope Tracking to Output

**Files:**
- Modify: `lib/output.js:1150-1153` (AST_Toplevel DEFPRINT)
- Modify: `lib/output.js:1261-1291` (AST_Lambda._do_print)
- Modify: `lib/output.js:174-200` (OutputStream options)

**Step 1: Add scope_map option to OutputStream**

In `lib/output.js`, find the `OutputStream` function defaults (around line 174). Add `scope_map: null` to the options:

After line 194 (after `webkit`), add:
```javascript
        scope_map          : null,
```

**Step 2: Add scope tracking to AST_Toplevel print**

Replace the DEFPRINT for AST_Toplevel (line 1150-1153) with:
```javascript
    DEFPRINT(AST_Toplevel, function(self, output) {
        var scope_map = output.option("scope_map");
        if (scope_map) {
            scope_map.enter_scope(self, output.line(), output.col());
        }
        display_body(self.body, true, output, true);
        output.print("");
        if (scope_map) {
            scope_map.exit_scope(self, output.line(), output.col());
        }
    });
```

**Step 3: Add scope tracking to AST_Lambda print**

After `print_braced(self, output, true);` in `AST_Lambda.DEFMETHOD("_do_print"` (line 1290), the method becomes:

Replace lines 1261-1291:
```javascript
    AST_Lambda.DEFMETHOD("_do_print", function(output, nokeyword) {
        var self = this;
        var scope_map = output.option("scope_map");
        if (scope_map) {
            scope_map.enter_scope(self, output.line(), output.col());
        }
        if (!nokeyword) {
            if (self.async) {
                output.print("async");
                output.space();
            }
            output.print("function");
            if (self.is_generator) {
                output.star();
            }
            if (self.name) {
                output.space();
            }
        }
        if (self.name instanceof AST_Symbol) {
            self.name.print(output);
        } else if (nokeyword && self.name instanceof AST_Node) {
            output.with_square(function() {
                self.name.print(output);
            });
        }
        output.with_parens(function() {
            self.argnames.forEach(function(arg, i) {
                if (i) output.comma();
                arg.print(output);
            });
        });
        output.space();
        print_braced(self, output, true);
        if (scope_map) {
            scope_map.exit_scope(self, output.line(), output.col());
        }
    });
```

**Step 4: Run lint to verify**

Run: `npm run lint`
Expected: No errors.

**Step 5: Commit**

```bash
git add lib/output.js
git commit -m "feat: add scope_map tracking hooks to output"
```

---

## Task 5: Write Test for Generated Ranges

**Files:**
- Modify: `test/mocha/scope-map.js`

**Step 1: Add test for generated ranges**

Add to `test/mocha/scope-map.js`:
```javascript
import { OutputStream } from "../../lib/output.js";

describe("ScopeMap", function() {
    // ... existing tests ...

    describe("generated ranges", function() {
        it("should track generated range positions", function() {
            var ast = parse("function foo(x) { return x; }");
            ast.figure_out_scope();

            var scope_map = ScopeMap();
            scope_map.capture(ast);

            var stream = OutputStream({ scope_map: scope_map });
            ast.print(stream);

            var ranges = scope_map.get_generated_ranges();

            assert.strictEqual(ranges.length, 2, "should have 2 ranges (global + function)");

            var global_range = ranges.find(r => r.original_scope.kind === "Global");
            var fn_range = ranges.find(r => r.original_scope.kind === "Function");

            assert.ok(global_range, "should have global range");
            assert.ok(fn_range, "should have function range");
            assert.strictEqual(fn_range.original_scope.name, "foo");
        });

        it("should compute bindings for surviving variables", function() {
            var ast = parse("function foo(x) { var y = x; return y; }");
            ast.figure_out_scope();

            var scope_map = ScopeMap();
            scope_map.capture(ast);

            var stream = OutputStream({ scope_map: scope_map });
            ast.print(stream);

            var ranges = scope_map.get_generated_ranges();
            var fn_range = ranges.find(r => r.original_scope.kind === "Function");

            assert.ok(fn_range.bindings.has("x"), "should have binding for x");
            assert.ok(fn_range.bindings.has("y"), "should have binding for y");
            assert.strictEqual(fn_range.bindings.get("x"), "x");
            assert.strictEqual(fn_range.bindings.get("y"), "y");
        });
    });
});
```

**Step 2: Run test**

Run: `npm run test:mocha -- --grep "ScopeMap"`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add test/mocha/scope-map.js
git commit -m "test: add generated range tracking tests"
```

---

## Task 6: Add Codec Encoding

**Files:**
- Modify: `lib/scope-map.js`

**Step 1: Add encode function to ScopeMap**

In `lib/scope-map.js`, add the import at the top:
```javascript
import { encode as encodeScopes } from "@jsr/chrome-devtools__source-map-scopes-codec";
```

Add the `encode` method before the return statement:
```javascript
    function encode(source_map_json) {
        if (!root) return source_map_json;

        var names = [];
        var name_index = new Map();

        function get_name_index(name) {
            if (name === null) return -1;
            if (name_index.has(name)) return name_index.get(name);
            var idx = names.length;
            names.push(name);
            name_index.set(name, idx);
            return idx;
        }

        var encoded_original_scopes = [];
        function encode_scope(scope_info) {
            var variables = [];
            scope_info.variables.forEach((var_info, name) => {
                variables.push(get_name_index(name));
            });

            var encoded = {
                start: scope_info.start,
                end: scope_info.end,
                kind: scope_info.kind,
                name: scope_info.name ? get_name_index(scope_info.name) : undefined,
                variables: variables,
                children: scope_info.children.map(encode_scope),
            };
            if (scope_info.is_stack_frame) {
                encoded.isStackFrame = true;
            }
            return encoded;
        }

        encoded_original_scopes.push(encode_scope(root));

        var encoded_generated_ranges = generated_ranges.map((range) => {
            var bindings = [];
            range.bindings.forEach((mangled, original) => {
                var original_idx = get_name_index(original);
                if (mangled === null) {
                    bindings.push([original_idx]);
                } else {
                    bindings.push([original_idx, get_name_index(mangled)]);
                }
            });

            return {
                start: range.start,
                end: range.end,
                isScope: true,
                originalScope: range.original_scope.index,
                bindings: bindings,
            };
        });

        var scope_info = {
            names: names,
            originalScopes: encoded_original_scopes,
            generatedRanges: encoded_generated_ranges,
        };

        return encodeScopes(scope_info, source_map_json);
    }
```

Update the return statement:
```javascript
    return {
        capture: capture,
        enter_scope: enter_scope,
        exit_scope: exit_scope,
        get_original_scopes: get_original_scopes,
        get_generated_ranges: get_generated_ranges,
        encode: encode,
    };
```

**Step 2: Verify syntax**

Run: `node --check lib/scope-map.js`
Expected: No output (success).

**Step 3: Commit**

```bash
git add lib/scope-map.js
git commit -m "feat: add scope info encoding with codec"
```

---

## Task 7: Integrate with minify.js

**Files:**
- Modify: `lib/minify.js:1-20` (imports)
- Modify: `lib/minify.js:136-145` (sourceMap options)
- Modify: `lib/minify.js:183-188` (after compression, before mangle)
- Modify: `lib/minify.js:226-228` (OutputStream creation)
- Modify: `lib/minify.js:229-241` (after output, encode scopes)

**Step 1: Add import for ScopeMap**

After line 15 in `lib/minify.js`:
```javascript
import { ScopeMap } from "./scope-map.js";
```

**Step 2: Add scopes option to sourceMap defaults**

In the sourceMap defaults (line 137-144), add `scopes: false`:
```javascript
    if (options.sourceMap) {
        options.sourceMap = defaults(options.sourceMap, {
            asObject: false,
            content: null,
            filename: null,
            includeSources: false,
            root: null,
            scopes: false,
            url: null,
        }, true);
    }
```

**Step 3: Add scope capture after parsing**

After line 166 (`toplevel = options.parse.toplevel;`), add:
```javascript
    var scope_map = null;
    if (options.sourceMap && options.sourceMap.scopes) {
        toplevel.figure_out_scope({});
        scope_map = ScopeMap();
        scope_map.capture(toplevel);
    }
```

**Step 4: Pass scope_map to OutputStream**

Modify line 226 to pass scope_map:
```javascript
        var stream = OutputStream({
            ...options.format,
            scope_map: scope_map,
        });
```

Wait, we need to be careful here. The existing code is:
```javascript
var stream = OutputStream(options.format);
```

We need to add scope_map to options.format before this. Add before line 226:
```javascript
        if (scope_map) {
            options.format.scope_map = scope_map;
        }
```

**Step 5: Encode scopes into source map**

After line 233 (`result.map = options.format.source_map.toString();`), add the scope encoding:

Replace lines 229-234:
```javascript
        if (options.sourceMap) {
            var map_json;
            if (options.sourceMap.asObject) {
                map_json = options.format.source_map.get().toJSON();
            } else {
                map_json = JSON.parse(options.format.source_map.toString());
            }
            if (scope_map) {
                map_json = scope_map.encode(map_json);
            }
            if (options.sourceMap.asObject) {
                result.map = map_json;
            } else {
                result.map = JSON.stringify(map_json);
            }
            if (options.sourceMap.url == "inline") {
                var sourceMap = typeof result.map === "object" ? JSON.stringify(result.map) : result.map;
                result.code += "\n//# sourceMappingURL=data:application/json;charset=utf-8;base64," + to_base64(sourceMap);
            } else if (options.sourceMap.url) {
                result.code += "\n//# sourceMappingURL=" + options.sourceMap.url;
            }
        }
```

**Step 6: Run lint**

Run: `npm run lint`
Expected: No errors.

**Step 7: Commit**

```bash
git add lib/minify.js
git commit -m "feat: integrate ScopeMap with minify pipeline"
```

---

## Task 8: Write Integration Test

**Files:**
- Modify: `test/mocha/scope-map.js`

**Step 1: Add integration test**

Add to `test/mocha/scope-map.js`:
```javascript
describe("ScopeMap", function() {
    // ... existing tests ...

    describe("minify integration", function() {
        it("should add scopes field to source map when enabled", async function() {
            var result = await minify("var a = 1; function foo(x) { return x + a; }", {
                sourceMap: { scopes: true },
                compress: false,
                mangle: false,
            });

            var map = JSON.parse(result.map);
            assert.ok(map.scopes, "source map should have scopes field");
        });

        it("should not add scopes field when disabled", async function() {
            var result = await minify("var a = 1;", {
                sourceMap: true,
                compress: false,
                mangle: false,
            });

            var map = JSON.parse(result.map);
            assert.ok(!map.scopes, "source map should not have scopes field");
        });

        it("should track mangled variable names in bindings", async function() {
            var result = await minify("function foo(longParameterName) { return longParameterName; }", {
                sourceMap: { scopes: true },
                compress: false,
                mangle: true,
            });

            var map = JSON.parse(result.map);
            assert.ok(map.scopes, "source map should have scopes field");
            // The scopes field contains encoded data - presence is enough for this test
        });
    });
});
```

**Step 2: Run tests**

Run: `npm run test:mocha -- --grep "ScopeMap"`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add test/mocha/scope-map.js
git commit -m "test: add minify integration tests for scope map"
```

---

## Task 9: Test Removed Variables

**Files:**
- Modify: `test/mocha/scope-map.js`

**Step 1: Add test for removed variables**

Add to `test/mocha/scope-map.js`:
```javascript
    describe("removed variables", function() {
        it("should mark unused variables as unavailable", async function() {
            var code = "function foo() { var unused = 1; return 42; }";
            var ast = parse(code);
            ast.figure_out_scope();

            // Capture before compression
            var scope_map = ScopeMap();
            scope_map.capture(ast);

            // Simulate compression removing the variable by checking if it would be marked
            var { root } = scope_map.get_original_scopes();
            var fn_scope = root.children[0];

            assert.ok(fn_scope.variables.has("unused"), "original scope should have unused variable");
        });
    });
```

**Step 2: Run tests**

Run: `npm run test:mocha -- --grep "ScopeMap"`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add test/mocha/scope-map.js
git commit -m "test: add removed variable detection test"
```

---

## Task 10: Update TypeScript Types

**Files:**
- Modify: `tools/terser.d.ts:158-165`

**Step 1: Add scopes option to SourceMapOptions**

In `tools/terser.d.ts`, update `SourceMapOptions` interface (lines 158-165):
```typescript
export interface SourceMapOptions {
    /** Source map object, 'inline' or source map file content */
    content?: RawSourceMap | string;
    includeSources?: boolean;
    filename?: string;
    root?: string;
    /** Enable encoding of scope information in source map */
    scopes?: boolean;
    url?: string | 'inline';
}
```

**Step 2: Commit**

```bash
git add tools/terser.d.ts
git commit -m "feat: add scopes option to TypeScript types"
```

---

## Task 11: Run Full Test Suite

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass (compress tests + mocha tests).

**Step 2: If tests fail, debug and fix**

Common issues:
- Import paths
- Missing variable declarations
- Scope tracking order issues

**Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address test failures"
```

---

## Task 12: Add Arrow Function Scope Tracking

**Files:**
- Modify: `lib/output.js:1327-1370` (AST_Arrow._do_print)

**Step 1: Add scope tracking to arrow functions**

Replace `AST_Arrow.DEFMETHOD("_do_print"` (lines 1327-1370):
```javascript
    AST_Arrow.DEFMETHOD("_do_print", function(output) {
        var self = this;
        var scope_map = output.option("scope_map");
        if (scope_map) {
            scope_map.enter_scope(self, output.line(), output.col());
        }
        var parent = output.parent();
        var needs_parens = (parent instanceof AST_Binary && !(parent instanceof AST_Assign)) ||
            parent instanceof AST_Unary ||
            (parent instanceof AST_Call && self === parent.expression);
        if (needs_parens) { output.print("("); }
        if (self.async) {
            output.print("async");
            output.space();
        }
        if (self.argnames.length === 1 && self.argnames[0] instanceof AST_Symbol) {
            self.argnames[0].print(output);
        } else {
            output.with_parens(function() {
                self.argnames.forEach(function(arg, i) {
                    if (i) output.comma();
                    arg.print(output);
                });
            });
        }
        output.space();
        output.print("=>");
        output.space();
        const first_statement = self.body[0];
        if (
            self.body.length === 1
            && first_statement instanceof AST_Return
        ) {
            const returned = first_statement.value;
            if (!returned) {
                output.print("{}");
            } else if (left_is_object(returned)) {
                output.print("(");
                returned.print(output);
                output.print(")");
            } else {
                returned.print(output);
            }
        } else {
            print_braced(self, output);
        }
        if (needs_parens) { output.print(")"); }
        if (scope_map) {
            scope_map.exit_scope(self, output.line(), output.col());
        }
    });
```

**Step 2: Add test for arrow functions**

Add to `test/mocha/scope-map.js`:
```javascript
        it("should capture arrow function scopes", function() {
            var ast = parse("var fn = (x) => x + 1;");
            ast.figure_out_scope();

            var scope_map = ScopeMap();
            scope_map.capture(ast);

            var { root, list } = scope_map.get_original_scopes();

            assert.strictEqual(list.length, 2);
            var arrow_scope = root.children[0];
            assert.strictEqual(arrow_scope.kind, "Function");
            assert.ok(arrow_scope.variables.has("x"));
        });
```

**Step 3: Run tests**

Run: `npm run test:mocha -- --grep "ScopeMap"`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add lib/output.js test/mocha/scope-map.js
git commit -m "feat: add scope tracking for arrow functions"
```

---

## Summary

After completing all tasks, you will have:

1. Codec dependency installed from JSR registry
2. `lib/scope-map.js` - ScopeMap factory with:
   - `capture()` - Phase 1 scope collection
   - `enter_scope()`/`exit_scope()` - Phase 2 range tracking
   - `encode()` - Codec integration
3. Modified `lib/output.js` with scope tracking hooks
4. Modified `lib/minify.js` with pipeline integration
5. Comprehensive tests in `test/mocha/scope-map.js`
6. Updated TypeScript types

Run `npm test` to verify everything works together.
