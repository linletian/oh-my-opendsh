#!/bin/sh
# install-concerto.sh — one-shot installer for the oh-my-opendsh Concerto Mode
# (协奏模式) persistent preset. Idempotent; sources pinned to the v0.2 tag by
# default. The same install can be done with a single curl one-liner — see
# docs/install-concerto.md.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/linletian/oh-my-opendsh/v0.2/scripts/install-concerto.sh | sh
#   (or run from a checkout: sh scripts/install-concerto.sh)
#
# Options (env):
#   CONCERTO_TAG=<tag>       tag/branch to fetch the preset from; defaults to
#                            the alias line below (see docs/release-process §2)
#   DSH_HOME=/path           DSH home (defaults to $HOME/.dsh)
#   NO_PIAI=1                skip the llm-pi-ai settings section (point
#                            agentOptions at your own second route instead)
#   EXPLORE_PROVIDER / EXPLORE_MODEL
#                            override the explore route inside agentOptions
#
# Requirements:
#   dsh >= 0.2 (the only supported face — declaration): python3 WITH PyYAML
#   on PATH (pip install pyyaml — macOS ships a python3 that has neither).
#   dsh < 0.2 is REFUSED by name: 0.1.x compatibility was dropped by ruling
#   D17 (task book 四之二十二, commit 2323658); the filediscovery face this
#   installer used to select for MINOR==1 was deleted in P4.5-T13 because
#   0.2.x never reads $DSH_HOME/.agent-presets/ off disk — an installer that
#   still took that leg would install nothing and say nothing.
set -eu

TAG="${CONCERTO_TAG:-v0.2}"
BASE="https://raw.githubusercontent.com/linletian/oh-my-opendsh/${TAG}"
D="${DSH_HOME:-${HOME}/.dsh}"
# The one install target (P4.5-T13: the two-face split is gone — only the
# declaration face remains, see the Requirements block above):
#   DECL_PATCH — declaration face (dsh >= 0.2): 0.2.x never reads
#                .agent-presets/ from disk. A preset only exists once it is
#                DECLARED as a row of a host composition, so the install target
#                is the web profile's patch file. Writing a preset directory on
#                0.2 would install nothing and say nothing.
DECL_PATCH="${D}/profiles/web/cordis.patch.yml"
SET="${D}/settings.yaml"

# F3 (PR #1 review): route overrides are written into agentOptions verbatim —
# reject anything that is not a YAML-safe identifier loudly, instead of
# emitting a broken composition.
for v in "${EXPLORE_PROVIDER:-}" "${EXPLORE_MODEL:-}"; do
  if [ -n "$v" ] && ! printf '%s' "$v" | grep -qE '^[a-zA-Z0-9._-]+$'; then
    echo "error: EXPLORE_PROVIDER / EXPLORE_MODEL must match ^[a-zA-Z0-9._-]+\$ (got '$v')" >&2
    exit 1
  fi
done

need() { command -v "$1" >/dev/null 2>&1 || { echo "error: missing $1" >&2; exit 1; }; }
need curl

# Version gate: dsh >= 0.2 never reads $DSH_HOME/.agent-presets/ from disk —
# presets are DECLARED, not file-discovered — so below that line there is no
# install face this installer can honestly offer. The old `MINOR==1 →
# filediscovery` leg was deleted in P4.5-T13 (ruling D17, commit 2323658:
# 0.1.x compatibility dropped); what remains is one comparison and one named
# refusal — refuse loudly, never drop a preset into a directory this dsh will
# never load, and never guess a face when the version is unreadable.
DSH_VER=""
if command -v dsh >/dev/null 2>&1; then
  DSH_VER="$(dsh --version 2>/dev/null | head -n 1 || true)"
fi
DSH_MAJOR="$(printf '%s\n' "$DSH_VER" | sed -n 's/^[^0-9]*\([0-9][0-9]*\)\.\([0-9][0-9]*\).*/\1/p')"
DSH_MINOR="$(printf '%s\n' "$DSH_VER" | sed -n 's/^[^0-9]*\([0-9][0-9]*\)\.\([0-9][0-9]*\).*/\2/p')"
if [ -z "$DSH_MAJOR" ] || [ -z "$DSH_MINOR" ]; then
  echo "error: cannot detect dsh version — dsh is missing from PATH or 'dsh --version' did not report a MAJOR.MINOR (got '${DSH_VER:-<empty>}')." >&2
  echo "error: install dsh (>= 0.2) first, then re-run this installer." >&2
  exit 1
fi
if [ "$DSH_MAJOR" -gt 0 ] || [ "$DSH_MINOR" -ge 2 ]; then
  DSH_FACE="declaration"
else
  echo "error: unsupported dsh version '${DSH_VER}' — dsh < 0.2 is NOT supported: 0.1.x compatibility was dropped by ruling D17 (presets must be DECLARED; 0.1.x file-discovered installs would materialize files no runtime reads). Install dsh >= 0.2 (the D7 pin) and re-run." >&2
  exit 1
fi
echo "==> detected dsh ${DSH_VER} — install face: ${DSH_FACE}"

# render_patch_block — prints the `insert:` patch declaration block that mounts
# the concerto preset inside a host composition. Args: <agent.cordis.yml>
# <preset.yml>. Output goes to stdout only; nothing is written to disk.
#
# The composition is re-indented by exactly 8 spaces: `plugins:` is emitted at
# column 8 of the block above, and a nested block sequence must sit DEEPER than
# its parent key — re-indenting by only 4 puts the sequence left of `plugins:`,
# so YAML resolves `plugins: null` without any error: an empty preset, installed
# silently.
render_patch_block() { # <agent.cordis.yml 路径> <preset.yml 路径>
  [ "$#" -eq 2 ] || { echo "error: render_patch_block <agent.cordis.yml> <preset.yml>" >&2; return 2; }
  python3 - "$1" "$2" <<'PYRENDER' || exit $?
import json
import sys

import yaml

# The Cordis Loader dialect carries raw JS through `!!js <expr>` tags (e.g.
# `disabled: !!js process.platform === 'win32'`). PyYAML has no constructor for
# that tag, so parse it into an opaque marker instead of dying with
# "could not determine a constructor for the tag tag:yaml.org,2002:js".
class _JsLoader(yaml.SafeLoader):
    pass

def _js_expr(loader, node):
    if isinstance(node, yaml.ScalarNode):
        return {'__jsExpr': node.value}
    if isinstance(node, yaml.SequenceNode):
        return {'__jsExpr': loader.construct_sequence(node)}
    return {'__jsExpr': loader.construct_mapping(node)}

_JsLoader.add_constructor('tag:yaml.org,2002:js', _js_expr)

def _load(text):
    return yaml.load(text, Loader=_JsLoader)

comp_path, preset_path = sys.argv[1], sys.argv[2]

try:
    with open(comp_path, encoding='utf-8') as f:
        comp_text = f.read()
    with open(preset_path, encoding='utf-8') as f:
        preset_text = f.read()
except OSError as e:
    print('render_patch_block: cannot read input: %s' % e, file=sys.stderr)
    sys.exit(1)

preset = _load(preset_text) or {}
name = preset.get('name')
desc = preset.get('description')
if name is None or desc is None:
    print('render_patch_block: %s must define both name: and description:' % preset_path,
          file=sys.stderr)
    sys.exit(1)

# A legal YAML 1.1 preset.yml may write `description: 2026-10-05`, which parses
# to datetime.date, not str. json.dumps would then raise a bare TypeError out of
# the middle of this block — exit 1 with a raw traceback leaking through the
# one-liner. Name the key and its type loudly instead.
for _key, _val in (('name', name), ('description', desc)):
    if not isinstance(_val, str):
        print('error: render_patch_block: %s must define %s: as a string, but YAML '
              'parsed it as %s (%r) — quote the value in preset.yml and re-run.'
              % (preset_path, _key, type(_val).__name__, _val), file=sys.stderr)
        sys.exit(1)

# `plugins:` sits at column 8 of the block above, so every composition line —
# including its top-level `- ` sequence dashes — moves 8 columns right. Blank
# lines stay blank; a row of 8 spaces would be noise, not YAML.
body = '\n'.join(ln if ln.strip() == '' else '        ' + ln
                 for ln in comp_text.split('\n'))

# name/description MUST be quoted, never bare-concatenated: a perfectly legal
# preset.yml whose description contains an ASCII ': ' (colon+space) would render
# `description: contains: an ASCII colon ...` — not valid YAML; PyYAML dies with
# ScannerError "mapping values are not allowed here" and the installer exits 1.
# The shipped preset.yml dodges this only by using fullwidth '：'.
#
# The quoted BOUNDARY this covers, stated exactly: json.dumps escapes the
# double-quote, the backslash, and every C0 control below U+0020 (\n, \t, ...),
# so the rendered value stays ONE double-quoted YAML scalar against exactly
# those characters. It does NOT escape the YAML 1.1 line-break characters JSON
# has no opinion about — U+0085 (NEL), U+2028 and U+2029 pass through as raw
# bytes with ensure_ascii=False, and PyYAML then folds NEL to a space inside
# the quoted scalar: a silent description rewrite no quoting can prevent. So
# correctness here is not claimed from the quoting at all — it is PROVEN by
# the round-trip self-check below, which compares the re-parsed name AND
# description character-for-character against the parsed input. ensure_ascii=False
# is only about readability: CJK stays readable instead of \uXXXX noise.
patch_text = (
    '- insert:\n'
    "    - id: preset-concerto\n"
    "      name: '@deepseek-ai/dsh-agent-preset'\n"
    '      config:\n'
    '        id: concerto\n'
    '        name: ' + json.dumps(name, ensure_ascii=False) + '\n'
    '        description: ' + json.dumps(desc, ensure_ascii=False) + '\n'
    '        plugins:\n'
) + body
if not patch_text.endswith('\n'):
    patch_text += '\n'

# Hard self-check: the rendered block must round-trip back to exactly the
# composition that was pasted in under `plugins:` — AND the quoted name/
# description must survive their own quoting. The name/description comparison
# is what gives the check teeth against the quoting boundary above: a raw
# U+0085 inside the double-quoted scalar folds to a space on re-parse, and
# only a character-for-character compare of the RE-PARSED values can see it.
try:
    rendered = _load(patch_text)
    original = _load(comp_text)
    got = json.dumps(rendered[0]['insert'][0]['config']['plugins'],
                     sort_keys=True, ensure_ascii=False)
    want = json.dumps(original, sort_keys=True, ensure_ascii=False)
    got_name = rendered[0]['insert'][0]['config']['name']
    got_desc = rendered[0]['insert'][0]['config']['description']
except (TypeError, KeyError, IndexError, yaml.YAMLError) as e:
    print('render_patch_block: self-check could not parse the rendered block: %s: %s'
          % (e.__class__.__name__, e), file=sys.stderr)
    sys.exit(1)
if got != want:
    print('render_patch_block: SELF-CHECK FAILED — rendered config.plugins != %s\n'
          '  rendered: %s\n  original: %s' % (comp_path, got[:400], want[:400]),
          file=sys.stderr)
    sys.exit(1)
if got_name != name or got_desc != desc:
    print('render_patch_block: SELF-CHECK FAILED — the quoted name/description did '
          'not round-trip character-for-character through the rendered patch.\n'
          '  name       rendered: %r\n  name       original: %r\n'
          '  description rendered: %r\n  description original: %r\n'
          '  A YAML 1.1 line-break character (e.g. U+0085 NEL) inside the quoted '
          'value was folded to a space. Re-save preset.yml without it.'
          % (got_name, name, got_desc, desc), file=sys.stderr)
    sys.exit(1)

sys.stdout.write(patch_text)
PYRENDER
}

# write_patch_row — installs one rendered patch block into a host cordis.patch.yml
# idempotently. Args: <cordis.patch.yml 路径> <block 文件路径>.
#
# The delete has to be TEXT-level. Upstream dsh-app-boot/lib/index.js:87 does
# `data.push(...insert)` — top-level inserts are appended with NO dedup, so a
# second plain append leaves TWO preset-concerto rows; and the target form
# (`- id: preset-concerto` without `insert:`) warns and skips at :96-98 when
# that row does not exist yet, which on a first install means nothing gets
# installed at all. yaml.load→dump would also shred the user's own comments and
# indentation, so only the preset-concerto rows are cut. The new content goes
# to a temp file and only reaches the original through os.replace() after the
# YAML self-check passes, so a failed check never leaves a half-written patch.
write_patch_row() { # <cordis.patch.yml 路径> <block 文件路径>
  [ "$#" -eq 2 ] || { echo "error: write_patch_row <cordis.patch.yml> <block>" >&2; return 2; }
  python3 - "$1" "$2" <<'PYROW' || exit $?
import json
import os
import re
import sys
import time

import yaml

TARGET = 'preset-concerto'

# Same `!!js` constructor as render_patch_block above: the Cordis Loader dialect
# carries raw JS through `!!js <expr>` tags and PyYAML has no constructor for
# tag:yaml.org,2002:js, so parse it into an opaque marker instead of dying.
class _JsLoader(yaml.SafeLoader):
    pass


def _js_expr(loader, node):
    if isinstance(node, yaml.ScalarNode):
        return {'__jsExpr': node.value}
    if isinstance(node, yaml.SequenceNode):
        return {'__jsExpr': loader.construct_sequence(node)}
    return {'__jsExpr': loader.construct_mapping(node)}


_JsLoader.add_constructor('tag:yaml.org,2002:js', _js_expr)


def _load(text):
    return yaml.load(text, Loader=_JsLoader)


def _fail(msg):
    print('write_patch_row: %s' % msg, file=sys.stderr)
    sys.exit(1)


class _InsertBlockCarriesUserContent(Exception):
    """The `- insert:` block holding the old target row ALSO carries the user's
    own non-dash lines (comments) but no other sub-entry. Cutting the target
    would leave a comment-only `insert:` (parses to `insert: null` — noise,
    not YAML), and dropping the whole block would silently erase the user's
    text: comments are not YAML nodes, so none of the self-checks
    (user_before / user_after / lost) can ever see that loss (PR #12 review).
    Refuse loudly instead — the caller exits BEFORE any byte is written."""


# The ONLY backup name shapes this script ever writes (see bak_path below):
# '<patch file>.bak.<%Y%m%d%H%M%S>', plus '<patch file>.bak.<same>.<N>' for a
# second backup inside the same second. '%Y%m%d%H%M%S' is exactly 14 ASCII
# digits, so "did this installer make this file?" is a decidable test on the
# NAME — and that shape test, not the prefix, is what scopes the deletion
# below.
# ASCII classes on purpose: Python's `\d` matches every Unicode decimal digit
# (category Nd), so `cordis.patch.yml.bak.١٢٣٤٥٦٧٨٩٠١٢٣٤` would match
# `\d{14}` and become a deletion candidate — a name `time.strftime('%Y…%S')`
# can NEVER produce, i.e. a file the user wrote by hand, which is precisely the
# data no retention policy may eat. `[0-9]` is the class the writer uses.
# group 1 captures the same-second collision suffix, which _prune_backups
# parses as an INTEGER (see the sort key there).
BACKUP_SHAPE = re.compile(r'[0-9]{14}(?:\.([0-9]+))?\Z')


def _prune_backups(target_path, keep=3):
    """Delete all but the newest `keep` backups THIS script produced.

    Without retention every re-run stacks another .bak.<timestamp> into the
    user's profile directory, unbounded.

    SCOPE, deliberately narrower than the prefix: a name is a deletion candidate
    only when it starts with '<patch file>.bak.' AND what follows is exactly 14
    ASCII digits, or 14 ASCII digits plus '.<N>' (this script's same-second
    collision suffix). Anything carrying the same prefix in a DIFFERENT name
    shape is not a file this script made and is KEPT — 'cordis.patch.yml.bak.mine',
    'cordis.patch.yml.bak.first' (this script's OWN permanent first-ever copy —
    immune by the same shape test),
    or the 'cordis.patch.yml.bak.before-my-edits' that this script's own uninstall
    hint invites the user to write with `ls -t <patch>.bak.[0-9]*`. Prefix alone
    would delete those silently, and a hand-kept user archive is precisely the
    data no retention policy may eat. Outside that prefix this function does not
    inspect, stat for deletion, or modify anything; its only filesystem
    operation is os.remove() of a name matching the shape above.

    THE SORT KEY, and why mtime alone is not enough: backups made inside the
    SAME second share one mtime, and there the tie must break on the collision
    suffix — as an INTEGER, not as text. Lexicographically '.bak.TS.10' sorts
    BEFORE '.bak.TS.2', so with 10+ collisions the text tie-break inverts
    creation order and the prune deletes the NEWEST backups, keeping stale
    ones; and the newest is exactly the file the uninstall hint (`ls -t … |
    head -n 1`) restores. A bare timestamp has no suffix and is the FIRST file
    made in its second, so it sorts as -1.

    This runs after os.replace() has put the new content in place, and a
    failure here is reported as a warning — the install already succeeded,
    leftover cruft must not turn it into a failed run.
    """
    d = os.path.dirname(target_path) or '.'
    prefix = os.path.basename(target_path) + '.bak.'
    entries = []
    try:
        for n in os.listdir(d):
            if not n.startswith(prefix):
                continue
            # Shape, not just prefix: a user's '<patch>.bak.<their own words>'
            # shares the prefix and must survive every prune forever.
            shape = BACKUP_SHAPE.match(n[len(prefix):])
            if not shape:
                continue
            try:
                mt = os.path.getmtime(os.path.join(d, n))
            except OSError:
                mt = 0
            # (mtime, same-second collision index, name): the integer suffix
            # keeps creation order readable past '.10', where text order flips.
            collide = shape.group(1)
            entries.append((mt, int(collide) if collide is not None else -1, n))
    except OSError as e:
        print('write_patch_row: WARNING: cannot list old backups in %s: %s' % (d, e))
        return
    entries.sort()
    for _, _, n in (entries[:-keep] if keep > 0 else entries):
        try:
            os.remove(os.path.join(d, n))
        except OSError as e:
            print('write_patch_row: WARNING: cannot remove old backup %s: %s' % (n, e))


# Form ①: a top-level target row `- id: preset-concerto`.
# Form ②: our patch row `- insert:` holding `    - id: preset-concerto` at
# column 4 (the depth render_patch_block emits).
# A quoted id — `- id: 'preset-concerto'` or `- id: "preset-concerto"` — is
# the same YAML scalar, and dsh-web-app's editor round-trip plausibly writes
# ids quoted, so both rows' patterns accept all three spellings. Quoted
# alternation rather than an optional quote class, so a mismatched
# `- id: 'preset-concerto"` cannot match.
# The trailing `\r?` keeps CRLF patch files upgradeable: lines come out of
# text.split('\n') with their '\r' still attached, and without it nothing here
# ever matches and the file never upgrades.
_TARGET_SCALAR = '(?:%s|\'%s\'|"%s")' % (TARGET, TARGET, TARGET)
RE_FORM1 = re.compile(r'^- id:[ \t]*' + _TARGET_SCALAR + r'[ \t]*\r?$')
RE_INSERT = re.compile(r'^- insert:[ \t]*\r?$')
RE_SUB_DASH = re.compile(r'^    - ')
RE_SUB_TARGET = re.compile(r'^    - id:[ \t]*' + _TARGET_SCALAR + r'[ \t]*\r?$')
RE_COMMENT = re.compile(r'^\s*#')


def _is_top_entry(ln):
    return ln.startswith('- ') or ln.rstrip('\r\n') == '-'


def _cuts_target_rows(text):
    """Return (new_text, dropped, swallowed_comments) with every
    preset-concerto row removed.

    The file is walked as a list of top-level entries: an entry runs from its
    column-0 `- ` line up to the next column-0 `- ` line or EOF, so user rows
    are copied out as they stand, comments included. Scope of that claim: per
    row. At file level the append step below can still add the one newline a
    file that ended without one was missing. One boundary is REFUSED rather
    than cut: an `- insert:` block whose only remaining content beside the
    target row is the user's own comments raises _InsertBlockCarriesUserContent
    — the cut cannot keep them (a comment-only `insert:` is not YAML anyone
    meant) and must not drop them silently (PR #12 review).

    `swallowed_comments` collects the comment lines dropped WITH a target row
    (inside its own subtree — e.g. an annotation the user wrote inside the
    installed block, PR #12 round 2): those are not YAML nodes either, so the
    caller warns about any the fresh block does not carry.
    """
    lines = text.split('\n')
    starts = [i for i, ln in enumerate(lines) if _is_top_entry(ln)]
    bounds = starts + [len(lines)]
    spans = []
    if not starts or starts[0] > 0:
        spans.append((0, bounds[0], False))       # leading comments, keep as-is
    for k, s in enumerate(starts):
        spans.append((s, bounds[k + 1], True))

    kept = []
    dropped = 0
    swallowed = []
    for start, end, is_entry in spans:
        chunk = lines[start:end]
        if not is_entry:
            kept.extend(chunk)
            continue
        if RE_FORM1.match(chunk[0]):               # form ① — drop the whole row
            dropped += 1
            swallowed.extend(ln for ln in chunk[1:] if RE_COMMENT.match(ln))
            continue
        if RE_INSERT.match(chunk[0]) and any(RE_SUB_TARGET.match(ln) for ln in chunk[1:]):
            subs = []
            skip = False
            for ln in chunk[1:]:
                if RE_SUB_DASH.match(ln):
                    skip = bool(RE_SUB_TARGET.match(ln))
                elif skip and RE_COMMENT.match(ln):
                    # A comment line swallowed inside the target row's subtree
                    # (skip is latched from its `- id:` line to the next
                    # 4-column dash) — collect it for the caller's WARNING.
                    swallowed.append(ln)
                if not skip:
                    subs.append(ln)
            if any(RE_SUB_DASH.match(ln) for ln in subs):
                dropped += 1
                # Keep `- insert:` only while at least one other sub-entry
                # survives; an insert block with no entries left is noise, not
                # YAML. Non-dash lines (comments) ride along with the kept
                # block here — they are only at risk in the branch below.
                kept.append(chunk[0])
                kept.extend(subs)
            elif any(ln.strip() for ln in subs):
                # No sibling sub-entry survives, but the block carries the
                # user's OWN non-blank lines (comments). Dropping the block
                # would erase them silently (PR #12 review: measured rc=0 with
                # the comment gone, invisible to every self-check); keeping it
                # would emit a comment-only `insert:`. Refuse instead and let
                # the user move their text by hand — nothing is written yet.
                raise _InsertBlockCarriesUserContent(
                    '\n'.join(ln for ln in subs if ln.strip()))
            else:
                dropped += 1
            continue
        kept.extend(chunk)                          # user entry — untouched
    return '\n'.join(kept), dropped, swallowed


def _refs_target(entry):
    if not isinstance(entry, dict):
        return False
    if entry.get('id') == TARGET:
        return True
    ins = entry.get('insert')
    return isinstance(ins, list) and any(isinstance(x, dict) and x.get('id') == TARGET
                                          for x in ins)


def _target_entry(doc):
    for e in doc if isinstance(doc, list) else []:
        if not isinstance(e, dict):
            continue
        if e.get('id') == TARGET:
            return e
        ins = e.get('insert')
        if isinstance(ins, list):
            for x in ins:
                if isinstance(x, dict) and x.get('id') == TARGET:
                    return x
    return None


def _js_truthy(v):
    """JS truthiness — the coarsest reading of `group:` that is still honest.

    Python and JS diverge on exactly TWO families of value a YAML `group:` key
    can hold: containers `[]`/`{}` (truthy in JS, falsy in Python — hence the
    explicit container case) and YAML's `.nan`, which parses to float NaN and is
    TRUE in Python (`bool(float('nan'))`) while JS says `Boolean(NaN)` is
    false. Every scalar other than NaN agrees. The NaN case is not a behaviour
    defect: a truthy non-boolean `group` boots as a NON-group row on the live
    path anyway (see `_is_group_row` — the boot face checks `kind === "group"`,
    not the `group:` key), so reading `.nan` wide here can only ever add one
    conservative refusal, never a false allow. A `!!js <expr>` marker reaches
    this function as a dict and stays truthy, which is the same wide-and-safe
    side the mount path would see before any evaluation.
    """
    if v is None or v is False:
        return False
    if isinstance(v, (list, dict)):
        return True
    return bool(v)


def _provably_disabled(node):
    """Whether dsh can NEVER mount this row, judged from the YAML as written.

    Upstream's disabled test is `Boolean(options.disabled)` — any truthy value
    disables the row — and it walks OWNING PARENTS too, so a disabled ancestor
    group disables every child (cordis-plugin-loader/lib/index.js:334-341,
    :347-348; the Loader's own schema spells it out at
    dsh-app-boot/lib/index.js:2736-2738: "Boolean or !!js expression. The
    Loader coerces other truthy values as disabled"). A `!!js` expression is
    NOT provable without evaluating it, so it is not treated as disabled here —
    refusing is the safe side of that guess.

    This helper judges the `disabled:` KEY ONLY. The Loader's own disabled test
    carries one more step this helper deliberately does NOT copy: a row whose
    `options.group` is truthy short-circuits it (`if (this.options.group)
    return false`, cordis-plugin-loader/lib/index.js:335) and IGNORES its own
    `disabled`. That escape is applied by the CALLER, at the leaf — see the
    comment on the leaf test in _find_target_in_group_configs for why folding
    it in here would also disarm the whole-subtree prune.
    """
    v = node.get('disabled')
    if isinstance(v, dict) and '__jsExpr' in v:
        return False
    return _js_truthy(v)


def _is_group_row(node):
    """Whether dsh can mount this row's `config:` LIST as child DECLARATION rows.

    This is upstream's union, copied, NOT a narrower approximation of it —
    dsh-app-boot/lib/index.js:2100:
        (row.group === true || row.name === "cordis:group"
            || row.name === "@deepseek-ai/cordis-plugin-group")
            && Array.isArray(row.config)
    The three spellings are ALTERNATIVES: `group: true` is only one of three
    doors. A row that merely says `name: cordis:group`, one that carries
    `group: 'true'` (a STRING — YAML 1.1 quotes keep their type) or
    `group: yes` beside that name, and one that names the package
    `@deepseek-ai/cordis-plugin-group` with NO `group:` key at all, all mount
    their children. A guard narrower than this union lets the nested row
    through, the installer exits 0 with two live preset rows, and the next boot
    dies in dsh-agent-preset-registry with 'Duplicate agent preset: concerto'.

    The name door is the one the mount path itself uses: children are walked
    only when the row's plugin resolves to the group carrier — `cordis:group`
    is the builtin, `@deepseek-ai/cordis-plugin-group` the package that exports
    the very same Group (:3002-3023, `kind === "group"` at :3131-3134) — while
    `group:` "does not select the plugin implementation" (:2734). The union is
    kept anyway, and `_js_truthy` kept wide, because both are SUPERSETS of that
    mount test and this guard may never be narrower than the runtime. Stated
    honestly about the wide end: a truthy non-boolean `group` (e.g. `group:
    'yes'` under a plain plugin name) is NOT refused by a real boot —
    `validateMetadata`/`validateEntry` and their "group must be a literal
    boolean or null" rule (:2958) run on the diagnostic face and in
    `includePatches`, NOT on the live boot path (`prepareProfileEntries` →
    preflight), where mounting is decided by `kind === "group"`, i.e. by the
    row's PLUGIN, not by its `group:` key. Such a row boots — as a NON-group
    row, its `config:` never walked as declaration rows. So the wide guard is
    NOT "zero cost": it can refuse one install that would have booted. We
    take that cost on purpose — refusing once is cheaper than betting upstream
    never adds a `group:` type check to the boot face — but the cost is named
    here, not denied.
    """
    if not isinstance(node.get('config'), list):
        return False
    if node.get('group') is True:
        return True
    if node.get('name') in ('cordis:group', '@deepseek-ai/cordis-plugin-group'):
        return True
    return _js_truthy(node.get('group'))


def _group_reason(node):
    """Why `_is_group_row` accepted this row, spelled the way it is spelled."""
    if node.get('group') is True:
        return '`group: true`'
    name = node.get('name')
    if name in ('cordis:group', '@deepseek-ai/cordis-plugin-group'):
        return '`name: %s`' % name
    return '`group: %r` (truthy, not the boolean true)' % (node.get('group'),)


def _find_target_in_group_configs(node, path='document', inside=False, reason=''):
    """Path of the first preset-concerto row nested in a group row's config LIST.

    The text-level cut above and _refs_target/_target_entry only ever look at
    a top-level row's own `id:` and `insert:` — a `- id: preset-concerto`
    buried inside a user group row's `config:` list is INVISIBLE to all of
    them: the cut will not delete it, the hits==1 self-check will not count
    it, and the install would print success while leaving TWO presets whose
    config.id is 'concerto' in the profile. The next `dsh web` boot then dies
    upstream in dsh-agent-preset-registry/lib/index.js:503 with
    'Duplicate agent preset: concerto' — a profile installed broken, loudly
    only at the wrong time. Auto-deleting the nested row would mean rewriting
    the user's own group structure, so this installer refuses instead: this
    walk runs BEFORE the patch file or its backup is written (not even a .bak)
    and its caller exits non-zero.

    `inside` is a ROW-level flag, and that boundary is load-bearing: it marks a
    node the Loader mounts as a DECLARATION ROW — an element of a group's
    `config:` list, or a sub-item of an `insert:` that itself sits in such a
    list. It is deliberately NOT handed down into a row's own `config:`
    MAPPING: `config: { id: preset-concerto }` inside `- id: some-plugin` is
    that plugin's own config id, plain data the Loader never mounts as a row,
    and refusing it would block a perfectly legal install until the user
    renamed their plugin's config key. Groups are still found at any depth,
    because `_is_group_row` is a structural test on the row itself and does not
    depend on `inside`.

    A nested row the Loader can never mount is not a duplicate waiting to
    happen: `_provably_disabled` skips `disabled: true` (and any other truthy
    `disabled`) on the row itself and prunes whole subtrees under a provably
    disabled group, per the parent walk cited there. `disabled: !!js …` stays
    refused — unprovable here, and the wrong guess installs a broken profile.

    Returns `(path, reason)` — the reason being how the ENCLOSING group row is
    spelled, so the refusal can name it — or None.
    """
    if isinstance(node, list):
        for i, item in enumerate(node):
            hit = _find_target_in_group_configs(item, '%s[%d]' % (path, i),
                                                inside, reason)
            if hit:
                return hit
        return None
    if not isinstance(node, dict):
        return None
    # `and not _js_truthy(node.get('group'))` sits INSIDE the negated
    # provably-disabled test, at the leaf — and deliberately not in
    # _provably_disabled's body. WHY THE CLAUSE EXISTS AT ALL: the Loader's
    # disabled test short-circuits on `options.group` (cordis-plugin-loader/
    # lib/index.js:335, `if (this.options.group) return false`) — a row that
    # declares itself a group with a truthy `group:` IGNORES its own
    # `disabled`, so `disabled: true` on such a row buys nothing and it still
    # mounts. The old leaf skipped every `disabled: true` row and let exactly
    # that row through: rc=0, two `- id: preset-concerto` rows in the file,
    # `Duplicate agent preset: concerto` on the next boot. So the row escapes
    # the skip when it carries a truthy `group:`: it is not provably disabled
    # — it is provably LIVE, and the refusal must fire on it. WHY HERE AND NOT
    # IN THE HELPER: in the helper every truthy-`group:` row would become
    # 'not provably disabled', which also disarms the whole-subtree prune
    # below — name-disabled groups (`name: cordis:group, disabled: true`) and
    # even disabled truthy-`group:` groups would stop pruning, and the walk
    # would re-enter their children again everywhere: refusals where the rows
    # genuinely cannot mount. At the leaf the clause costs nothing —
    # _is_group_row already refuses truthy-`group:` rows with a nested target
    # whether disabled or not; this only stops `disabled: true` from granting
    # such a row a skip it has not earned.
    if (inside and node.get('id') == TARGET
            and not (_provably_disabled(node)
                    and not _js_truthy(node.get('group')))):
        return (path, reason)
    label = node.get('id')
    here = '%s#%s' % (path, label) if isinstance(label, str) else path
    if _provably_disabled(node) and _is_group_row(node):
        # PRUNE WHOLE SUBTREES, for real: a group row whose `disabled` is
        # provably truthy (the Loader honours it — the :335 `options.group`
        # short-circuit is about the ROW's own mount; the round-4 probe read
        # `group: true` + `disabled: true` as unmountable at boot too) mounts
        # nothing, so nothing below it can duplicate and this walk stops here.
        # Without this `return None` the generic `for key` loop below re-enters
        # the disabled row with inside=False, finds an INNER group row, and
        # treats its `config:` as declaration rows again — those rows cannot
        # mount, yet the install would be refused. That direction is safe but
        # over-eager; the prune makes the walk match what its docstring
        # claims. Pinned by T32's prune case; mutating this `return None`
        # away turns that case red.
        return None
    if _is_group_row(node):
        hit = _find_target_in_group_configs(node['config'], '%s.config' % here,
                                             True, _group_reason(node))
        if hit:
            return hit
    # key=str: legal YAML allows non-string mapping keys (`config: {1: a}`),
    # and a bare sorted() would die with a raw TypeError ('<' between str and
    # int) leaking out of the one-liner before any installer sentence (PR #12
    # review). The walk only needs a deterministic order, not a typed one.
    for key in sorted(node, key=str):
        # Sub-items of a NESTED `insert:` are rows as well; every other key of
        # a row holds data — including the row's own `config:` mapping, which
        # must never be read as a declaration row (see the `inside` note above).
        child_inside = inside and key == 'insert'
        hit = _find_target_in_group_configs(node[key], '%s.%s' % (here, key),
                                             child_inside, reason if child_inside else '')
        if hit:
            return hit
    return None


def _refuse_nested_group_target(text):
    """Loudly refuse an unrepresentable nested form — before the patch file and
    its backup are written (the directory this runs in may already exist).

    Top-level `- id: preset-concerto` rows and rows inside a top-level
    `- insert:` ARE safely expressible (the cut handles both) and are not
    touched here; only a target row sitting inside a GROUP row's `config:`
    LIST is refused, and only then — a group row per upstream's union in
    `_is_group_row`, which is wider than `group: true` alone.
    """
    try:
        doc = _load(text) if text.strip() else []
    except yaml.YAMLError:
        # Unparseable input is reported by the pre-parse below, in its own
        # words, at its own step; this guard stays out of its way.
        return
    for row in doc if isinstance(doc, list) else []:
        hit = _find_target_in_group_configs(row)
        if hit:
            where, reason = hit
            print('error: %s contains a `%s` declaration row nested INSIDE the '
                  '`config:` list of a %s row (%s). The installer cannot '
                  'safely replace it — the text-level cut would leave it in place, '
                  'and the profile would then carry two presets whose config.id is '
                  '\'concerto\', which makes dsh-agent-preset-registry throw '
                  '\'Duplicate agent preset: concerto\' on the next `dsh web` boot. '
                  'Delete that nested row from the patch file by hand and re-run '
                  'the installer.' % (patch_path, TARGET, reason, where),
                  file=sys.stderr)
            sys.exit(1)


def _str_keys(v):
    # YAML 1.1 allows non-string mapping keys (`config: {1: a}` is legal), and
    # json.dumps(sort_keys=True) dies comparing str with int — the same bare
    # TypeError class the group-walk's sorted(node) had (PR #12 review). The
    # dumps below exist for EQUALITY comparisons only, and both sides go
    # through this same coercion, so canonical order and equality survive.
    if isinstance(v, dict):
        return {str(k): _str_keys(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_str_keys(x) for x in v]
    return v


def _dump(v):
    return json.dumps(_str_keys(v), sort_keys=True, ensure_ascii=False)


patch_path, block_path = sys.argv[1], sys.argv[2]

try:
    with open(block_path, 'rb') as f:
        block_text = f.read().decode('utf-8')
except OSError as e:
    _fail('cannot read block %s: %s' % (block_path, e))

# Missing patch file == empty document == empty initial content (no backup).
orig_bytes = b''
if os.path.exists(patch_path):
    try:
        with open(patch_path, 'rb') as f:
            orig_bytes = f.read()
    except OSError as e:
        _fail('cannot read %s: %s' % (patch_path, e))
orig_text = orig_bytes.decode('utf-8')

# Refuse the unrepresentable nested form FIRST — before the backup, before any
# byte OF THE PATCH FILE OR ITS BACKUP (and before the .tmp the rewrite stages
# through). The boundary is stated that way on purpose: the profiles/web
# directory this runs in is created by the shell BEFORE write_patch_row is
# called — `sh -x` shows mktemp -d, then mkdir -p, then this refusal — so the
# guard owns no directory, only the bytes below. See _refuse_nested_group_target
# for why a preset-concerto row inside a group row's config: list must never
# ride into the profile beside the freshly installed one.
_refuse_nested_group_target(orig_text)

# The cut may REFUSE (user comments riding inside the old row's `- insert:`
# block) — that lands before any byte of the patch file, its backup, or the
# staging .tmp exists, same boundary as the nested-group refusal above.
try:
    cut_text, dropped, swallowed_comments = _cuts_target_rows(orig_text)
except _InsertBlockCarriesUserContent as e:
    _fail('refusing to install over %s: the `- insert:` block holding the old '
          '%s row also carries your own comment line(s):\n%s\n'
          'Replacing the row would delete that text with it — comments are '
          'not YAML nodes, so no self-check could ever see the loss. Move or '
          'delete the comment by hand, delete the `- id: %s` sub-row, then '
          're-run. Nothing has been written.'
          % (patch_path, TARGET, e, TARGET))
new_text = cut_text
if new_text and not new_text.endswith('\n'):
    new_text += '\n'
new_text += block_text

try:
    orig_doc = _load(orig_text) if orig_text.strip() else []
    cut_doc = _load(cut_text) if cut_text.strip() else []
    block_doc = _load(block_text)
except yaml.YAMLError as e:
    _fail('cannot pre-parse the document: %s: %s' % (e.__class__.__name__, e))
if orig_doc is None:
    orig_doc = []
if cut_doc is None:
    cut_doc = []
if not isinstance(block_doc, list):
    _fail('%s must parse to a list' % block_path)
block_entry = _target_entry(block_doc)
if block_entry is None:
    _fail('%s contains no top-level %s entry' % (block_path, TARGET))
if not isinstance(cut_doc, list):
    cut_doc = []

if new_text == orig_text:
    # Idempotent re-run: the declared row is already in place byte-for-byte.
    # Writing anyway would stack a backup EQUAL TO the live file into
    # retention, and enough no-op runs would evict the only backup that still
    # holds the pre-install original (PR #12 review, measured: after four
    # no-op runs all three surviving backups equalled the installed state, so
    # the restore hint could only restore the file onto itself). No write, no
    # backup — retention still runs, to bound leftovers from installer
    # versions that backed up on refused/no-op runs.
    _prune_backups(patch_path, keep=3)
    print('write_patch_row: %s — already up to date (the %s row matches); '
          'nothing written, no backup taken' % (patch_path, TARGET))
    sys.exit(0)

# Rows the append must not disturb, counted on the CUT text — i.e. before the
# append, as the spec puts it. A pre-existing `- insert:` block that keeps a
# sibling of its own legitimately grows the user-row count, so comparing with
# the original file would false-fail there; the superset check below still
# catches a cut that ate a user row.
user_before = sum(1 for e in cut_doc if not _refs_target(e))
user_kept = sorted(_dump(e) for e in orig_doc if not _refs_target(e))

tmp_path = '%s.tmp.%d' % (patch_path, os.getpid())
bak_path = ''
try:
    d = os.path.dirname(patch_path)
    if d:
        os.makedirs(d, exist_ok=True)
    mode = 0o644
    if os.path.exists(patch_path):
        mode = os.stat(patch_path).st_mode
    with open(tmp_path, 'wb') as f:
        f.write(new_text.encode('utf-8'))
        f.flush()
        os.fsync(f.fileno())
    os.chmod(tmp_path, mode)

    # Self-check on what actually hit the disk, before it can become the file.
    with open(tmp_path, 'rb') as f:
        back = f.read().decode('utf-8')
    if back != new_text:
        _fail('read-back of %s differs from what was written' % tmp_path)
    doc = _load(back)
    if not isinstance(doc, list):
        _fail('patch file does not parse to a list')
    hits = sum(1 for e in doc if _refs_target(e))
    if hits != 1:
        # The honest unmatched-shape hint is the BASE of this message, always,
        # and the CRLF advice is APPENDED to it for files that really carry CRLF
        # bytes. It used to be the other way round: on a CRLF file whose real
        # cause was an unmatched shape, the CRLF sentence REPLACED the honest
        # one, so the user ran dos2unix, re-ran, and got the same red with no
        # new information — `- id: preset-concerto  # note` fails the text-level
        # cut under LF just as hard as under CRLF.
        honest = ('%s contains a preset-concerto declaration shape this installer '
                  'recognises in prose but could not match at the text level '
                  '(e.g. `- id: %s` with a trailing comment, or sub-rows indented 6 '
                  'spaces instead of 4 under `- insert:`); delete that row by hand '
                  'and re-run.' % (patch_path, TARGET))
        crlf = ''
        if b'\r\n' in orig_bytes:
            crlf = ('If %s has CRLF line endings, convert it to LF first (e.g. '
                    'dos2unix) and re-run — but converting alone does NOT fix this '
                    'one: ' % patch_path)
        _fail('expected exactly 1 %s row after install, found %d (dropped %d '
              'pre-existing). %s%s' % (TARGET, hits, dropped, crlf, honest))
    user_after = sum(1 for e in doc if not _refs_target(e))
    if user_after != user_before:
        _fail('the append disturbed user rows: %d before, %d after'
              % (user_before, user_after))
    after_kept = sorted(_dump(e) for e in doc if not _refs_target(e))
    lost = [d for d in user_kept if d not in after_kept]
    if lost:
        _fail('a pre-existing user row was cut: %s' % lost[0][:400])
    entry = _target_entry(doc)
    p_new = (entry or {}).get('config', {}).get('plugins')
    p_want = block_entry.get('config', {}).get('plugins')
    if not isinstance(p_new, list) or not isinstance(p_want, list):
        _fail('config.plugins is not a list (patch: %r)' % (p_new,))
    if len(p_new) != len(p_want):
        _fail('config.plugins length %d != block length %d' % (len(p_new), len(p_want)))
    for i, (got, want) in enumerate(zip(p_new, p_want)):
        if _dump(got) != _dump(want):
            _fail('config.plugins[%d] differs\n  patch:  %s\n  block: %s'
                 % (i, _dump(got)[:400], _dump(want)[:400]))
    # Comment lines the old target block carried AWAY: they were never YAML
    # nodes, so no check above could see them (PR #12 round 2 — an annotation
    # written INSIDE the installed block used to vanish silently on re-install,
    # rc=0). Not a refusal: the replaced block is installer-owned and upgrades
    # legitimately change OUR comments, so blocking would break upgrades — but
    # the dropped lines are named, so a user annotation is never lost silently.
    unseen_comments = [c for c in swallowed_comments if c.strip() not in block_text]
    if unseen_comments:
        print('write_patch_row: WARNING: the replaced %s block carried comment '
              'line(s) the new block does not have (yours, or ours removed by '
              'the upgrade). If any was YOURS, re-add it by hand:' % TARGET,
              file=sys.stderr)
        for c in unseen_comments:
            print('    %s' % c.strip(), file=sys.stderr)
    # Every check has passed — the new content is proven. Only NOW is the
    # original backed up, immediately before it is replaced: a backup written
    # earlier outlived every REFUSED install and stacked unpruned (PR #12
    # review, measured: five refused runs left five .bak files). The patch
    # file and its backup are read and written in binary mode, so a restored
    # .bak holds the exact bytes that were in the file before the rewrite.
    if os.path.exists(patch_path):
        bak_path = '%s.bak.%s' % (patch_path, time.strftime('%Y%m%d%H%M%S'))
        n = 1
        while os.path.exists(bak_path):
            bak_path = '%s.bak.%s.%d' % (patch_path, time.strftime('%Y%m%d%H%M%S'), n)
            n += 1
        try:
            with open(bak_path, 'wb') as f:
                f.write(orig_bytes)
        except OSError as e:
            _fail('cannot write backup %s: %s' % (bak_path, e))
        # The FIRST pre-install original also gets a permanent copy outside
        # the retention shape: '.first' never matches _prune_backups'
        # [0-9]{14} test, so it survives every prune — including the ones
        # refused runs run (PR #12 round 2: with keep=3 alone, four
        # content-changing reinstalls evicted the only backup that predates
        # the installer, and the restore hint could only restore the file
        # onto itself — measured). Written once, never overwritten: it holds
        # the state before the installer FIRST touched the file.
        first_path = '%s.bak.first' % patch_path
        if not os.path.exists(first_path):
            try:
                with open(first_path, 'wb') as f:
                    f.write(orig_bytes)
            except OSError as e:
                # The timestamped backup above exists; the safety copy must
                # not turn a proven install red.
                print('write_patch_row: WARNING: cannot write %s: %s'
                      % (first_path, e), file=sys.stderr)
    os.replace(tmp_path, patch_path)
except SystemExit:
    if os.path.exists(tmp_path):
        os.remove(tmp_path)
    raise
except (OSError, TypeError, KeyError, IndexError, ValueError, yaml.YAMLError) as e:
    if os.path.exists(tmp_path):
        os.remove(tmp_path)
    _fail('%s: %s' % (e.__class__.__name__, e))
finally:
    # Retention runs on EVERY outcome, refusal included: older installers had
    # already written their backup by the time a check refused, and nothing
    # ever pruned those. _prune_backups cannot turn a run red — it warns and
    # continues, and only ever touches the strict timestamp shape.
    _prune_backups(patch_path, keep=3)
if os.path.exists(tmp_path):
    os.remove(tmp_path)

print('write_patch_row: %s — 1 %s row (dropped %d old), %d user row(s) kept%s'
      % (patch_path, TARGET, dropped, user_after,
         ', backup %s' % bak_path if bak_path else ', no backup'))
PYROW
}

# stage_sources — download the two preset sources into <dir> and apply the
# EXPLORE_PROVIDER / EXPLORE_MODEL override. Args: <dir>.
#
# The override MUST run on the freshly downloaded, NOT YET INDENTED source
# text: the rewriter below matches `agentOptions:` / `provider:` / `model:` at
# the indentation the source files themselves use. render_patch_block shifts the
# whole composition 8 columns right, after which those rows no longer match —
# so rewrite first, render second. Both install faces download through this one
# function, which is also why the Python block exists exactly once.
stage_sources() { # <下载目标目录>
  [ "$#" -eq 1 ] || { echo "error: stage_sources <dir>" >&2; return 2; }
  mkdir -p "$1"
  curl -fsSL "${BASE}/patches/omo-dsh/omo-agents-current/preset/agent.cordis.yml" -o "$1/agent.cordis.yml"
  curl -fsSL "${BASE}/patches/omo-dsh/omo-agents-current/preset/preset.yml" -o "$1/preset.yml"

  if [ -n "${EXPLORE_PROVIDER:-}${EXPLORE_MODEL:-}" ]; then
    need python3
    EXPLORE_PROVIDER="${EXPLORE_PROVIDER:-}" EXPLORE_MODEL="${EXPLORE_MODEL:-}" python3 - "$1/agent.cordis.yml" <<'PY'
import os, sys, json
path = sys.argv[1]
lines = open(path).read().split('\n')
p = os.environ.get('EXPLORE_PROVIDER') or ''
m = os.environ.get('EXPLORE_MODEL') or ''
in_agent_options = False
for i, l in enumerate(lines):
    if l.strip() == 'agentOptions:':
        in_agent_options = True
        continue
    if in_agent_options:
        if l.strip().startswith('provider:') and p:
            # F3 — the quoted BOUNDARY, stated exactly, in the same words the
            # render site uses for its own json.dumps: json.dumps escapes the
            # double-quote, the backslash, and every C0 control below U+0020
            # (\n, \t, ...), so the value written here stays ONE double-quoted
            # YAML scalar against exactly those characters. It makes no promise
            # about the rest, and the rest differs from the render site by one
            # flag: this call runs with json.dumps' DEFAULT ensure_ascii=True,
            # so every non-ASCII character — U+0085 (NEL), U+2028, U+2029
            # included — is written as a \uXXXX escape and no raw line-break
            # byte ever reaches the file, where the render site passes them
            # through raw and catches the damage with its round-trip
            # self-check. Neither is what makes THIS line safe: the shell-side
            # identifier gate near the top of this script already rejects any
            # EXPLORE_PROVIDER / EXPLORE_MODEL not matching
            # ^[a-zA-Z0-9._-]+$, so no hostile character reaches this
            # json.dumps at all. The quoting is the belt; that gate is the
            # braces, and there is no round-trip self-check behind it here — so
            # nothing beyond what the gate proves is claimed.
            lines[i] = l.split(':')[0] + ': ' + json.dumps(p)
        if l.strip().startswith('model:') and m:
            lines[i] = l.split(':')[0] + ': ' + json.dumps(m)
        if l.strip() and not l.startswith(' '):
            in_agent_options = False
open(path, 'w').write('\n'.join(lines))
PY
    echo "==> explore route overridden (provider=${EXPLORE_PROVIDER:-<unchanged>} model=${EXPLORE_MODEL:-<unchanged>})"
  fi
}

# ---- install face -----------------------------------------------------------
# Why this is straight-line now (P4.5-T13): dsh 0.1.x file-discovered presets
# out of $DSH_HOME/.agent-presets/; dsh >= 0.2 dropped that directory scan
# completely — the Loader composes only what a profile DECLARES, i.e. the rows
# of $DSH_HOME/profiles/<profile>/cordis.patch.yml. On 0.2 a preset file sitting
# in .agent-presets/ is dead weight: no error, no preset, an installer that lied.
# Ruling D17 (commit 2323658) dropped 0.1.x, so the version gate above REFUSES
# dsh < 0.2 by name and the old two-face `case` — whose `filediscovery` arm
# could now only ever be reached by a version this installer rejects — was
# deleted with it. DSH_FACE has exactly one assignment ("declaration"); the
# declaration face renders the preset into a single `- insert:` row and installs
# it with write_patch_row: idempotent, and it copies each user entry of the
# patch file through as it stands — the only byte change the rewrite can make
# outside the new block is appending the newline a file that ended without one
# was missing.
# No package.json is written on purpose: dsh creates it on first boot
# (dsh-app-boot/lib/index.js:972-975), and :589 keeps that bootstrap from ever
# overwriting the cordis.patch.yml we just wrote.
# Dependency guards up front, BEFORE any directory or file is created:
# render_patch_block and write_patch_row both need python3 plus PyYAML,
# and without these lines a missing yaml module surfaces as a bare
# traceback after the target directory already exists.
need mktemp
need python3
if ! python3 -c 'import yaml' >/dev/null 2>&1; then
  echo "error: PyYAML required for the dsh >= 0.2 install path (pip install pyyaml)" >&2
  exit 1
fi
# agent-preset-registry precondition, asserted BEFORE anything is written.
# Basis: upstream dsh-agent-preset/lib/index.js:10 declares
# `static inject = ["agentPresets"]` — the plugin pulls the registry from
# the service scope, so a declared row only mounts while an
# agent-preset-registry service is in scope, and on 0.2.x that ships with
# @deepseek-ai/dsh-web-app. A profile that bundles no registry takes the
# row quietly and mounts nothing (the roster goes `broken`, nothing
# throws), so refuse here instead of shipping a silent no-op.
python3 - "${D}/profiles/web/package.json" <<'PYASSERT' || exit 1
import json
import sys

path = sys.argv[1]
WEB_APP = '@deepseek-ai/dsh-web-app'
try:
    with open(path, encoding='utf-8') as f:
        doc = json.load(f)
except FileNotFoundError:
    print('==> %s does not exist yet — on first boot dsh writes the web profile '
          'from its built-in template, whose bundles are @deepseek-ai/dsh-base + '
          '%s (the latter carries the agent-preset-registry row).' % (path, WEB_APP))
    sys.exit(0)
except (OSError, ValueError) as e:
    print('error: cannot read/parse %s to confirm agent-preset-registry will be in '
          'scope: %s: %s' % (path, e.__class__.__name__, e), file=sys.stderr)
    sys.exit(1)
dsh = doc.get('dsh') if isinstance(doc, dict) else None
profile = dsh.get('profile') if isinstance(dsh, dict) else None
bundles = profile.get('bundles') if isinstance(profile, dict) else None
if not isinstance(bundles, list) or WEB_APP not in bundles:
    # The message promises to name the ACTUAL bundles value, so a non-list
    # must be shown as its raw repr, not laundered into 'null' — the user
    # reading this needs to see the string they actually wrote, not a value
    # the file never carried.
    if isinstance(bundles, list):
        bundles_shown = json.dumps(bundles, ensure_ascii=False)
    else:
        bundles_shown = 'raw value %r — not a list' % (bundles,)
    print('error: %s does not bundle %s — this profile brings no '
          'agent-preset-registry, so the preset-concerto declaration row cannot '
          'mount (silent failure: roster broken, nothing throws). Re-run against a '
          'web profile that bundles %s, or install through the plugin line '
          'instead. (dsh.profile.bundles=%s)'
          % (path, WEB_APP, WEB_APP, bundles_shown), file=sys.stderr)
    sys.exit(1)
print('==> %s bundles %s — agent-preset-registry is in scope for the declared row'
      % (path, WEB_APP))
PYASSERT
echo "==> installing concerto preset (tag ${TAG}) as a declared row of ${DECL_PATCH}"
TMP_SRC="$(mktemp -d)"
# EXIT cleans up on the normal/error path; the signal trap must also EXIT —
# a handler that only deletes the staging dir lets the script run on past the
# interruption (measured under dash: SIGINT mid-run, script reached the last
# line; PR #12 review). 130 = 128 + SIGINT, the conventional signal exit.
trap 'rm -rf "${TMP_SRC:-}" 2>/dev/null || true' EXIT
trap 'rm -rf "${TMP_SRC:-}" 2>/dev/null; exit 130' INT TERM HUP
stage_sources "${TMP_SRC}"
# mkdir only AFTER the downloads succeeded, so a failed curl leaves no
# empty profiles/web/ behind.
mkdir -p "${D}/profiles/web"
render_patch_block "${TMP_SRC}/agent.cordis.yml" "${TMP_SRC}/preset.yml" > "${TMP_SRC}/block.yml"
write_patch_row "${DECL_PATCH}" "${TMP_SRC}/block.yml"
echo "==> declared preset-concerto in ${DECL_PATCH}; previous content (if any) backed up to ${DECL_PATCH}.bak.<timestamp> (newest 3 kept); the FIRST pre-install original is also kept as ${DECL_PATCH}.bak.first (never pruned)"

if [ -n "${NO_PIAI:-}" ]; then
  echo "==> NO_PIAI=1 — skipping pi-ai settings; point agentOptions at your own second route"
else
  if grep -q '^llm-pi-ai:' "${SET}" 2>/dev/null; then
    echo "==> llm-pi-ai section already present in ${SET} — left untouched"
  else
    echo "==> adding llm-pi-ai section to ${SET}"
    # F4 (PR #1 review): the file may not end with a newline — a missing
    # leading one would glue the block onto the previous entry.
    last="$(tail -c 1 "${SET}" 2>/dev/null || true)"
    if [ -n "$last" ] && [ "$last" != "$(printf '\n')" ]; then
      printf '\n' >> "${SET}"
    fi
    printf 'llm-pi-ai:\n  providers:\n    deepseek:\n      apiKeyEnv: DEEPSEEK_API_KEY\n' >> "${SET}"
  fi
fi

echo "==> checking credential DEEPSEEK_API_KEY (key name only, value never printed)"
if grep -q '^DEEPSEEK_API_KEY' "${D}/.credentials.yaml" 2>/dev/null; then
  echo "    credential found"
else
  echo "    WARNING: DEEPSEEK_API_KEY not found in ${D}/.credentials.yaml — configure it before delegating"
fi

echo
echo "done. Restart the harness, open a NEW session, and pick 协奏模式 (Concerto Mode)."
echo "30s check: ask 'which delegation tools do you see?' -> the CONDUCTOR sees only call_omo_explore; explore children see none."
# Uninstall guidance (P4.5-T13: declaration face only — the filediscovery arm
# was deleted with the MINOR==1 leg; dsh < 0.2 is refused at the version gate,
# so there is no `.agent-presets/concerto` this installer writes anymore).
# Never rm -rf the patch file: it also carries the user's own rows.
# The restore glob is timestamp-shaped on purpose: '.bak.*' would also match
# the user's own '.bak.mine' archive, which no retention policy eats and
# which `ls -t` would happily hand back over the real backup.
echo "uninstall: edit ${DECL_PATCH} and delete ONLY the '- insert:' block whose row is '- id: preset-concerto' — do NOT delete the file, it holds your own rows too."
echo "           or restore the newest INSTALLER backup (timestamp-shaped names only, your own .bak.mine is never matched): cp \"\$(ls -t \"${DECL_PATCH}\".bak.[0-9]* 2>/dev/null | head -n 1)\" \"${DECL_PATCH}\"   (optionally remove the llm-pi-ai section from ${SET})"
echo "           or your TRUE pre-install original, if it exists (written once, never pruned, and the timestamp glob above never matches it): cp \"${DECL_PATCH}.bak.first\" \"${DECL_PATCH}\""
