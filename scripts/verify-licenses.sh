#!/bin/sh
# verify-licenses.sh — thin shell wrapper (plan T3, PRD AC-8).
# All logic lives in scripts/verify-licenses.mjs; this wrapper only execs it
# with the caller's arguments and forwards the exit code.
exec node "$(dirname "$0")/verify-licenses.mjs" "$@"
