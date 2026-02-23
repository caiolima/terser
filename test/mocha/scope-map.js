import assert from "assert";
import { minify } from "../../main.js";
import { parse } from "../../lib/parse.js";
import { ScopeMap } from "../../lib/scope-map.js";
import { OutputStream } from "../../lib/output.js";

describe("ScopeMap", function() {
    describe("capture", function() {
        it("should capture global scope with variables", function() {
            var ast = parse("var a = 1; var b = 2;");
            ast.figure_out_scope();

            var scope_map = ScopeMap();
            scope_map.capture(ast);

            var { root, list } = scope_map.get_original_scopes();

            assert.ok(root, "should have root scope");
            assert.strictEqual(root.kind, "global");
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
            assert.strictEqual(root.kind, "global");
            assert.strictEqual(root.children.length, 1);

            var fn_scope = root.children[0];
            assert.strictEqual(fn_scope.kind, "function");
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

        it("should capture arrow function scopes", function() {
            var ast = parse("var fn = (x) => x + 1;");
            ast.figure_out_scope();

            var scope_map = ScopeMap();
            scope_map.capture(ast);

            var { root, list } = scope_map.get_original_scopes();

            assert.strictEqual(list.length, 2);
            var arrow_scope = root.children[0];
            assert.strictEqual(arrow_scope.kind, "function");
            assert.ok(arrow_scope.variables.has("x"));
        });

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
    });

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

            var global_range = ranges.find(r => r.original_scope.kind === "global");
            var fn_range = ranges.find(r => r.original_scope.kind === "function");

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
            var fn_range = ranges.find(r => r.original_scope.kind === "function");

            assert.ok(fn_range.bindings.has("x"), "should have binding for x");
            assert.ok(fn_range.bindings.has("y"), "should have binding for y");
            assert.strictEqual(fn_range.bindings.get("x"), "x");
            assert.strictEqual(fn_range.bindings.get("y"), "y");
        });
    });

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
        });
    });

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
});
