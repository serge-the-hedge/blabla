# ARB fixtures

The six Brickit catalogs, verbatim, taken from `brickit-flutter` at commit
`4c6b65419` (`packages/brickit_generated/lib/l10n/`).

They are the oracle for the Catalog Document round trip: `serialize(parse(text))`
must equal `text` byte for byte, for every one of them. Do not reformat, lint,
or add a trailing newline to these files — every property they carry is
deliberate, including the ones a tidy-up would remove. `biome.json` excludes
this directory so no formatter can quietly take that decision.

Measured at that commit, per file: 1,434 messages and 1,434 `@` metadata blocks,
one document global (`@@locale`, always first), one escaped astral surrogate
pair (`🦄`), and no trailing newline. Across all six the only escape
sequences in use are `\n`, `\"`, and that one `\u` pair.

## Provenance

An ARB file is JSON and cannot carry a comment, so each file's origin is
recorded here instead. SHA-256, as taken from `4c6b65419`:

- `intl_de.arb` — `d1d4e91a9d0a25de3a1c6267e03eca17ce1a3d3d52eb04a0d745481a62705f8b`
- `intl_en.arb` — `a623f6827721da035c738b3342a082cb97c8bdd1363e1da40a0ac5c4586867eb`
- `intl_es.arb` — `f15e52dc544b78aa6220737953aba2f734edaeef309d9fa8cdc1fe8c480c0854`
- `intl_fr.arb` — `9ffc05c03226170d11e14c814cf1e0c597eb1ff3cd923fee35f6204d72cc743d`
- `intl_ru.arb` — `8267f7ad63e8c17cef4c8a1f2f65ad5e5ed5f6b22c94abb6b58598c28583d91f`
- `intl_zh.arb` — `ccd674a93e5ecf22294c049e3c751106a0b976466b1b6b61bf36d0984a6f8c65`

Refreshing them against a newer Brickit commit is a deliberate act: update the
commit and the checksums here in the same change, and expect the round-trip
test to be the thing that tells you whether the new corpus holds any property
the codec does not yet handle.
