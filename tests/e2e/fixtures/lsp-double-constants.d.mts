// Type declarations for ./lsp-double-constants.mjs (tests/omo-lsp/
// lsp-double-protocol.test.ts and any future .ts consumer).
//
// WHY THIS FILE EXISTS AND IS NOT OPTIONAL. The repo's root tsconfig has no
// `allowJs` — a `.mjs` is deliberately not typechecked — so an untyped `.mjs`
// import is TS7016 "implicitly has an 'any' type" and gate 1 goes red the moment
// a `.ts` imports it. The house answer is the sibling `.d.mts` every such module
// already ships: scripts/doctor-lite.d.mts, scripts/vendor-manifest.d.mts,
// scripts/verify-licenses.d.mts and, for a fixture under tests/,
// tests/e2e/mock-llm-server.d.mts. This is that same seam, for this module.
//
// THE FACE IS COMPLETE ON PURPOSE. Every export of the `.mjs` is declared here,
// in the `.mjs`'s own order. A partial declaration would let a consumer import a
// name that exists at runtime and be told nothing about it — the drift this
// module's own header (「the SINGLE SOURCE of every literal the P6-T5 LSP double
// and its e2e scenarios share」) exists to prevent.
//
// Types only, no values: the literals stay in the `.mjs`, which is the single
// source. Nothing is restated here that could move on its own.

/** Config id of the double (`<id>: <state>; source=…` on the engine's status). */
export declare const LSP_DOUBLE_SERVER_ID: string;
/** `serverInfo.name` on the double's `initialize` result. */
export declare const LSP_DOUBLE_SERVER_NAME: string;
/** Canned definition target, relative to the fixture workspace root. */
export declare const LSP_DOUBLE_MARKER_RELATIVE: string;
/** Sentinel inside that file whose line becomes the canned location. */
export declare const LSP_DOUBLE_MARKER_SENTINEL: string;
/** 0-based character offset of the canned selection range's start. */
export declare const LSP_DOUBLE_MARKER_CHARACTER: number;
/** The canned diagnostic, answered on BOTH the push and the pull path. */
export declare const LSP_DOUBLE_DIAGNOSTIC_MESSAGE: string;
export declare const LSP_DOUBLE_DIAGNOSTIC_SOURCE: string;
export declare const LSP_DOUBLE_DIAGNOSTIC_CODE: number;
/** The reverse-canary triple: an id/command/extension nothing else can answer. */
export declare const LSP_DOUBLE_MISSING_SERVER_ID: string;
export declare const LSP_DOUBLE_MISSING_COMMAND: string;
export declare const LSP_DOUBLE_MISSING_EXTENSION: string;
/** The fixture-workspace-relative document the canary call addresses. */
export declare const LSP_DOUBLE_MISSING_PROBE_FILE: string;

/**
 * The stdio child's boot announcement, DERIVED from the source text of
 * vendor/lsp-core/src/cli.ts. Throws when the selector matches nothing or the
 * derivation is empty — a caller greps a value it proved exists, never an empty
 * string. scripts/concerto-mode-probe.sh runs the SAME derivation in awk as an
 * independent second reader; see the `.mjs` for the full contract.
 */
export declare function deriveLspMcpStartingMarker(cliSource: string): string;
