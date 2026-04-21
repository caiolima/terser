import { AST_Defun, AST_Arrow, AST_Scope, AST_SymbolRef, TreeWalker, TreeTransformer, AST_SymbolDefun, AST_Accessor, AST_DefClass, AST_ClassExpression, AST_Function, AST_SymbolLambda } from "./ast.js";
import { SymbolDef } from "./scope.js";

/**
 * Builds the original scope tree for a single input file.
 */
export function process_original_scopes(options_parse, scopeInfoBuilder) {
  const { toplevel, filename } = options_parse;
  const startIndex = toplevel.body.findIndex(node => node.start.file === filename);
  const startNode = toplevel.body[startIndex];
  const end = toplevel.end;

  scopeInfoBuilder.startScope(startNode.start.line - 1, startNode.start.col, { kind: "global" });
  if (toplevel.variables) {
    addScopeVariables(scopeInfoBuilder, filterByFile(toplevel.variables, filename));
  }
  const scope = scopeInfoBuilder.currentScope();
  toplevel.original = { scope };
  if (!scopeInfoBuilder.files) {
    scopeInfoBuilder.files = [];
  }
  scopeInfoBuilder.files.push(filename);
  if (!scopeInfoBuilder.fileScopes) {
    scopeInfoBuilder.fileScopes = [];
  }
  scopeInfoBuilder.fileScopes.push(scope);

  for (let i = startIndex; i < toplevel.body.length; i++) {
    const node = toplevel.body[i];
    node.walk(new TreeWalker((node, descend) => {
      if (node.is_block_scope()) {
        scopeInfoBuilder.startScope(node.block_scope.start.line - 1, node.block_scope.start.col, { kind: "block" });
        if (node.block_scope.variables) {
          addScopeVariables(scopeInfoBuilder, [...node.block_scope.variables.values()]);
        }
        node.original = { scope: scopeInfoBuilder.currentScope() };

        descend();

        scopeInfoBuilder.endScope(node.block_scope.end.line - 1, node.block_scope.end.col + 1);
        return true;
      }

      if (node instanceof AST_Scope && !(node instanceof AST_DefClass) && !(node instanceof AST_ClassExpression)) {
        const kind =
              (node instanceof AST_Defun) ? "function"
            : (node instanceof AST_Function) ? "function"
            : (node instanceof AST_Arrow) ? "function"
            : (node instanceof AST_Accessor) ? "accessor"
            : undefined;
        scopeInfoBuilder.startScope(node.start.line - 1, node.start.col, { kind, isStackFrame: true });
        if (node.variables) {
          addScopeVariables(scopeInfoBuilder, filterUnusedArgumentsVar(node.variables));
        }
        // console.error("Created scope for: " + node.name.name);
        node.original = { scope: scopeInfoBuilder.currentScope() };

        descend();

        scopeInfoBuilder.endScope(node.end.line - 1, node.end.col + 1);
        return true;
      }

      if (node instanceof AST_SymbolDefun || node instanceof AST_SymbolLambda) {
        scopeInfoBuilder.setScopeName(node.name);
      }
    }));
  }

  scopeInfoBuilder.endScope(end.line - 1, end.col + 1);
}

function addScopeVariables(scopeInfoBuilder, variableNodes) {
  scopeInfoBuilder.setScopeVariables(variableNodes.map(v => v.name));
  scopeInfoBuilder.currentScope().variableIds = variableNodes.map(v => v.original_id);
}

/**
 * Builds the GeneratedRanges for a given toplevel AST node.
 */
export function process_generated_ranges(toplevel, scopeInfoBuilder) {
  // console.error("Starting process_generated_ranges");
  for (const scope of scopeInfoBuilder.fileScopes) {
    scopeInfoBuilder.startRange(toplevel.gen_start.line - 1, toplevel.gen_start.col, { scope, values: computeValues(scope) });
  }

  for (const node of toplevel.body) {
    node.walk(new TreeWalker((node, descend) => {
      if (node.is_block_scope()) {
        const values = computeValues(node.original?.scope);
        startRangeForNode(node, values, scopeInfoBuilder);
        descend();
        endRangeForNode(node, scopeInfoBuilder);
        return true;
      }

      if (node instanceof AST_Scope && !(node instanceof AST_DefClass) && !(node instanceof AST_ClassExpression)) {
        const values = computeValues(node.original?.scope);
        startRangeForNode(node, values, scopeInfoBuilder);
        scopeInfoBuilder.setRangeStackFrame(true);
        descend();
        endRangeForNode(node, scopeInfoBuilder);
        return true;
      }

      if (node.original) {
        const chain = collectOriginalChain(node.original);
        for (const orig of chain) {
          startRangeForOriginal(node, orig, scopeInfoBuilder);
        }
        descend();
        for (let i = 0; i < chain.length; i++) {
          endRangeForNode(node, scopeInfoBuilder);
        }
        return true;
      }
    }));
  }

  for (let i = 0; i < scopeInfoBuilder.fileScopes.length; i++) {
    scopeInfoBuilder.endRange(toplevel.gen_end.line - 1, toplevel.gen_end.col);
  }
}

function computeValues(scope) {
  const values = [];
  if (scope?.variables) {
    for (let i = 0; i < scope.variables.length; i++) {
      values.push(resolveGeneratedName(scope.variableIds[i]) ?? scope.variables[i]);
    }
  }
  return values;
}

function resolveGeneratedName(id, visiting = new Set()) {
  if (visiting.has(id)) return null;
  const stored = SymbolDef.generated_names.get(id);
  if (stored == null) return null;
  if (typeof stored === "string") return stored;
  // stored is an AST_Node: transitively resolve inner variable references.
  visiting.add(id);
  const node = resolveNode(stored, visiting);
  visiting.delete(id);
  return node.print_to_string();
}

function resolveNode(node, visiting) {
  const tt = new TreeTransformer(function (sub) {
    if (sub instanceof AST_SymbolRef) {
      const subDef = sub.thedef;
      if (!subDef) return undefined;
      const subId = subDef.original_id;
      if (visiting.has(subId)) return undefined;
      const subStored = SymbolDef.generated_names.get(subId);
      if (subStored == null) return undefined;
      if (typeof subStored === "string") {
        if (subStored === sub.name) return undefined;
        const replacement = sub.clone();
        replacement.name = subStored;
        return replacement;
      }
      visiting.add(subId);
      const resolved = resolveNode(subStored, visiting);
      visiting.delete(subId);
      return resolved;
    }
  });
  return node.transform(tt);
}

function collectOriginalChain(original) {
  // The chain head is the innermost (deepest) inlined scope; its `.parent`
  // links outward. Ranges must be started from outermost to innermost so
  // that the inner ranges nest correctly inside the outer ones.
  const chain = [];
  let curr = original;
  while (curr) {
    chain.push(curr);
    curr = curr.parent;
  }
  return chain.reverse();
}

function filterUnusedArgumentsVar(variables) {
  const result = [];
  for (const [key, value] of variables.entries()) {
    if (key !== "arguments" || value.references.length > 0) {
      result.push(value);
    }
  }
  return result;
}

function filterByFile(variables, filename) {
  const result = [];
  for (const [, value] of variables.entries()) {
    if (value.orig.some(node => node.start.file === filename)) {
      result.push(value);
    }
  }
  return result;
}

function startRangeForNode(node, values, scopeInfoBuilder) {
  startRangeForOriginal(node, node.original, scopeInfoBuilder, values);
}

function startRangeForOriginal(node, original, scopeInfoBuilder, values) {
  let callSite;
  if (original?.callsite) {
    const { line, col: column } = original.callsite;
    callSite = {
      sourceIndex: scopeInfoBuilder.files.indexOf(original.callsite.file),
      line: line - 1,
      column,
    };
  }
  const computedValues = values ?? computeValues(original?.scope);
  scopeInfoBuilder.startRange(node.gen_start.line - 1, node.gen_start.col, { scope: original?.scope, values: computedValues, callSite });
}

function endRangeForNode(node, scopeInfoBuilder) {
  scopeInfoBuilder.endRange(node.gen_end.line - 1, node.gen_end.col);
}
