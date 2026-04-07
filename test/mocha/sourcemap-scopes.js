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

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 6, column: 12 },
            kind: "global",
            isStackFrame: false,
            variables: ["logProxy", "v"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 3, column: 1 },
                kind: "function",
                name: "logProxy",
                isStackFrame: true,
                variables: ["x", "z"],
                children: [],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 32 },
            isStackFrame: false,
            isHidden: false,
            values: [
                'function logProxy(x){console.log(x+": foo")}',
                '"Hello World"',
            ],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 0, column: 31 },
                isStackFrame: false,
                isHidden: false,
                values: ["x", '"foo"'],
                children: [],
                callSite: { sourceIndex: 0, line: 6, column: 0 },
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: { inline: true, toplevel: true, passes: 2 },
            mangle: { toplevel: true },
        });

        // --- Generated code ---
        assert.strictEqual(result.code, expected_code);

        // --- Original scopes ---
        assert.strictEqual(scopes.length, 1);
        const globalScope = scopes[0];
        assert.strictEqual(globalScope.kind, expected_scopes[0].kind);
        assert.strictEqual(globalScope.isStackFrame, expected_scopes[0].isStackFrame);
        assert.deepStrictEqual(globalScope.variables, expected_scopes[0].variables);
        assert.deepStrictEqual(globalScope.start, expected_scopes[0].start);
        assert.deepStrictEqual(globalScope.end, expected_scopes[0].end);
        assert.strictEqual(globalScope.children.length, expected_scopes[0].children.length);

        const logProxyScope = globalScope.children[0];
        assert.strictEqual(logProxyScope.name, expected_scopes[0].children[0].name);
        assert.strictEqual(logProxyScope.kind, expected_scopes[0].children[0].kind);
        assert.strictEqual(logProxyScope.isStackFrame, expected_scopes[0].children[0].isStackFrame);
        assert.deepStrictEqual(logProxyScope.variables, expected_scopes[0].children[0].variables);
        assert.deepStrictEqual(logProxyScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(logProxyScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(logProxyScope.children.length, expected_scopes[0].children[0].children.length);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, expected_ranges[0].children.length);

        const inlinedRange = globalRange.children[0];
        assert.strictEqual(inlinedRange.originalScope, logProxyScope);
        assert.strictEqual(inlinedRange.isStackFrame, expected_ranges[0].children[0].isStackFrame);
        assert.strictEqual(inlinedRange.isHidden, expected_ranges[0].children[0].isHidden);
        assert.deepStrictEqual(inlinedRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(inlinedRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(inlinedRange.values, expected_ranges[0].children[0].values);
        assert.strictEqual(inlinedRange.children.length, expected_ranges[0].children[0].children.length);
        assert.deepStrictEqual(inlinedRange.callSite, expected_ranges[0].children[0].callSite);
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

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 8, column: 8 },
            kind: "global",
            isStackFrame: false,
            variables: ["n", "f"],
            children: [{
                start: { line: 2, column: 0 },
                end: { line: 6, column: 1 },
                kind: "function",
                name: "f",
                isStackFrame: true,
                variables: ["x", "y", "n"],
                children: [],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 54 },
            isStackFrame: false,
            isHidden: false,
            values: [
                "2",
                "function f(x,y=12){console.log(y),console.log(3)}",
            ],
            children: [{
                start: { line: 0, column: 1 },
                end: { line: 0, column: 48 },
                isStackFrame: true,
                isHidden: false,
                values: ["o", "l", "3"],
                children: [],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: { inline: true, toplevel: true },
            mangle: { toplevel: true },
        });

        // --- Generated code ---
        assert.strictEqual(result.code, expected_code);

        // --- Original scopes ---
        assert.strictEqual(scopes.length, 1);
        const globalScope = scopes[0];
        assert.strictEqual(globalScope.kind, expected_scopes[0].kind);
        assert.strictEqual(globalScope.isStackFrame, expected_scopes[0].isStackFrame);
        assert.deepStrictEqual(globalScope.variables, expected_scopes[0].variables);
        assert.deepStrictEqual(globalScope.start, expected_scopes[0].start);
        assert.deepStrictEqual(globalScope.end, expected_scopes[0].end);
        assert.strictEqual(globalScope.children.length, expected_scopes[0].children.length);

        const fScope = globalScope.children[0];
        assert.strictEqual(fScope.name, expected_scopes[0].children[0].name);
        assert.strictEqual(fScope.kind, expected_scopes[0].children[0].kind);
        assert.strictEqual(fScope.isStackFrame, expected_scopes[0].children[0].isStackFrame);
        assert.deepStrictEqual(fScope.variables, expected_scopes[0].children[0].variables);
        assert.deepStrictEqual(fScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(fScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(fScope.children.length, expected_scopes[0].children[0].children.length);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, expected_ranges[0].children.length);

        const fRange = globalRange.children[0];
        assert.strictEqual(fRange.originalScope, fScope);
        assert.strictEqual(fRange.isStackFrame, expected_ranges[0].children[0].isStackFrame);
        assert.strictEqual(fRange.isHidden, expected_ranges[0].children[0].isHidden);
        assert.deepStrictEqual(fRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(fRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(fRange.values, expected_ranges[0].children[0].values);
        assert.strictEqual(fRange.children.length, expected_ranges[0].children[0].children.length);
        assert.strictEqual(fRange.callSite, undefined);
    });
});
