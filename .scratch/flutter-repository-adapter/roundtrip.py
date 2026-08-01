#!/usr/bin/env python3
"""Round-trip probe for the first Flutter Repository Adapter.

Walks one complete cycle against a real Brickit checkout:

    snapshot identity -> release bundle -> apply to worktree -> gen-l10n ->
    verify -> branch + commit -> measure the pull request -> roll back

Everything runs in a detached git worktree, so the developer's own checkout is
never touched. No network, no credentials: the point is to measure what the
three candidate adapter shapes would each have to do, not to open a real PR.
"""

import hashlib
import json
import re
import subprocess
import sys
import time
from pathlib import Path

WT = Path("/tmp/brickit-adapter-wt")
PKG = WT / "packages/brickit_generated"
L10N = PKG / "lib/l10n"
SOURCE_LOCALE = "en"
TARGETS = ["de", "es", "fr", "ru", "zh"]
OUT = Path(__file__).parent / "roundtrip.json"

report = {}


def run(cmd, cwd=WT, check=True):
    t0 = time.time()
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, shell=isinstance(cmd, str))
    return {
        "cmd": cmd if isinstance(cmd, str) else " ".join(cmd),
        "code": p.returncode,
        "seconds": round(time.time() - t0, 2),
        "stdout": p.stdout.strip()[-2000:],
        "stderr": p.stderr.strip()[-2000:],
    }


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# --- 1. Snapshot identity -----------------------------------------------------
# What a Repository Adapter submits to ingestSnapshot: the commit plus the
# complete file manifest. Content hashes make the submission idempotent.

commit = subprocess.run(
    ["git", "rev-parse", "HEAD"], cwd=WT, capture_output=True, text=True
).stdout.strip()

manifest = {
    f"packages/brickit_generated/lib/l10n/intl_{loc}.arb": sha(L10N / f"intl_{loc}.arb")
    for loc in [SOURCE_LOCALE] + TARGETS
}
report["snapshot"] = {
    "repository": "brickit-app/brickit-flutter",
    "commit": commit,
    "manifest": manifest,
    "bytes": sum((L10N / f"intl_{loc}.arb").stat().st_size for loc in [SOURCE_LOCALE] + TARGETS),
}

arbs = {
    loc: json.loads((L10N / f"intl_{loc}.arb").read_text(encoding="utf-8"))
    for loc in [SOURCE_LOCALE] + TARGETS
}
src_keys = [k for k in arbs[SOURCE_LOCALE] if not k.startswith("@")]

# Coverage before the bundle: what does a first release actually have to carry?
report["coverage"] = {
    "source_keys": len(src_keys),
    "per_locale": {
        loc: {
            "keys": len([k for k in arbs[loc] if not k.startswith("@")]),
            "empty": len([k for k, v in arbs[loc].items()
                          if not k.startswith("@") and isinstance(v, str) and not v.strip()]),
            "identical_to_source": len([k for k in src_keys
                                        if arbs[loc].get(k) == arbs[SOURCE_LOCALE].get(k)]),
        }
        for loc in TARGETS
    },
}

# --- 2. Release bundle --------------------------------------------------------
# Blabla writes target catalogs only; Git stays the sole author of the Source
# Contract, so intl_en.arb is never in the bundle. Simulate a modest release:
# five corrected German strings, the shape of ordinary translator work.

edited = [k for k in src_keys if isinstance(arbs["de"].get(k), str)
          and "{" not in arbs["de"][k]][:5]
bundle = json.loads(json.dumps(arbs["de"]))  # deep copy, preserving key order
for k in edited:
    bundle[k] = bundle[k] + " · blabla"

before_gen = {
    p.name: sha(p) for p in sorted(L10N.glob("app_localizations*.dart"))
}

# --- 3. Apply -----------------------------------------------------------------
# Serialization is the adapter's lossless-writeback contract. Two rules recover
# this repo's convention exactly: 2-space indent with literal non-ASCII, except
# astral characters which stay escaped UTF-16 surrogate pairs, and no trailing
# newline. Anything else turns every release into a whole-file diff.


def write_arb(data: dict) -> str:
    s = json.dumps(data, ensure_ascii=False, indent=2)
    out = []
    for ch in s:
        if ord(ch) > 0xFFFF:
            n = ord(ch) - 0x10000
            out.append("\\u%04X\\u%04X" % (0xD800 + (n >> 10), 0xDC00 + (n & 0x3FF)))
        else:
            out.append(ch)
    return "".join(out)


target_path = L10N / "intl_de.arb"
original_bytes = target_path.read_bytes()

# Did writing back an *unchanged* catalog stay byte-identical? Every locale is
# rewritten through the same serializer before the release edit lands.
writeback_clean = {}
for loc in [SOURCE_LOCALE] + TARGETS:
    p = L10N / f"intl_{loc}.arb"
    before = p.read_bytes()
    p.write_text(write_arb(arbs[loc]), encoding="utf-8")
    writeback_clean[loc] = p.read_bytes() == before
    p.write_bytes(before)
report["lossless_writeback"] = writeback_clean

target_path.write_text(write_arb(bundle), encoding="utf-8")

# --- 4. Regenerate ------------------------------------------------------------
report["gen_l10n"] = run(["fvm", "flutter", "gen-l10n"], cwd=PKG)

# --- 5. Verify ----------------------------------------------------------------
after_gen = {p.name: sha(p) for p in sorted(L10N.glob("app_localizations*.dart"))}
changed_generated = [n for n in after_gen if before_gen.get(n) != after_gen[n]]

new_de = json.loads((L10N / "intl_de.arb").read_text(encoding="utf-8"))
report["verify"] = {
    "keys_unchanged": [k for k in new_de if not k.startswith("@")] == [
        k for k in arbs["de"] if not k.startswith("@")
    ],
    "generated_files_changed": changed_generated,
    "public_api_unchanged": "app_localizations.dart" not in changed_generated,
    "edited_keys": edited,
}

# Does the regenerated Dart actually carry the new values?
gen_de = (L10N / "app_localizations_de.dart").read_text(encoding="utf-8")
report["verify"]["values_landed"] = all(
    re.search(re.escape(bundle[k].replace("'", "\\'")), gen_de) for k in edited
)

# --- 6. Pull request shape ----------------------------------------------------
branch = "blabla/release-probe"
run(["git", "checkout", "-b", branch])
run(["git", "add", "packages/brickit_generated/lib/l10n"])
report["commit"] = run(
    ["git", "-c", "user.name=blabla", "-c", "user.email=bot@blabla.local",
     "commit", "-m", "l10n: apply Blabla release bundle (probe)"]
)
report["pull_request"] = {
    "files": run(["git", "diff", "--stat", "HEAD~1", "HEAD"])["stdout"],
    "numstat": run(["git", "diff", "--numstat", "HEAD~1", "HEAD"])["stdout"],
}

# Would the Brickit CI gate this? It runs `make` then `flutter test test/`.
# The cheap non-mutating half is: regenerate and fail if the tree moved.
report["ci_gate_probe"] = run(
    "fvm flutter gen-l10n && git diff --exit-code -- packages/brickit_generated/lib/l10n",
    cwd=PKG,
)

# --- 7. Rollback --------------------------------------------------------------
report["rollback"] = run(["git", "revert", "--no-edit", "HEAD"])
report["rollback_clean"] = run(["git", "status", "--short"])["stdout"] == ""
report["rollback_restores_source"] = (
    (L10N / "intl_de.arb").read_bytes() == original_bytes
)

OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
print(json.dumps(report, indent=2, ensure_ascii=False)[:6000])
