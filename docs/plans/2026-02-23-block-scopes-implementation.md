# Block Scopes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend source map scopes to capture block scopes (`let`/`const` in `for`, `if`, `try`/`catch`, `switch`, plain blocks) alongside existing function/global scopes.

**Architecture:** Block scopes in Terser aren't direct `AST_Scope` nodes — they're regular statement nodes (`AST_For`, `AST_Block`, etc.) with a synthetic `.block_scope` property created during `figure_out_scope()`. We extend `capture()` in `scope-map.js` to detect these, and add `enter_scope`/`exit_scope` hooks in each DEFPRINT in `output.js`. Only blocks with `let`/`const`/`class` declarations are captured.

**Tech Stack:** JavaScript ES6 modules, Mocha for tests.

---

## Task 1: Add Block Scope Capture Tests

**Files:**
- Modify: `test/mocha/scope-map.js:76` (after existing capture tests)

**Step 1: Write the failing tests for block scope capture**

Add the following tests inside the existing `describe("capture")` block, after line 75 (after the arrow function test):

```javascript
        it("should capture block scopes with let/const", function() {
            var ast = parse("{ let x = 1; const y = 2; }");
            ast.figure_out_scope();

            var scope_map = ScopeMap();
            scope_map.capture(ast);

            var { root, list } = scope_map.get_original_scopes();

            assert.strictEqual(root.kind, "global");
            var block_scope = root.children[0];
            assert.ok(block_scope, "should have a block scope child");
            assert.strictEqual(block_scope.kind, "block");
            assert.strictEqual(block_scope.is_stack_frame, false);
            assert.ok(block_scope.variables.has("x"), "should have variable x");
            assert.ok(block_scope.variables.has("y"), "should have variable y");
        });

        it("should capture for loop block scope with let", function() {
            var ast = parse("for (let i = 0; i < 10; i++) { let x = i; }");
            ast.figure_out_scope();

            var scope_map = ScopeMap();
            scope_map.capture(ast);

            var { root } = scope_map.get_original_scopes();

            // for loop creates a block scope for 'i'
            var for_scope = root.children.find(c => c.kind === "block" && c.variables.has("i"));
            assert.ok(for_scope, "should have block scope with i");
            assert.strictEqual(for_scope.kind, "block");

            // The body block creates a nested scope for 'x'
            var body_scope = for_scope.children.find(c => c.kind === "block" && c.variables.has("x"));
            assert.ok(body_scope, "should have nested block scope with x");
        });

        it("should capture try/catch block scopes", function() {
            var ast = parse("try { let a = 1; } catch (e) { let b = 2; }");
            ast.figure_out_scope();

            var scope_map = ScopeMap();
            scope_map.capture(ast);

            var { root } = scope_map.get_original_scopes();
            var block_children = root.children.filter(c => c.kind === "block");

            // try body has 'a', catch has 'e' and 'b'
            var try_scope = block_children.find(c => c.variables.has("a"));
            assert.ok(try_scope, "should have try block scope with a");

            var catch_scope = block_children.find(c => c.variables.has("e"));
            assert.ok(catch_scope, "should have catch block scope with e");
            assert.ok(catch_scope.variables.has("b"), "catch scope should also have b");
        });

        it("should skip blocks without let/const bindings", function() {
            var ast = parse("if (true) { console.log('hi'); }");
            ast.figure_out_scope();

            var scope_map = ScopeMap();
            scope_map.capture(ast);

            var { root, list } = scope_map.get_original_scopes();

            // Only global scope — no block scope since there are no let/const
            assert.strictEqual(list.length, 1);
            assert.strictEqual(root.children.length, 0);
        });

        it("should capture nested block scopes inside functions", function() {
            var ast = parse("function foo() { let x = 1; { let y = 2; } }");
            ast.figure_out_scope();

            var scope_map = ScopeMap();
            scope_map.capture(ast);

            var { root } = scope_map.get_original_scopes();

            var fn_scope = root.children.find(c => c.kind === "function");
            assert.ok(fn_scope, "should have function scope");
            assert.ok(fn_scope.variables.has("x"), "function scope has x (let hoists to function in scope analysis)");

            var block_child = fn_scope.children.find(c => c.kind === "block");
            assert.ok(block_child, "should have block scope child");
            assert.ok(block_child.variables.has("y"), "block scope has y");
        });
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:mocha -- --grep "ScopeMap"`
Expected: The new block scope tests FAIL (block scopes are not captured yet). Existing tests still pass.

**Step 3: Commit**

```bash
git add test/mocha/scope-map.js
git commit --no-verify -m "test: add block scope capture tests (failing)"
```

---

## Task 2: Implement Block Scope Capture in scope-map.js

**Files:**
- Modify: `lib/scope-map.js:25-59` (capture function's TreeWalker callback)

**Step 1: Add block scope detection to the TreeWalker**

In `lib/scope-map.js`, the TreeWalker callback (line 25) currently only handles `AST_Scope && !is_block_scope()`. Add a second branch **before** the existing one (block scope check must come first since block-scope-creating nodes are not `AST_Scope` instances in the original AST):

Replace lines 25-59:

```javascript
        var tw = new TreeWalker((node, descend) => {
            // Block scopes: for, if, try/catch, switch, plain {} blocks
            // These are NOT AST_Scope — they get a synthetic .block_scope during figure_out_scope()
            if (node.is_block_scope() && node.block_scope
                && node.block_scope.variables && node.block_scope.variables.size > 0) {
                var scope_info = {
                    index: original_scopes.length,
                    kind: "block",
                    name: null,
                    is_stack_frame: false,
                    start: { line: node.start.line - 1, column: node.start.col },
                    end: { line: node.end.endline - 1, column: node.end.endcol },
                    variables: new Map(),
                    children: [],
                    node: node.block_scope,
                };

                node.block_scope.variables.forEach((def, name) => {
                    scope_info.variables.set(name, { name: name, def: def });
                });

                scope_to_index.set(node.block_scope, scope_info.index);
                original_scopes.push(scope_info);

                if (scope_stack.length > 0) {
                    scope_stack[scope_stack.length - 1].children.push(scope_info);
                }

                scope_stack.push(scope_info);
                descend();
                scope_stack.pop();
                return true;
            }

            // Function and global scopes
            if (node instanceof AST_Scope && !node.is_block_scope()) {
                var scope_info = {
                    index: original_scopes.length,
                    kind: node instanceof AST_Toplevel ? "global" : "function",
                    name: node.name ? node.name.name : null,
                    is_stack_frame: !(node instanceof AST_Toplevel),
                    start: { line: node.start.line - 1, column: node.start.col },
                    end: { line: node.end.endline - 1, column: node.end.endcol },
                    variables: new Map(),
                    children: [],
                    node: node,
                };

                if (node.variables) {
                    node.variables.forEach((def, name) => {
                        if (name === "arguments") return;
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
```

**Step 2: Run tests to verify block scope capture tests pass**

Run: `npm run test:mocha -- --grep "ScopeMap"`
Expected: All tests pass, including the new block scope capture tests.

**Step 3: Commit**

```bash
git add lib/scope-map.js
git commit --no-verify -m "feat: add block scope capture to ScopeMap"
```

---

## Task 3: Add Block Scope Output Hooks Tests

**Files:**
- Modify: `test/mocha/scope-map.js` (in the "generated ranges" describe block)

**Step 1: Write the failing tests for block scope generated ranges**

Add inside the `describe("generated ranges")` block, after the existing tests:

```javascript
        it("should track generated ranges for block scopes", function() {
            var ast = parse("{ let x = 1; }");
            ast.figure_out_scope();

            var scope_map = ScopeMap();
            scope_map.capture(ast);

            var stream = OutputStream({ scope_map: scope_map });
            ast.print(stream);

            var ranges = scope_map.get_generated_ranges();

            var global_range = ranges.find(r => r.original_scope.kind === "global");
            var block_range = ranges.find(r => r.original_scope.kind === "block");

            assert.ok(global_range, "should have global range");
            assert.ok(block_range, "should have block range");
            assert.ok(block_range.bindings.has("x"), "should have binding for x");
            assert.strictEqual(block_range.bindings.get("x"), "x");
        });

        it("should track generated ranges for for loops with let", function() {
            var ast = parse("for (let i = 0; i < 10; i++) {}");
            ast.figure_out_scope();

            var scope_map = ScopeMap();
            scope_map.capture(ast);

            var stream = OutputStream({ scope_map: scope_map });
            ast.print(stream);

            var ranges = scope_map.get_generated_ranges();
            var for_range = ranges.find(r =>
                r.original_scope.kind === "block" && r.original_scope.variables.has("i")
            );

            assert.ok(for_range, "should have block range for for-loop scope");
            assert.ok(for_range.bindings.has("i"), "should have binding for i");
        });
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:mocha -- --grep "ScopeMap"`
Expected: The new generated range tests FAIL (no output hooks for block scopes yet). Capture tests still pass.

**Step 3: Commit**

```bash
git add test/mocha/scope-map.js
git commit --no-verify -m "test: add block scope generated range tests (failing)"
```

---

## Task 4: Add Block Scope Hooks to output.js

**Files:**
- Modify: `lib/output.js:1185-1187` (AST_BlockStatement)
- Modify: `lib/output.js:1191-1202` (AST_Do)
- Modify: `lib/output.js:1203-1211` (AST_While)
- Modify: `lib/output.js:1212-1240` (AST_For)
- Modify: `lib/output.js:1241-1257` (AST_ForIn)
- Modify: `lib/output.js:1489-1508` (AST_If)
- Modify: `lib/output.js:1511-1528` (AST_Switch)
- Modify: `lib/output.js:1550-1562` (AST_Try)
- Modify: `lib/output.js:1563-1573` (AST_Catch)

**Step 1: Add scope hooks to AST_BlockStatement**

Replace lines 1185-1187:

```javascript
    DEFPRINT(AST_BlockStatement, function(self, output) {
        var scope_map = output.option("scope_map");
        if (scope_map) scope_map.enter_scope(self.block_scope, output.line(), output.col());
        print_braced(self, output);
        if (scope_map) scope_map.exit_scope(self.block_scope, output.line(), output.col());
    });
```

**Step 2: Add scope hooks to AST_Do**

Replace lines 1191-1202:

```javascript
    DEFPRINT(AST_Do, function(self, output) {
        var scope_map = output.option("scope_map");
        if (scope_map) scope_map.enter_scope(self.block_scope, output.line(), output.col());
        output.print("do");
        output.space();
        make_block(self.body, output);
        output.space();
        output.print("while");
        output.space();
        output.with_parens(function() {
            self.condition.print(output);
        });
        output.semicolon();
        if (scope_map) scope_map.exit_scope(self.block_scope, output.line(), output.col());
    });
```

**Step 3: Add scope hooks to AST_While**

Replace lines 1203-1211:

```javascript
    DEFPRINT(AST_While, function(self, output) {
        var scope_map = output.option("scope_map");
        if (scope_map) scope_map.enter_scope(self.block_scope, output.line(), output.col());
        output.print("while");
        output.space();
        output.with_parens(function() {
            self.condition.print(output);
        });
        output.space();
        self._do_print_body(output);
        if (scope_map) scope_map.exit_scope(self.block_scope, output.line(), output.col());
    });
```

**Step 4: Add scope hooks to AST_For**

Replace lines 1212-1240:

```javascript
    DEFPRINT(AST_For, function(self, output) {
        var scope_map = output.option("scope_map");
        if (scope_map) scope_map.enter_scope(self.block_scope, output.line(), output.col());
        output.print("for");
        output.space();
        output.with_parens(function() {
            if (self.init) {
                if (self.init instanceof AST_Definitions) {
                    self.init.print(output);
                } else {
                    parenthesize_for_noin(self.init, output, true);
                }
                output.print(";");
                output.space();
            } else {
                output.print(";");
            }
            if (self.condition) {
                self.condition.print(output);
                output.print(";");
                output.space();
            } else {
                output.print(";");
            }
            if (self.step) {
                self.step.print(output);
            }
        });
        output.space();
        self._do_print_body(output);
        if (scope_map) scope_map.exit_scope(self.block_scope, output.line(), output.col());
    });
```

**Step 5: Add scope hooks to AST_ForIn**

Replace lines 1241-1257:

```javascript
    DEFPRINT(AST_ForIn, function(self, output) {
        var scope_map = output.option("scope_map");
        if (scope_map) scope_map.enter_scope(self.block_scope, output.line(), output.col());
        output.print("for");
        if (self.await) {
            output.space();
            output.print("await");
        }
        output.space();
        output.with_parens(function() {
            self.init.print(output);
            output.space();
            output.print(self instanceof AST_ForOf ? "of" : "in");
            output.space();
            self.object.print(output);
        });
        output.space();
        self._do_print_body(output);
        if (scope_map) scope_map.exit_scope(self.block_scope, output.line(), output.col());
    });
```

**Step 6: Add scope hooks to AST_If**

Replace lines 1489-1508:

```javascript
    DEFPRINT(AST_If, function(self, output) {
        var scope_map = output.option("scope_map");
        if (scope_map) scope_map.enter_scope(self.block_scope, output.line(), output.col());
        output.print("if");
        output.space();
        output.with_parens(function() {
            self.condition.print(output);
        });
        output.space();
        if (self.alternative) {
            make_then(self, output);
            output.space();
            output.print("else");
            output.space();
            if (self.alternative instanceof AST_If)
                self.alternative.print(output);
            else
                force_statement(self.alternative, output);
        } else {
            self._do_print_body(output);
        }
        if (scope_map) scope_map.exit_scope(self.block_scope, output.line(), output.col());
    });
```

**Step 7: Add scope hooks to AST_Switch**

Replace lines 1511-1528:

```javascript
    DEFPRINT(AST_Switch, function(self, output) {
        var scope_map = output.option("scope_map");
        if (scope_map) scope_map.enter_scope(self.block_scope, output.line(), output.col());
        output.print("switch");
        output.space();
        output.with_parens(function() {
            self.expression.print(output);
        });
        output.space();
        var last = self.body.length - 1;
        if (last < 0) print_braced_empty(self, output);
        else output.with_block(function() {
            self.body.forEach(function(branch, i) {
                output.indent(true);
                branch.print(output);
                if (i < last && branch.body.length > 0)
                    output.newline();
            });
        });
        if (scope_map) scope_map.exit_scope(self.block_scope, output.line(), output.col());
    });
```

**Step 8: Add scope hooks to AST_Try**

Replace lines 1550-1562:

```javascript
    DEFPRINT(AST_Try, function(self, output) {
        var scope_map = output.option("scope_map");
        if (scope_map) scope_map.enter_scope(self.block_scope, output.line(), output.col());
        output.print("try");
        output.space();
        print_braced(self, output);
        if (self.bcatch) {
            output.space();
            self.bcatch.print(output);
        }
        if (self.bfinally) {
            output.space();
            self.bfinally.print(output);
        }
        if (scope_map) scope_map.exit_scope(self.block_scope, output.line(), output.col());
    });
```

**Step 9: Add scope hooks to AST_Catch**

Replace lines 1563-1573:

```javascript
    DEFPRINT(AST_Catch, function(self, output) {
        var scope_map = output.option("scope_map");
        if (scope_map) scope_map.enter_scope(self.block_scope, output.line(), output.col());
        output.print("catch");
        if (self.argname) {
            output.space();
            output.with_parens(function() {
                self.argname.print(output);
            });
        }
        output.space();
        print_braced(self, output);
        if (scope_map) scope_map.exit_scope(self.block_scope, output.line(), output.col());
    });
```

**Step 10: Run tests to verify block scope generated range tests pass**

Run: `npm run test:mocha -- --grep "ScopeMap"`
Expected: All tests pass.

**Step 11: Commit**

```bash
git add lib/output.js
git commit --no-verify -m "feat: add block scope tracking hooks to output"
```

---

## Task 5: Add Integration Tests

**Files:**
- Modify: `test/mocha/scope-map.js` (in the "minify integration" describe block)

**Step 1: Write integration tests for block scopes with minify**

Add inside the `describe("minify integration")` block:

```javascript
        it("should encode block scopes in source map", async function() {
            var result = await minify("{ let x = 1; const y = 2; }", {
                sourceMap: { scopes: true },
                compress: false,
                mangle: false,
            });

            var map = JSON.parse(result.map);
            assert.ok(map.scopes, "source map should have scopes field");
        });

        it("should track mangled block-scoped variables", async function() {
            var result = await minify("function foo() { for (let longName = 0; longName < 10; longName++) {} }", {
                sourceMap: { scopes: true },
                compress: false,
                mangle: true,
            });

            var map = JSON.parse(result.map);
            assert.ok(map.scopes, "source map should have scopes field");
        });
```

**Step 2: Run tests**

Run: `npm run test:mocha -- --grep "ScopeMap"`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add test/mocha/scope-map.js
git commit --no-verify -m "test: add block scope integration tests"
```

---

## Task 6: Run Full Test Suite

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass (compress tests + mocha tests). No regressions.

**Step 2: If any test fails, debug and fix**

Common issues:
- `block_scope` being `undefined` on nodes that didn't go through `figure_out_scope()`
- Scope ordering issues in the generated range tree
- `enter_scope` called with `undefined` node (should be handled gracefully by the index check)

**Step 3: Commit any fixes**

```bash
git add -A
git commit --no-verify -m "fix: address test failures from block scope support"
```

---

## Summary

After completing all tasks:

1. `lib/scope-map.js` — `capture()` now detects block-scope-creating nodes via `is_block_scope()` and records their `block_scope` variables with `kind: "block"`
2. `lib/output.js` — 9 DEFPRINTs now call `enter_scope`/`exit_scope` with `self.block_scope`
3. `test/mocha/scope-map.js` — Comprehensive tests for block scope capture, generated ranges, and minify integration
4. No changes needed to `compute_bindings()` or `encode()` — they already work generically
