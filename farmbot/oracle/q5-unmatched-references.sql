-- Q5: pages that reference an unmatched display name.
--
-- The graph emits one SEEN_IN edge per (UnmatchedName, Structure) pair:
-- `unmatched_name.source_pages` is a set, and unresolved service references are
-- grouped by display name before their page is added. The status is a property
-- of the display name, not of the page, and is ambiguous when any occurrence of
-- that name was ambiguous. The two branches below therefore collect every
-- occurrence, deduplicate (display_name, page), and decide the status once per
-- display name so the oracle matches the graph even when a page repeats the same
-- unresolved service reference.
WITH occurrences AS (
  SELECT
    name.display_name AS display_name,
    TRIM(page) AS page,
    CASE WHEN name.status = 'ambiguous' THEN 1 ELSE 0 END AS ambiguous
  FROM unmatched_name AS name,
    UNNEST(string_split(name.source_pages, ', ')) AS pages(page)
  UNION ALL
  SELECT
    reference.display_name,
    reference.page_path,
    CASE WHEN reference.match_method = 'ambiguous' THEN 1 ELSE 0 END
  FROM service_reference AS reference
  WHERE reference.resolved_part IS NULL
),
names AS (
  SELECT display_name, MAX(ambiguous) AS ambiguous
  FROM occurrences
  GROUP BY display_name
)
SELECT occurrence.display_name, occurrence.page
FROM (SELECT DISTINCT display_name, page FROM occurrences) AS occurrence
JOIN names ON names.display_name = occurrence.display_name
WHERE (CASE WHEN names.ambiguous = 1 THEN 'ambiguous' ELSE 'unmatched' END) = $status
ORDER BY occurrence.display_name, occurrence.page;
