# Source Map Scopes — Test Plan

## Context

The scopes feature (TC39 ecma426 proposal) encodes original scope trees and generated ranges into source maps, enabling debuggers to reconstruct frames, scopes, and bindings for minified/transpiled code. Terser has an initial implementation on the `hbenl/scopes` branch with 2 existing tests in `test/mocha/sourcemap-scopes.js`. This plan expands test coverage across the key scenarios described in the spec and issue discussions.

**Important caveat:** The expected output snippets below are *illustrative*. Terser's actual output may differ depending on optimization passes, heuristics, and version. Each test case must be adjusted during implementation to match terser's real output — run the minification first, verify the generated code, then write assertions against the actual scopes/ranges produced.

## Test file

`test/mocha/sourcemap-scopes.js` — follows the existing pattern using `decodeOutputScopes()` helper.

---

## Category 1: Basic Scope Kinds

Tests that each scope kind (`global`, `function`, `block`) is correctly identified with proper hierarchy, `isStackFrame` flags, and variable listings.

### 1. Global scope only

```js
var a = 1;
console.log(a);
```

- Single global scope: `kind: "global"`, `isStackFrame: false`, `variables: ["a"]`, no children.

### 2. Function scope nested in global

```js
function greet(name) {
    console.log("Hello " + name);
}
greet("world");
```

- Global scope (`variables: ["greet"]`) > function scope (`kind: "function"`, `name: "greet"`, `isStackFrame: true`, `variables: ["name"]`).

### 3. Block scope nested in function

```js
function process(x) {
    let result = x;
    if (x > 0) {
        let temp = x * 2;
        result = temp;
    }
    return result;
}
process(5);
```

- Three-level nesting: global > function (`variables: ["x", "result"]`) > block (`kind: "block"`, `isStackFrame: false`, `variables: ["temp"]`).

### 4. Multiple sibling block scopes

```js
function demo(x) {
    {
        let a = x + 1;
        console.log(a);
    }
    {
        let a = x + 2;
        console.log(a);
    }
}
demo(1);
```

- Function scope with two sibling block children, each `kind: "block"`, each with `variables: ["a"]`.

---

## Category 2: Function Inlining

Tests for the core inlining use case — callSite tracking, binding per call site, nested inlining.

### 5. Single-call function inlining

```js
function add(a, b) {
    return a + b;
}
console.log(add(1, 2));
```

- Original: global > function `add` (`isStackFrame: true`, `variables: ["a", "b"]`).
- Generated: global range > inlined range with `callSite` pointing to `add(1, 2)`, bindings `a -> "1"`, `b -> "2"`.

### 6. Multi-call inlining (same function, different bindings)

```js
function greet(name) {
    console.log("Hello " + name);
}
greet("Alice");
greet("Bob");
```

- Two generated ranges both referencing the same original `greet` scope, but with different bindings (`name -> '"Alice"'` vs `name -> '"Bob"'`) and different callSites.

### 7. Nested inlining (function calls another inlined function)

```js
function add(a, b) {
    return a + b;
}
function double(x) {
    return add(x, x);
}
console.log(double(5));
```

- Nested generated ranges: `double` inlined (callSite → `double(5)`) containing `add` inlined (callSite → `add(x, x)`).

### 8. Partial inlining (one function inlined, another preserved)

```js
function helper(x) {
    return x + 1;
}
function main(y) {
    return helper(y) * 2;
}
console.log(main(5));
```

- `helper` has a regular generated range (`isStackFrame: true`, no callSite). `main` is inlined with callSite. Mixed preserved/inlined scenario.

### 9. Inlining with closure capture

```js
const multiplier = 3;
function scale(x) {
    return x * multiplier;
}
console.log(scale(5));
```

- Global scope has `variables: ["multiplier", "scale"]` with `multiplier` constant-folded. Inlined `scale` range has `x` binding. Tests interaction between inlining and outer-scope variable resolution.

---

## Category 3: Transformations

Tests for specific compiler optimizations and how they affect scope/binding mappings.

### 10. Pure constant folding

```js
const a = 3;
const b = 4;
console.log(a + b);
```

- Global scope `variables: ["a", "b"]`. Bindings: `a -> "3"`, `b -> "4"` (no generated variables exist).

### 11. Pure variable renaming (mangle only, no compress)

```js
function calculate(longName, anotherName) {
    const intermediate = longName + anotherName;
    return intermediate;
}
calculate(1, 2);
```

- Options: `{ compress: false, mangle: true }`. Scope structure preserved exactly, bindings map original names to mangled names 1:1.

### 12. Dead code elimination (unreachable branch)

```js
function check(x) {
    if (false) {
        let dead = "unreachable";
        console.log(dead);
    }
    return x;
}
check(1);
```

- Original scopes include the block with `variables: ["dead"]`. No corresponding generated range for the eliminated block.

### 13. Block scope flattening (let → var across blocks)

```js
{
    let x = 1;
    console.log(x);
}
{
    let x = 2;
    console.log(x);
}
```

- Two original block scopes each with `variables: ["x"]`. Generated code flattens them into different variable names, resolving the shadowing.

### 14. Unused variable dropping

```js
function process(a, b) {
    const unused = a * 100;
    return b + 1;
}
process(1, 2);
```

- Original scope lists `variables: ["a", "b", "unused"]`. Generated range binding for `unused` is `undefined` (unavailable).

### 15. Toplevel IIFE wrapping

```js
function greet(name) {
    console.log("Hello " + name);
}
greet("world");
```

- Options: `{ compress: { toplevel: true }, mangle: { toplevel: true } }`. Function converted to IIFE. Original scope identity (`name: "greet"`) preserved despite syntactic form change.

---

## Category 4: Variable Shadowing

Tests for correct variable resolution when the minifier introduces or preserves name collisions.

### 16. Minifier-introduced shadowing (same name, different scopes)

```js
function outer(num) {
    function inner(value) {
        const value_plus_one = value + 1;
        console.log(value_plus_one);
    }
    const num_plus_one = num + 1;
    inner(num_plus_one);
}
outer(1);
```

- `num` and `value` both mangle to the same name. `num_plus_one` and `value_plus_one` also collide. Scope bindings must distinguish which generated name means what in each scope. (From issue #37 comment 4.)

### 17. Minifier-introduced shadowing with block scope

```js
function compute(arg1, arg2, arg3) {
    const intermediate = arg1 + arg2;
    if (arg3 !== undefined) {
        const result = intermediate * arg3;
        return result;
    }
    return intermediate;
}
compute(2, 3, 4);
```

- `arg1` and `result` may mangle to the same name. Block scope binding for `result` shadows function scope binding for `arg1`. (From issue #37 comment 14.)

### 18. Original source already has shadowing

```js
let x = 10;
function foo() {
    let x = 20;
    console.log(x);
}
foo();
console.log(x);
```

- Pre-existing shadowing in original code. Both scopes have `variables: ["x"]` mapped to correct generated names.

### 19. Block scope shadowing resolved by flattening

```js
{
    let x = 1;
    console.log(x);
    {
        let x = 2;
        console.log(x);
    }
    console.log(x);
}
```

- Original has nested shadowing. Generated code resolves it by giving each `x` a unique name. Bindings: outer `x -> "o"`, inner `x -> "n"`. (From issue #37 comment 4.)

### 20. Shadowing with inlining

```js
function scale(x) {
    return x * 2;
}
let x = 5;
console.log(scale(x));
```

- Both global and function scope have variable `x`. After inlining, scopes must distinguish them as different variables despite sharing a name.

---

## Category 5: Advanced Features

Tests for specialized spec features: arrow functions, default params, destructuring, class methods, loop scoping, try/catch, isHidden, sub-range bindings.

### 21. Arrow functions as scopes

```js
const add = (a, b) => a + b;
const multiply = (a, b) => a * b;
console.log(add(2, 3) + multiply(4, 5));
```

- Arrow functions produce `kind: "function"`, `isStackFrame: true`. When inlined, each gets its own generated range with callSite.

### 22. Default parameter values

```js
function greet(name, greeting = "Hello") {
    console.log(greeting + " " + name);
}
greet("world");
```

- Function scope `variables: ["name", "greeting"]`. After inlining, bindings include the default value for `greeting`.

### 23. Destructuring parameters

```js
function sum({ x, y }) {
    return x + y;
}
console.log(sum({ x: 1, y: 2 }));
```

- Destructured variables `x`, `y` appear in function scope's `variables`. Bindings map them individually.

### 24. For-loop block scoping

```js
function demo() {
    for (let i = 0; i < 3; i++) {
        console.log(i);
    }
}
demo();
```

- Loop `let i` creates a block scope (`kind: "block"`, `variables: ["i"]`) nested in the function scope.

### 25. isHidden generated range

```js
var a = 1;
var b = 2;
console.log(a + b);
```

- When terser wraps code in a transpiler-added construct (e.g. IIFE), the generated range for that wrapper should have `isHidden: true`.

### 26. Sub-range bindings (BindingRange)

```js
function process(a) {
    let b = a + 1;
    console.log(b);
    let c = a + 2;
    console.log(c);
}
process(5);
```

- If minifier reuses a generated variable for both `b` and `c`, sub-range bindings encode which original variable it represents at each point in the range.

### 27. Class method scoping

```js
class Counter {
    constructor(initial) {
        this.count = initial;
    }
    increment(amount) {
        this.count += amount;
        return this.count;
    }
}
const c = new Counter(0);
console.log(c.increment(5));
```

- Class creates scope hierarchy: global > class > method. Each method has `kind: "function"`, `isStackFrame: true`.

### 28. Try/catch scope

```js
function safeParse(str) {
    try {
        return JSON.parse(str);
    } catch (e) {
        console.log(e.message);
        return null;
    }
}
safeParse("invalid");
```

- Catch clause creates block scope with `variables: ["e"]`, scoped only to the catch block.

---

## Future Work (not in this plan)

- **Cross-module / bundling cases**: Merging multiple modules into one file, inlining functions across module boundaries (as in issue #37 comment 13 — rollup+terser scenario). Requires multi-source input support.
- **More advanced cases**: generators, async/await, `eval`, `with` statements, computed property names, template literals, optional chaining, nullish coalescing.
- **BindingRange edge cases**: Variables that become available/unavailable multiple times within a range.
- **Multiple generated range trees**: Concatenated bundles with separate range trees.

## Verification

For each test case during implementation:
1. Run `minify()` with `sourceMap: { scopes: true }` and the appropriate compress/mangle options
2. Inspect `result.code` to determine the actual generated output (adjust expectations accordingly)
3. Decode scopes/ranges using `@chrome-devtools/source-map-scopes-codec`
4. Assert original scopes: kind, name, isStackFrame, variables, hierarchy
5. Assert generated ranges: start/end positions, isStackFrame, isHidden, originalScope linkage, callSite, bindings/values
6. Run full test suite: `npm run test:mocha`

## References

- **Spec**: https://github.com/tc39/ecma426/blob/main/proposals/scopes.md
- **Discussion**: https://github.com/tc39/ecma426/issues/37
- **Prototype**: https://github.com/hbenl/tc39-proposal-scope-mapping/
- **Codec**: `@chrome-devtools/source-map-scopes-codec`
