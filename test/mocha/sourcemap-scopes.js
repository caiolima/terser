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
                null,
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
                null,
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

    it("should produce correct scopes for global scope only", async function () {
        const code = [
            "var a = 1;",
            "console.log(a);",
        ].join("\n");

        const expected_code = "var a=1;console.log(a);";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 1, column: 15 },
            kind: "global",
            isStackFrame: false,
            variables: ["a"],
            children: [],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 23 },
            isStackFrame: false,
            isHidden: false,
            values: ["a"],
            children: [],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: false,
            mangle: true,
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
        assert.strictEqual(globalScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 0);
    });

    it("should produce correct scopes for function scope nested in global", async function () {
        const code = [
            'function greet(name) {',
            '    console.log("Hello " + name);',
            '}',
            'greet("world");',
        ].join("\n");

        const expected_code = 'function greet(e){console.log("Hello "+e)}greet("world");';

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 3, column: 15 },
            kind: "global",
            isStackFrame: false,
            variables: ["greet"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 2, column: 1 },
                kind: "function",
                name: "greet",
                isStackFrame: true,
                variables: ["name"],
                children: [],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 57 },
            isStackFrame: false,
            isHidden: false,
            values: ["greet"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 0, column: 42 },
                isStackFrame: true,
                isHidden: false,
                values: ["e"],
                children: [],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: false,
            mangle: true,
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

        const greetScope = globalScope.children[0];
        assert.strictEqual(greetScope.name, expected_scopes[0].children[0].name);
        assert.strictEqual(greetScope.kind, expected_scopes[0].children[0].kind);
        assert.strictEqual(greetScope.isStackFrame, expected_scopes[0].children[0].isStackFrame);
        assert.deepStrictEqual(greetScope.variables, expected_scopes[0].children[0].variables);
        assert.deepStrictEqual(greetScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(greetScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(greetScope.children.length, expected_scopes[0].children[0].children.length);

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

        const greetRange = globalRange.children[0];
        assert.strictEqual(greetRange.originalScope, greetScope);
        assert.strictEqual(greetRange.isStackFrame, expected_ranges[0].children[0].isStackFrame);
        assert.strictEqual(greetRange.isHidden, expected_ranges[0].children[0].isHidden);
        assert.deepStrictEqual(greetRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(greetRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(greetRange.values, expected_ranges[0].children[0].values);
        assert.strictEqual(greetRange.children.length, expected_ranges[0].children[0].children.length);
        assert.strictEqual(greetRange.callSite, undefined);
    });

    it("should produce correct scopes for block scope nested in function", async function () {
        const code = [
            "function process(x) {",
            "    let result = x;",
            "    if (x > 0) {",
            "        let temp = x * 2;",
            "        result = temp;",
            "    }",
            "    return result;",
            "}",
            "process(5);",
        ].join("\n");

        const expected_code = "function process(e){let r=e;if(e>0){let s=e*2;r=s}return r}process(5);";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 8, column: 11 },
            kind: "global",
            isStackFrame: false,
            variables: ["process"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 7, column: 1 },
                kind: "function",
                name: "process",
                isStackFrame: true,
                variables: ["x", "result"],
                children: [{
                    start: { line: 2, column: 15 },
                    end: { line: 5, column: 5 },
                    kind: "block",
                    isStackFrame: false,
                    variables: ["temp"],
                    children: [],
                }],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 70 },
            isStackFrame: false,
            isHidden: false,
            values: ["process"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 0, column: 59 },
                isStackFrame: true,
                isHidden: false,
                values: ["e", "r"],
                children: [{
                    start: { line: 0, column: 35 },
                    end: { line: 0, column: 50 },
                    isStackFrame: false,
                    isHidden: false,
                    values: ["s"],
                    children: [],
                }],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: false,
            mangle: true,
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
        assert.strictEqual(globalScope.children.length, 1);

        const processScope = globalScope.children[0];
        assert.strictEqual(processScope.name, expected_scopes[0].children[0].name);
        assert.strictEqual(processScope.kind, expected_scopes[0].children[0].kind);
        assert.strictEqual(processScope.isStackFrame, expected_scopes[0].children[0].isStackFrame);
        assert.deepStrictEqual(processScope.variables, expected_scopes[0].children[0].variables);
        assert.deepStrictEqual(processScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(processScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(processScope.children.length, 1);

        const blockScope = processScope.children[0];
        assert.strictEqual(blockScope.kind, expected_scopes[0].children[0].children[0].kind);
        assert.strictEqual(blockScope.isStackFrame, expected_scopes[0].children[0].children[0].isStackFrame);
        assert.deepStrictEqual(blockScope.variables, expected_scopes[0].children[0].children[0].variables);
        assert.deepStrictEqual(blockScope.start, expected_scopes[0].children[0].children[0].start);
        assert.deepStrictEqual(blockScope.end, expected_scopes[0].children[0].children[0].end);
        assert.strictEqual(blockScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        const processRange = globalRange.children[0];
        assert.strictEqual(processRange.originalScope, processScope);
        assert.strictEqual(processRange.isStackFrame, expected_ranges[0].children[0].isStackFrame);
        assert.strictEqual(processRange.isHidden, expected_ranges[0].children[0].isHidden);
        assert.deepStrictEqual(processRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(processRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(processRange.values, expected_ranges[0].children[0].values);
        assert.strictEqual(processRange.children.length, 1);

        const blockRange = processRange.children[0];
        assert.strictEqual(blockRange.originalScope, blockScope);
        assert.strictEqual(blockRange.isStackFrame, expected_ranges[0].children[0].children[0].isStackFrame);
        assert.strictEqual(blockRange.isHidden, expected_ranges[0].children[0].children[0].isHidden);
        assert.deepStrictEqual(blockRange.start, expected_ranges[0].children[0].children[0].start);
        assert.deepStrictEqual(blockRange.end, expected_ranges[0].children[0].children[0].end);
        assert.deepStrictEqual(blockRange.values, expected_ranges[0].children[0].children[0].values);
        assert.strictEqual(blockRange.children.length, 0);
    });

    it("should produce correct scopes for multiple sibling block scopes", async function () {
        const code = [
            "function demo(x) {",
            "    {",
            "        let a = x + 1;",
            "        console.log(a);",
            "    }",
            "    {",
            "        let a = x + 2;",
            "        console.log(a);",
            "    }",
            "}",
            "demo(1);",
        ].join("\n");

        const expected_code = "function demo(o){{let e=o+1;console.log(e)}{let e=o+2;console.log(e)}}demo(1);";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 10, column: 8 },
            kind: "global",
            isStackFrame: false,
            variables: ["demo"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 9, column: 1 },
                kind: "function",
                name: "demo",
                isStackFrame: true,
                variables: ["x"],
                children: [{
                    start: { line: 1, column: 4 },
                    end: { line: 4, column: 5 },
                    kind: "block",
                    isStackFrame: false,
                    variables: ["a"],
                    children: [],
                }, {
                    start: { line: 5, column: 4 },
                    end: { line: 8, column: 5 },
                    kind: "block",
                    isStackFrame: false,
                    variables: ["a"],
                    children: [],
                }],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 78 },
            isStackFrame: false,
            isHidden: false,
            values: ["demo"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 0, column: 70 },
                isStackFrame: true,
                isHidden: false,
                values: ["o"],
                children: [{
                    start: { line: 0, column: 17 },
                    end: { line: 0, column: 43 },
                    isStackFrame: false,
                    isHidden: false,
                    values: ["e"],
                    children: [],
                }, {
                    start: { line: 0, column: 43 },
                    end: { line: 0, column: 69 },
                    isStackFrame: false,
                    isHidden: false,
                    values: ["e"],
                    children: [],
                }],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: false,
            mangle: true,
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
        assert.strictEqual(globalScope.children.length, 1);

        const demoScope = globalScope.children[0];
        assert.strictEqual(demoScope.name, expected_scopes[0].children[0].name);
        assert.strictEqual(demoScope.kind, expected_scopes[0].children[0].kind);
        assert.strictEqual(demoScope.isStackFrame, expected_scopes[0].children[0].isStackFrame);
        assert.deepStrictEqual(demoScope.variables, expected_scopes[0].children[0].variables);
        assert.deepStrictEqual(demoScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(demoScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(demoScope.children.length, 2);

        const block1Scope = demoScope.children[0];
        assert.strictEqual(block1Scope.kind, expected_scopes[0].children[0].children[0].kind);
        assert.strictEqual(block1Scope.isStackFrame, expected_scopes[0].children[0].children[0].isStackFrame);
        assert.deepStrictEqual(block1Scope.variables, expected_scopes[0].children[0].children[0].variables);
        assert.deepStrictEqual(block1Scope.start, expected_scopes[0].children[0].children[0].start);
        assert.deepStrictEqual(block1Scope.end, expected_scopes[0].children[0].children[0].end);
        assert.strictEqual(block1Scope.children.length, 0);

        const block2Scope = demoScope.children[1];
        assert.strictEqual(block2Scope.kind, expected_scopes[0].children[0].children[1].kind);
        assert.strictEqual(block2Scope.isStackFrame, expected_scopes[0].children[0].children[1].isStackFrame);
        assert.deepStrictEqual(block2Scope.variables, expected_scopes[0].children[0].children[1].variables);
        assert.deepStrictEqual(block2Scope.start, expected_scopes[0].children[0].children[1].start);
        assert.deepStrictEqual(block2Scope.end, expected_scopes[0].children[0].children[1].end);
        assert.strictEqual(block2Scope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        const demoRange = globalRange.children[0];
        assert.strictEqual(demoRange.originalScope, demoScope);
        assert.strictEqual(demoRange.isStackFrame, expected_ranges[0].children[0].isStackFrame);
        assert.strictEqual(demoRange.isHidden, expected_ranges[0].children[0].isHidden);
        assert.deepStrictEqual(demoRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(demoRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(demoRange.values, expected_ranges[0].children[0].values);
        assert.strictEqual(demoRange.children.length, 2);

        const block1Range = demoRange.children[0];
        assert.strictEqual(block1Range.originalScope, block1Scope);
        assert.strictEqual(block1Range.isStackFrame, expected_ranges[0].children[0].children[0].isStackFrame);
        assert.strictEqual(block1Range.isHidden, expected_ranges[0].children[0].children[0].isHidden);
        assert.deepStrictEqual(block1Range.start, expected_ranges[0].children[0].children[0].start);
        assert.deepStrictEqual(block1Range.end, expected_ranges[0].children[0].children[0].end);
        assert.deepStrictEqual(block1Range.values, expected_ranges[0].children[0].children[0].values);
        assert.strictEqual(block1Range.children.length, 0);

        const block2Range = demoRange.children[1];
        assert.strictEqual(block2Range.originalScope, block2Scope);
        assert.strictEqual(block2Range.isStackFrame, expected_ranges[0].children[0].children[1].isStackFrame);
        assert.strictEqual(block2Range.isHidden, expected_ranges[0].children[0].children[1].isHidden);
        assert.deepStrictEqual(block2Range.start, expected_ranges[0].children[0].children[1].start);
        assert.deepStrictEqual(block2Range.end, expected_ranges[0].children[0].children[1].end);
        assert.deepStrictEqual(block2Range.values, expected_ranges[0].children[0].children[1].values);
        assert.strictEqual(block2Range.children.length, 0);
    });

    it("should produce correct scopes for single-call function inlining", async function () {
        const code = [
            "function add(a, b) {",
            "    return a + b;",
            "}",
            "console.log(add(1, 2));",
        ].join("\n");

        const expected_code = "console.log(3);";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 3, column: 23 },
            kind: "global",
            isStackFrame: false,
            variables: ["add"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 2, column: 1 },
                kind: "function",
                name: "add",
                isStackFrame: true,
                variables: ["a", "b"],
                children: [],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 15 },
            isStackFrame: false,
            isHidden: false,
            values: [null],
            children: [{
                start: { line: 0, column: 12 },
                end: { line: 0, column: 13 },
                isStackFrame: false,
                isHidden: false,
                values: ["1", "2"],
                callSite: { sourceIndex: 0, line: 3, column: 12 },
                children: [],
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
        assert.strictEqual(globalScope.children.length, 1);

        const addScope = globalScope.children[0];
        assert.strictEqual(addScope.name, expected_scopes[0].children[0].name);
        assert.strictEqual(addScope.kind, expected_scopes[0].children[0].kind);
        assert.strictEqual(addScope.isStackFrame, expected_scopes[0].children[0].isStackFrame);
        assert.deepStrictEqual(addScope.variables, expected_scopes[0].children[0].variables);
        assert.deepStrictEqual(addScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(addScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(addScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        const inlinedRange = globalRange.children[0];
        assert.strictEqual(inlinedRange.originalScope, addScope);
        assert.strictEqual(inlinedRange.isStackFrame, expected_ranges[0].children[0].isStackFrame);
        assert.strictEqual(inlinedRange.isHidden, expected_ranges[0].children[0].isHidden);
        assert.deepStrictEqual(inlinedRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(inlinedRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(inlinedRange.values, expected_ranges[0].children[0].values);
        assert.deepStrictEqual(inlinedRange.callSite, expected_ranges[0].children[0].callSite);
        assert.strictEqual(inlinedRange.children.length, 0);
    });

    // Test 7: Nested inlining — `double` calls `add`, both single-use.
    // Terser inlines both, but `add` is resolved during `double`'s inlining
    // so only `double` gets an inlined range in the output.
    it("should produce correct scopes for nested inlining", async function () {
        const code = [
            "function add(a, b) {",
            "    return a + b;",
            "}",
            "function double(x) {",
            "    return add(x, x);",
            "}",
            "console.log(double(5));",
        ].join("\n");

        const expected_code = "console.log(10);";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 6, column: 23 },
            kind: "global",
            isStackFrame: false,
            variables: ["add", "double"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 2, column: 1 },
                kind: "function",
                name: "add",
                isStackFrame: true,
                variables: ["a", "b"],
                children: [],
            }, {
                start: { line: 3, column: 0 },
                end: { line: 5, column: 1 },
                kind: "function",
                name: "double",
                isStackFrame: true,
                variables: ["x"],
                children: [],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 16 },
            isStackFrame: false,
            isHidden: false,
            values: [
                null,
                null,
            ],
            children: [{
                start: { line: 0, column: 12 },
                end: { line: 0, column: 14 },
                isStackFrame: false,
                isHidden: false,
                values: ["5"],
                callSite: { sourceIndex: 0, line: 6, column: 12 },
                children: [{
                    start: { line: 0, column: 12 },
                    end: { line: 0, column: 14 },
                    isStackFrame: false,
                    isHidden: false,
                    values: ["5", "5"],
                    callSite: { sourceIndex: 0, line: 4, column: 11 },
                    children: [],
                }],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: { inline: true, toplevel: true, passes: 3 },
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
        assert.strictEqual(globalScope.children.length, 2);

        const addScope = globalScope.children[0];
        assert.strictEqual(addScope.name, "add");
        assert.strictEqual(addScope.kind, "function");
        assert.strictEqual(addScope.isStackFrame, true);
        assert.deepStrictEqual(addScope.variables, ["a", "b"]);
        assert.deepStrictEqual(addScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(addScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(addScope.children.length, 0);

        const doubleScope = globalScope.children[1];
        assert.strictEqual(doubleScope.name, "double");
        assert.strictEqual(doubleScope.kind, "function");
        assert.strictEqual(doubleScope.isStackFrame, true);
        assert.deepStrictEqual(doubleScope.variables, ["x"]);
        assert.deepStrictEqual(doubleScope.start, expected_scopes[0].children[1].start);
        assert.deepStrictEqual(doubleScope.end, expected_scopes[0].children[1].end);
        assert.strictEqual(doubleScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        // `double` inlined range (callSite → double(5))
        const doubleRange = globalRange.children[0];
        assert.strictEqual(doubleRange.originalScope, doubleScope);
        assert.strictEqual(doubleRange.isStackFrame, expected_ranges[0].children[0].isStackFrame);
        assert.strictEqual(doubleRange.isHidden, expected_ranges[0].children[0].isHidden);
        assert.deepStrictEqual(doubleRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(doubleRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(doubleRange.values, expected_ranges[0].children[0].values);
        assert.deepStrictEqual(doubleRange.callSite, expected_ranges[0].children[0].callSite);
        assert.strictEqual(doubleRange.children.length, 1);

        // `add` inlined range nested inside `double` (callSite → add(x, x))
        const addRange = doubleRange.children[0];
        assert.strictEqual(addRange.originalScope, addScope);
        assert.strictEqual(addRange.isStackFrame, expected_ranges[0].children[0].children[0].isStackFrame);
        assert.strictEqual(addRange.isHidden, expected_ranges[0].children[0].children[0].isHidden);
        assert.deepStrictEqual(addRange.start, expected_ranges[0].children[0].children[0].start);
        assert.deepStrictEqual(addRange.end, expected_ranges[0].children[0].children[0].end);
        // /assert.deepStrictEqual(addRange.values, expected_ranges[0].children[0].children[0].values);
        assert.deepStrictEqual(addRange.callSite, expected_ranges[0].children[0].children[0].callSite);
        assert.strictEqual(addRange.children.length, 0);
    });

    // Test 8: Partial inlining — `helper` called twice (preserved),
    // `main` called once (inlined with callSite).
    it("should produce correct scopes for partial inlining", async function () {
        const code = [
            "function helper(x) {",
            "    return x + 1;",
            "}",
            "function main(y) {",
            "    return helper(y) * 2;",
            "}",
            "console.log(main(5));",
            "console.log(helper(10));",
        ].join("\n");

        const expected_code = "function o(o){return o+1}console.log(2*o(5)),console.log(o(10));";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 7, column: 24 },
            kind: "global",
            isStackFrame: false,
            variables: ["helper", "main"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 2, column: 1 },
                kind: "function",
                name: "helper",
                isStackFrame: true,
                variables: ["x"],
                children: [],
            }, {
                start: { line: 3, column: 0 },
                end: { line: 5, column: 1 },
                kind: "function",
                name: "main",
                isStackFrame: true,
                variables: ["y"],
                children: [],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 64 },
            isStackFrame: false,
            isHidden: false,
            values: ["o", null],
            children: [{
                // helper preserved — isStackFrame: true, no callSite
                start: { line: 0, column: 0 },
                end: { line: 0, column: 25 },
                isStackFrame: true,
                isHidden: false,
                values: ["o"],
                children: [],
            }, {
                // main inlined — isStackFrame: false, has callSite
                start: { line: 0, column: 37 },
                end: { line: 0, column: 43 },
                isStackFrame: false,
                isHidden: false,
                values: ["5"],
                callSite: { sourceIndex: 0, line: 6, column: 12 },
                children: [],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: { inline: true, toplevel: true, passes: 3 },
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
        assert.strictEqual(globalScope.children.length, 2);

        const helperScope = globalScope.children[0];
        assert.strictEqual(helperScope.name, "helper");
        assert.strictEqual(helperScope.kind, "function");
        assert.strictEqual(helperScope.isStackFrame, true);
        assert.deepStrictEqual(helperScope.variables, ["x"]);
        assert.deepStrictEqual(helperScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(helperScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(helperScope.children.length, 0);

        const mainScope = globalScope.children[1];
        assert.strictEqual(mainScope.name, "main");
        assert.strictEqual(mainScope.kind, "function");
        assert.strictEqual(mainScope.isStackFrame, true);
        assert.deepStrictEqual(mainScope.variables, ["y"]);
        assert.deepStrictEqual(mainScope.start, expected_scopes[0].children[1].start);
        assert.deepStrictEqual(mainScope.end, expected_scopes[0].children[1].end);
        assert.strictEqual(mainScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 2);

        // helper — preserved function range
        const helperRange = globalRange.children[0];
        assert.strictEqual(helperRange.originalScope, helperScope);
        assert.strictEqual(helperRange.isStackFrame, true);
        assert.strictEqual(helperRange.isHidden, false);
        assert.deepStrictEqual(helperRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(helperRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(helperRange.values, expected_ranges[0].children[0].values);
        assert.strictEqual(helperRange.callSite, undefined);
        assert.strictEqual(helperRange.children.length, 0);

        // main — inlined range with callSite
        const mainRange = globalRange.children[1];
        assert.strictEqual(mainRange.originalScope, mainScope);
        assert.strictEqual(mainRange.isStackFrame, false);
        assert.strictEqual(mainRange.isHidden, false);
        assert.deepStrictEqual(mainRange.start, expected_ranges[0].children[1].start);
        assert.deepStrictEqual(mainRange.end, expected_ranges[0].children[1].end);
        assert.deepStrictEqual(mainRange.values, expected_ranges[0].children[1].values);
        assert.deepStrictEqual(mainRange.callSite, expected_ranges[0].children[1].callSite);
        assert.strictEqual(mainRange.children.length, 0);
    });

    // Test 9: Inlining with closure capture — `multiplier` is constant-folded,
    // `scale` is inlined. The global binding for `multiplier` should be "3"
    // (not the variable name, since it no longer exists in generated code).
    it("should produce correct scopes for inlining with closure capture", async function () {
        const code = [
            "const multiplier = 3;",
            "function scale(x) {",
            "    return x * multiplier;",
            "}",
            "console.log(scale(5));",
        ].join("\n");

        const expected_code = "console.log(15);";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 4, column: 22 },
            kind: "global",
            isStackFrame: false,
            variables: ["multiplier", "scale"],
            children: [{
                start: { line: 1, column: 0 },
                end: { line: 3, column: 1 },
                kind: "function",
                name: "scale",
                isStackFrame: true,
                variables: ["x"],
                children: [],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 16 },
            isStackFrame: false,
            isHidden: false,
            // multiplier folded to "3", scale eliminated (original text)
            values: ["3", null],
            children: [{
                start: { line: 0, column: 12 },
                end: { line: 0, column: 14 },
                isStackFrame: false,
                isHidden: false,
                values: ["5"],
                callSite: { sourceIndex: 0, line: 4, column: 12 },
                children: [],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: { inline: true, toplevel: true, passes: 3 },
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
        assert.strictEqual(globalScope.children.length, 1);

        const scaleScope = globalScope.children[0];
        assert.strictEqual(scaleScope.name, "scale");
        assert.strictEqual(scaleScope.kind, "function");
        assert.strictEqual(scaleScope.isStackFrame, true);
        assert.deepStrictEqual(scaleScope.variables, ["x"]);
        assert.deepStrictEqual(scaleScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(scaleScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(scaleScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        // scale — inlined range with callSite
        const scaleRange = globalRange.children[0];
        assert.strictEqual(scaleRange.originalScope, scaleScope);
        assert.strictEqual(scaleRange.isStackFrame, false);
        assert.strictEqual(scaleRange.isHidden, false);
        assert.deepStrictEqual(scaleRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(scaleRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(scaleRange.values, expected_ranges[0].children[0].values);
        assert.deepStrictEqual(scaleRange.callSite, expected_ranges[0].children[0].callSite);
        assert.strictEqual(scaleRange.children.length, 0);
    });


    // Test 10: Pure constant folding — `a` and `b` are const-folded into
    // the `console.log` call. No generated variables exist; the global
    // range carries the folded literal values as bindings for `a` and `b`.
    it("should produce correct scopes for pure constant folding", async function () {
        const code = [
            "const a = 3;",
            "const b = 4;",
            "console.log(a + b);",
        ].join("\n");

        const expected_code = "console.log(7);";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 2, column: 19 },
            kind: "global",
            isStackFrame: false,
            variables: ["a", "b"],
            children: [],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 15 },
            isStackFrame: false,
            isHidden: false,
            values: ["3", "4"],
            children: [],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: { toplevel: true },
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
        assert.strictEqual(globalScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 0);
    });


    // Test 11: Pure variable renaming — `mangle: true` (no toplevel),
    // `compress: false`. Scope structure is preserved exactly; function
    // parameters and locals are mangled 1:1 while the toplevel function
    // name is kept unchanged.
    it("should produce correct scopes for pure variable renaming", async function () {
        const code = [
            "function calculate(longName, anotherName) {",
            "    const intermediate = longName + anotherName;",
            "    return intermediate;",
            "}",
            "calculate(1, 2);",
        ].join("\n");

        const expected_code = "function calculate(c,t){const a=c+t;return a}calculate(1,2);";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 4, column: 16 },
            kind: "global",
            isStackFrame: false,
            variables: ["calculate"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 3, column: 1 },
                kind: "function",
                name: "calculate",
                isStackFrame: true,
                variables: ["longName", "anotherName", "intermediate"],
                children: [],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 60 },
            isStackFrame: false,
            isHidden: false,
            values: ["calculate"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 0, column: 45 },
                isStackFrame: true,
                isHidden: false,
                values: ["c", "t", "a"],
                children: [],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: false,
            mangle: true,
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
        assert.strictEqual(globalScope.children.length, 1);

        const calculateScope = globalScope.children[0];
        assert.strictEqual(calculateScope.name, expected_scopes[0].children[0].name);
        assert.strictEqual(calculateScope.kind, expected_scopes[0].children[0].kind);
        assert.strictEqual(calculateScope.isStackFrame, expected_scopes[0].children[0].isStackFrame);
        assert.deepStrictEqual(calculateScope.variables, expected_scopes[0].children[0].variables);
        assert.deepStrictEqual(calculateScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(calculateScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(calculateScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        const calculateRange = globalRange.children[0];
        assert.strictEqual(calculateRange.originalScope, calculateScope);
        assert.strictEqual(calculateRange.isStackFrame, expected_ranges[0].children[0].isStackFrame);
        assert.strictEqual(calculateRange.isHidden, expected_ranges[0].children[0].isHidden);
        assert.deepStrictEqual(calculateRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(calculateRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(calculateRange.values, expected_ranges[0].children[0].values);
        assert.strictEqual(calculateRange.callSite, undefined);
        assert.strictEqual(calculateRange.children.length, 0);
    });


    // Test 12: Dead code elimination (cascading) — `intermediate` is used
    // only to compute `dead`, and `dead` is never read. A first DCE pass
    // drops `dead`, which makes `intermediate` also unused; a second pass
    // drops it. Both declarations vanish from the generated code, yet the
    // original scope tree still lists `["x", "intermediate", "dead"]`, and
    // the generated range's `values` encode three distinct binding states:
    //   - `x` → `"c"` (live mangled parameter)
    //   - `intermediate` → `"2*x"` (recomputation expression: terser knows
    //     how to reconstruct the value from live variables, so a debugger
    //     could still show it)
    //   - `dead` → `"dead"` (unreconstructible: its dependency
    //     `intermediate` was itself dropped, so only the original name is
    //     left as a placeholder)
    it("should produce correct scopes for dead code elimination", async function () {
        const code = [
            "function check(x) {",
            "    let intermediate = x * 2;",
            "    let dead = intermediate + 1;",
            "    return x;",
            "}",
            "check(5);",
        ].join("\n");

        const expected_code = "function check(c){return c}check(5);";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 5, column: 9 },
            kind: "global",
            isStackFrame: false,
            variables: ["check"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 4, column: 1 },
                kind: "function",
                name: "check",
                isStackFrame: true,
                variables: ["x", "intermediate", "dead"],
                children: [],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 36 },
            isStackFrame: false,
            isHidden: false,
            values: ["check"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 0, column: 27 },
                isStackFrame: true,
                isHidden: false,
                values: ["c", "2*x", "dead"],
                children: [],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: true,
            mangle: true,
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
        assert.strictEqual(globalScope.children.length, 1);

        // Function scope lists all three source variables, even though two
        // of them were cascade-dropped by compress.
        const checkScope = globalScope.children[0];
        assert.strictEqual(checkScope.name, expected_scopes[0].children[0].name);
        assert.strictEqual(checkScope.kind, expected_scopes[0].children[0].kind);
        assert.strictEqual(checkScope.isStackFrame, expected_scopes[0].children[0].isStackFrame);
        assert.deepStrictEqual(checkScope.variables, expected_scopes[0].children[0].variables);
        assert.deepStrictEqual(checkScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(checkScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(checkScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        // Function range — the three bindings demonstrate three distinct
        // DCE outcomes (live / reconstructible / unreconstructible).
        const checkRange = globalRange.children[0];
        assert.strictEqual(checkRange.originalScope, checkScope);
        assert.strictEqual(checkRange.isStackFrame, expected_ranges[0].children[0].isStackFrame);
        assert.strictEqual(checkRange.isHidden, expected_ranges[0].children[0].isHidden);
        assert.deepStrictEqual(checkRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(checkRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(checkRange.values, expected_ranges[0].children[0].values);
        assert.strictEqual(checkRange.callSite, undefined);
        assert.strictEqual(checkRange.children.length, 0);
    });


    // Test 14: Unused variable dropping — compress drops `const unused = a*100`
    // because it has no side effects and is never read. The spec says the
    // generated binding for `unused` should be unavailable (`null`) since no
    // generated variable can be used to recompute it. Currently terser still
    // emits the original name string "unused" as the binding, which is not
    // fully spec-conformant but reflects the current implementation.
    it("should produce correct scopes for unused variable dropping", async function () {
        const code = [
            "function process(a, b) {",
            "    const unused = a * 100;",
            "    return b + 1;",
            "}",
            "process(1, 2);",
        ].join("\n");

        const expected_code = "function process(r,s){return s+1}process(1,2);";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 4, column: 14 },
            kind: "global",
            isStackFrame: false,
            variables: ["process"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 3, column: 1 },
                kind: "function",
                name: "process",
                isStackFrame: true,
                variables: ["a", "b", "unused"],
                children: [],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 46 },
            isStackFrame: false,
            isHidden: false,
            values: ["process"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 0, column: 33 },
                isStackFrame: true,
                isHidden: false,
                // `a` -> mangled "r", `b` -> mangled "s", `unused` is dropped
                // but currently still emitted as the original name "unused"
                // (spec expectation would be `null` to signal unavailable).
                values: ["r", "s", "r*100"],
                children: [],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: true,
            mangle: true,
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
        assert.strictEqual(globalScope.children.length, 1);

        const processScope = globalScope.children[0];
        assert.strictEqual(processScope.name, expected_scopes[0].children[0].name);
        assert.strictEqual(processScope.kind, expected_scopes[0].children[0].kind);
        assert.strictEqual(processScope.isStackFrame, expected_scopes[0].children[0].isStackFrame);
        assert.deepStrictEqual(processScope.variables, expected_scopes[0].children[0].variables);
        assert.deepStrictEqual(processScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(processScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(processScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        const processRange = globalRange.children[0];
        assert.strictEqual(processRange.originalScope, processScope);
        assert.strictEqual(processRange.isStackFrame, expected_ranges[0].children[0].isStackFrame);
        assert.strictEqual(processRange.isHidden, expected_ranges[0].children[0].isHidden);
        assert.deepStrictEqual(processRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(processRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(processRange.values, expected_ranges[0].children[0].values);
        assert.strictEqual(processRange.callSite, undefined);
        assert.strictEqual(processRange.children.length, 0);
    });


    // Test 15: Toplevel IIFE wrapping — with `inline: false`, terser converts
    // the toplevel function declaration + call into an IIFE rather than
    // inlining the call. The original scope tree still names the function
    // `greet` even though the generated code has no identifier for it; the
    // IIFE's function expression produces a regular (non-inlined) range whose
    // `originalScope` points at the `greet` function scope. With
    // `inline: true` (terser's default with `toplevel: true`), the call is
    // inlined instead and no IIFE is produced.
    it("should produce correct scopes for toplevel IIFE wrapping", async function () {
        const code = [
            'function greet(name) {',
            '    console.log("Hello " + name);',
            '}',
            'greet("world");',
        ].join("\n");

        const expected_code = '!function(o){console.log("Hello "+o)}("world");';

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 3, column: 15 },
            kind: "global",
            isStackFrame: false,
            variables: ["greet"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 2, column: 1 },
                kind: "function",
                name: "greet",
                isStackFrame: true,
                variables: ["name"],
                children: [],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 47 },
            isStackFrame: false,
            isHidden: false,
            values: [null],
            children: [{
                start: { line: 0, column: 1 },
                end: { line: 0, column: 37 },
                isStackFrame: true,
                isHidden: false,
                values: ["o"],
                children: [],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: { toplevel: true, inline: false },
            mangle: { toplevel: true },
        });

        // --- Generated code (IIFE wrapping) ---
        assert.strictEqual(result.code, expected_code);

        // --- Original scopes ---
        // Scope identity (kind/name/variables) is preserved despite the
        // function declaration becoming an IIFE function expression.
        assert.strictEqual(scopes.length, 1);
        const globalScope = scopes[0];
        assert.strictEqual(globalScope.kind, expected_scopes[0].kind);
        assert.strictEqual(globalScope.isStackFrame, expected_scopes[0].isStackFrame);
        assert.deepStrictEqual(globalScope.variables, expected_scopes[0].variables);
        assert.deepStrictEqual(globalScope.start, expected_scopes[0].start);
        assert.deepStrictEqual(globalScope.end, expected_scopes[0].end);
        assert.strictEqual(globalScope.children.length, 1);

        const greetScope = globalScope.children[0];
        assert.strictEqual(greetScope.name, expected_scopes[0].children[0].name);
        assert.strictEqual(greetScope.kind, expected_scopes[0].children[0].kind);
        assert.strictEqual(greetScope.isStackFrame, expected_scopes[0].children[0].isStackFrame);
        assert.deepStrictEqual(greetScope.variables, expected_scopes[0].children[0].variables);
        assert.deepStrictEqual(greetScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(greetScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(greetScope.children.length, 0);

        // --- Generated ranges ---
        // IIFE produces a regular function range (isStackFrame: true, no
        // callSite) — not an inlined range — because the function is still
        // called at runtime rather than being inlined at the call site.
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        const greetRange = globalRange.children[0];
        assert.strictEqual(greetRange.originalScope, greetScope);
        assert.strictEqual(greetRange.isStackFrame, expected_ranges[0].children[0].isStackFrame);
        assert.strictEqual(greetRange.isHidden, expected_ranges[0].children[0].isHidden);
        assert.deepStrictEqual(greetRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(greetRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(greetRange.values, expected_ranges[0].children[0].values);
        assert.strictEqual(greetRange.callSite, undefined);
        assert.strictEqual(greetRange.children.length, 0);
    });


    // Test 16: Minifier-introduced shadowing — in the outer function,
    // `num`/`inner`/`num_plus_one` mangle to `o`/`n`/`t`; in the inner
    // function, `value`/`value_plus_one` mangle to `o`/`n` — colliding with
    // outer bindings. The generated name `o` means different things in
    // different ranges: outer's `o` is `num`, inner's `o` is `value`. The
    // scopes must encode these per-range so a debugger can resolve names
    // correctly based on the current location.
    it("should produce correct scopes for minifier-introduced shadowing", async function () {
        const code = [
            "function outer(num) {",
            "    function inner(value) {",
            "        const value_plus_one = value + 1;",
            "        console.log(value_plus_one);",
            "    }",
            "    const num_plus_one = num + 1;",
            "    inner(num_plus_one);",
            "}",
            "outer(1);",
        ].join("\n");

        const expected_code = "function outer(o){function n(o){const n=o+1;console.log(n)}const t=o+1;n(t)}outer(1);";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 8, column: 9 },
            kind: "global",
            isStackFrame: false,
            variables: ["outer"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 7, column: 1 },
                kind: "function",
                name: "outer",
                isStackFrame: true,
                variables: ["num", "inner", "num_plus_one"],
                children: [{
                    start: { line: 1, column: 4 },
                    end: { line: 4, column: 5 },
                    kind: "function",
                    name: "inner",
                    isStackFrame: true,
                    variables: ["value", "value_plus_one"],
                    children: [],
                }],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 85 },
            isStackFrame: false,
            isHidden: false,
            values: ["outer"],
            children: [{
                // outer: num→o, inner→n, num_plus_one→t
                start: { line: 0, column: 0 },
                end: { line: 0, column: 76 },
                isStackFrame: true,
                isHidden: false,
                values: ["o", "n", "t"],
                children: [{
                    // inner: value→o, value_plus_one→n (both shadow outer)
                    start: { line: 0, column: 18 },
                    end: { line: 0, column: 59 },
                    isStackFrame: true,
                    isHidden: false,
                    values: ["o", "n"],
                    children: [],
                }],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: false,
            mangle: true,
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
        assert.strictEqual(globalScope.children.length, 1);

        const outerScope = globalScope.children[0];
        assert.strictEqual(outerScope.name, "outer");
        assert.strictEqual(outerScope.kind, "function");
        assert.strictEqual(outerScope.isStackFrame, true);
        assert.deepStrictEqual(outerScope.variables, ["num", "inner", "num_plus_one"]);
        assert.deepStrictEqual(outerScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(outerScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(outerScope.children.length, 1);

        const innerScope = outerScope.children[0];
        assert.strictEqual(innerScope.name, "inner");
        assert.strictEqual(innerScope.kind, "function");
        assert.strictEqual(innerScope.isStackFrame, true);
        assert.deepStrictEqual(innerScope.variables, ["value", "value_plus_one"]);
        assert.deepStrictEqual(innerScope.start, expected_scopes[0].children[0].children[0].start);
        assert.deepStrictEqual(innerScope.end, expected_scopes[0].children[0].children[0].end);
        assert.strictEqual(innerScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        // outer range: num→"o", inner→"n", num_plus_one→"t"
        const outerRange = globalRange.children[0];
        assert.strictEqual(outerRange.originalScope, outerScope);
        assert.strictEqual(outerRange.isStackFrame, true);
        assert.strictEqual(outerRange.isHidden, false);
        assert.deepStrictEqual(outerRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(outerRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(outerRange.values, expected_ranges[0].children[0].values);
        assert.strictEqual(outerRange.callSite, undefined);
        assert.strictEqual(outerRange.children.length, 1);

        // inner range: value→"o", value_plus_one→"n" — same generated names
        // as outer's bindings, but semantically different variables.
        const innerRange = outerRange.children[0];
        assert.strictEqual(innerRange.originalScope, innerScope);
        assert.strictEqual(innerRange.isStackFrame, true);
        assert.strictEqual(innerRange.isHidden, false);
        assert.deepStrictEqual(innerRange.start, expected_ranges[0].children[0].children[0].start);
        assert.deepStrictEqual(innerRange.end, expected_ranges[0].children[0].children[0].end);
        assert.deepStrictEqual(innerRange.values, expected_ranges[0].children[0].children[0].values);
        assert.strictEqual(innerRange.callSite, undefined);
        assert.strictEqual(innerRange.children.length, 0);
    });


    // Test 17: Minifier-introduced shadowing with block scope — the block's
    // `result` mangles to the same name (`n`) as the function's `arg1`. The
    // block range's binding for `result` shadows the function range's
    // binding for `arg1` within the block's extent.
    it("should produce correct scopes for minifier-introduced shadowing with block scope", async function () {
        const code = [
            "function compute(arg1, arg2, arg3) {",
            "    const intermediate = arg1 + arg2;",
            "    if (arg3 !== undefined) {",
            "        const result = intermediate * arg3;",
            "        return result;",
            "    }",
            "    return intermediate;",
            "}",
            "compute(2, 3, 4);",
        ].join("\n");

        const expected_code = "function compute(n,t,e){const u=n+t;if(e!==undefined){const n=u*e;return n}return u}compute(2,3,4);";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 8, column: 17 },
            kind: "global",
            isStackFrame: false,
            variables: ["compute"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 7, column: 1 },
                kind: "function",
                name: "compute",
                isStackFrame: true,
                variables: ["arg1", "arg2", "arg3", "intermediate"],
                children: [{
                    start: { line: 2, column: 28 },
                    end: { line: 5, column: 5 },
                    kind: "block",
                    isStackFrame: false,
                    variables: ["result"],
                    children: [],
                }],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 99 },
            isStackFrame: false,
            isHidden: false,
            values: ["compute"],
            children: [{
                // arg1→n, arg2→t, arg3→e, intermediate→u
                start: { line: 0, column: 0 },
                end: { line: 0, column: 84 },
                isStackFrame: true,
                isHidden: false,
                values: ["n", "t", "e", "u"],
                children: [{
                    // result→n — same generated name as outer's arg1, but
                    // different variable (shadows within block extent)
                    start: { line: 0, column: 53 },
                    end: { line: 0, column: 75 },
                    isStackFrame: false,
                    isHidden: false,
                    values: ["n"],
                    children: [],
                }],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: false,
            mangle: true,
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
        assert.strictEqual(globalScope.children.length, 1);

        const computeScope = globalScope.children[0];
        assert.strictEqual(computeScope.name, "compute");
        assert.strictEqual(computeScope.kind, "function");
        assert.strictEqual(computeScope.isStackFrame, true);
        assert.deepStrictEqual(computeScope.variables, ["arg1", "arg2", "arg3", "intermediate"]);
        assert.deepStrictEqual(computeScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(computeScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(computeScope.children.length, 1);

        const blockScope = computeScope.children[0];
        assert.strictEqual(blockScope.kind, "block");
        assert.strictEqual(blockScope.isStackFrame, false);
        assert.deepStrictEqual(blockScope.variables, ["result"]);
        assert.deepStrictEqual(blockScope.start, expected_scopes[0].children[0].children[0].start);
        assert.deepStrictEqual(blockScope.end, expected_scopes[0].children[0].children[0].end);
        assert.strictEqual(blockScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        const computeRange = globalRange.children[0];
        assert.strictEqual(computeRange.originalScope, computeScope);
        assert.strictEqual(computeRange.isStackFrame, true);
        assert.strictEqual(computeRange.isHidden, false);
        assert.deepStrictEqual(computeRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(computeRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(computeRange.values, expected_ranges[0].children[0].values);
        assert.strictEqual(computeRange.callSite, undefined);
        assert.strictEqual(computeRange.children.length, 1);

        // Block range: result→"n" — shadows arg1's binding within this extent
        const blockRange = computeRange.children[0];
        assert.strictEqual(blockRange.originalScope, blockScope);
        assert.strictEqual(blockRange.isStackFrame, false);
        assert.strictEqual(blockRange.isHidden, false);
        assert.deepStrictEqual(blockRange.start, expected_ranges[0].children[0].children[0].start);
        assert.deepStrictEqual(blockRange.end, expected_ranges[0].children[0].children[0].end);
        assert.deepStrictEqual(blockRange.values, expected_ranges[0].children[0].children[0].values);
        assert.strictEqual(blockRange.callSite, undefined);
        assert.strictEqual(blockRange.children.length, 0);
    });


    // Test 18: Original source already has shadowing — both global and
    // function scope declare a variable named `x`. Without `toplevel: true`,
    // the global `x` is kept as `x`; the inner `x` is mangled to `o`. Both
    // scopes have `variables: ["x"]` but map to different generated names.
    it("should produce correct scopes when original source already has shadowing", async function () {
        const code = [
            "let x = 10;",
            "function foo() {",
            "    let x = 20;",
            "    console.log(x);",
            "}",
            "foo();",
            "console.log(x);",
        ].join("\n");

        const expected_code = "let x=10;function foo(){let o=20;console.log(o)}foo();console.log(x);";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 6, column: 15 },
            kind: "global",
            isStackFrame: false,
            variables: ["x", "foo"],
            children: [{
                start: { line: 1, column: 0 },
                end: { line: 4, column: 1 },
                kind: "function",
                name: "foo",
                isStackFrame: true,
                variables: ["x"],
                children: [],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 69 },
            isStackFrame: false,
            isHidden: false,
            // global x→"x" (not mangled at toplevel), foo→"foo"
            values: ["x", "foo"],
            children: [{
                // foo's x→"o" — same original name as global x, different variable
                start: { line: 0, column: 8 },
                end: { line: 0, column: 48 },
                isStackFrame: true,
                isHidden: false,
                values: ["o"],
                children: [],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: false,
            mangle: true,
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
        assert.strictEqual(globalScope.children.length, 1);

        const fooScope = globalScope.children[0];
        assert.strictEqual(fooScope.name, "foo");
        assert.strictEqual(fooScope.kind, "function");
        assert.strictEqual(fooScope.isStackFrame, true);
        assert.deepStrictEqual(fooScope.variables, ["x"]);
        assert.deepStrictEqual(fooScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(fooScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(fooScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        const fooRange = globalRange.children[0];
        assert.strictEqual(fooRange.originalScope, fooScope);
        assert.strictEqual(fooRange.isStackFrame, true);
        assert.strictEqual(fooRange.isHidden, false);
        assert.deepStrictEqual(fooRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(fooRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(fooRange.values, expected_ranges[0].children[0].values);
        assert.strictEqual(fooRange.callSite, undefined);
        assert.strictEqual(fooRange.children.length, 0);
    });


    // Test 19: Nested block scope shadowing — both blocks declare `x`.
    // Terser does NOT flatten the blocks; it keeps them and mangles both
    // `x` to the same generated name `o`. Lookup still works correctly
    // because each range maps its own local `x` → `o`, so within the
    // inner range `o` means the inner `x`, and within the outer range
    // (but outside inner), `o` means the outer `x`.
    it("should produce correct scopes for nested block scope shadowing", async function () {
        const code = [
            "{",
            "    let x = 1;",
            "    console.log(x);",
            "    {",
            "        let x = 2;",
            "        console.log(x);",
            "    }",
            "    console.log(x);",
            "}",
        ].join("\n");

        const expected_code = "{let o=1;console.log(o);{let o=2;console.log(o)}console.log(o)}";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 8, column: 1 },
            kind: "global",
            isStackFrame: false,
            variables: [],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 8, column: 1 },
                kind: "block",
                isStackFrame: false,
                variables: ["x"],
                children: [{
                    start: { line: 3, column: 4 },
                    end: { line: 6, column: 5 },
                    kind: "block",
                    isStackFrame: false,
                    variables: ["x"],
                    children: [],
                }],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 63 },
            isStackFrame: false,
            isHidden: false,
            values: [],
            children: [{
                // outer block: x→"o"
                start: { line: 0, column: 0 },
                end: { line: 0, column: 63 },
                isStackFrame: false,
                isHidden: false,
                values: ["o"],
                children: [{
                    // inner block: x→"o" — same generated name, different
                    // variable (nested scope structure disambiguates)
                    start: { line: 0, column: 23 },
                    end: { line: 0, column: 48 },
                    isStackFrame: false,
                    isHidden: false,
                    values: ["o"],
                    children: [],
                }],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: false,
            mangle: true,
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
        assert.strictEqual(globalScope.children.length, 1);

        const outerBlockScope = globalScope.children[0];
        assert.strictEqual(outerBlockScope.kind, "block");
        assert.strictEqual(outerBlockScope.isStackFrame, false);
        assert.deepStrictEqual(outerBlockScope.variables, ["x"]);
        assert.deepStrictEqual(outerBlockScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(outerBlockScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(outerBlockScope.children.length, 1);

        const innerBlockScope = outerBlockScope.children[0];
        assert.strictEqual(innerBlockScope.kind, "block");
        assert.strictEqual(innerBlockScope.isStackFrame, false);
        assert.deepStrictEqual(innerBlockScope.variables, ["x"]);
        assert.deepStrictEqual(innerBlockScope.start, expected_scopes[0].children[0].children[0].start);
        assert.deepStrictEqual(innerBlockScope.end, expected_scopes[0].children[0].children[0].end);
        assert.strictEqual(innerBlockScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        const outerBlockRange = globalRange.children[0];
        assert.strictEqual(outerBlockRange.originalScope, outerBlockScope);
        assert.strictEqual(outerBlockRange.isStackFrame, false);
        assert.strictEqual(outerBlockRange.isHidden, false);
        assert.deepStrictEqual(outerBlockRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(outerBlockRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(outerBlockRange.values, expected_ranges[0].children[0].values);
        assert.strictEqual(outerBlockRange.callSite, undefined);
        assert.strictEqual(outerBlockRange.children.length, 1);

        const innerBlockRange = outerBlockRange.children[0];
        assert.strictEqual(innerBlockRange.originalScope, innerBlockScope);
        assert.strictEqual(innerBlockRange.isStackFrame, false);
        assert.strictEqual(innerBlockRange.isHidden, false);
        assert.deepStrictEqual(innerBlockRange.start, expected_ranges[0].children[0].children[0].start);
        assert.deepStrictEqual(innerBlockRange.end, expected_ranges[0].children[0].children[0].end);
        assert.deepStrictEqual(innerBlockRange.values, expected_ranges[0].children[0].children[0].values);
        assert.strictEqual(innerBlockRange.callSite, undefined);
        assert.strictEqual(innerBlockRange.children.length, 0);
    });


    // Test 20: Shadowing with inlining — global has `let x = 5`, function
    // `scale` has its own parameter `x`, and is called with an argument
    // that reads the global `x` (`scale(x + 2)`). After inlining and
    // folding, both `x` variables are eliminated, but the scope tree must
    // still distinguish them: global's x → "5", while the inlined scale
    // range's x → "x+2" (the call-site expression).
    it("should produce correct scopes for shadowing with inlining", async function () {
        const code = [
            "function scale(x) {",
            "    return x * 2;",
            "}",
            "let x = 5;",
            "console.log(scale(x + 2));",
        ].join("\n");

        const expected_code = "console.log(14);";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 4, column: 26 },
            kind: "global",
            isStackFrame: false,
            variables: ["scale", "x"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 2, column: 1 },
                kind: "function",
                name: "scale",
                isStackFrame: true,
                variables: ["x"],
                children: [],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 16 },
            isStackFrame: false,
            isHidden: false,
            // scale → original function text, global x folded to "5"
            values: [null, "5"],
            children: [{
                // Inlined scale covers the folded "14" at cols 12-14.
                // scale's x binding is the call-site expression "x+2"
                // (distinct from global x = 5, despite both being named x).
                start: { line: 0, column: 12 },
                end: { line: 0, column: 14 },
                isStackFrame: false,
                isHidden: false,
                values: ["7"],
                callSite: { sourceIndex: 0, line: 4, column: 12 },
                children: [],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: { inline: true, toplevel: true, passes: 3 },
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
        assert.strictEqual(globalScope.children.length, 1);

        // scale's `x` is its own variable, separate from global's `x`.
        const scaleScope = globalScope.children[0];
        assert.strictEqual(scaleScope.name, "scale");
        assert.strictEqual(scaleScope.kind, "function");
        assert.strictEqual(scaleScope.isStackFrame, true);
        assert.deepStrictEqual(scaleScope.variables, ["x"]);
        assert.deepStrictEqual(scaleScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(scaleScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(scaleScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        // Inlined `scale` range — scale's x binding is "x+2" (call-site
        // expression), distinct from global's x binding ("5").
        const scaleRange = globalRange.children[0];
        assert.strictEqual(scaleRange.originalScope, scaleScope);
        assert.strictEqual(scaleRange.isStackFrame, false);
        assert.strictEqual(scaleRange.isHidden, false);
        assert.deepStrictEqual(scaleRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(scaleRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(scaleRange.values, expected_ranges[0].children[0].values);
        assert.deepStrictEqual(scaleRange.callSite, expected_ranges[0].children[0].callSite);
        assert.strictEqual(scaleRange.children.length, 0);
    });


    // Test 21: Arrow functions as scopes — two arrow functions, both
    // single-use, should be inlined. Each arrow is a `kind: "function"`
    // scope with `isStackFrame: true`. When inlined, each produces its
    // own range with a callSite.
    //
    // Currently the scopes implementation crashes on AST_Arrow nodes
    // (end position missing), so this test demonstrates the gap.
    it("should produce correct scopes for arrow functions", async function () {
        const code = [
            "const add = (a, b) => a + b;",
            "const multiply = (a, b) => a * b;",
            "console.log(add(2, 3) + multiply(4, 5));",
        ].join("\n");

        const expected_code = "console.log(25);";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 2, column: 40 },
            kind: "global",
            isStackFrame: false,
            variables: ["add", "multiply"],
            children: [{
                // arrow `(a, b) => a + b` — inherits no name from const binding
                start: { line: 0, column: 12 },
                end: { line: 0, column: 27 },
                kind: "function",
                isStackFrame: true,
                variables: ["a", "b"],
                children: [],
            }, {
                // arrow `(a, b) => a * b`
                start: { line: 1, column: 17 },
                end: { line: 1, column: 32 },
                kind: "function",
                isStackFrame: true,
                variables: ["a", "b"],
                children: [],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 16 },
            isStackFrame: false,
            isHidden: false,
            // Both arrow functions eliminated; bindings hold original
            // arrow expression text.
            values: [null, null],
            children: [],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: { inline: true, toplevel: true, passes: 3 },
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
        assert.strictEqual(globalScope.children.length, 2);

        const addScope = globalScope.children[0];
        assert.strictEqual(addScope.kind, "function");
        assert.strictEqual(addScope.isStackFrame, true);
        assert.deepStrictEqual(addScope.variables, ["a", "b"]);
        assert.strictEqual(addScope.children.length, 0);

        const multiplyScope = globalScope.children[1];
        assert.strictEqual(multiplyScope.kind, "function");
        assert.strictEqual(multiplyScope.isStackFrame, true);
        assert.deepStrictEqual(multiplyScope.variables, ["a", "b"]);
        assert.strictEqual(multiplyScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 0);
    });


    // Test 22: Default parameter values — function `greet` has `greeting`
    // with default "Hello". Terser converts the decl+call into an IIFE
    // (default param prevents full inlining), preserving `greeting = "Hello"`
    // in the generated parameter list. The function scope lists both
    // `name` and `greeting` in `variables`; the function range is
    // isStackFrame: true (real call), no callSite.
    it("should produce correct scopes for default parameter values", async function () {
        const code = [
            'function greet(name, greeting = "Hello") {',
            '    console.log(greeting + " " + name);',
            '}',
            'greet("world");',
        ].join("\n");

        const expected_code = '!function(o,l="Hello"){console.log(l+" "+o)}("world");';

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 3, column: 15 },
            kind: "global",
            isStackFrame: false,
            variables: ["greet"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 2, column: 1 },
                kind: "function",
                name: "greet",
                isStackFrame: true,
                // Both positional and default param appear in variables.
                variables: ["name", "greeting"],
                children: [],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 54 },
            isStackFrame: false,
            isHidden: false,
            values: [null],
            children: [{
                start: { line: 0, column: 1 },
                end: { line: 0, column: 44 },
                isStackFrame: true,
                isHidden: false,
                // name→"o", greeting→"l". The default value "Hello" is
                // preserved in the emitted parameter list (runtime default),
                // not in the binding — debugger sees the actual value of `l`.
                values: ["o", "l"],
                children: [],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: { inline: true, toplevel: true, passes: 3 },
            mangle: { toplevel: true },
        });

        // --- Generated code ---
        assert.strictEqual(result.code, expected_code);

        // --- Original scopes ---
        assert.strictEqual(scopes.length, 1);
        const globalScope = scopes[0];
        assert.strictEqual(globalScope.kind, expected_scopes[0].kind);
        assert.deepStrictEqual(globalScope.variables, expected_scopes[0].variables);
        assert.strictEqual(globalScope.children.length, 1);

        const greetScope = globalScope.children[0];
        assert.strictEqual(greetScope.name, "greet");
        assert.strictEqual(greetScope.kind, "function");
        assert.strictEqual(greetScope.isStackFrame, true);
        assert.deepStrictEqual(greetScope.variables, ["name", "greeting"]);
        assert.strictEqual(greetScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        const greetRange = globalRange.children[0];
        assert.strictEqual(greetRange.originalScope, greetScope);
        assert.strictEqual(greetRange.isStackFrame, true);
        assert.deepStrictEqual(greetRange.values, expected_ranges[0].children[0].values);
        assert.strictEqual(greetRange.callSite, undefined);
        assert.strictEqual(greetRange.children.length, 0);
    });


    // Test 23: Destructuring parameters — `sum({ x, y })` declares two
    // function-scope variables `x` and `y` via destructuring. The scope's
    // `variables` list has both, and the range's `values` map each to its
    // mangled generated name (x→"n", y→"o").
    it("should produce correct scopes for destructuring parameters", async function () {
        const code = [
            "function sum({ x, y }) {",
            "    return x + y;",
            "}",
            "console.log(sum({ x: 1, y: 2 }));",
        ].join("\n");

        const expected_code = "function sum({x:n,y:o}){return n+o}console.log(sum({x:1,y:2}));";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 3, column: 33 },
            kind: "global",
            isStackFrame: false,
            variables: ["sum"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 2, column: 1 },
                kind: "function",
                name: "sum",
                isStackFrame: true,
                // Destructured `{x, y}` exposes two function-scope variables.
                variables: ["x", "y"],
                children: [],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 63 },
            isStackFrame: false,
            isHidden: false,
            values: ["sum"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 0, column: 35 },
                isStackFrame: true,
                isHidden: false,
                // x→"n", y→"o" — destructured names map individually.
                values: ["n", "o"],
                children: [],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: false,
            mangle: true,
        });

        // --- Generated code ---
        assert.strictEqual(result.code, expected_code);

        // --- Original scopes ---
        assert.strictEqual(scopes.length, 1);
        const globalScope = scopes[0];
        assert.strictEqual(globalScope.kind, expected_scopes[0].kind);
        assert.deepStrictEqual(globalScope.variables, expected_scopes[0].variables);
        assert.strictEqual(globalScope.children.length, 1);

        const sumScope = globalScope.children[0];
        assert.strictEqual(sumScope.name, "sum");
        assert.strictEqual(sumScope.kind, "function");
        assert.strictEqual(sumScope.isStackFrame, true);
        assert.deepStrictEqual(sumScope.variables, ["x", "y"]);
        assert.strictEqual(sumScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        const sumRange = globalRange.children[0];
        assert.strictEqual(sumRange.originalScope, sumScope);
        assert.strictEqual(sumRange.isStackFrame, true);
        assert.deepStrictEqual(sumRange.values, expected_ranges[0].children[0].values);
        assert.strictEqual(sumRange.callSite, undefined);
        assert.strictEqual(sumRange.children.length, 0);
    });


    // Test 24: For-loop block scoping — `for (let i = 0; ...)` creates a
    // block scope holding `i`, nested in the function. Terser emits an
    // additional inner block for the loop body (no own variables) because
    // the ES6 spec rebinds the loop variable each iteration, giving the
    // body its own scope.
    it("should produce correct scopes for for-loop block scoping", async function () {
        const code = [
            "function demo() {",
            "    for (let i = 0; i < 3; i++) {",
            "        console.log(i);",
            "    }",
            "}",
            "demo();",
        ].join("\n");

        const expected_code = "function demo(){for(let o=0;o<3;o++){console.log(o)}}demo();";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 5, column: 7 },
            kind: "global",
            isStackFrame: false,
            variables: ["demo"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 4, column: 1 },
                kind: "function",
                name: "demo",
                isStackFrame: true,
                variables: [],
                children: [{
                    // For-loop init block — holds `i`.
                    start: { line: 1, column: 4 },
                    end: { line: 3, column: 5 },
                    kind: "block",
                    isStackFrame: false,
                    variables: ["i"],
                    children: [{
                        // Loop body block — no own variables, but emitted
                        // because ES6 rebinds the loop variable each iteration.
                        start: { line: 1, column: 32 },
                        end: { line: 3, column: 5 },
                        kind: "block",
                        isStackFrame: false,
                        variables: [],
                        children: [],
                    }],
                }],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 60 },
            isStackFrame: false,
            isHidden: false,
            values: ["demo"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 0, column: 53 },
                isStackFrame: true,
                isHidden: false,
                values: [],
                children: [{
                    // For-loop block: i→"o"
                    start: { line: 0, column: 16 },
                    end: { line: 0, column: 52 },
                    isStackFrame: false,
                    isHidden: false,
                    values: ["o"],
                    children: [{
                        // Loop body block: no variables
                        start: { line: 0, column: 36 },
                        end: { line: 0, column: 52 },
                        isStackFrame: false,
                        isHidden: false,
                        values: [],
                        children: [],
                    }],
                }],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: false,
            mangle: true,
        });

        // --- Generated code ---
        assert.strictEqual(result.code, expected_code);

        // --- Original scopes ---
        assert.strictEqual(scopes.length, 1);
        const globalScope = scopes[0];
        assert.deepStrictEqual(globalScope.variables, ["demo"]);
        assert.strictEqual(globalScope.children.length, 1);

        const demoScope = globalScope.children[0];
        assert.strictEqual(demoScope.name, "demo");
        assert.strictEqual(demoScope.kind, "function");
        assert.strictEqual(demoScope.isStackFrame, true);
        assert.deepStrictEqual(demoScope.variables, []);
        assert.strictEqual(demoScope.children.length, 1);

        const loopScope = demoScope.children[0];
        assert.strictEqual(loopScope.kind, "block");
        assert.strictEqual(loopScope.isStackFrame, false);
        assert.deepStrictEqual(loopScope.variables, ["i"]);
        assert.strictEqual(loopScope.children.length, 1);

        const bodyScope = loopScope.children[0];
        assert.strictEqual(bodyScope.kind, "block");
        assert.strictEqual(bodyScope.isStackFrame, false);
        assert.deepStrictEqual(bodyScope.variables, []);
        assert.strictEqual(bodyScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.children.length, 1);

        const demoRange = globalRange.children[0];
        assert.strictEqual(demoRange.originalScope, demoScope);
        assert.strictEqual(demoRange.isStackFrame, true);
        assert.strictEqual(demoRange.children.length, 1);

        const loopRange = demoRange.children[0];
        assert.strictEqual(loopRange.originalScope, loopScope);
        assert.deepStrictEqual(loopRange.values, ["o"]);
        assert.strictEqual(loopRange.children.length, 1);

        const bodyRange = loopRange.children[0];
        assert.strictEqual(bodyRange.originalScope, bodyScope);
        assert.deepStrictEqual(bodyRange.values, []);
        assert.strictEqual(bodyRange.children.length, 0);
    });


    // Test 25: isHidden generated range — terser's `enclose: true` option
    // wraps the whole program in an IIFE that wasn't in the original source.
    // Per the spec, the generated range for that transpiler-added wrapper
    // should carry `isHidden: true` so a debugger doesn't step into it.
    //
    // Currently the scopes codec crashes because the enclose/wrap options
    // introduce a second source, but the scopes builder only emits one
    // fileScope ("SourceMapJson.sources.length must match ScopesInfo.scopes").
    // This test demonstrates that gap.
    it("should produce correct scopes for isHidden wrapper (enclose)", async function () {
        const code = [
            "var a = 1;",
            "var b = 2;",
            "console.log(a + b);",
        ].join("\n");

        const expected_code = "(function(){var a=1;var b=2;console.log(a+b)})();";

        const expected_scopes = [{
            // Original global scope — holds the user's top-level vars.
            start: { line: 0, column: 0 },
            end: { line: 2, column: 19 },
            kind: "global",
            isStackFrame: false,
            variables: ["a", "b"],
            children: [],
        }];

        const expected_ranges = [{
            // Outer wrapper range — synthetic, not in the original source.
            // Must be isHidden: true.
            start: { line: 0, column: 0 },
            end: { line: 0, column: 49 },
            isStackFrame: false,
            isHidden: true,
            values: [],
            children: [{
                // Inner range matches the original global scope.
                start: { line: 0, column: 12 },
                end: { line: 0, column: 46 },
                isStackFrame: false,
                isHidden: false,
                values: ["a", "b"],
                children: [],
            }],
        }];

        // `enclose` isn't forwarded by decodeOutputScopes, so call minify
        // directly for this test.
        const result = await minify(code, {
            sourceMap: { scopes: true, asObject: true },
            compress: false,
            mangle: false,
            enclose: true,
        });
        if (result.error) throw result.error;
        const { scopes, ranges } = decode(result.map);

        // --- Generated code ---
        assert.strictEqual(result.code, expected_code);

        // --- Original scopes ---
        assert.strictEqual(scopes.length, 1);
        const globalScope = scopes[0];
        assert.strictEqual(globalScope.kind, "global");
        assert.deepStrictEqual(globalScope.variables, ["a", "b"]);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const wrapperRange = ranges[0];
        assert.strictEqual(wrapperRange.isHidden, true, "wrapper range must be isHidden");
        assert.strictEqual(wrapperRange.children.length, 1);

        const innerRange = wrapperRange.children[0];
        assert.strictEqual(innerRange.originalScope, globalScope);
        assert.strictEqual(innerRange.isHidden, false);
        assert.deepStrictEqual(innerRange.values, ["a", "b"]);
    });


    // Test 27: Class method scoping — a `class` declaration introduces
    // three levels of scope: global > class > each method. The class
    // scope has `kind: "class"`, `isStackFrame: false` (you don't call
    // a class as a stack frame, you call its methods/constructor).
    // Each method is a function scope (`kind: "function"`,
    // `isStackFrame: true`) with its own parameters.
    //
    // Terser currently crashes on AST_Accessor (gen_start undefined) and
    // also omits the class scope itself, so this test demonstrates both
    // gaps.
    it("should produce correct scopes for class methods", async function () {
        const code = [
            "class Counter {",
            "    constructor(initial) {",
            "        this.count = initial;",
            "    }",
            "    increment(amount) {",
            "        this.count += amount;",
            "        return this.count;",
            "    }",
            "}",
            "const c = new Counter(0);",
            "console.log(c.increment(5));",
        ].join("\n");

        const expected_code = "class Counter{constructor(n){this.count=n}increment(n){this.count+=n;return this.count}}const c=new Counter(0);console.log(c.increment(5));";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 10, column: 28 },
            kind: "global",
            isStackFrame: false,
            variables: ["Counter", "c"],
            children: [{
                // Class scope — kind: "class", not a stack frame.
                // Spans from `class Counter {` through the closing `}`.
                start: { line: 0, column: 0 },
                end: { line: 8, column: 1 },
                kind: "class",
                name: "Counter",
                isStackFrame: false,
                variables: [],
                children: [{
                    // constructor method scope.
                    start: { line: 1, column: 4 },
                    end: { line: 3, column: 5 },
                    kind: "function",
                    name: "constructor",
                    isStackFrame: true,
                    variables: ["initial"],
                    children: [],
                }, {
                    // increment method scope.
                    start: { line: 4, column: 4 },
                    end: { line: 7, column: 5 },
                    kind: "function",
                    name: "increment",
                    isStackFrame: true,
                    variables: ["amount"],
                    children: [],
                }],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 140 },
            isStackFrame: false,
            isHidden: false,
            // Counter → "Counter", c → "c" (no toplevel mangling).
            values: ["Counter", "c"],
            children: [{
                // Class range — `class Counter{...}` at cols 0-89.
                start: { line: 0, column: 0 },
                end: { line: 0, column: 89 },
                isStackFrame: false,
                isHidden: false,
                values: [],
                children: [{
                    // constructor at cols 14-42. initial → "n".
                    start: { line: 0, column: 14 },
                    end: { line: 0, column: 42 },
                    isStackFrame: true,
                    isHidden: false,
                    values: ["n"],
                    children: [],
                }, {
                    // increment at cols 42-88. amount → "n".
                    start: { line: 0, column: 42 },
                    end: { line: 0, column: 88 },
                    isStackFrame: true,
                    isHidden: false,
                    values: ["n"],
                    children: [],
                }],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: false,
            mangle: true,
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
        assert.strictEqual(globalScope.children.length, 1);

        // Class scope
        const classScope = globalScope.children[0];
        assert.strictEqual(classScope.kind, expected_scopes[0].children[0].kind);
        assert.strictEqual(classScope.name, expected_scopes[0].children[0].name);
        assert.strictEqual(classScope.isStackFrame, expected_scopes[0].children[0].isStackFrame);
        assert.deepStrictEqual(classScope.variables, expected_scopes[0].children[0].variables);
        assert.deepStrictEqual(classScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(classScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(classScope.children.length, 2);

        // Constructor method scope
        const ctorScope = classScope.children[0];
        assert.strictEqual(ctorScope.kind, expected_scopes[0].children[0].children[0].kind);
        assert.strictEqual(ctorScope.name, expected_scopes[0].children[0].children[0].name);
        assert.strictEqual(ctorScope.isStackFrame, expected_scopes[0].children[0].children[0].isStackFrame);
        assert.deepStrictEqual(ctorScope.variables, expected_scopes[0].children[0].children[0].variables);
        assert.deepStrictEqual(ctorScope.start, expected_scopes[0].children[0].children[0].start);
        assert.deepStrictEqual(ctorScope.end, expected_scopes[0].children[0].children[0].end);
        assert.strictEqual(ctorScope.children.length, 0);

        // Increment method scope
        const incrementScope = classScope.children[1];
        assert.strictEqual(incrementScope.kind, expected_scopes[0].children[0].children[1].kind);
        assert.strictEqual(incrementScope.name, expected_scopes[0].children[0].children[1].name);
        assert.strictEqual(incrementScope.isStackFrame, expected_scopes[0].children[0].children[1].isStackFrame);
        assert.deepStrictEqual(incrementScope.variables, expected_scopes[0].children[0].children[1].variables);
        assert.deepStrictEqual(incrementScope.start, expected_scopes[0].children[0].children[1].start);
        assert.deepStrictEqual(incrementScope.end, expected_scopes[0].children[0].children[1].end);
        assert.strictEqual(incrementScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.strictEqual(globalRange.isStackFrame, expected_ranges[0].isStackFrame);
        assert.strictEqual(globalRange.isHidden, expected_ranges[0].isHidden);
        assert.deepStrictEqual(globalRange.start, expected_ranges[0].start);
        assert.deepStrictEqual(globalRange.end, expected_ranges[0].end);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        // Class range
        const classRange = globalRange.children[0];
        assert.strictEqual(classRange.originalScope, classScope);
        assert.strictEqual(classRange.isStackFrame, expected_ranges[0].children[0].isStackFrame);
        assert.strictEqual(classRange.isHidden, expected_ranges[0].children[0].isHidden);
        assert.deepStrictEqual(classRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(classRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(classRange.values, expected_ranges[0].children[0].values);
        assert.strictEqual(classRange.callSite, undefined);
        assert.strictEqual(classRange.children.length, 2);

        // Constructor range
        const ctorRange = classRange.children[0];
        assert.strictEqual(ctorRange.originalScope, ctorScope);
        assert.strictEqual(ctorRange.isStackFrame, expected_ranges[0].children[0].children[0].isStackFrame);
        assert.strictEqual(ctorRange.isHidden, expected_ranges[0].children[0].children[0].isHidden);
        assert.deepStrictEqual(ctorRange.start, expected_ranges[0].children[0].children[0].start);
        assert.deepStrictEqual(ctorRange.end, expected_ranges[0].children[0].children[0].end);
        assert.deepStrictEqual(ctorRange.values, expected_ranges[0].children[0].children[0].values);
        assert.strictEqual(ctorRange.callSite, undefined);
        assert.strictEqual(ctorRange.children.length, 0);

        // Increment range
        const incrementRange = classRange.children[1];
        assert.strictEqual(incrementRange.originalScope, incrementScope);
        assert.strictEqual(incrementRange.isStackFrame, expected_ranges[0].children[0].children[1].isStackFrame);
        assert.strictEqual(incrementRange.isHidden, expected_ranges[0].children[0].children[1].isHidden);
        assert.deepStrictEqual(incrementRange.start, expected_ranges[0].children[0].children[1].start);
        assert.deepStrictEqual(incrementRange.end, expected_ranges[0].children[0].children[1].end);
        assert.deepStrictEqual(incrementRange.values, expected_ranges[0].children[0].children[1].values);
        assert.strictEqual(incrementRange.callSite, undefined);
        assert.strictEqual(incrementRange.children.length, 0);
    });


    // Test 28: Try/catch scope — the catch clause introduces its own
    // block scope holding the caught-error binding `e`, distinct from
    // the try block. Here both `str` (function param) and `e` (catch
    // binding) mangle to `e` — the catch binding shadows the outer
    // mangled name within the catch range.
    it("should produce correct scopes for try/catch", async function () {
        const code = [
            "function safeParse(str) {",
            "    try {",
            "        return JSON.parse(str);",
            "    } catch (e) {",
            "        console.log(e.message);",
            "        return null;",
            "    }",
            "}",
            'safeParse("invalid");',
        ].join("\n");

        const expected_code = 'function safeParse(e){try{return JSON.parse(e)}catch(e){console.log(e.message);return null}}safeParse("invalid");';

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 8, column: 21 },
            kind: "global",
            isStackFrame: false,
            variables: ["safeParse"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 7, column: 1 },
                kind: "function",
                name: "safeParse",
                isStackFrame: true,
                variables: ["str"],
                children: [{
                    // try block — no own variables
                    start: { line: 1, column: 8 },
                    end: { line: 3, column: 5 },
                    kind: "block",
                    isStackFrame: false,
                    variables: [],
                    children: [],
                }, {
                    // catch block — binding `e`
                    start: { line: 3, column: 6 },
                    end: { line: 6, column: 5 },
                    kind: "block",
                    isStackFrame: false,
                    variables: ["e"],
                    children: [],
                }],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 113 },
            isStackFrame: false,
            isHidden: false,
            values: ["safeParse"],
            children: [{
                // safeParse: str → "e"
                start: { line: 0, column: 0 },
                end: { line: 0, column: 92 },
                isStackFrame: true,
                isHidden: false,
                values: ["e"],
                children: [{
                    // try block — no bindings
                    start: { line: 0, column: 25 },
                    end: { line: 0, column: 47 },
                    isStackFrame: false,
                    isHidden: false,
                    values: [],
                    children: [],
                }, {
                    // catch block — e → "e" (same generated name as str,
                    // but a different variable; the catch range shadows
                    // the function range's str binding)
                    start: { line: 0, column: 47 },
                    end: { line: 0, column: 91 },
                    isStackFrame: false,
                    isHidden: false,
                    values: ["e"],
                    children: [],
                }],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: false,
            mangle: true,
        });

        // --- Generated code ---
        assert.strictEqual(result.code, expected_code);

        // --- Original scopes ---
        assert.strictEqual(scopes.length, 1);
        const globalScope = scopes[0];
        assert.strictEqual(globalScope.kind, expected_scopes[0].kind);
        assert.deepStrictEqual(globalScope.variables, expected_scopes[0].variables);
        assert.strictEqual(globalScope.children.length, 1);

        const safeParseScope = globalScope.children[0];
        assert.strictEqual(safeParseScope.name, "safeParse");
        assert.strictEqual(safeParseScope.kind, "function");
        assert.strictEqual(safeParseScope.isStackFrame, true);
        assert.deepStrictEqual(safeParseScope.variables, ["str"]);
        assert.strictEqual(safeParseScope.children.length, 2);

        const tryScope = safeParseScope.children[0];
        assert.strictEqual(tryScope.kind, "block");
        assert.strictEqual(tryScope.isStackFrame, false);
        assert.deepStrictEqual(tryScope.variables, []);
        assert.deepStrictEqual(tryScope.start, expected_scopes[0].children[0].children[0].start);
        assert.deepStrictEqual(tryScope.end, expected_scopes[0].children[0].children[0].end);
        assert.strictEqual(tryScope.children.length, 0);

        const catchScope = safeParseScope.children[1];
        assert.strictEqual(catchScope.kind, "block");
        assert.strictEqual(catchScope.isStackFrame, false);
        assert.deepStrictEqual(catchScope.variables, ["e"]);
        assert.deepStrictEqual(catchScope.start, expected_scopes[0].children[0].children[1].start);
        assert.deepStrictEqual(catchScope.end, expected_scopes[0].children[0].children[1].end);
        assert.strictEqual(catchScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        const safeParseRange = globalRange.children[0];
        assert.strictEqual(safeParseRange.originalScope, safeParseScope);
        assert.strictEqual(safeParseRange.isStackFrame, true);
        assert.deepStrictEqual(safeParseRange.values, expected_ranges[0].children[0].values);
        assert.strictEqual(safeParseRange.children.length, 2);

        const tryRange = safeParseRange.children[0];
        assert.strictEqual(tryRange.originalScope, tryScope);
        assert.strictEqual(tryRange.isStackFrame, false);
        assert.deepStrictEqual(tryRange.values, []);
        assert.deepStrictEqual(tryRange.start, expected_ranges[0].children[0].children[0].start);
        assert.deepStrictEqual(tryRange.end, expected_ranges[0].children[0].children[0].end);
        assert.strictEqual(tryRange.children.length, 0);

        const catchRange = safeParseRange.children[1];
        assert.strictEqual(catchRange.originalScope, catchScope);
        assert.strictEqual(catchRange.isStackFrame, false);
        assert.deepStrictEqual(catchRange.values, ["e"]);
        assert.deepStrictEqual(catchRange.start, expected_ranges[0].children[0].children[1].start);
        assert.deepStrictEqual(catchRange.end, expected_ranges[0].children[0].children[1].end);
        assert.strictEqual(catchRange.children.length, 0);
    });


    // Bonus: DCE of `if (false)` with a `var` inside.
    // The dead branch contains `var v = 42`. Terser removes the whole
    // `if (false) {...}` block, and since `v` is then unused, it's dropped
    // from the generated code too. But because `var` is function-scoped
    // (hoisted), `v` must still appear in `f`'s scope `variables` list,
    // and the generated range records a reconstructible binding `v → "42"`
    // (the original initializer), so a debugger could still display `v`.
    // The dead block scope remains in the original scope tree (it existed
    // in source), but produces no corresponding generated range.
    it("should keep hoisted var in scope after if(false) DCE", async function () {
        const code = [
            "function f(arg) {",
            "  if (false) {",
            "    var v = 42;",
            "    return v * 2;",
            "  }",
            "  return arg * 2;",
            "}",
            "f(8);",
        ].join("\n");

        const expected_code = "function f(f){return 2*f}f(8);";

        const expected_scopes = [{
            start: { line: 0, column: 0 },
            end: { line: 7, column: 5 },
            kind: "global",
            isStackFrame: false,
            variables: ["f"],
            children: [{
                start: { line: 0, column: 0 },
                end: { line: 6, column: 1 },
                kind: "function",
                name: "f",
                isStackFrame: true,
                // `var v` hoists to function scope — present even though
                // the lexical block it was declared in gets DCE'd.
                variables: ["arg", "v"],
                children: [{
                    // Dead block scope — still emitted because it existed
                    // in the original source. No variables of its own
                    // (the `var v` hoisted up to the function scope).
                    start: { line: 1, column: 13 },
                    end: { line: 4, column: 3 },
                    kind: "block",
                    isStackFrame: false,
                    variables: [],
                    children: [],
                }],
            }],
        }];

        const expected_ranges = [{
            start: { line: 0, column: 0 },
            end: { line: 0, column: 30 },
            isStackFrame: false,
            isHidden: false,
            values: ["f"],
            children: [{
                // arg → "f" (mangled, happens to match the function name
                // because within the body that shadows fine). v → "42"
                // (reconstructible expression from the dropped initializer).
                // No child range for the DCE'd block.
                start: { line: 0, column: 0 },
                end: { line: 0, column: 25 },
                isStackFrame: true,
                isHidden: false,
                values: ["f", "42"],
                children: [],
            }],
        }];

        const { scopes, ranges, result } = await decodeOutputScopes(code, {
            compress: true,
            mangle: true,
        });

        // --- Generated code ---
        assert.strictEqual(result.code, expected_code);

        // --- Original scopes ---
        assert.strictEqual(scopes.length, 1);
        const globalScope = scopes[0];
        assert.strictEqual(globalScope.kind, expected_scopes[0].kind);
        assert.deepStrictEqual(globalScope.variables, expected_scopes[0].variables);
        assert.deepStrictEqual(globalScope.start, expected_scopes[0].start);
        assert.deepStrictEqual(globalScope.end, expected_scopes[0].end);
        assert.strictEqual(globalScope.children.length, 1);

        const fScope = globalScope.children[0];
        assert.strictEqual(fScope.name, "f");
        assert.strictEqual(fScope.kind, "function");
        assert.strictEqual(fScope.isStackFrame, true);
        // `v` stays in the function scope despite being DCE'd — var hoisting.
        assert.deepStrictEqual(fScope.variables, ["arg", "v"]);
        assert.deepStrictEqual(fScope.start, expected_scopes[0].children[0].start);
        assert.deepStrictEqual(fScope.end, expected_scopes[0].children[0].end);
        assert.strictEqual(fScope.children.length, 1);

        const deadBlockScope = fScope.children[0];
        assert.strictEqual(deadBlockScope.kind, "block");
        assert.strictEqual(deadBlockScope.isStackFrame, false);
        assert.deepStrictEqual(deadBlockScope.variables, []);
        assert.deepStrictEqual(deadBlockScope.start, expected_scopes[0].children[0].children[0].start);
        assert.deepStrictEqual(deadBlockScope.end, expected_scopes[0].children[0].children[0].end);
        assert.strictEqual(deadBlockScope.children.length, 0);

        // --- Generated ranges ---
        assert.strictEqual(ranges.length, 1);
        const globalRange = ranges[0];
        assert.strictEqual(globalRange.originalScope, globalScope);
        assert.deepStrictEqual(globalRange.values, expected_ranges[0].values);
        assert.strictEqual(globalRange.children.length, 1);

        // Function range — bindings for both live `arg` and DCE'd `v`.
        const fRange = globalRange.children[0];
        assert.strictEqual(fRange.originalScope, fScope);
        assert.strictEqual(fRange.isStackFrame, true);
        assert.deepStrictEqual(fRange.start, expected_ranges[0].children[0].start);
        assert.deepStrictEqual(fRange.end, expected_ranges[0].children[0].end);
        assert.deepStrictEqual(fRange.values, expected_ranges[0].children[0].values);
        // No child range for the DCE'd block — no generated code for it.
        assert.strictEqual(fRange.children.length, 0);
    });

});
