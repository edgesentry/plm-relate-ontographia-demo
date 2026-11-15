// Reader for the v1.7 service pages: `extras/troubleshooting/*.md` and
// `extras/maintenance/*.md`. A page is extracted only when it has at least
// one `[[part name]]` link. The parsing is pure so the same page list always
// produces the same rows, whatever order the pages arrive in.

import { findWikilinks } from './markdown.mjs';
import { normalizeName, resolveName } from './normalize.mjs';

export const SERVICE_KINDS = [
  { kind: 'troubleshooting', prefix: 'v1.7/extras/troubleshooting/' },
  { kind: 'maintenance', prefix: 'v1.7/extras/maintenance/' },
];

const FENCE = /^\s*```/;

export function serviceKindForPath(path) {
  for (const entry of SERVICE_KINDS) {
    if (path.startsWith(entry.prefix)) return entry.kind;
  }
  return null;
}

/**
 * Build service-page and service-reference rows from a page list.
 *
 * @param {Array<{ path: string, title: string|null, body: string }>} pages
 * @param {{ index: Map<string, unknown>, parts: Array<{ name: string }> }} context
 * @returns {{
 *   pages: Array<object>,
 *   references: Array<object>,
 * }}
 */
export function extractServicePages(pages, { index, parts }) {
  const pageRows = [];
  const references = [];

  for (const page of pages) {
    const kind = serviceKindForPath(page.path);
    if (!kind) continue;

    const title = typeof page.title === 'string' ? page.title : null;
    const links = [];
    let inFence = false;

    page.body.split(/\r?\n/).forEach((line, lineIndex) => {
      if (FENCE.test(line)) {
        inFence = !inFence;
        return;
      }
      if (inFence) return;

      const seen = new Map();
      for (const link of findWikilinks(line)) {
        const occurrence = seen.get(link.name) ?? 0;
        seen.set(link.name, occurrence + 1);
        const resolved = resolveName(link.name, index, parts);
        links.push({
          pagePath: page.path,
          lineNumber: lineIndex + 1,
          occurrence,
          displayName: link.name,
          normalizedName: normalizeName(link.name),
          resolvedPart: resolved.partName,
          matchMethod: resolved.method,
          candidates: resolved.candidates,
        });
      }
    });

    if (links.length === 0) continue;

    pageRows.push({
      path: page.path,
      title,
      kind,
      referenceCount: links.length,
    });
    references.push(...links);
  }

  pageRows.sort((left, right) => left.path.localeCompare(right.path));
  references.sort(
    (left, right) =>
      left.pagePath.localeCompare(right.pagePath) ||
      left.lineNumber - right.lineNumber ||
      left.occurrence - right.occurrence,
  );

  return { pages: pageRows, references };
}
