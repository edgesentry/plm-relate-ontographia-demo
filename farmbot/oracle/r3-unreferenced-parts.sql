-- R3: parts referenced by no assembly chapter, pre-assembly, bag or packing
-- list.
--
-- The graph Intent states this absence with five correlated `not_exists`
-- entries; this query states the same NOT EXISTS conditions in SQL.
SELECT p.name AS part
FROM part AS p
WHERE NOT EXISTS (
    SELECT 1 FROM assembly_reference AS r WHERE r.resolved_part = p.name
  )
  AND NOT EXISTS (
    SELECT 1 FROM preassembly_reference AS r WHERE r.resolved_part = p.name
  )
  AND NOT EXISTS (
    SELECT 1 FROM packing_item AS r WHERE r.resolved_part = p.name
  )
ORDER BY p.name;
