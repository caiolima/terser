import assert from "assert";
import { minify } from "../../main.js";
import { decode } from "@chrome-devtools/source-map-scopes-codec";

async function decodeOutputScopes(code, options = {}) {
    const result = await minify(code, {
        sourceMap: { scopes: true, asObject: true, ...options.sourceMap },
        compress: options.compress ?? false,
        mangle: options.mangle ?? false,
    });
    if (result.error) throw result.error;
    const decoded = decode(result.map);
    return { ...decoded, result };
}

describe("sourcemap-scopes", function () {
    it("should produce correct scopes for simple inline with multi-pass", async function () {
        const code = [
            'function logProxy(x) {',
            '    let z = "foo";',
            '    console.log(x + ": " + z);',
            '}',
            '',
            'let v = "Hello World";',
            'logProxy(v);',
        ].join("\n");

        const expected_code = 'console.log("Hello World: foo");';

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: { inline: true, toplevel: true, passes: 2 },
            mangle: { toplevel: true },
        });

        // --- Generated code ---
        assert.strictEqual(result.code, expected_code);

        // --- Original scopes ---
        assert.strictEqual(scopes.length, 1);
        const globalScope = scopes[0];
        assert.strictEqual(globalScope.kind, "global");
        assert.strictEqual(globalScope.isStackFrame, false);
        assert.deepStrictEqual(globalScope.variables, ["logProxy", "v"]);
        assert.deepStrictEqual(globalScope.start, { line: 0, column: 0 });
        assert.deepStrictEqual(globalScope.end, { line: 6, column: 12 });
        assert.strictEqual(globalScope.children.length, 1);

        const logProxyScope = globalScope.children[0];
        assert.strictEqual(logProxyScope.name, "logProxy");
        assert.strictEqual(logProxyScope.kind, "function");
        assert.strictEqual(logProxyScope.isStackFrame, true);
        assert.deepStrictEqual(logProxyScope.variables, ["x", "z"]);
        assert.deepStrictEqual(logProxyScope.start, { line: 0, column: 0 });
        assert.deepStrictEqual(logProxyScope.end, { line: 3, column: 1 });
        assert.strictEqual(logProxyScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, false);
        assert.strictEqual(globalRange.isHidden, false);
        assert.deepStrictEqual(globalRange.start, { line: 0, column: 0 });
        assert.deepStrictEqual(globalRange.end, { line: 0, column: 32 });
        assert.deepStrictEqual(globalRange.values, [
            'function logProxy(x){console.log(x+": foo")}',
            '"Hello World"',
        ]);
        assert.strictEqual(globalRange.children.length, 1);

        const inlinedRange = globalRange.children[0];
        assert.strictEqual(inlinedRange.originalScope, logProxyScope);
        assert.strictEqual(inlinedRange.isStackFrame, false);
        assert.strictEqual(inlinedRange.isHidden, false);
        assert.deepStrictEqual(inlinedRange.start, { line: 0, column: 0 });
        assert.deepStrictEqual(inlinedRange.end, { line: 0, column: 31 });
        assert.deepStrictEqual(inlinedRange.values, ["x", '"foo"']);
        assert.strictEqual(inlinedRange.children.length, 0);
        assert.deepStrictEqual(inlinedRange.callSite, {
            sourceIndex: 0,
            line: 6,
            column: 0,
        });
    });

    it("should produce correct scopes for constant folding and dead code elimination", async function () {
        const code = [
            "const n = 2;",
            "",
            "function f(x, y = 12) {",
            "  const n = 3;",
            "  console.log(y);",
            "  console.log(n);",
            "}",
            "",
            "f(1, n);",
        ].join("\n");

        const expected_code = "!function(o,l=12){console.log(l),console.log(3)}(0,2);";

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: { inline: true, toplevel: true },
            mangle: { toplevel: true },
        });

        // --- Generated code ---
        assert.strictEqual(result.code, expected_code);

        // --- Original scopes ---
        assert.strictEqual(scopes.length, 1);
        const globalScope = scopes[0];
        assert.strictEqual(globalScope.kind, "global");
        assert.strictEqual(globalScope.isStackFrame, false);
        assert.deepStrictEqual(globalScope.variables, ["n", "f"]);
        assert.deepStrictEqual(globalScope.start, { line: 0, column: 0 });
        assert.deepStrictEqual(globalScope.end, { line: 8, column: 8 });
        assert.strictEqual(globalScope.children.length, 1);

        const fScope = globalScope.children[0];
        assert.strictEqual(fScope.name, "f");
        assert.strictEqual(fScope.kind, "function");
        assert.strictEqual(fScope.isStackFrame, true);
        assert.deepStrictEqual(fScope.variables, ["x", "y", "n"]);
        assert.deepStrictEqual(fScope.start, { line: 2, column: 0 });
        assert.deepStrictEqual(fScope.end, { line: 6, column: 1 });
        assert.strictEqual(fScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, false);
        assert.strictEqual(globalRange.isHidden, false);
        assert.deepStrictEqual(globalRange.start, { line: 0, column: 0 });
        assert.deepStrictEqual(globalRange.end, { line: 0, column: 54 });
        assert.deepStrictEqual(globalRange.values, [
            "2",
            "function f(x,y=12){console.log(y),console.log(3)}",
        ]);
        assert.strictEqual(globalRange.children.length, 1);

        const fRange = globalRange.children[0];
        assert.strictEqual(fRange.originalScope, fScope);
        assert.strictEqual(fRange.isStackFrame, true);
        assert.strictEqual(fRange.isHidden, false);
        assert.deepStrictEqual(fRange.start, { line: 0, column: 1 });
        assert.deepStrictEqual(fRange.end, { line: 0, column: 48 });
        assert.deepStrictEqual(fRange.values, ["o", "l", "3"]);
        assert.strictEqual(fRange.children.length, 0);
        assert.strictEqual(fRange.callSite, undefined);
    });
});
