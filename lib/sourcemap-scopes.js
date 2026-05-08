import { AST_Defun, AST_Arrow, AST_Scope, TreeWalker, AST_SymbolDefun, AST_Accessor, AST_DefClass, AST_ClassExpression, AST_Function, AST_SymbolLambda } from "./ast.js";
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

function compute_scope_values(scope) {
  const values = [];
  if (scope?.variables) {
    for (let i = 0; i < scope.variables.length; i++) {
      values.push(SymbolDef.generated_names.get(scope.variableIds[i]) ?? scope.variables[i]);
    }
  }
  return values;
}

export function open_range_for(node, output, builder) {
  const scope = node.original.scope;
  const values = compute_scope_values(scope);
  let callSite;
  if (node.original.callsite) {
    const { line, col: column, file } = node.original.callsite;
    callSite = {
      sourceIndex: builder.files.indexOf(file),
      line: line - 1,
      column,
    };
  }
  builder.startRange(output.line() - 1, output.col(), { scope, values, callSite });
  if (
    node instanceof AST_Scope
    && !(node instanceof AST_DefClass)
    && !(node instanceof AST_ClassExpression)
  ) {
    builder.setRangeStackFrame(true);
  }
}

export function open_file_scope_ranges(output, builder) {
  for (const scope of builder.fileScopes) {
    const values = compute_scope_values(scope);
    builder.startRange(output.line() - 1, output.col(), { scope, values });
  }
}

export function close_file_scope_ranges(output, builder) {
  for (let i = 0; i < builder.fileScopes.length; i++) {
    builder.endRange(output.line() - 1, output.col());
  }
}
