# Prototype: how reliable is each code-context finding class?

Throwaway. Built to resolve [Bound automatic code-context inference](https://github.com/serge-the-hedge/blabla/issues/11)
with real numbers instead of estimates. Not production code, and not the shape
of the eventual manifest generator.

Run: `python3 analyze.py ../brickit-app/brickit-flutter > findings.json`

Corpus: `intl_en.arb` (1,434 keys) against 677 hand-written Dart files in
`packages/brickit` and `packages/brickit_generated`, excluding `*.g.dart`,
`*.freezed.dart`, and the generated `app_localizations*.dart`.

## What the run measured

| Finding class | Result |
| --- | --- |
| Call site | 769 keys referenced, 945 total references; 688 keys in exactly one file, 81 in several |
| Screen | 713 of 769 (92.7%) resolve to one area; 56 span areas; 583 (75.8%) have **no** direct `screens/` file |
| Dynamic selection | 49 keys chosen inside 12 `AppLocalizations`-taking helpers by switch/conditional |
| Unreferenced | 665 keys (46.4% of the catalog) with no reference |
| Layout | 422 keys expand ≥1.4× at their worst locale; only 90 referenced keys (11.7%) sit near any width/overflow hint |

## The two facts that decide auto-apply

**1. A key reference is statically complete in this codebase.** The generated
`AppLocalizations` exposes getters, and the repo contains no string-keyed lookup
into it — no `l10n[...]`, no `Map<String, String Function(...)>`, no reflective
resolution. Firebase Remote Config drives feature flags, not message names. The
sibling `brickit-web` repo carries its own strings and never reads these keys.
So a key cannot be reached by a name assembled at runtime, and "no static
reference" is not defeated by a hidden dynamic path.

**2. Naive matching is wrong in both directions, and the errors are small and
knowable.**

- *Recall*: matching line by line silently drops references, because dartfmt
  wraps long chains onto `localizations\n    .someKey`. That alone lost 9 keys
  before the matcher was switched to whole-file matching.
- *Precision*: a bare-identifier text search reports 772 "referenced" keys, but
  three of those — `preparing`, `today`, `yesterday` — are ordinary Dart
  identifiers colliding with key names (`ScanStatus.preparing`,
  `DateTimeUtils.today()`), not localization references at all.
- Receiver names are inconsistent across the codebase (`l10n`, `localizations`,
  `localization`, `appLocalization`, `appLocalizations`), so the receiver set
  has to be collected from `AppLocalizations` declarations rather than assumed.

Both error classes come from the matcher, not from the language. They shrink to
zero with a real Dart resolver; they do not shrink with more heuristics.

## Where the confidence actually drops

Screen attribution looks strong at 92.7% but the headline is misleading: 75.8%
of referenced keys are never touched by a file under `screens/`. Their "screen"
is inferred from a shared widget directory — `widgets/activity_feed`,
`widgets/paywall` — which is a *feature* area, not a screen a translator could
open. The 56 multi-area keys are worse: `about_app_privacy_policy` appears in
`screens/settings`, `screens/uikit`, `widgets/paywall`, and `widgets/sign_in`.
Note `screens/uikit` is a component showcase, so a showcase reference inflates
the area count without describing real product placement.

Layout is the weakest class by a wide margin. Expansion ratio is measurable from
the ARB alone and needs no code at all, while the thing that makes expansion
*matter* — a constrained widget — is only weakly observable: 11.7% of referenced
keys sit near a `maxLines`/`overflow`/`SizedBox(width:`/`Expanded` hint, and
proximity within ±12 lines is not containment. Of the eight worst expanders,
seven show no constraint hint.

Dynamic selection is narrow and precise: 12 helpers, 49 keys, and they are
legible sets (`pom_education_screen_step_1..6_title`). This is not a reliability
problem — it is a context *opportunity*, because the sibling set is exactly what
a translator needs to see.
