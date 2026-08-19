#!/usr/bin/env bash
# scripts/p1-preset-probe.sh — compatibility wrapper. The T5 P-1 spike probe
# grew into the real Concerto Mode probe (T6); kept so existing references
# (docs/mvp-pitfalls.md P-1.1, evidence logs) still resolve to a working entry.
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/concerto-mode-probe.sh" "$@"
