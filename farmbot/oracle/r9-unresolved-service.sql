-- R9: unresolved references on service pages.
--
-- Each row is one service-page reference line whose `resolved_part` is null and
-- whose match method is `unmatched`. `candidates` is the diagnostic candidate
-- list the extract recorded for that line; on the pinned source it is null for
-- the one row.
SELECT
  display_name AS name,
  page_path AS source_file,
  line_number AS line,
  candidates
FROM service_reference
WHERE resolved_part IS NULL AND match_method = 'unmatched'
ORDER BY name, source_file, line;
