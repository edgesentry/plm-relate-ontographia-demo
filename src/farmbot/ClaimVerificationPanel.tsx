import { useState } from 'react';
import { agentClaims } from './data';

export interface AgentClaimFixture {
  id: string;
  useCase: 'hallucinated-part' | 'wrong-conclusion' | 'missed-change-impact';
  expectedVerdict: 'confirmed' | 'rejected';
  title: string;
  agentAnswer: string;
  claim: Record<string, unknown>;
}

export interface ClaimQueryProvenance {
  intent: string;
  cypher: string;
  params: Record<string, unknown>;
  rowCount: number;
}

export interface ClaimVerdict {
  claimId: string;
  useCase: string;
  verdict: 'confirmed' | 'rejected';
  reasonCode: string;
  summary: string;
  claimed: Record<string, unknown>;
  actual: Record<string, unknown>;
  missing: {
    nodes: string[];
    edges: string[];
  };
  evidence: {
    ruleId: string | null;
    queries: ClaimQueryProvenance[];
  };
}

interface ClaimVerificationPanelProps {
  disabled: boolean;
  onVerify(fixture: AgentClaimFixture): Promise<ClaimVerdict>;
}

const USE_CASE_LABELS: Record<AgentClaimFixture['useCase'], string> = {
  'hallucinated-part': 'Use case 1: Hallucinated part',
  'wrong-conclusion': 'Use case 2: Wrong BOM conclusion (R1)',
  'missed-change-impact': 'Use case 3: Missed change impact (R6)',
};

export function ClaimVerificationPanel({ disabled, onVerify }: ClaimVerificationPanelProps) {
  const fixtures = agentClaims.claims as AgentClaimFixture[];
  const [selectedId, setSelectedId] = useState<string>(fixtures[0]?.id ?? '');
  const [verdict, setVerdict] = useState<ClaimVerdict | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = fixtures.find((item) => item.id === selectedId) ?? fixtures[0];

  const selectClaim = (id: string) => {
    setSelectedId(id);
    setVerdict(null);
    setError(null);
  };

  const runVerification = async () => {
    if (!selected || disabled || running) return;
    setRunning(true);
    setError(null);
    try {
      const next = await onVerify(selected);
      setVerdict(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <details
      className="panel farmbot-claim-verifier"
      data-testid="claim-verifier-panel"
    >
      <summary>
        <h2 id="claim-verifier-heading">Deterministic claim verification</h2>
      </summary>
      <p className="muted small">
        Select a fixed agent claim fixture and verify it outside the agent harness using
        ontology-constrained Intent queries on the in-browser Relate graph.
      </p>

      <div className="chip-list" data-testid="claim-fixture-list">
        {fixtures.map((fixture) => (
          <button
            key={fixture.id}
            type="button"
            className={`chip${fixture.id === selected?.id ? ' is-selected' : ''}`}
            data-testid={`claim-fixture-${fixture.id}`}
            aria-pressed={fixture.id === selected?.id}
            onClick={() => selectClaim(fixture.id)}
          >
            <span className="chip-label">{fixture.title}</span>
            <span className="chip-description">{USE_CASE_LABELS[fixture.useCase]}</span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="claim-preview" data-testid="claim-preview">
          <p className="small">
            <strong>Fixed agent claim:</strong> {selected.agentAnswer}
          </p>
          <div className="farmbot-actions">
            <button
              type="button"
              className="primary"
              data-testid="verify-claim-run"
              disabled={disabled || running}
              onClick={() => void runVerification()}
            >
              {running ? 'Verifying...' : 'Verify claim'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="error-box" data-testid="claim-verifier-error">
          <p>Verification failed:</p>
          <pre>{error}</pre>
        </div>
      )}

      {verdict && (
        <div className="claim-verdict" data-testid="claim-verdict">
          <p className="claim-verdict-head">
            <span
              className={`claim-verdict-badge claim-verdict-${verdict.verdict}`}
              data-testid="claim-verdict-badge"
            >
              {verdict.verdict === 'confirmed' ? 'CONFIRMED' : 'REJECTED'}
            </span>{' '}
            <code data-testid="claim-reason-code">{verdict.reasonCode}</code>
            {verdict.evidence.ruleId && (
              <>
                {' '}
                <span className="muted small" data-testid="claim-rule-id">
                  Rule {verdict.evidence.ruleId}
                </span>
              </>
            )}
          </p>
          <p className="small" data-testid="claim-verdict-summary">
            {verdict.summary}
          </p>

          {(verdict.missing.nodes.length > 0 || verdict.missing.edges.length > 0) && (
            <div className="claim-evidence-block" data-testid="claim-missing-evidence">
              {verdict.missing.nodes.length > 0 && (
                <p className="small">
                  <strong>Missing node:</strong>{' '}
                  <code>{verdict.missing.nodes.join(', ')}</code>
                </p>
              )}
              {verdict.missing.edges.length > 0 && (
                <p className="small">
                  <strong>Missing edge:</strong>{' '}
                  <code>{verdict.missing.edges.join(', ')}</code>
                </p>
              )}
            </div>
          )}

          <div className="claim-evidence-grid" data-testid="claim-actual-evidence">
            <div>
              <h3 className="small">Claimed</h3>
              <pre>{JSON.stringify(verdict.claimed, null, 2)}</pre>
            </div>
            <div>
              <h3 className="small">Actual graph evidence</h3>
              <pre>{JSON.stringify(verdict.actual, null, 2)}</pre>
            </div>
          </div>

          <details className="claim-queries" data-testid="claim-queries">
            <summary className="muted small">
              Executed Intent queries ({verdict.evidence.queries.length})
            </summary>
            {verdict.evidence.queries.map((entry) => (
              <div key={entry.intent} className="claim-query-item">
                <p className="small">
                  <code>{entry.intent}</code> ({entry.rowCount} rows)
                </p>
                <pre>{entry.cypher}</pre>
                {Object.keys(entry.params).length > 0 && (
                  <pre>{JSON.stringify(entry.params, null, 2)}</pre>
                )}
              </div>
            ))}
          </details>
        </div>
      )}
    </details>
  );
}
