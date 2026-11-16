-- R6: a name changed or removed in the Change Log still appears on a packing
-- or service page.
--
-- Fact: a `change_note_link` that resolved to a part is still named by a
-- packing or service usage line, matched on the resolved part.
-- Inferred: a Change Log list item that removes or replaces an item
-- (`removed`, `replaced`, `switched`, `dropped`) names an item in prose. A
-- downstream display name whose normalized words occur in that item is a
-- candidate unless the same item links a name that already contains those
-- words; that link is the replacement and is covered by the fact row.
-- Fact wins: an inferred match whose normalized key equals a changed part is
-- promoted to a fact row (`promoted`), so an unmatched packing line on a
-- second page is reported under the changed part rather than dropped.
--
-- The name keys follow `farmbot/scripts/lib/normalize.mjs` (`normalizeName` and
-- `singularizeName`): NFKC, `×`/`✕` -> `x`, dashes -> `-`, `w/` -> `with `,
-- parentheticals and brackets stripped, `&` -> ` and `, every other run of
-- non-alphanumerics -> one space, then the last word singularized when it ends
-- in a single `s`. DuckDB exposes NFC rather than NFKC; the pinned seed and the
-- fixtures contain no compatibility characters the two forms differ on.
--
-- `downstream` is `packing_item` plus `service_reference` only. Pre-assembly
-- pages and the Accessory bag BOM are not packing items, so they never reach
-- this rule.
--
-- The returned `name` is the finding subject: the part name for a fact, the
-- normalized display name for an inference.
WITH
  downstream_raw AS (
    SELECT
      page_path AS source_file,
      display_name,
      resolved_part,
      trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          nfc_normalize(lower(display_name)),
                          '[×✕]', 'x', 'g'
                        ),
                        '[‐‑‒–—―]', '-', 'g'
                      ),
                      '\bw/\s*', 'with ', 'g'
                    ),
                    '\([^)]*\)', ' ', 'g'
                  ),
                  '\([^)]*\)', ' ', 'g'
                ),
                '\[[^\]]*\]', ' ', 'g'
              ),
              '&', ' and ', 'g'
            ),
            '[^a-z0-9]+', ' ', 'g'
          ),
          '[[:space:]]+', ' ', 'g'
        )
      ) AS name_key
    FROM packing_item
    WHERE display_name IS NOT NULL
    UNION ALL
    SELECT
      page_path,
      display_name,
      resolved_part,
      trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          nfc_normalize(lower(display_name)),
                          '[×✕]', 'x', 'g'
                        ),
                        '[‐‑‒–—―]', '-', 'g'
                      ),
                      '\bw/\s*', 'with ', 'g'
                    ),
                    '\([^)]*\)', ' ', 'g'
                  ),
                  '\([^)]*\)', ' ', 'g'
                ),
                '\[[^\]]*\]', ' ', 'g'
              ),
              '&', ' and ', 'g'
            ),
            '[^a-z0-9]+', ' ', 'g'
          ),
          '[[:space:]]+', ' ', 'g'
        )
      )
    FROM service_reference
    WHERE display_name IS NOT NULL
  ),
  downstream AS (
    SELECT
      source_file,
      display_name,
      resolved_part,
      name_key,
      CASE
        WHEN length(name_key) > 3
          AND ends_with(name_key, 's')
          AND NOT ends_with(name_key, 'ss')
        THEN substr(name_key, 1, length(name_key) - 1)
        ELSE name_key
      END AS name_singular
    FROM downstream_raw
  ),
  removal AS (
    SELECT
      section,
      bullet,
      trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          nfc_normalize(
                            lower(regexp_replace(text, '\[\[[^\]]+\]\]', ' ', 'g'))
                          ),
                          '[×✕]', 'x', 'g'
                        ),
                        '[‐‑‒–—―]', '-', 'g'
                      ),
                      '\bw/\s*', 'with ', 'g'
                    ),
                    '\([^)]*\)', ' ', 'g'
                  ),
                  '\([^)]*\)', ' ', 'g'
                ),
                '\[[^\]]*\]', ' ', 'g'
              ),
              '&', ' and ', 'g'
            ),
            '[^a-z0-9]+', ' ', 'g'
          ),
          '[[:space:]]+', ' ', 'g'
        )
      ) AS prose
    FROM change_note
    WHERE regexp_matches(
      text,
      '^[[:space:]]*(?:[-*+]|[0-9]+\.)[[:space:]]+(removed|replaces?|switched|dropped)\b',
      'i'
    )
  ),
  links AS (
    SELECT
      section,
      bullet,
      trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          nfc_normalize(lower(display_name)),
                          '[×✕]', 'x', 'g'
                        ),
                        '[‐‑‒–—―]', '-', 'g'
                      ),
                      '\bw/\s*', 'with ', 'g'
                    ),
                    '\([^)]*\)', ' ', 'g'
                  ),
                  '\([^)]*\)', ' ', 'g'
                ),
                '\[[^\]]*\]', ' ', 'g'
              ),
              '&', ' and ', 'g'
            ),
            '[^a-z0-9]+', ' ', 'g'
          ),
          '[[:space:]]+', ' ', 'g'
        )
      ) AS link_key
    FROM change_note_link
    WHERE resolved_part IS NOT NULL
  ),
  changed AS (
    SELECT DISTINCT
      resolved_part AS part_name,
      trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          nfc_normalize(lower(resolved_part)),
                          '[×✕]', 'x', 'g'
                        ),
                        '[‐‑‒–—―]', '-', 'g'
                      ),
                      '\bw/\s*', 'with ', 'g'
                    ),
                    '\([^)]*\)', ' ', 'g'
                  ),
                  '\([^)]*\)', ' ', 'g'
                ),
                '\[[^\]]*\]', ' ', 'g'
              ),
              '&', ' and ', 'g'
            ),
            '[^a-z0-9]+', ' ', 'g'
          ),
          '[[:space:]]+', ' ', 'g'
        )
      ) AS part_key
    FROM change_note_link
    WHERE resolved_part IS NOT NULL
  ),
  matches AS (
    SELECT DISTINCT d.name_key AS name, d.source_file
    FROM removal AS r
    JOIN downstream AS d
      ON d.name_key <> ''
      AND (
        (' ' || r.prose || ' ') LIKE ('% ' || d.name_key || ' %')
        OR (' ' || r.prose || ' ') LIKE ('% ' || d.name_singular || ' %')
      )
    WHERE NOT EXISTS (
        SELECT 1
        FROM links AS l
        WHERE l.section IS NOT DISTINCT FROM r.section
          AND l.bullet = r.bullet
          AND (
            (' ' || l.link_key || ' ') LIKE ('% ' || d.name_key || ' %')
            OR (' ' || l.link_key || ' ') LIKE ('% ' || d.name_singular || ' %')
          )
      )
  ),
  facts AS (
    SELECT DISTINCT d.resolved_part AS name, d.source_file
    FROM change_note_link AS l
    JOIN downstream AS d ON d.resolved_part = l.resolved_part
    WHERE l.resolved_part IS NOT NULL
  ),
  promoted AS (
    SELECT DISTINCT c.part_name AS name, m.source_file
    FROM matches AS m
    JOIN changed AS c ON c.part_key = m.name
  ),
  inferred AS (
    SELECT DISTINCT m.name AS name, m.source_file
    FROM matches AS m
    WHERE NOT EXISTS (
        SELECT 1
        FROM changed AS c
        WHERE c.part_key = m.name
      )
  )
SELECT name, TRUE AS inferred, source_file FROM inferred
UNION
SELECT name, FALSE AS inferred, source_file FROM facts
UNION
SELECT name, FALSE AS inferred, source_file FROM promoted
ORDER BY name, inferred, source_file;
