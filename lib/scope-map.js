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
                    kind: node instanceof AST_Toplevel ? "global" : "function",
                    name: node.name ? node.name.name : null,
                    is_stack_frame: !(node instanceof AST_Toplevel),
                    start: { line: node.start.line - 1, column: node.start.col },
                    end: { line: node.end.endline - 1, column: node.end.endcol },
                    variables: new Map(),
                    children: [],
                    node: node,
                };

                if (node.variables) {
                    node.variables.forEach((def, name) => {
                        if (name === "arguments") return;
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
            start: { line: line - 1, column: col },
            end: null,
            bindings: new Map(),
        });
    }

    function exit_scope(node, line, col) {
        var range = range_stack.pop();
        if (!range) return;

        range.end = { line: line - 1, column: col };
        compute_bindings(range, node);
        generated_ranges.push(range);
    }

    function compute_bindings(range, node) {
        var original_scope = range.original_scope;
        var surviving_vars = node.variables || new Map();

        original_scope.variables.forEach((var_info, original_name) => {
            var surviving_def = surviving_vars.get(original_name);

            if (surviving_def) {
                var mangled = surviving_def.mangled_name || original_name;
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

        // Build OriginalScope tree in the codec's expected format
        var scope_info_to_encoded = new Map();

        function encode_scope(scope_info) {
            var variables = [];
            scope_info.variables.forEach((var_info, name) => {
                variables.push(name);
            });

            var encoded = {
                start: scope_info.start,
                end: scope_info.end,
                kind: scope_info.kind,
                name: scope_info.name || undefined,
                isStackFrame: scope_info.is_stack_frame,
                variables: variables,
                children: scope_info.children.map(encode_scope),
            };
            scope_info_to_encoded.set(scope_info, encoded);
            return encoded;
        }

        var encoded_root = encode_scope(root);

        // Build GeneratedRange tree - sort by start position, then by end (descending)
        // When starts are equal, larger ranges (containers) come first
        var sorted_ranges = generated_ranges.slice().sort((a, b) => {
            if (a.start.line !== b.start.line) return a.start.line - b.start.line;
            if (a.start.column !== b.start.column) return a.start.column - b.start.column;
            // Same start: larger range (later end) comes first
            if (a.end.line !== b.end.line) return b.end.line - a.end.line;
            return b.end.column - a.end.column;
        });

        function build_range(range) {
            var original_scope = scope_info_to_encoded.get(range.original_scope);
            var values = [];
            if (original_scope) {
                original_scope.variables.forEach((var_name) => {
                    var mangled = range.bindings.get(var_name);
                    values.push(mangled); // string or null
                });
            }

            return {
                start: range.start,
                end: range.end,
                originalScope: original_scope,
                isStackFrame: original_scope ? original_scope.isStackFrame : false,
                isHidden: false,
                values: values,
                children: [],
            };
        }

        // Build range tree with proper nesting
        // Ranges need to be nested: if range B starts after range A starts and ends before A ends,
        // then B is a child of A
        var range_stack_build = [];
        var top_level_ranges = [];

        sorted_ranges.forEach((range) => {
            var encoded_range = build_range(range);

            // Pop ranges from stack that have ended before this range starts
            while (range_stack_build.length > 0) {
                var parent = range_stack_build[range_stack_build.length - 1];
                var parent_range = parent._range;
                // Check if current range starts after parent ends
                var after_parent = (range.start.line > parent_range.end.line ||
                    (range.start.line === parent_range.end.line && range.start.column >= parent_range.end.column));
                if (after_parent) {
                    range_stack_build.pop();
                } else {
                    break;
                }
            }

            // Store original range for end position comparison
            encoded_range._range = range;

            if (range_stack_build.length > 0) {
                range_stack_build[range_stack_build.length - 1].children.push(encoded_range);
            } else {
                top_level_ranges.push(encoded_range);
            }
            range_stack_build.push(encoded_range);
        });

        // Clean up temporary _range properties
        function clean_ranges(ranges) {
            ranges.forEach((r) => {
                delete r._range;
                clean_ranges(r.children);
            });
        }
        clean_ranges(top_level_ranges);

        var scope_info = {
            scopes: [encoded_root], // One scope tree per source file
            ranges: top_level_ranges,
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
