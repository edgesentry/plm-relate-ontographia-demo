-- R8: parts named by a service page that no assembly chapter or pre-assembly
-- references.
--
-- The pre-assembly references include the Accessory bag BOM sections: their
-- owning structure is a Bag inside a pre-assembly page. Packing is reported as
-- context (a packed part is the shape the rule cares about most), not as a
-- reason to exclude the part.
WITH service_parts AS (
  SELECT DISTINCT resolved_part AS part
  FROM service_reference
  WHERE resolved_part IS NOT NULL
)
SELECT
  service_parts.part,
  EXISTS (
    SELECT 1 FROM packing_item AS item WHERE item.resolved_part = service_parts.part
  ) AS packed
FROM service_parts
WHERE NOT EXISTS (
    SELECT 1
    FROM assembly_reference AS reference
    WHERE reference.resolved_part = service_parts.part
  )
  AND NOT EXISTS (
    SELECT 1
    FROM preassembly_reference AS reference
    WHERE reference.resolved_part = service_parts.part
  )
ORDER BY service_parts.part;
