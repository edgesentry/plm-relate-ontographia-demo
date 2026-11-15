-- Q5: pages that reference an unmatched display name.
--
-- unmatched_name.source_pages is a comma-and-space separated list; the graph
-- emits one SEEN_IN edge per entry, so the list is unnested here. Unresolved
-- service references are not rows of unmatched_name; the graph derives one
-- UnmatchedName per display name from service_reference, seen in its service
-- page, so the second branch projects the same shape. Service match methods map
-- to the same status rule the generator uses.
SELECT display_name, page
FROM (
  SELECT
    name.display_name AS display_name,
    TRIM(page) AS page,
    name.status AS status
  FROM unmatched_name AS name,
    UNNEST(string_split(name.source_pages, ', ')) AS pages(page)
  UNION ALL
  SELECT
    reference.display_name,
    reference.page_path,
    CASE
      WHEN reference.match_method = 'ambiguous' THEN 'ambiguous'
      ELSE 'unmatched'
    END
  FROM service_reference AS reference
  WHERE reference.resolved_part IS NULL
) AS seen
WHERE status = $status
ORDER BY display_name, page;
