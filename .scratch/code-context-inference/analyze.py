#!/usr/bin/env python3
"""Throwaway prototype: measure how reliable each code-context finding class is
on the real Brickit Flutter catalog.

Not production code. It exists to answer one question with real numbers:
which findings can be applied automatically, and which must stay as reviewable
evidence attached to a key.

Usage: python3 analyze.py <path-to-brickit-flutter>
"""

import json
import os
import re
import sys
from collections import defaultdict

FLUTTER = sys.argv[1] if len(sys.argv) > 1 else "../brickit-app/brickit-flutter"
L10N = os.path.join(FLUTTER, "packages/brickit_generated/lib/l10n")

# ---------------------------------------------------------------- ARB corpus

def load_arb(locale):
    with open(os.path.join(L10N, f"intl_{locale}.arb"), encoding="utf-8") as fh:
        return json.load(fh)

SOURCE = load_arb("en")
KEYS = [k for k in SOURCE if not k.startswith("@")]
KEYSET = set(KEYS)
TARGET_LOCALES = ["de", "es", "fr", "ru", "zh"]
TARGETS = {loc: load_arb(loc) for loc in TARGET_LOCALES}

# --------------------------------------------------------------- Dart corpus

GENERATED = re.compile(r"(\.g\.dart|\.freezed\.dart|app_localizations.*\.dart)$")

def dart_files():
    for pkg in ("brickit", "brickit_generated"):
        root = os.path.join(FLUTTER, "packages", pkg, "lib")
        for dirpath, _, names in os.walk(root):
            for name in names:
                if not name.endswith(".dart") or GENERATED.search(name):
                    continue
                yield os.path.join(dirpath, name)

FILES = sorted(dart_files())

# Receivers that carry an AppLocalizations value. Collected rather than
# assumed: the codebase names them inconsistently (l10n, localizations,
# appLocalization, localization, appLocalizations, ...).
RECEIVER_DECL = re.compile(r"\bAppLocalizations\??\s+([A-Za-z_][A-Za-z0-9_]*)")
RECEIVERS = set()
SOURCES = {}
for path in FILES:
    with open(path, encoding="utf-8", errors="replace") as fh:
        text = fh.read()
    SOURCES[path] = text
    RECEIVERS.update(RECEIVER_DECL.findall(text))
# Inline `AppLocalizations.of(context)!.key` needs no named receiver.
RECEIVERS.discard("of")

ACCESS = re.compile(
    r"\b(?:" + "|".join(sorted(map(re.escape, RECEIVERS))) + r")\s*!?\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)"
)
INLINE = re.compile(r"AppLocalizations\s*\.\s*of\s*\([^)]*\)\s*!?\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)")

# key -> {file -> [line numbers]}
# Matched over whole-file text, not line by line: dartfmt wraps long call
# chains, so `localizations\n    .someKey` is common and a line scanner silently
# drops those references.
refs = defaultdict(lambda: defaultdict(list))
for path, text in SOURCES.items():
    for pattern in (ACCESS, INLINE):
        for m in pattern.finditer(text):
            name = m.group(1)
            if name in KEYSET:
                refs[name][path].append(text[: m.start()].count("\n") + 1)

REFERENCED = set(refs)
UNREFERENCED = KEYSET - REFERENCED

# ------------------------------------------------------- screen attribution

def area_of(path):
    """The feature/screen area a file belongs to, from its repo path."""
    rel = os.path.relpath(path, os.path.join(FLUTTER, "packages"))
    parts = rel.split(os.sep)
    try:
        i = parts.index("lib")
    except ValueError:
        return rel
    tail = parts[i + 1:]
    if not tail:
        return rel
    kind = tail[0]                      # screens | widgets | blocs | services ...
    if len(tail) >= 2 and not tail[1].endswith(".dart"):
        return f"{kind}/{tail[1]}"
    return f"{kind}/{os.path.splitext(tail[-1])[0]}"


def is_screen(path):
    return f"{os.sep}screens{os.sep}" in path

# key -> areas / files it is reached from
key_areas = {k: {area_of(p) for p in files} for k, files in refs.items()}
key_files = {k: set(files) for k, files in refs.items()}

SINGLE_AREA = {k for k, a in key_areas.items() if len(a) == 1}
MULTI_AREA = {k for k, a in key_areas.items() if len(a) > 1}

# A key reached only through non-screen files (shared widgets, blocs, services)
# has no direct screen; its screen is an inference, not a fact.
DIRECT_SCREEN = {k for k, files in key_files.items() if any(is_screen(p) for p in files)}
NO_DIRECT_SCREEN = REFERENCED - DIRECT_SCREEN

# --------------------------------------------------------- dynamic selection

# The generated AppLocalizations exposes getters, so a key name can never be
# built from a string at runtime. What *is* dynamic is the choice between
# getters: a helper that takes AppLocalizations and returns one of several
# messages by switch/conditional, invoked from somewhere else.
HELPER_SIG = re.compile(
    r"^\s*(?:static\s+)?(?:String|Widget|TipTextModel|[A-Z][A-Za-z0-9_]*\??)\s+"
    r"(_?[A-Za-z][A-Za-z0-9_]*)\s*\([^;{]*AppLocalizations",
    re.MULTILINE,
)
SELECTOR = re.compile(r"\b(switch\s*\(|\?\s|: *[a-z_])")

dynamic_keys = set()
helper_sites = []       # (file, helper, [keys])
for path, text in SOURCES.items():
    lines = text.splitlines()
    for m in HELPER_SIG.finditer(text):
        helper = m.group(1)
        start = text[: m.start()].count("\n")
        # crude brace scan from the signature to the end of the helper body
        depth, i, end = 0, m.end(), None
        seen_open = False
        while i < len(text):
            c = text[i]
            if c == "{":
                depth += 1
                seen_open = True
            elif c == "}":
                depth -= 1
                if seen_open and depth == 0:
                    end = i
                    break
            i += 1
        body = text[m.start(): end if end else m.end()]
        found = set()
        for pattern in (ACCESS, INLINE):
            found.update(n for n in pattern.findall(body) if n in KEYSET)
        if len(found) > 1 and SELECTOR.search(body):
            dynamic_keys |= found
            helper_sites.append((path, helper, sorted(found), start + 1))

# ------------------------------------------------------------ layout budgets

def expansion(key):
    src = SOURCE.get(key)
    if not isinstance(src, str) or not src:
        return None
    worst_loc, worst_len = None, 0
    for loc, cat in TARGETS.items():
        val = cat.get(key)
        if isinstance(val, str) and len(val) > worst_len:
            worst_loc, worst_len = loc, len(val)
    if worst_loc is None:
        return None
    return len(src), worst_len, worst_len / len(src), worst_loc

expansions = {k: e for k in KEYS if (e := expansion(k))}
SHORT_SOURCE = {k for k, e in expansions.items() if e[0] <= 20}
BIG_EXPANSION = {k for k, e in expansions.items() if e[2] >= 1.4 and e[0] >= 8}

# A layout budget is only real if the widget constrains width. Static text
# analysis cannot see that; the closest observable proxy is whether the call
# site sits near a constraint hint.
CONSTRAINT = re.compile(
    r"\b(maxLines|overflow\s*:\s*TextOverflow|SizedBox\s*\(\s*width|"
    r"FittedBox|Expanded|Flexible|ellipsis)\b"
)
constrained = set()
for key, files in refs.items():
    for path, linenos in files.items():
        lines = SOURCES[path].splitlines()
        for ln in linenos:
            window = "\n".join(lines[max(0, ln - 12): ln + 12])
            if CONSTRAINT.search(window):
                constrained.add(key)
                break

# ------------------------------------------------------------------- report

def pct(n, d):
    return f"{100 * n / d:.1f}%" if d else "n/a"


def sample(items, n=6):
    return sorted(items)[:n]


out = {
    "corpus": {
        "keys": len(KEYS),
        "dart_files_scanned": len(FILES),
        "receiver_names": sorted(RECEIVERS),
        "target_locales": TARGET_LOCALES,
    },
    "call_site": {
        "referenced_keys": len(REFERENCED),
        "total_references": sum(len(v) for f in refs.values() for v in f.values()),
        "single_file_keys": sum(1 for k, f in key_files.items() if len(f) == 1),
        "multi_file_keys": sum(1 for k, f in key_files.items() if len(f) > 1),
        "sample": {
            k: {os.path.relpath(p, FLUTTER): ln for p, ln in list(refs[k].items())[:3]}
            for k in sample(REFERENCED, 4)
        },
    },
    "screen": {
        "single_area": len(SINGLE_AREA),
        "single_area_pct": pct(len(SINGLE_AREA), len(REFERENCED)),
        "multi_area": len(MULTI_AREA),
        "no_direct_screen_file": len(NO_DIRECT_SCREEN),
        "no_direct_screen_pct": pct(len(NO_DIRECT_SCREEN), len(REFERENCED)),
        "single_area_sample": {k: sorted(key_areas[k]) for k in sample(SINGLE_AREA, 5)},
        "multi_area_sample": {k: sorted(key_areas[k]) for k in sample(MULTI_AREA, 5)},
        "no_direct_screen_sample": {
            k: sorted(key_areas[k]) for k in sample(NO_DIRECT_SCREEN, 5)
        },
    },
    "dynamic": {
        "keys_selected_in_helpers": len(dynamic_keys),
        "helper_count": len(helper_sites),
        "overlap_with_single_area": len(dynamic_keys & SINGLE_AREA),
        "sample": [
            {
                "file": os.path.relpath(p, FLUTTER),
                "helper": h,
                "line": ln,
                "keys": ks[:6],
            }
            for p, h, ks, ln in sorted(helper_sites, key=lambda x: -len(x[2]))[:5]
        ],
    },
    "unreferenced": {
        "count": len(UNREFERENCED),
        "pct_of_catalog": pct(len(UNREFERENCED), len(KEYS)),
        "sample": sample(UNREFERENCED, 12),
    },
    "layout": {
        "keys_with_measurable_expansion": len(expansions),
        "expansion_ge_1_4x": len(BIG_EXPANSION),
        "short_source_le_20_chars": len(SHORT_SOURCE),
        "referenced_near_constraint_hint": len(constrained),
        "constraint_hint_pct_of_referenced": pct(len(constrained), len(REFERENCED)),
        "worst_expansion_sample": [
            {
                "key": k,
                "source_len": expansions[k][0],
                "worst_len": expansions[k][1],
                "ratio": round(expansions[k][2], 2),
                "locale": expansions[k][3],
                "near_constraint_hint": k in constrained,
            }
            for k in sorted(BIG_EXPANSION, key=lambda k: -expansions[k][2])[:8]
        ],
    },
}

print(json.dumps(out, indent=2, ensure_ascii=False))
