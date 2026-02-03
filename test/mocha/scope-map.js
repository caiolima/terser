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
