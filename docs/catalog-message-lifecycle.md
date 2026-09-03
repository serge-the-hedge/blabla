# Catalog Message Lifecycle

This document is the normative travel map for every Catalog Message and Target
Value that enters Blabla, changes there, and reaches a compiled application. It
does not replace the control-plane specification; it makes the specification's
distributed lifecycle decisions readable in one place.

## The route to the application

```text
merged application repository (Release Truth)
  -> Repository Adapter reads one complete Git commit
  -> immutable Source Snapshot and Catalog Documents
  -> accepted Baseline Snapshot and derived Catalog Projection
  -> Catalog Workspace values, proposals, and human decisions
  -> Release Assessment and immutable Release Bundle
  -> Repository Adapter applies the Release Delta to a delivery branch
  -> review and merge in the application repository
  -> next ordinary sync observes the merged files
  -> Flutter localization generation and application release
```

Blabla is a control plane, not the runtime source of text. A value reaches users
only after it is written to and shipped from the application repository. A
successful Blabla build or delivery proves neither merge nor application
release; the following accepted Source Snapshot closes that evidence loop.

## Independent facts

Do not compress the lifecycle into one `status`. For every target value, Blabla
answers these questions independently:

1. **Presence** — is there content, or an Intentional Blank decision?
2. **Contract Validity** — does the value preserve valid syntax and the Message
   Signature?
3. **Currency** — does its Source Fingerprint answer the current Source
   Contract?
4. **Human confirmation** — is there a Translator Confirmation for this exact
   content and Source Contract?
5. **Introduction review** — if the message entered after bootstrap, has every
   target Locale that was active then received a deliberate First Review?
6. **Provenance** — did the visible value come from Git, a person, an agent
   candidate, restoration, or a Locale Proposal?
7. **Delivery evidence** — has an immutable Release Bundle carried the decision
   to a repository branch, and has a later Baseline observed it?

A populated value can therefore be valid and current while remaining
unconfirmed. A confirmed value can become stale without becoming missing. An
Introduced Message can contain plausible text in every Locale while still
requiring First Review.

## Import paths

### Bootstrap Baseline

The first accepted Baseline imports every non-empty target as an Unconfirmed
Import and every absent or empty target as Waiting. Ingestion itself confirms
nothing. The explicitly approved `ordinary-v1` bootstrap sweep may establish
Translator Confirmations for conservative, ordinary values.

Bootstrap is unique. Its broad trust decision must never apply to messages
introduced by later Baselines.

### Existing message, unchanged

When source and target evidence are unchanged, exact matching Translator
Confirmations and Intentional Blanks continue to apply. No new work is created.

### Existing target changed in Git

Git wins the visible target value. An exact confirmation for the former content
does not transfer, so a non-empty replacement is an Unconfirmed Import and an
empty replacement is Waiting. The Reconciliation Report records the Git change.

### Existing source changed in Git

An unchanged target retains the Source Fingerprint it was authored against. A
semantic source change makes it a Stale Translation requiring confirmation or
an edit; a cosmetic source change remains visible but non-blocking. A safe
Contract Transform may mechanically preserve validity but never creates human
confirmation or currency.

If source and target both change in the same accepted snapshot, the imported
target may answer the new Source Contract, but it remains unconfirmed until a
human affirms that exact pair.

### Message introduced after bootstrap

A source identifier absent from both the previous active catalog and retained
archive enters as an Introduced Message. The Reconciliation Report records its
materialized targets under **To translate**, even when their files already
contain text.

The target Locales active at introduction form a frozen First Review scope:

- empty or absent output is Waiting;
- populated output is an Unconfirmed Import;
- imported text is starting material, never evidence of review;
- ordinary batch confirmation excludes the whole Introduced Message;
- each Locale leaves First Review only through a deliberate human action;
- the key remains in the **New from Git** Catalog Scope until that frozen scope
  is complete.

A Locale added later follows the Locale Proposal lifecycle and does not reopen a
completed introduction. Removing and restoring a key follows Archive
Reconciliation; it does not manufacture a second introduction.

### Message or Locale absent from Git

A missing source identifier is soft-archived with its history. A missing bound
target Locale is likewise archived. Byte-identical source restoration can
restore retained targets automatically; changed source requires a proposal or
fresh translation work. An unbound file is setup evidence, not an active Locale.

## Human and agent paths

| Origin | Becomes visible immediately? | Creates human confirmation? | Route onward |
|---|---:|---:|---|
| Git target import | Yes | No | Confirm or edit in Strings |
| Human target edit in Strings | Yes | Yes, on save | Release assessment |
| Human confirmation without edit | Yes | Yes | Release assessment |
| Intentional Blank | Yes | Deliberate equivalent | Release assessment |
| Agent Translation Proposal | No; candidate is inert | No | Human accepts exact/edited candidate into the target workflow |
| Translation Task review | Candidate only until accepted | Yes, through the reviewing person | Catalog Workspace |
| Source edit in Strings | Candidate Source Proposal | Not a target confirmation | Release Bundle, Git review, later sync |
| Locale Proposal | Separate draft catalog | Only reviewed candidate applications | Finalize artifact, deliver, sync unbound file, bind Locale |
| Automatic restore/transform | Yes | No new confirmation | Review according to retained currency and validity |

Agents may propose and revise content, but only authenticated human gestures
create Translator Confirmations or complete First Review.

## Working states and gestures

| Current facts | Presentation | Required action |
|---|---|---|
| No target content and no Intentional Blank | **Waiting** | Write a value or record a reasoned blank |
| Current non-empty content lacks exact confirmation | **Unconfirmed Import** | Approve unchanged or edit and save |
| Previously confirmed content answers older semantic source | **Source changed** | Confirm it remains correct or edit and save |
| Exact current confirmation or valid Intentional Blank | Settled and silent | None |
| Any unresolved target in an Introduced Message | **New from Git** on the key | Complete deliberate First Review per introduction Locale |

`New from Git` is key-level provenance layered over the ordinary per-value
states. It must not replace Waiting, Unconfirmed Import, or Stale Translation.

## Batch policy

The ordinary-import batch exists to retire conservative imported backlog, most
notably at bootstrap. It may confirm only untouched, contract-valid, non-empty,
source-different, non-repeated current values with no pending Source Proposal.

It must additionally exclude every unresolved Introduced Message. This prevents
plausible placeholder text from becoming reviewed merely because it arrived in
all Locale files. Translation Tasks and Locale Proposal review may accept many
values at once because they preserve an explicit candidate set and a human is
reviewing that set.

## Release policy

Contract-invalid, Waiting, and semantically stale values require decisions.
Ordinary Unconfirmed Imports remain non-blocking legacy backlog. An unresolved
Introduced Message is different: it is known post-bootstrap work and makes a
new Release Assessment **Needs Decisions**.

This gate governs Blabla Release Bundles. Because Release Truth remains the
application repository, Brickit can still ship repository-authored placeholders
without invoking Blabla; a complete organizational gate ultimately requires
Brickit's release CI to consume Blabla readiness evidence.

Release records keep these dimensions distinct:

- existing-Locale value changes;
- complete new-Locale additions;
- unresolved ordinary imports;
- an `introduction_review` finding for each otherwise-current target still in
  First Review (aggregated into the ordinary **Needs Decisions** count);
- source proposals included in the bundle.

## Delivery and closure

A Release Bundle is immutable evidence derived from one ready Release Record.
The Repository Adapter computes a Release Delta against the delivery tree,
writes only reviewed changes, regenerates Flutter localization output, and
creates a local review branch. Git review and merge remain developer actions.

The lifecycle closes only when a later ordinary sync observes the merged commit
as a descendant of the Baseline. Until then, Blabla may know that delivery was
attempted but cannot call the repository or application updated.

## Edge-case decisions

- Identical text on unrelated keys is ordinary reuse and changes no state.
- Identical target text across different Locales of the same key remains
  suspicious and is excluded from ordinary batch confirmation.
- Returning to previously confirmed exact target bytes restores confirmation
  only when the Source Contract fingerprint also matches.
- A source-only Git introduction is still an Introduced Message; missing target
  entries are Waiting rather than silently accepted source fallback.
- A Source Proposal does not erase imported provenance. Candidate target work
  can be authored against it, but the proposal must reach Git and be observed by
  sync before Git evidence changes.
- Preview Snapshots may support provisional work but never create introductions
  or advance delivery truth.
- A key removed before First Review retains its introduction provenance in the
  archive; restoration resumes rather than resets that work.

## Implementation and rollout boundary

Blabla now persists introduction provenance, derives First Review from later
human decisions, exposes **New from Git** in Strings and Navigation, excludes it
from `ordinary-v1`, and includes it in Release Assessment. Reconciliation also
records every target of a new key, including target text already present in Git.

Existing production projections predate this provenance. Blabla must not guess
that every unconfirmed key is new, because that would relabel the bootstrap
catalog. Consequently, automatic classification begins with the first Baseline
accepted after this implementation: keys first appearing in that or any later
Baseline are exact; older post-bootstrap introductions retain their ordinary
states unless a separate historical migration reconstructs their first
appearance from immutable Snapshot evidence. Such a migration is optional and
must be explicit, bounded, and previewed before it changes review work.
