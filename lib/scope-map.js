"use strict";

import { defaults } from "./utils/index.js";
import {
    AST_Scope,
    AST_Toplevel,
    TreeWalker,
} from "./ast.js";

function ScopeMap(options) {
    defaults(options, {
        orig: null,
    });

    var original_scopes = [];
    var scope_to_index = new Map();
    var root = null;
    var generated_ranges = [];
    var range_stack = [];

    function capture(toplevel) {
        var scope_stack = [];

        var tw = new TreeWalker((node, descend) => {
            if (node instanceof AST_Scope && !node.is_block_scope()) {
                var scope_info = {
                    index: original_scopes.length,
                    kind: node instanceof AST_Toplevel ? "Global" : "Function",
                    name: node.name ? node.name.name : null,
                    is_stack_frame: !(node instanceof AST_Toplevel),
                    start: { line: node.start.line, column: node.start.col },
                    end: { line: node.end.endline, column: node.end.endcol },
                    variables: new Map(),
                    children: [],
                    node: node,
                };

                if (node.variables) {
                    node.variables.forEach((def, name) => {
                        scope_info.variables.set(name, { name: name, def: def });
                    });
                }

                scope_to_index.set(node, scope_info.index);
                original_scopes.push(scope_info);

                if (scope_stack.length > 0) {
                    scope_stack[scope_stack.length - 1].children.push(scope_info);
                } else {
                    root = scope_info;
                }

                scope_stack.push(scope_info);
                descend();
                scope_stack.pop();
                return true;
            }
        });

        toplevel.walk(tw);
    }

    function enter_scope(node, line, col) {
        var index = scope_to_index.get(node);
        if (index === undefined) return;

        range_stack.push({
            original_scope: original_scopes[index],
            start: { line: line, column: col },
            end: null,
            bindings: new Map(),
        });
    }

    function exit_scope(node, line, col) {
        var range = range_stack.pop();
        if (!range) return;

        range.end = { line: line, column: col };
        compute_bindings(range, node);
        generated_ranges.push(range);
    }

    function compute_bindings(range, node) {
        var original_scope = range.original_scope;
        var surviving_vars = node.variables || new Map();

        original_scope.variables.forEach((var_info, original_name) => {
            var def = var_info.def;
            var surviving_def = surviving_vars.get(original_name);

            if (surviving_def && surviving_def.id === def.id) {
                var mangled = def.mangled_name || original_name;
                range.bindings.set(original_name, mangled);
            } else {
                range.bindings.set(original_name, null);
            }
        });
    }

    function get_original_scopes() {
        return { root: root, list: original_scopes };
    }

    function get_generated_ranges() {
        return generated_ranges;
    }

    return {
        capture: capture,
        enter_scope: enter_scope,
        exit_scope: exit_scope,
        get_original_scopes: get_original_scopes,
        get_generated_ranges: get_generated_ranges,
    };
}

export {
    ScopeMap,
};
