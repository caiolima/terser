"use strict";

import { defaults } from "./utils/index.js";
import {
    AST_Scope,
    AST_Toplevel,
    TreeWalker,
} from "./ast.js";
import { encode as encodeScopes } from "@jsr/chrome-devtools__source-map-scopes-codec";

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

    function encode(source_map_json) {
        if (!root) return source_map_json;

        var names = [];
        var name_index = new Map();

        function get_name_index(name) {
            if (name === null) return -1;
            if (name_index.has(name)) return name_index.get(name);
            var idx = names.length;
            names.push(name);
            name_index.set(name, idx);
            return idx;
        }

        var encoded_original_scopes = [];
        function encode_scope(scope_info) {
            var variables = [];
            scope_info.variables.forEach((var_info, name) => {
                variables.push(get_name_index(name));
            });

            var encoded = {
                start: scope_info.start,
                end: scope_info.end,
                kind: scope_info.kind,
                name: scope_info.name ? get_name_index(scope_info.name) : undefined,
                variables: variables,
                children: scope_info.children.map(encode_scope),
            };
            if (scope_info.is_stack_frame) {
                encoded.isStackFrame = true;
            }
            return encoded;
        }

        encoded_original_scopes.push(encode_scope(root));

        var encoded_generated_ranges = generated_ranges.map((range) => {
            var bindings = [];
            range.bindings.forEach((mangled, original) => {
                var original_idx = get_name_index(original);
                if (mangled === null) {
                    bindings.push([original_idx]);
                } else {
                    bindings.push([original_idx, get_name_index(mangled)]);
                }
            });

            return {
                start: range.start,
                end: range.end,
                isScope: true,
                originalScope: range.original_scope.index,
                bindings: bindings,
            };
        });

        var scope_info = {
            names: names,
            originalScopes: encoded_original_scopes,
            generatedRanges: encoded_generated_ranges,
        };

        return encodeScopes(scope_info, source_map_json);
    }

    return {
        capture: capture,
        enter_scope: enter_scope,
        exit_scope: exit_scope,
        get_original_scopes: get_original_scopes,
        get_generated_ranges: get_generated_ranges,
        encode: encode,
    };
}

export {
    ScopeMap,
};
