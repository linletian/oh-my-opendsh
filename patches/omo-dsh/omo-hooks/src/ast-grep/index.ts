// index.ts — barrel of the omo-hooks ast-grep provisioning layer, the 语义移植
// of upstream packages/utils/src/ast-grep/index.ts @ v4.19.4 (frozen baseline tag,
// commit b072d279110bdda2c6ac2525d0d24dc54d16148a — 5 star re-exports, same
// member set minus nothing: every upstream module in the barrel survived the
// D9 reduction INSIDE its own file, none was dropped from the barrel).
//
// WHY THIS BARREL IS THE HOOK'S ONLY IMPORT (R2-7②③ static-gate-home):
// src/hooks/ast-grep-sg-provision.ts imports `../ast-grep/index.ts` and
// nothing deeper — the seam scripts/verify-concerto-static.mjs record c29 pins
// (the provisioning layer is one import, so a renamed module can never half-
// survive). The layer lives OUTSIDE src/hooks/ because it is not a listener;
// c13 reconciles listeners, c29 reconciles THIS.
export * from './sg-manifest.ts'
export * from './sg-provisioner.ts'
export * from './sg-resolver.ts'
export * from './install-script.ts'
export * from './types.ts'
