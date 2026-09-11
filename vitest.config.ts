import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Explicit include: the repo's own suite (tests/**) plus the vendored
    // OMO package's tests, which stay in src/ to remain byte-identical to
    // upstream (see docs/plans/phase1-dev/phase1-plan.md §4.1). Declaring both
    // paths is what makes "the vendor tests really ran" auditable — a silent
    // drop from collection would otherwise look like a perfect green.
    // Constraint: repo tests must live under tests/ or inside the vendor tree —
    // anything elsewhere is never collected. tests/ also accepts *.spec.ts so a
    // future spec file cannot be silently skipped; the vendor pattern stays
    // *.test.ts (that tree is ours to control and is always .test.ts).
    include: ["tests/**/*.{test,spec}.ts", "patches/omo-dsh/vendor/**/*.test.ts"],
  },
  resolve: {
    // Shim S-1: the vendored tests import { describe, it, expect } from
    // "bun:test"; vitest exports the same API. No test source is modified.
    alias: { "bun:test": "vitest" },
  },
});
