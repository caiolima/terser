# Block Scopes Support for Source Map Scopes

## Overview

Extend the existing scope map feature (function + global scopes) to support block scopes (`let`/`const` boundaries in `for`, `if`, `try`/`catch`, `switch`, plain blocks, etc.).

## Scope of Implementation

**Included:**
- All block scope constructs: `for`, `for...in`, `for...of`, `while`, `do...while`, `if`/`else`, `switch`, `try`/`catch`, plain `{}` blocks
- Only blocks that introduce `let`/`const`/`class` declarations (skip empty scopes)
- Variable bindings with mangled name mapping for block-scoped variables
- `kind: "block"` scope type, `is_stack_frame: false`

**Not included:**
- Inlining detection and callsite information
- Expression bindings for folded constants

## Architecture

### How Block Scopes Work in Terser's AST

Block scopes differ from function scopes in the AST:

- **Function scopes**: The node itself (`AST_Function`, `AST_Arrow`, etc.) `instanceof AST_Scope` and directly has `.variables`
- **Block scopes**: Regular statement nodes (`AST_For`, `AST_Block`, etc.) get a synthetic `.block_scope` property (an `AST_Scope` instance with `_block_scope = true`) attached during `figure_out_scope()`. The block-scoped variables (`let`/`const`/`class`) live on `node.block_scope.variables`.

Detection: `node.is_block_scope()` returns `true` for `AST_Block`, `AST_IterationStatement`, and `AST_Scope` instances with `_block_scope`.

### Changes

#### 1. Phase 1 — Capture (`lib/scope-map.js`)

In `capture()`, add handling for block scope nodes alongside the existing function scope handling:

```javascript
// Existing: capture function/global scopes
if (node instanceof AST_Scope && !node.is_block_scope()) {
    // ... existing code ...
}

// NEW: capture block scopes with variables
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
        node: node.block_scope,  // track the synthetic scope
    };

    node.block_scope.variables.forEach((def, name) => {
        scope_info.variables.set(name, { name: name, def: def });
    });

    scope_to_index.set(node.block_scope, scope_info.index);
    original_scopes.push(scope_info);

    // Add as child of current scope in scope_stack
    if (scope_stack.length > 0) {
        scope_stack[scope_stack.length - 1].children.push(scope_info);
    }

    scope_stack.push(scope_info);
    descend();
    scope_stack.pop();
    return true;
}
```

**Key detail:** We map `node.block_scope` (the synthetic AST_Scope) in `scope_to_index`, since that's the object we'll match during output.

#### 2. Phase 2 — Output Hooks (`lib/output.js`)

Add `scope_map.enter_scope(self.block_scope, ...)` / `exit_scope(self.block_scope, ...)` to each DEFPRINT that produces a block scope. The pattern:

```javascript
DEFPRINT(AST_SomeBlockNode, function(self, output) {
    var scope_map = output.option("scope_map");
    if (scope_map) scope_map.enter_scope(self.block_scope, output.line(), output.col());

    // ... existing print logic ...

    if (scope_map) scope_map.exit_scope(self.block_scope, output.line(), output.col());
});
```

Nodes to modify:
- `AST_BlockStatement`
- `AST_For`
- `AST_ForIn` (covers `AST_ForOf`)
- `AST_While`
- `AST_Do`
- `AST_Switch`
- `AST_Try`
- `AST_Catch`
- `AST_If`

Since `enter_scope` returns early if the node wasn't captured (index === undefined), nodes without block-scoped variables will be no-ops.

**Note:** `self.block_scope` may be `undefined` for nodes that haven't gone through `figure_out_scope()` or after compression removes the block. The `enter_scope` function handles this gracefully since `scope_to_index.get(undefined)` returns `undefined`.

#### 3. Binding Computation — No Changes

`compute_bindings()` already works generically. It uses `node.variables` (which `block_scope` has as a synthetic `AST_Scope`).

#### 4. Encoding — No Changes

The `encode()` function handles the scope tree generically. Block scopes will appear as children with `kind: "block"`.

## Testing Strategy

### Unit Tests (extend `test/mocha/scope-map.js`)

1. **Capture block scopes with let/const**
   ```javascript
   { let x = 1; const y = 2; }
   ```
   Expect: global scope with one "block" child containing variables x, y

2. **For loop with let**
   ```javascript
   for (let i = 0; i < 10; i++) { let x = i; }
   ```
   Expect: block scope for the for loop containing `i`, nested block scope containing `x`

3. **For...of/for...in with let**
   ```javascript
   for (const item of items) { }
   ```

4. **Try/catch**
   ```javascript
   try { let a = 1; } catch (e) { let b = 2; }
   ```
   Expect: block scope for try body, block scope for catch with `e` and `b`

5. **Skip blocks without bindings**
   ```javascript
   if (true) { console.log("hi"); }
   ```
   Expect: no block scope captured (no let/const)

6. **Nested block scopes inside functions**
   ```javascript
   function foo() { let x = 1; { let y = 2; } }
   ```
   Expect: function scope with `x`, child block scope with `y`

7. **Integration test with mangling**
   ```javascript
   function foo() { for (let longName = 0; longName < 10; longName++) {} }
   ```
   With mangle: verify bindings map `longName` to mangled name

8. **Integration test with compression (unused removal)**
   ```javascript
   function foo() { { let unused = 1; } return 42; }
   ```
   With compress: verify removed block-scoped variables marked as unavailable

## File Changes Summary

| File | Changes |
|------|---------|
| `lib/scope-map.js` | Add block scope handling in `capture()` |
| `lib/output.js` | Add scope_map enter/exit hooks to ~9 DEFPRINTs |
| `test/mocha/scope-map.js` | Add block scope test cases |
