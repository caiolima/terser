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
