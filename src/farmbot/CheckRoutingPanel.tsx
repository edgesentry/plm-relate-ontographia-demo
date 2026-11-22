import { useEffect, useRef, useState } from 'react';
import type { Ontographia } from '../lib/ontographia';
import { CheckFreeTextPanel, type CheckFreeTextPhase } from './CheckFreeTextPanel';
import { CHECK_CATALOG } from './check-catalog.mjs';
import { prepareCheckProposal } from './check-routing.mjs';
import { loadCheckRoutingModel, type LoadedCheckModel } from './check-webllm';
import { REJECTED_ROUTING_DEMO_TEXT } from './rejection-demo.mjs';
import { allowedValues, checkIntents, farmbotOntology } from './data';
import type { MessageKey } from './i18n';
import type {
  CheckId,
  CheckPanelError,
  CheckPreparation,
  CheckProposal,
  CheckRunResult,
  CheckRouting,
} from './check-routing-types';

interface CheckRoutingPanelProps {
  engine: Ontographia | null;
  disabled: boolean;
  onRun(proposal: CheckProposal): Promise<CheckRunResult>;
  t(key: MessageKey): string;
}

type GpuLike = { requestAdapter(): Promise<unknown> };

const CHECK_LABEL_KEYS: Record<CheckId, MessageKey> = {
  R1: 'checkR1Label',
  R2: 'checkR2Label',
  R3: 'checkR3Label',
  R4: 'checkR4Label',
  R5: 'checkR5Label',
  R6: 'checkR6Label',
  R7: 'checkR7Label',
  R8: 'checkR8Label',
  R9: 'checkR9Label',
};

function detailText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function detectWebGpu(): Promise<boolean> {
  const gpu = (navigator as unknown as { gpu?: GpuLike }).gpu;
  if (!gpu || typeof gpu.requestAdapter !== 'function') return false;
  try {
    return Boolean(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

function domainValues(domain: string): string[] {
  const values = (allowedValues as unknown as Record<string, unknown>)[domain];
  return Array.isArray(values) ? (values as string[]) : [];
}

function initialParameters(): Partial<Record<CheckId, string>> {
  const values: Partial<Record<CheckId, string>> = {};
  for (const check of CHECK_CATALOG) {
    if (!check.parameter) continue;
    const [first] = domainValues(check.parameter.domain);
    if (typeof first === 'string') values[check.id as CheckId] = first;
  }
  return values;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function CheckRoutingPanel({ engine, disabled, onRun, t }: CheckRoutingPanelProps) {
  const [selectedCheck, setSelectedCheck] = useState<CheckId>('R1');
  const [parameters, setParameters] =
    useState<Partial<Record<CheckId, string>>>(initialParameters);
  const [proposal, setProposal] = useState<CheckProposal | null>(null);
  const [result, setResult] = useState<CheckRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<CheckPanelError | null>(null);
  const [phase, setPhase] = useState<CheckFreeTextPhase>('checking');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [notice, setNotice] = useState<'cancelled' | null>(null);
  const [text, setText] = useState('');
  const [debug, setDebug] = useState({ compileAttempts: 0, runs: 0 });

  const modelRef = useRef<LoadedCheckModel | null>(null);
  const modelAbortRef = useRef<AbortController | null>(null);
  const modelLoadToken = useRef(0);
  const generationToken = useRef(0);
  const runToken = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void detectWebGpu().then((supported) => {
      if (!cancelled) setPhase(supported ? 'consent' : 'unsupported');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      modelLoadToken.current += 1;
      generationToken.current += 1;
      modelAbortRef.current?.abort();
      if (modelRef.current) void modelRef.current.unload();
      modelRef.current = null;
    },
    [],
  );

  const prepare = (routing: CheckRouting): boolean => {
    runToken.current += 1;
    setRunning(false);
    setResult(null);
    setProposal(null);
    setError(null);
    setNotice(null);
    const prepared = prepareCheckProposal(routing, {
      allowedValues,
      checkIntents,
      compiler: engine,
      ontology: farmbotOntology,
    }) as CheckPreparation;
    setDebug((current) => ({
      ...current,
      compileAttempts:
        current.compileAttempts + (prepared.ok || prepared.stage === 'compile' ? 1 : 0),
    }));
    if (!prepared.ok) {
      setError({
        kind: prepared.stage === 'compile' ? 'compile' : 'validation',
        detail: prepared.errors.join('\n'),
      });
      return false;
    }
    setProposal(prepared.proposal);
    return true;
  };

  const routingForChip = (id: CheckId, parameterValue?: string): CheckRouting => {
    const check = CHECK_CATALOG.find((entry) => entry.id === id);
    if (!check) throw new Error(`unknown check ${id}`);
    return {
      check: id,
      parameter:
        check.parameter && parameterValue
          ? { domain: check.parameter.domain, value: parameterValue }
          : null,
    };
  };

  const selectChip = (id: CheckId) => {
    if (!engine || disabled) return;
    generationToken.current += 1;
    if (phase === 'generating') setPhase('ready');
    setSelectedCheck(id);
    prepare(routingForChip(id, parameters[id]));
  };

  const selectParameter = (value: string) => {
    if (!engine || disabled) return;
    const next = { ...parameters, [selectedCheck]: value };
    setParameters(next);
    prepare(routingForChip(selectedCheck, value));
  };

  const loadModel = () => {
    modelAbortRef.current?.abort();
    const token = modelLoadToken.current + 1;
    modelLoadToken.current = token;
    const abort = new AbortController();
    modelAbortRef.current = abort;
    setPhase('loading');
    setProgress(0);
    setProgressText('');
    setNotice(null);
    setError(null);
    setProposal(null);

    void loadCheckRoutingModel({
      signal: abort.signal,
      onProgress: (report) => {
        if (modelLoadToken.current !== token) return;
        setProgress(report.progress);
        setProgressText(report.text);
      },
    }).then(
      (model) => {
        if (modelLoadToken.current !== token || abort.signal.aborted) {
          void model.unload();
          return;
        }
        const previous = modelRef.current;
        modelRef.current = model;
        if (previous) void previous.unload();
        setProgress(1);
        setPhase('ready');
      },
      (loadError: unknown) => {
        if (modelLoadToken.current !== token) return;
        if (abort.signal.aborted) {
          setPhase('consent');
          setNotice('cancelled');
          return;
        }
        setPhase('error');
        setError({ kind: 'load', detail: detailText(loadError) });
      },
    );
  };

  const cancelModelLoad = () => {
    modelLoadToken.current += 1;
    modelAbortRef.current?.abort();
    modelAbortRef.current = null;
    setProgress(0);
    setProgressText('');
    setPhase('consent');
    setNotice('cancelled');
  };

  const declineConsent = () => {
    setPhase('declined');
    setError(null);
    setProposal(null);
  };

  const convert = async () => {
    const model = modelRef.current;
    const trimmed = text.trim();
    if (!model || !engine || !trimmed || phase !== 'ready') return;
    const token = generationToken.current + 1;
    generationToken.current = token;
    setPhase('generating');
    setError(null);
    setNotice(null);
    setProposal(null);
    setResult(null);

    let output: string;
    try {
      output = await model.generate(trimmed);
    } catch (generateError) {
      if (generationToken.current !== token) return;
      setPhase('ready');
      setError({ kind: 'generate', detail: detailText(generateError) });
      return;
    }
    if (generationToken.current !== token) return;
    setPhase('ready');
    // Raw model text enters exactly the same validator, expansion and compile
    // helper as a routing object constructed by a chip.
    runToken.current += 1;
    const prepared = prepareCheckProposal(output, {
      allowedValues,
      checkIntents,
      compiler: engine,
      ontology: farmbotOntology,
    }) as CheckPreparation;
    setDebug((current) => ({
      ...current,
      compileAttempts:
        current.compileAttempts + (prepared.ok || prepared.stage === 'compile' ? 1 : 0),
    }));
    if (!prepared.ok) {
      setError({
        kind: prepared.stage === 'compile' ? 'compile' : 'validation',
        detail: prepared.errors.join('\n'),
      });
      return;
    }
    setProposal(prepared.proposal);
  };

  // The fixed sample takes the same validator path as raw model text. Validation
  // fails before the compiler, so this works even when engine is null; no model
  // state, consent state or phase is touched.
  const showRejectionDemo = () => {
    generationToken.current += 1;
    runToken.current += 1;
    setRunning(false);
    setResult(null);
    setProposal(null);
    setNotice(null);
    setError(null);
    const prepared = prepareCheckProposal(REJECTED_ROUTING_DEMO_TEXT, {
      allowedValues,
      checkIntents,
      compiler: engine,
      ontology: farmbotOntology,
    }) as CheckPreparation;
    setDebug((current) => ({
      ...current,
      compileAttempts:
        current.compileAttempts + (prepared.ok || prepared.stage === 'compile' ? 1 : 0),
    }));
    if (prepared.ok) {
      setError({
        kind: 'validation',
        detail: 'The rejection demonstration fixture was unexpectedly accepted.',
        sample: REJECTED_ROUTING_DEMO_TEXT,
      });
      return;
    }
    setError({
      kind: 'validation',
      detail: prepared.errors.join('\n'),
      sample: REJECTED_ROUTING_DEMO_TEXT,
    });
  };

  const runProposal = async () => {
    const current = proposal;
    if (!current || running || disabled) return;
    const token = runToken.current + 1;
    runToken.current = token;
    setRunning(true);
    setError(null);
    try {
      const executed = await onRun(current);
      if (runToken.current !== token) return;
      setResult(executed);
      setProposal(null);
      setDebug((currentDebug) => ({ ...currentDebug, runs: currentDebug.runs + 1 }));
    } catch (executeError) {
      if (runToken.current !== token) return;
      setProposal(null);
      setError({ kind: 'execute', detail: detailText(executeError) });
    } finally {
      if (runToken.current === token) setRunning(false);
    }
  };

  const selected = CHECK_CATALOG.find((check) => check.id === selectedCheck) ?? CHECK_CATALOG[0];
  const parameterValues = selected.parameter ? domainValues(selected.parameter.domain) : [];
  const convertDisabled =
    !modelRef.current || phase !== 'ready' || !engine || disabled || text.trim().length === 0;

  return (
    <section className="panel farmbot-check-routing" aria-labelledby="check-routing-heading">
      <h2 id="check-routing-heading">{t('checkRoutingHeading')}</h2>
      <p className="muted small">{t('checkRoutingIntro')}</p>
      <div hidden data-testid="farmbot-check-routing-debug">
        {JSON.stringify(debug)}
      </div>

      <div className="chip-list" aria-label={t('checkChipListLabel')}>
        {CHECK_CATALOG.map((check) => (
          <button
            key={check.id}
            type="button"
            className={`chip${check.id === selectedCheck ? ' is-selected' : ''}`}
            data-testid={`check-chip-${check.id}`}
            aria-pressed={check.id === selectedCheck}
            disabled={!engine || disabled}
            onClick={() => selectChip(check.id as CheckId)}
          >
            <span className="chip-label">{t(CHECK_LABEL_KEYS[check.id as CheckId])}</span>
          </button>
        ))}
      </div>

      {selected.parameter && (
        <label className="farmbot-selector">
          <span>{t('checkParameterLabel')}</span>
          <select
            data-testid="check-parameter"
            value={parameters[selectedCheck] ?? ''}
            disabled={!engine || disabled}
            onChange={(event) => selectParameter(event.target.value)}
          >
            {parameterValues.map((value: string) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <span className="muted small">{t('selectorHint')}</span>
        </label>
      )}

      <CheckFreeTextPanel
        phase={phase}
        progress={progress}
        progressText={progressText}
        notice={notice}
        error={error}
        value={text}
        convertDisabled={convertDisabled}
        onValueChange={setText}
        onConsent={loadModel}
        onDecline={declineConsent}
        onReviewConsent={() => setPhase('consent')}
        onLoad={loadModel}
        onCancelLoad={cancelModelLoad}
        onConvert={() => void convert()}
        onShowRejectionDemo={showRejectionDemo}
        t={t}
      />

      {proposal && (
        <div className="proposal-box" data-testid="farmbot-check-proposal">
          <h3>{t('checkProposalHeading')}</h3>
          <dl className="farmbot-meta">
            <div>
              <dt>{t('checkProposalCheck')}</dt>
              <dd>{t(CHECK_LABEL_KEYS[proposal.routing.check])}</dd>
            </div>
            <div>
              <dt>{t('checkProposalParameter')}</dt>
              <dd>
                <code>
                  {proposal.routing.parameter
                    ? JSON.stringify(proposal.routing.parameter)
                    : t('checkNoParameter')}
                </code>
              </dd>
            </div>
          </dl>
          <pre data-testid="farmbot-check-proposal-routing">
            {JSON.stringify(proposal.routing, null, 2)}
          </pre>
          <h4>{t('checkProposalIntents')}</h4>
          <pre data-testid="farmbot-check-proposal-intents">
            {JSON.stringify(
              proposal.intents.map(({ file, intent }) => ({ file, intent })),
              null,
              2,
            )}
          </pre>
          <div data-testid="farmbot-check-proposal-path">
            {proposal.intents.map((entry) => (
              <p className="muted small" key={entry.file}>
                <code>{entry.file}</code>: {entry.path}
              </p>
            ))}
          </div>
          <div className="farmbot-actions">
            <button
              type="button"
              className="primary"
              data-testid="farmbot-check-proposal-run"
              disabled={running || disabled}
              onClick={() => void runProposal()}
            >
              {running ? t('running') : t('checkRunProposal')}
            </button>
            <button
              type="button"
              data-testid="farmbot-check-proposal-cancel"
              disabled={running}
              onClick={() => {
                runToken.current += 1;
                setProposal(null);
              }}
            >
              {t('checkCancelProposal')}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="farmbot-check-result" data-testid="farmbot-check-result">
          <h3>{t('checkResultHeading')}</h3>
          <p className="muted small">{t('checkResultNote')}</p>
          <p className="note small" data-testid="check-result-hint">
            {t('checkResultHint')}
          </p>
          <p className="muted small">
            {t('receivedDigestLabel')}: <code>{result.digest}</code>
          </p>
          <pre data-testid="farmbot-check-result-routing">
            {JSON.stringify(result.proposal.routing, null, 2)}
          </pre>
          {result.intents.map((entry) => (
            <section key={entry.file} data-testid={`check-query-result-${entry.file}`}>
              <h4>
                <code>{entry.file}</code>
              </h4>
              <details>
                <summary>{t('checkProposalIntents')}</summary>
                <pre>{JSON.stringify(entry.intent, null, 2)}</pre>
                <pre>{entry.cypher}</pre>
                <pre>{JSON.stringify(entry.params, null, 2)}</pre>
              </details>
              <p>
                {t('rowsHeading')} <span className="count">{entry.rows.length}</span>
              </p>
              {entry.rows.length === 0 ? (
                <p className="no-matches">{t('noRows')}</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {entry.columns.map((column) => (
                          <th key={column} scope="col">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {entry.rows.map((row, index) => (
                        <tr key={index}>
                          {entry.columns.map((column) => (
                            <td key={column}>{cellText(row[column])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
