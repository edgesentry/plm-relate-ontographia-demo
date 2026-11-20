# Preset question Intents

One Intent per preset question lives as a JSON file under `farmbot/intents/`.
They are compiled by the Ontographia WASM binding and executed by Relate
against the committed seed `farmbot/dist/farmbot.seed.json` in
`farmbot/test/preset-questions.test.mjs` and on the `/farmbot/` screen; versions
are pinned in `package.json`. Each file under `farmbot/oracle/` is an
independent SQL answer over the DuckDB extract with the same column names. Read
the Intent JSON for each pattern, parameter and projected columns, and the test
for limits and row expectations.

## Parameters

A filter value is stored in the Intent JSON because the pinned schema takes a
literal `value`; the compiler emits it as `$param_N` and returns it in
`params`, so the compiled Cypher has no part name, category slug or status
literal. The test asserts both the placeholder and the literal's absence, then
passes `params` to Relate unchanged.

Filter values must come from the extract: `farmbot/scripts/allowed-values.mjs`
generates `farmbot/dist/farmbot.allowed-values.json`. Read the script for the
domains and byte-identity guarantee.

## Forward traversal only

The compiler rejects `direction: in` when the previous node is not the
relationship's `from_class`, even though the requested edge would arrive from
`to_class` (`edgesentry/ontographia#164`). Every shipped Intent starts on the
`from_class` and traverses `direction: out`, filtering the far alias when the
question is naturally asked from the other side; the test checks every
`traverse` step.

## Unique chapters and structures (Q2 and Q3)

A part can be referenced more than once by the same chapter or structure, so
the raw pattern returns one row per usage line, while both questions want
unique owners. The compiler cannot express `DISTINCT`: the Intent schema has no
such field (unknown keys are rejected) and the Cypher 25 emitter writes
`RETURN` without `DISTINCT`. For Q2 and Q3 only, a post-compile step replaces
the single `\nRETURN ` with `\nRETURN DISTINCT ` and leaves every other byte,
including `$param_N` placeholders, exactly as compiled. The step is
`insertDistinctReturn` in `src/farmbot/distinct-return.mjs`, shared by the
tests and the `/farmbot/` screen so the rewrite cannot drift; nothing in the
ontology or compiler changes. The test asserts the raw output has no
`DISTINCT`, the executed statement does, and rows are unique. Q1, Q4 and Q5
keep the engine's multiplicity.

## Why Q1 returns no container or variant column

The graph attaches the packing container through `COMPARED_IN` and the product
variant through `FOR_VARIANT`, separate outgoing edges from the same
`QuantityDifference` node. A traversal is one linear chain and the far side
cannot be entered with `direction: in` (`edgesentry/ontographia#164`), so one
Intent cannot bind the compared part, its container and its variant together.
Q1 starts on `QuantityDifference`, traverses `COMPARES_PART` to `Part` and
projects the part name and `packing_minus_part`; the oracle projects the same
columns. The test also checks that the extract's difference rows fall on the
hardware kit page for both `standard` and `xl`, which is a `Kit` in the seed.
