// target.ts — the sentinel family's DECLARATION, and the reason this fixture
// project stays typeclean under the repo's root tsconfig (`include` covers
// `tests`, so every file here is type-checked even though nothing here is ever
// compiled or run by the scenario).
//
// The scenario's whole subject is a CALL SHAPE: `OMO_E2E_AST_GREP_TARGET($ARG)`.
// A name that exists nowhere would make this fixture a syntax error rather than a
// document, and a syntax-error document is a bad subject for a tool whose entire
// value is parsing — real `sg` would report parse failures instead of matches,
// and the hermetic double's job (answer for the shape, honestly return `[]` for
// anything else) would have no clean baseline to be checked against.
//
// So the name is declared here, once, with the signature the calls in app.ts and
// queries.ts actually use. Its BODY is inert on purpose: nothing executes this
// file. It exists so the fixture is valid TypeScript, and so renaming the
// sentinel is a single-site edit that the driver's loud absence check will catch
// if the pinned constants are not moved with it.

/** The sentinel family's signature: one string argument, string result — the
 *  shape every matching call site in this project uses verbatim. */
export function OMO_E2E_AST_GREP_TARGET(argument: string): string {
  // Inert by construction. If this ever runs, it is a DRIVER bug (the scenario
  // executes `sg`, never this module), and returning the argument unchanged keeps
  // that bug visible rather than fatal.
  return argument
}
