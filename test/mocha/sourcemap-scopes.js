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
});
