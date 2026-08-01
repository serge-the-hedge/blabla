# Round-trip probe: the first Flutter Repository Adapter

Throwaway prototype for [Decide the first Flutter repository adapter](https://github.com/serge-the-hedge/blabla/issues/12).
It walks one complete adapter cycle against a real Brickit checkout and measures
what each candidate workflow shape would actually have to do.

## Running it

```bash
git -C ../brickit-app/brickit-flutter worktree add --detach /tmp/brickit-adapter-wt origin/develop
python3 roundtrip.py     # writes roundtrip.json
```

Everything happens in a detached worktree, so the developer's own checkout is
never touched. No network, no credentials, no pull request is opened.

## The four facts that decide the adapter shape

**1. Regeneration is hermetic and sub-second.** `flutter gen-l10n` reproduces
all seven committed `app_localizations*.dart` files **byte for byte** from
nothing but the six ARB files, a ten-line `pubspec.yaml`, an `l10n.yaml`, and
the pinned SDK (FVM 3.44.6). No `pub get`, no Brickit dependencies, no app
source, no network — 0.78 s warm. The generated Dart layer is a pure function
of the catalogs, so the losslessness oracle from
[Define what lossless Flutter round-tripping means](https://github.com/serge-the-hedge/blabla/issues/6)
can run anywhere a pinned Flutter SDK exists, and needs nothing else from the repo.

**2. A target-only release can never move the generated public API.** Applying
a five-key German release changed exactly `app_localizations_de.dart`;
`app_localizations.dart` — the abstract interface every call site compiles
against — was untouched. Git stays the sole author of the Source Contract, so
Blabla writes target catalogs only, and the failure mode of a bad release is
wrong text, never a broken build.

**3. Byte-exact ARB writeback needs exactly two rules.** A naive
`json.dumps(ensure_ascii=False, indent=2)` writer does *not* round-trip: it
turns the one escaped surrogate pair (`🦄`, a unicorn) into a literal
emoji and appends a trailing newline the repo does not use. With astral
characters re-escaped as UTF-16 surrogate pairs and no trailing newline, all six
catalogs round-trip byte-identically. Without those rules every release is a
whole-file diff on all six files.

**4. Rollback is an ordinary revert.** `git revert` on the release commit
restored `intl_de.arb` to its original bytes with a clean tree, in 0.03 s.

## What the pull request looks like

A five-key German release, measured:

```
5  5  packages/brickit_generated/lib/l10n/app_localizations_de.dart
5  5  packages/brickit_generated/lib/l10n/intl_de.arb
```

Two files, ten lines. One diff line per changed string in each. Reviewable as
translation work rather than as a machine dump.

## Where the generated Dart bites

`packages/brickit_generated/lib/l10n/app_localizations*.dart` is **committed**,
and every one of the last fifteen ARB-touching commits changed the ARB and the
generated Dart together. A release that ships ARB only leaves the two
disagreeing.

Brickit's existing CI does not catch that. `flutter_bloc_tests.yml` runs `make`
(build_runner) and then `flutter test test/`; because `flutter: generate: true`
regenerates into the runner's working tree, the tests pass on a stale commit and
the drift ships. A dedicated gate does catch it:

```bash
fvm flutter gen-l10n && git diff --exit-code -- packages/brickit_generated/lib/l10n
```

Probed against an ARB-only change, it exits 1 and names both files. It costs
0.78 s and mutates nothing.

## Catalog state at `origin/develop` (19a07bc3)

1,459 source keys — 25 more than the 1,434 measured on the earlier checkout
during [Bound automatic code-context inference](https://github.com/serge-the-hedge/blabla/issues/11),
a reminder that source moves under any release in flight.

| Locale | Keys | Empty values | Identical to source |
| --- | --- | --- | --- |
| de | 1,459 | 10 | 125 |
| es | 1,459 | 11 | 79 |
| fr | 1,459 | 5 | 68 |
| ru | 1,459 | 12 | 55 |
| zh | 1,459 | 10 | 54 |

No locale has a missing key and none has an extra one, so the first release
carries no key-set change. The empty values are the first real Source Fallback
or Intentional Blank population to classify, and the identical-to-source counts
are the Source-identical Translation candidates.

## What this does not settle

Where the pinned Flutter SDK runs — a developer machine, a Brickit Actions
runner, or a container Blabla owns — is the credential question, and the probe
deliberately takes no position on it. It only shows the cost is 0.78 s wherever
it lands.
