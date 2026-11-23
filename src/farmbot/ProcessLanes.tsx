// Hand-built SVG process-lane diagram for one finding.
//
// The geometry and the fitted node text come from `layoutFinding` and its
// text helpers in `./process-lanes.mjs`; this component only draws them.
// Styling is classes plus React attributes (no `<style>` element, no HTML
// strings), so the page keeps `style-src 'self'`. Every node carries `data-`
// attributes for the browser smoke.

import type { MessageKey } from './i18n';
import {
  LABEL_SIZE,
  LANES,
  META_SIZE,
  clip,
  fitMeta,
  layoutFinding,
} from './process-lanes.mjs';
import type { Finding } from './types';

/** Every lane id maps to its label, drawn or not (a missing link points at a hidden lane). */
const LANE_LABEL_KEYS = new Map<string, MessageKey>(
  (LANES as unknown as Array<{ id: string; labelKey: MessageKey }>).map((lane) => [
    lane.id,
    lane.labelKey,
  ]),
);
const LANE_LABEL_ORDER = (LANES as unknown as Array<{ id: string }>).map((lane) => lane.id);

interface DiagramQuantity {
  version: string;
  text: string;
  className: string;
}

interface DiagramNode {
  id: string;
  lane: string;
  role: string;
  evidenceIndexes: number[];
  label: string;
  meta: string;
  problem: boolean;
  pdfOnly: boolean;
  quantities: DiagramQuantity[];
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DiagramEdge {
  from: string;
  to: string;
  kind: 'link' | 'missing';
  onPath: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mx?: number;
}

interface DiagramLane {
  id: string;
  labelKey: MessageKey;
  x: number;
  width: number;
  count: number;
}

interface LaneLayout {
  width: number;
  height: number;
  nodeCap: number;
  lanes: DiagramLane[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  overflow: { count: number; nodeIds: string[] };
}

interface ProcessLanesProps {
  finding: Finding;
  /** Evidence row indexes selected in the finding view. */
  selectedEvidence: readonly number[];
  onSelectEvidence: (evidenceIndexes: number[]) => void;
  t: (key: MessageKey) => string;
}

export function ProcessLanes({
  finding,
  selectedEvidence,
  onSelectEvidence,
  t,
}: ProcessLanesProps) {
  const layout = layoutFinding(finding) as unknown as LaneLayout;
  const selected = new Set(selectedEvidence);

  const isSelected = (node: DiagramNode) =>
    node.evidenceIndexes.some((index) => selected.has(index));

  const laneName = (laneId: string): string => {
    const key = LANE_LABEL_KEYS.get(laneId);
    return key ? t(key) : laneId;
  };

  const nodeLabel = (node: DiagramNode): string => {
    const parts = [
      `${laneName(node.lane)}: ${node.label}`,
      t(node.problem ? 'lanesNodeProblem' : 'lanesNodeNoProblem'),
    ];
    if (node.pdfOnly) parts.push(t('lanesNodePdfOnly'));
    for (const quantity of node.quantities) {
      const variant =
        quantity.version === ''
          ? ''
          : ` (${t('lanesNodeVariant')} ${quantity.version})`;
      parts.push(`${t('lanesNodeQuantity')}: ${quantity.text}${variant}`);
    }
    return parts.join('; ');
  };

  const missingLaneIds = [
    ...new Set(
      layout.edges
        .filter((edge) => edge.kind === 'missing')
        .map((edge) => edge.to.slice(5)),
    ),
  ].sort(
    (left, right) => LANE_LABEL_ORDER.indexOf(left) - LANE_LABEL_ORDER.indexOf(right),
  );

  return (
    // The pane asks the finding-live grid for the layout's natural width, so
    // a five-lane hero renders one to one instead of being scaled into half a
    // column. `min(..., 60vw)` caps the ask on narrower desktop screens so the
    // evidence list keeps its share, and below the 1024px split the pane is
    // already wider than 60vw, which leaves the stacked flow unchanged.
    <section
      className="process-lanes"
      data-testid="process-lanes"
      style={{ minWidth: `min(${layout.width}px, 60vw)` }}
    >
      <h3>{t('processLanesHeading')}</h3>
      <p className="muted small">{t('processLanesHelp')}</p>
      <p className="muted small">{t('lanesSelectHint')}</p>
      <p className="process-lanes-legend">
        <span className="lane-legend-item">
          <span className="lane-legend lane-legend-problem" aria-hidden="true" />
          {t('lanesLegendProblem')}
        </span>
        <span className="lane-legend-item">
          <span className="lane-legend lane-legend-path" aria-hidden="true" />
          {t('lanesLegendPath')}
        </span>
        <span className="lane-legend-item">
          <span className="lane-legend lane-legend-missing" aria-hidden="true" />
          {t('lanesLegendMissing')}
        </span>
        <span className="lane-legend-item">
          <span className="lane-legend lane-legend-quantity" aria-hidden="true">
            +4 −8
          </span>
          {t('lanesLegendQuantity')}
        </span>
      </p>

      {layout.nodes.length === 0 ? (
        <p className="muted small" data-testid="process-lanes-empty">
          {t('lanesEmpty')}
        </p>
      ) : (
        <svg
          className="process-lanes-svg"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          style={{ maxWidth: `${layout.width}px` }}
          role="group"
          aria-label={t('processLanesHeading')}
          data-width={layout.width}
          data-height={layout.height}
        >
          {layout.lanes.map((lane) => (
            <g key={lane.id} className="process-lane" data-testid={`process-lane-${lane.id}`}>
              <rect
                className="process-lane-bg"
                x={lane.x + 1}
                y={2}
                width={lane.width - 2}
                height={layout.height - 4}
                rx={8}
              />
              <text
                className="process-lane-title"
                x={lane.x + lane.width / 2}
                y={16}
                textAnchor="middle"
              >
                {t(lane.labelKey)}
              </text>
            </g>
          ))}

          {layout.edges.map((edge) => {
            const targetLane = edge.to.startsWith('lane:') ? edge.to.slice(5) : null;
            const edgeTitle = targetLane
              ? `${t('lanesMissingTitle')}: ${laneName(targetLane)}`
              : `${edge.from} → ${edge.to}`;
            return (
              <g
                key={`${edge.from}|${edge.to}|${edge.kind}`}
                className={`process-edge process-edge-${edge.kind}${
                  edge.onPath ? ' is-on-path' : ''
                }`}
                data-from={edge.from}
                data-to={edge.to}
                data-kind={edge.kind}
                data-path={edge.onPath ? 'true' : 'false'}
              >
                <title>{edgeTitle}</title>
                {edge.mx === undefined ? (
                  <line
                    className="process-edge-line"
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={edge.x2}
                    y2={edge.y2}
                  />
                ) : (
                  <path
                    className="process-edge-line"
                    d={`M ${edge.x1} ${edge.y1} H ${edge.mx} V ${edge.y2} H ${edge.x2}`}
                  />
                )}
                {edge.kind === 'missing' && (
                  <circle className="process-edge-end" cx={edge.x2} cy={edge.y2} r={3} />
                )}
              </g>
            );
          })}

          {layout.nodes.map((node) => {
            const nodeSelected = isSelected(node);
            return (
              <g
                key={node.id}
                className={`process-node${node.problem ? ' is-problem' : ''}${
                  nodeSelected ? ' is-selected' : ''
                }`}
                data-node-id={node.id}
                data-lane={node.lane}
                data-evidence-index={node.evidenceIndexes.join(',')}
                data-problem={node.problem ? 'true' : 'false'}
                data-selected={nodeSelected ? 'true' : 'false'}
                role="button"
                tabIndex={0}
                aria-label={nodeLabel(node)}
                aria-pressed={nodeSelected}
                onClick={() => onSelectEvidence(node.evidenceIndexes)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectEvidence(node.evidenceIndexes);
                  }
                }}
              >
                <title>
                  {`${node.label} (${node.id})${node.pdfOnly ? `; ${t('lanesNodePdfOnly')}` : ''}`}
                </title>
                <rect
                  className="process-node-box"
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={8}
                />
                <text
                  className="process-node-label"
                  x={node.x + 8}
                  y={node.y + 16}
                >
                  {clip(node.label, node.width, LABEL_SIZE)}
                </text>
                <text className="process-node-meta" x={node.x + 8} y={node.y + 29}>
                  {fitMeta(node.meta, node.width, META_SIZE)}
                </text>
                {node.pdfOnly && node.quantities.length === 0 && (
                  <text
                    className="process-node-meta"
                    x={node.x + 8}
                    y={node.y + 42}
                    data-testid="process-node-pdf-only"
                  >
                    {clip(t('lanesNodePdfOnly'), node.width, META_SIZE)}
                  </text>
                )}
                {node.quantities.map((quantity, index) => (
                  <text
                    key={`${quantity.version}-${index}`}
                    className={`process-node-qty ${quantity.className}`}
                    x={node.x + 8}
                    y={node.y + 42}
                  >
                    {quantity.text}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>
      )}

      {missingLaneIds.length > 0 && (
        <p className="muted small" data-testid="process-lanes-missing">
          {t('lanesMissingList')}{' '}
          {missingLaneIds.map((laneId) => laneName(laneId)).join(' / ')}
        </p>
      )}

      {layout.overflow.count > 0 && (
        <p className="muted small" data-testid="process-lanes-overflow">
          <span className="count">{layout.overflow.count}</span> {t('lanesOverflowNote')}
        </p>
      )}
    </section>
  );
}
