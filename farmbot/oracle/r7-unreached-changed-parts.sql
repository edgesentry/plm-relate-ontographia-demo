-- R7: changed parts that reach nothing.
--
-- A changed part is the target of a resolved `change_note_link`. Reach is any
-- resolved usage line in an assembly chapter, a pre-assembly (including its
-- Accessory bag BOM rows), a packing list (kit, bag or carton) or a service
-- page. The rows returned here are the changed parts with no such reference.
WITH changed AS (
  SELECT DISTINCT resolved_part AS part
  FROM change_note_link
  WHERE resolved_part IS NOT NULL
),
reached AS (
  SELECT resolved_part AS part
  FROM assembly_reference
  WHERE resolved_part IS NOT NULL
  UNION
  SELECT resolved_part
  FROM preassembly_reference
  WHERE resolved_part IS NOT NULL
  UNION
  SELECT resolved_part
  FROM packing_item
  WHERE resolved_part IS NOT NULL
  UNION
  SELECT resolved_part
  FROM service_reference
  WHERE resolved_part IS NOT NULL
)
SELECT changed.part
FROM changed
WHERE NOT EXISTS (
    SELECT 1 FROM reached WHERE reached.part = changed.part
  )
ORDER BY changed.part;
