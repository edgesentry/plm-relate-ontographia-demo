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
--
-- The returned `name` is the finding subject: the part name for a fact, the
-- normalized display name for an inference.
WITH
  downstream AS (
    SELECT
      page_path AS source_file,
      display_name,
      resolved_part,
      trim(
        regexp_replace(
          regexp_replace(lower(display_name), '[^a-z0-9]+', ' ', 'g'),
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
          regexp_replace(lower(display_name), '[^a-z0-9]+', ' ', 'g'),
          '[[:space:]]+', ' ', 'g'
        )
      )
    FROM service_reference
  ),
  removal AS (
    SELECT
      section,
      bullet,
      trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              lower(regexp_replace(text, '\[\[[^\]]+\]\]', ' ', 'g')),
              '\([^)]*\)', ' ', 'g'
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
          regexp_replace(lower(display_name), '[^a-z0-9]+', ' ', 'g'),
          '[[:space:]]+', ' ', 'g'
        )
      ) AS link_key
    FROM change_note_link
    WHERE resolved_part IS NOT NULL
  ),
  facts AS (
    SELECT DISTINCT d.resolved_part AS name, d.source_file
    FROM change_note_link AS l
    JOIN downstream AS d ON d.resolved_part = l.resolved_part
    WHERE l.resolved_part IS NOT NULL
  ),
  inferred AS (
    SELECT DISTINCT d.name_key AS name, d.source_file
    FROM removal AS r
    JOIN downstream AS d
      ON (' ' || r.prose || ' ') LIKE ('% ' || d.name_key || ' %')
    WHERE NOT EXISTS (
        SELECT 1
        FROM links AS l
        WHERE l.section IS NOT DISTINCT FROM r.section
          AND l.bullet = r.bullet
          AND (' ' || l.link_key || ' ') LIKE ('% ' || d.name_key || ' %')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM facts AS f
        WHERE f.name IS NOT NULL
          AND trim(
            regexp_replace(
              regexp_replace(lower(f.name), '[^a-z0-9]+', ' ', 'g'),
              '[[:space:]]+', ' ', 'g'
            )
          ) = d.name_key
      )
  )
SELECT name, TRUE AS inferred, source_file FROM inferred
UNION
SELECT name, FALSE AS inferred, source_file FROM facts
ORDER BY name, inferred, source_file;
