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
            values: ["function add(a,b){return a+b}"],
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
                "function add(a,b){return a+b}",
                "function double(x){return x+x}",
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
        assert.deepStrictEqual(addRange.values, expected_ranges[0].children[0].children[0].values);
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
            values: ["o", "function main(y){return 2*helper(y)}"],
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
            values: ["3", "function scale(x){return x*multiplier}"],
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
                values: ["r", "s", "unused"],
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
            values: ['function greet(name){console.log("Hello "+name)}'],
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

});
