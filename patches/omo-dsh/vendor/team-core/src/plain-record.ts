// plain-record.ts — P5-T8a semantic port (the only project-written source
// file in this vendored package — NOTICE.md and VENDOR-MANIFEST.json are the
// project-new record files, not source).
//
// Upstream: packages/utils/src/record-type-guard.ts @ v4.19.4
//   (frozen baseline tag, commit b072d279110bdda2c6ac2525d0d24dc54d16148a),
//   package @oh-my-opencode/utils. The `isPlainRecord` body below is the
//   upstream expression byte-for-byte. `isRecord` is deliberately NOT
//   ported: its only team-core consumers (team-mailbox/
//   pending-delivery-recovery.ts, team-state-store/reservation-
//   reconciliation.ts) sit outside this vendored subset (D4 + scope
//   guardrails). This file exists so the vendored team-state-store/store.ts
//   — the sole vendored consumer of @oh-my-opencode/utils — resolves inside
//   the vendor closure instead of across a package boundary.
//
// Copyright code-yeongyu, SUL-1.0; see the package NOTICE.md and
// VENDOR-MANIFEST.json (deviations[]).
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}
