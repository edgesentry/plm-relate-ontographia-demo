// Reader for the v1.7 Change Log page. The page is prose and bullet lists
// under `#` section headings; links are `[[part name]]` wikilinks. The
// parsing is pure so the same page list always produces the same rows.

import { findWikilinks } from './markdown.mjs';
import { normalizeName, resolveName } from './normalize.mjs';

export const CHANGE_LOG_PATH = 'v1.7/assembly/intro/change-log.md';

const HEADING = /^(#{1,6})\s+(.+?)\s*$/;
const IMAGE_ONLY = /^\s*!\[[^\]]*\]\([^)]*\)\s*$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+\.)\s+/;
const FENCE = /^\s*```/;

// A text unit is one paragraph or one list item. Images are not text units,
// blank lines separate units, and a list item always starts a new unit. The
// unit index (`bullet`) is 0-based within its section and counts every unit,
// including units without links.
function parseUnits(body) {
  const lines = body.split(/\r?\n/);
  const units = [];
  let section = null;
  let sectionOrder = -1;
  let bullet = 0;
  let current = null;
  let inFence = false;

  const flush = () => {
    if (!current) return;
    units.push(current);
    current = null;
  };

  lines.forEach((line, index) => {
    if (FENCE.test(line)) {
      inFence = !inFence;
      flush();
      return;
    }
    if (inFence) return;

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      section = heading[2].replace(/\s*#+\s*$/, '').trim();
      sectionOrder += 1;
      bullet = 0;
      return;
    }
    if (!line.trim()) {
      flush();
      return;
    }
    if (IMAGE_ONLY.test(line)) {
      flush();
      return;
    }
    if (LIST_ITEM.test(line)) {
      flush();
      current = {
        section,
        sectionOrder,
        bullet: bullet++,
        lines: [{ text: line, lineNumber: index + 1 }],
      };
      return;
    }
    if (current) {
      current.lines.push({ text: line, lineNumber: index + 1 });
      return;
    }
    current = {
      section,
      sectionOrder,
      bullet: bullet++,
      lines: [{ text: line, lineNumber: index + 1 }],
    };
  });
  flush();

  return units;
}

function unitResolution(linkCount, resolvedCount) {
  if (linkCount === 0) return 'no_links';
  if (resolvedCount === linkCount) return 'all_resolved';
  if (resolvedCount === 0) return 'none_resolved';
  return 'partially_resolved';
}

/**
 * Build change-note rows and one row per link for the Change Log page.
 *
 * @param {Array<{ path: string, title: string|null, body: string }>} pages
 * @param {{ index: Map<string, unknown>, parts: Array<{ name: string }> }} context
 * @returns {{
 *   notes: Array<object>,
 *   links: Array<object>,
 * }}
 */
export function extractChangeNotes(pages, { index, parts }) {
  const notes = [];
  const links = [];

  for (const page of pages) {
    if (page.path !== CHANGE_LOG_PATH) continue;
    const units = parseUnits(page.body);

    for (const unit of units) {
      const unitLinks = [];
      for (const entry of unit.lines) {
        for (const link of findWikilinks(entry.text)) {
          const resolved = resolveName(link.name, index, parts);
          unitLinks.push({
            section: unit.section,
            sectionOrder: unit.sectionOrder,
            bullet: unit.bullet,
            linkIndex: unitLinks.length,
            lineNumber: entry.lineNumber,
            displayName: link.name,
            normalizedName: normalizeName(link.name),
            resolvedPart: resolved.partName,
            matchMethod: resolved.method,
            candidates: resolved.candidates,
          });
        }
      }

      notes.push({
        section: unit.section,
        sectionOrder: unit.sectionOrder,
        bullet: unit.bullet,
        text: unit.lines.map((entry) => entry.text).join('\n').trim(),
        lineNumber: unit.lines[0].lineNumber,
        linkedNames: unitLinks.map((link) => link.displayName),
        resolution: unitResolution(
          unitLinks.length,
          unitLinks.filter((link) => link.resolvedPart).length,
        ),
      });
      links.push(...unitLinks);
    }
  }

  notes.sort(
    (left, right) => left.sectionOrder - right.sectionOrder || left.bullet - right.bullet,
  );
  links.sort(
    (left, right) =>
      left.sectionOrder - right.sectionOrder ||
      left.bullet - right.bullet ||
      left.linkIndex - right.linkIndex,
  );

  return { notes, links };
}
