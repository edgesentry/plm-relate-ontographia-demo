import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { CheckRoutingPanel } from './CheckRoutingPanel';
import type {
  CheckProposal,
  CheckRunResult,
  ExecutedCheckIntent,
} from './check-routing-types';
import { messages, type Lang, type MessageKey } from './i18n';
import {
  allowedValues,
  checkIntents,
  COMMITTED_FINDINGS_DIGEST,
  defaultFilterValue,
  farmbotOntology,
  intents,
  partSources,
  questions,
  SOURCE_PIN,
} from './data';
import { canonicalJson } from './agent/canonical.mjs';
import { collectFindings } from './agent/index.mjs';
import { findingSelection } from './finding-selection.mjs';
import {
  countBySeverity,
  findingCauses,
  findingCountermeasures,
  orderFindings,
  parseFindingHash,
  splitEvidenceQueries,
  summaryLine,
  visibleFindings,
} from './findings-view.mjs';
import { planQuestion } from './plan.mjs';
import { ProcessLanes } from './ProcessLanes';
import { orderEvidenceRows } from './process-lanes.mjs';
import { reconciliationCategoryKey } from './reconciliation.mjs';
import { SAMPLE_NOTIFICATIONS } from './sample-notifications.mjs';
import { formatSeedDigest, SEED_DIGEST, sha256Hex } from './seed-digest.mjs';
import {
  STORE_DIGEST,
  STORE_NODES,
  STORE_RELATIONSHIPS,
} from './store-digest.mjs';
import { SeedFetchError, SeedRejectedError } from './seed';
import { openRelateSession, RelateTrapError, type SessionStep } from './session';
import { closeTrappedSession } from './session-cleanup.mjs';
import { loadOntographia, type Ontographia } from '../lib/ontographia';
import type {
  Finding,
  FindingQuery,
  FindingSeverity,
  FindingsDocument,
  Intent,
  QuestionId,
  QuestionPlan,
  RelateEnvelope,
  RelateSession,
  SelectorDomain,
} from './types';

type EngineState =
  | { status: 'loading' }
  | { status: 'ready'; engine: Ontographia }
  | { status: 'error'; detail: string };

type RelateState =
  | { status: 'idle' }
  | { status: 'loading'; step: SessionStep }
  | { status: 'ready'; digest: string; byteLength: number; statements: number }
  | { status: 'trapped' };

type ScreenError =
  | { kind: 'compile'; detail: string }
  | { kind: 'seed-fetch'; detail: string }
  | { kind: 'seed-digest'; expected: string; actual: string }
  | { kind: 'relate-load'; detail: string }
  | { kind: 'relate-query'; detail: string }
  | { kind: 'wasm-trap'; detail: string }
  | { kind: 'limit'; limit: number; rows: number };

interface RunResult {
  questionId: QuestionId;
  intent: Intent;
  executed: string;
  params: Record<string, unknown>;
  distinctApplied: boolean;
  columns: string[];
  rows: Record<string, unknown>[];
  digest: string;
}

type SeverityCounts = Record<FindingSeverity, number>;

interface ChecksResult {
  findings: Finding[];
  count: number;
  bySeverity: SeverityCounts;
  digest: string;
  matches: boolean;
  ms: number;
}

type ChecksState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ready'; result: ChecksResult }
  | { status: 'error'; detail: string };

/** Engine timings read by the browser smoke; milliseconds from `performance`. */
interface ScreenTimings {
  seedLoadMs: number | null;
  queries: Partial<Record<QuestionId, number>>;
  checks?: {
    ms: number;
    count: number;
    ids: string[];
    bySeverity: SeverityCounts;
    digest: string;
    expectedDigest: string;
    matches: boolean;
  };
}

const SEVERITY_LEVELS: readonly FindingSeverity[] = ['action', 'review', 'info'];

const SEVERITY_LABEL_KEYS: Record<FindingSeverity, MessageKey> = {
  action: 'severityAction',
  review: 'severityReview',
  info: 'severityInfo',
};

const QUESTION_LABEL_KEYS: Record<QuestionId, MessageKey> = {
  q1: 'q1Label',
  q2: 'q2Label',
  q3: 'q3Label',
  q4: 'q4Label',
  q5: 'q5Label',
};

const QUESTION_TEXT_KEYS: Record<QuestionId, MessageKey> = {
  q1: 'q1Question',
  q2: 'q2Question',
  q3: 'q3Question',
  q4: 'q4Question',
  q5: 'q5Question',
};

const SELECTOR_LABEL_KEYS: Record<SelectorDomain, MessageKey> = {
  part_names_in_assembly_chapters: 'selectorPart',
  part_names_in_all_three_structure_kinds: 'selectorPart',
  category_slugs_in_kits: 'selectorCategory',
};

/** Localized rule label per check id, reused by the sample email cards. */
const CHECK_RULE_LABEL_KEYS: Record<string, MessageKey> = {
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

const ERROR_MESSAGE_KEYS: Record<ScreenError['kind'], MessageKey> = {
  compile: 'compileError',
  'seed-fetch': 'seedFetchError',
  'seed-digest': 'seedDigestError',
  'relate-load': 'relateLoadError',
  'relate-query': 'relateQueryError',
  'wasm-trap': 'wasmTrapError',
  limit: 'limitError',
};

function detailText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function initialFilterValues(): Record<QuestionId, string | null> {
  const values: Record<QuestionId, string | null> = {
    q1: null,
    q2: null,
    q3: null,
    q4: null,
    q5: null,
  };
  for (const question of questions) {
    values[question.id] = defaultFilterValue(intents[question.id]);
  }
  return values;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function App() {
  const [lang, setLang] = useState<Lang>(() =>
    navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en',
  );
  const [engine, setEngine] = useState<EngineState>({ status: 'loading' });
  const [relate, setRelate] = useState<RelateState>({ status: 'idle' });
  const [selectedId, setSelectedId] = useState<QuestionId>('q1');
  const [filterValues, setFilterValues] =
    useState<Record<QuestionId, string | null>>(initialFilterValues);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<ScreenError | null>(null);
  const [timings, setTimings] = useState<ScreenTimings>({
    seedLoadMs: null,
    queries: {},
  });
  const [checks, setChecks] = useState<ChecksState>({ status: 'idle' });
  const [initialFindingId] = useState<string | null>(() =>
    parseFindingHash(window.location.hash),
  );
  // The last well-formed finding id that arrived by a same-page hash change
  // after load, such as a sample-email link clicked on an idle screen.
  const [findingHashId, setFindingHashId] = useState<string | null>(null);
  const [showInfoFindings, setShowInfoFindings] = useState(false);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(
    initialFindingId,
  );
  const [selectedEvidence, dispatchFindingSelection] = useReducer(findingSelection, []);
  const [hashRevealCount, setHashRevealCount] = useState(0);
  const evidenceRowRefs = useRef<Map<number, HTMLLIElement | null>>(new Map());

  const pendingRevealRef = useRef<string | null>(initialFindingId);
  // The finding id whose hash reveal still owes a scroll of the finding view.
  const pendingScrollRef = useRef<string | null>(null);
  const sessionRef = useRef<RelateSession | null>(null);
  const sessionPromise = useRef<Promise<RelateSession> | null>(null);
  const trappedRef = useRef(false);
  const runToken = useRef(0);
  const timingMarkId = useRef(0);
  const checksRunningRef = useRef(false);
  const autoChecksRef = useRef(false);

  // Marks around the engine work only: seed fetch/digest/load for the session,
  // and `session.execute` for a query. React render time is outside both.
  const startTiming = (prefix: string): string => {
    timingMarkId.current += 1;
    const markName = `${prefix}:start:${timingMarkId.current}`;
    performance.mark(markName);
    return markName;
  };

  const finishTiming = (prefix: string, startMark: string): number => {
    timingMarkId.current += 1;
    const endMark = `${prefix}:end:${timingMarkId.current}`;
    performance.mark(endMark);
    return performance.measure(prefix, startMark, endMark).duration;
  };

  const t = (key: MessageKey) => messages[lang][key];

  // The Ontographia engine is loaded after first paint so the first painted
  // frame of /farmbot/ stays free of WASM fetches.
  useEffect(() => {
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      loadOntographia().then(
        (loaded) => {
          if (!cancelled) setEngine({ status: 'ready', engine: loaded });
        },
        (loadError: unknown) => {
          if (!cancelled) setEngine({ status: 'error', detail: detailText(loadError) });
        },
      );
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = messages[lang].title;
  }, [lang]);

  useEffect(
    () => () => {
      sessionRef.current?.close();
      sessionRef.current = null;
    },
    [],
  );

  const question = questions.find((candidate) => candidate.id === selectedId) ?? questions[0];
  const selectorValue = question.selector
    ? (filterValues[question.id] ?? defaultFilterValue(intents[question.id]) ?? '')
    : null;
  const selectorOptions = useMemo(
    () => (question.selector ? allowedValues[question.selector] : []),
    [question.selector],
  );

  const clearRun = () => {
    runToken.current += 1;
    setResult(null);
    setError(null);
  };

  const selectQuestion = (id: QuestionId) => {
    if (id === selectedId) return;
    setSelectedId(id);
    clearRun();
  };

  const selectFilterValue = (value: string) => {
    setFilterValues((current) => ({ ...current, [question.id]: value }));
    clearRun();
  };

  const ensureSession = (): Promise<RelateSession> => {
    if (sessionRef.current) return Promise.resolve(sessionRef.current);
    if (trappedRef.current) {
      return Promise.reject(new Error('Relate trapped; reload the page to continue.'));
    }
    if (!sessionPromise.current) {
      setRelate({ status: 'loading', step: 'seed' });
      const seedLoadMark = startTiming('farmbot:seed-load');
      sessionPromise.current = openRelateSession((step) =>
        setRelate({ status: 'loading', step }),
      )
        .then((session) => {
          const seedLoadMs = finishTiming('farmbot:seed-load', seedLoadMark);
          setTimings((current) => ({ ...current, seedLoadMs }));
          sessionRef.current = session;
          setRelate({
            status: 'ready',
            digest: session.digest,
            byteLength: session.byteLength,
            statements: session.statements,
          });
          return session;
        })
        .catch((openError: unknown) => {
          sessionPromise.current = null;
          setRelate({ status: 'idle' });
          throw openError;
        });
    }
    return sessionPromise.current;
  };

  /**
   * Discard a trapped session and move the panel into the trapped state. The
   * caller chooses which error box reports the trap: the question panel and
   * the checks panel keep separate error state.
   */
  const trapSession = (
    session: RelateSession,
    trapError: unknown,
    report: (trap: ScreenError) => void,
  ) => {
    closeTrappedSession(session, trapError, (trap) => {
      sessionRef.current = null;
      sessionPromise.current = null;
      trappedRef.current = true;
      setRelate({ status: 'trapped' });
      report(trap);
    });
  };

  /**
   * Map a failure to open the session onto a screen error. A trap also moves the
   * panel into the trapped state; the caller decides which banner shows the
   * result.
   */
  const sessionFailure = (openError: unknown): ScreenError => {
    if (openError instanceof SeedRejectedError) {
      return {
        kind: 'seed-digest',
        expected: SEED_DIGEST,
        actual: formatSeedDigest(openError.actualHex),
      };
    }
    if (openError instanceof SeedFetchError) {
      return { kind: 'seed-fetch', detail: openError.message };
    }
    if (openError instanceof RelateTrapError) {
      trappedRef.current = true;
      sessionPromise.current = null;
      setRelate({ status: 'trapped' });
      return { kind: 'wasm-trap', detail: openError.message };
    }
    if (trappedRef.current) {
      return { kind: 'wasm-trap', detail: detailText(openError) };
    }
    return { kind: 'relate-load', detail: detailText(openError) };
  };

  const run = async () => {
    if (engine.status !== 'ready' || running) return;
    const questionToRun = question;
    const intent: Intent = structuredClone(intents[questionToRun.id]);
    if (questionToRun.selector) {
      const value = filterValues[questionToRun.id] ?? defaultFilterValue(intents[questionToRun.id]);
      if (intent.filter?.[0] && value !== null) intent.filter[0].value = value;
    }

    const token = runToken.current + 1;
    runToken.current = token;
    setRunning(true);
    setResult(null);
    setError(null);

    try {
      let plan: QuestionPlan;
      try {
        plan = planQuestion(engine.engine, farmbotOntology, intent, questionToRun.distinct);
      } catch (compileError) {
        setError({ kind: 'compile', detail: detailText(compileError) });
        return;
      }

      let session: RelateSession;
      try {
        session = await ensureSession();
      } catch (openError) {
        if (runToken.current !== token) return;
        setError(sessionFailure(openError));
        return;
      }
      if (runToken.current !== token) return;

      let envelope: RelateEnvelope;
      const queryPrefix = `farmbot:query:${questionToRun.id}`;
      const queryMark = startTiming(queryPrefix);
      try {
        envelope = session.execute(plan.executed, plan.params);
      } catch (executeError) {
        finishTiming(queryPrefix, queryMark);
        if (session.isTrap(executeError)) {
          trapSession(session, executeError, setError);
        } else {
          setError({ kind: 'relate-query', detail: detailText(executeError) });
        }
        return;
      }
      const queryMs = finishTiming(queryPrefix, queryMark);
      setTimings((current) => ({
        ...current,
        queries: { ...current.queries, [questionToRun.id]: queryMs },
      }));

      if (envelope.error) {
        setError({ kind: 'relate-query', detail: envelope.error });
        return;
      }

      const rows = envelope.rows ?? [];
      if (rows.length >= intent.limit) {
        setError({ kind: 'limit', limit: intent.limit, rows: rows.length });
        return;
      }

      setResult({
        questionId: questionToRun.id,
        intent,
        executed: plan.executed,
        params: plan.params,
        distinctApplied: plan.distinctApplied,
        columns: envelope.columns ?? intent.return.map((entry) => entry.as_name),
        rows,
        digest: session.digest,
      });
    } finally {
      setRunning(false);
    }
  };

  // Free-text and rule-chip proposals share this confirmed execution boundary.
  // They execute their own compiled Intents, never the findings collector.
  const runConfirmedCheck = async (proposal: CheckProposal): Promise<CheckRunResult> => {
    let session: RelateSession;
    try {
      session = await ensureSession();
    } catch (openError) {
      sessionFailure(openError);
      throw openError;
    }

    const executed: ExecutedCheckIntent[] = [];
    for (const entry of proposal.intents) {
      let envelope: RelateEnvelope;
      try {
        envelope = session.execute(entry.cypher, entry.params);
      } catch (executeError) {
        if (session.isTrap(executeError)) trapSession(session, executeError, () => {});
        throw executeError;
      }
      if (envelope.error) throw new Error(envelope.error);
      const rows = envelope.rows ?? [];
      if (rows.length >= entry.intent.limit) {
        throw new Error(
          `${entry.file} reached its Intent limit ${entry.intent.limit}; rows are not shown`,
        );
      }
      executed.push({
        ...entry,
        columns: envelope.columns ?? entry.intent.return.map((item) => item.as_name),
        rows,
      });
    }
    return { proposal, intents: executed, digest: session.digest };
  };

  /**
   * Run every check Intent in this tab. The caller supplies the compiled
   * ontology, the committed check Intents, the committed part page paths, the
   * verified seed digest and the same Relate session the questions use.
   */
  const runChecks = async () => {
    if (engine.status !== 'ready' || checksRunningRef.current) return;
    const checkEngine = engine.engine;
    checksRunningRef.current = true;
    // Any started checks satisfy the deep-link auto-run, so a later
    // `#finding=` hash change cannot start a second run after a manual one.
    autoChecksRef.current = true;
    // Checks own `checks`; a preset-question error stays visible in its own box.
    setChecks({ status: 'running' });

    try {
      let session: RelateSession;
      try {
        session = await ensureSession();
      } catch (openError) {
        // Keep trap handling, but report only through the checks box.
        sessionFailure(openError);
        setChecks({ status: 'error', detail: detailText(openError) });
        return;
      }

      const mark = startTiming('farmbot:checks');
      let document: FindingsDocument;
      try {
        document = collectFindings({
          engine: checkEngine,
          ontology: farmbotOntology,
          checks: checkIntents,
          sources: partSources.sources,
          seed: { digest: session.digest, bytes: session.byteLength },
          execute(query: string, params: Record<string, unknown>) {
            const envelope = session.execute(query, params);
            if (envelope.error) throw new Error(envelope.error);
            return envelope.rows ?? [];
          },
        }) as unknown as FindingsDocument;
      } catch (checkError) {
        finishTiming('farmbot:checks', mark);
        if (session.isTrap(checkError)) {
          // Quarantine the trapped session; the checks box reports the failure.
          trapSession(session, checkError, () => {});
        }
        setChecks({ status: 'error', detail: detailText(checkError) });
        return;
      }
      const ms = finishTiming('farmbot:checks', mark);

      // The committed document is not bundled; its sidecar digest is. A match
      // means the browser produced the same canonical bytes.
      const hex = await sha256Hex(new TextEncoder().encode(canonicalJson(document)));
      const digest = `farmbot-findings-v1 sha256:${hex}`;
      const findings = orderFindings(document.findings) as Finding[];
      const counts = countBySeverity(document.findings);
      const bySeverity: SeverityCounts = {
        action: counts.action,
        review: counts.review,
        info: counts.info,
      };
      const matches = hex === COMMITTED_FINDINGS_DIGEST;

      setChecks({
        status: 'ready',
        result: { findings, count: findings.length, bySeverity, digest, matches, ms },
      });
      setTimings((current) => ({
        ...current,
        checks: {
          ms,
          count: findings.length,
          ids: findings.map((finding) => finding.id),
          bySeverity,
          digest,
          expectedDigest: `farmbot-findings-v1 sha256:${COMMITTED_FINDINGS_DIGEST}`,
          matches,
        },
      }));
    } finally {
      checksRunningRef.current = false;
    }
  };

  // A well-formed deep link runs the checks once, after the engine is ready.
  // The hash can be present at load or arrive later on the same page: a click
  // on a sample-email link only changes the hash, so both paths land here.
  // `runChecks` itself latches `autoChecksRef`, so checks that already started
  // — by this effect or by a manual Run checks — are never started twice.
  // Any other hash does nothing: no session, no request, no error.
  useEffect(() => {
    if (autoChecksRef.current) return;
    if (engine.status !== 'ready') return;
    if (initialFindingId === null && findingHashId === null) return;
    autoChecksRef.current = true;
    void runChecks();
  }, [engine.status, initialFindingId, findingHashId]);

  // After load, a hash change opens the matching finding when it is available.
  // Malformed hashes and other keys are ignored. Each valid finding hash is its
  // own reveal event, even when it repeats the id that is already selected.
  useEffect(() => {
    const onHashChange = () => {
      const id = parseFindingHash(window.location.hash);
      if (id === null) return;
      pendingRevealRef.current = id;
      setSelectedFindingId(id);
      setFindingHashId(id);
      setHashRevealCount((current) => current + 1);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // A finding opened from the URL hash must be visible: adjust the filter just
  // enough for its severity to appear. The pending id is consumed once, so a
  // manual toggle is not overridden. `hashRevealCount` keys the effect on the
  // hash events themselves, so a return to the same id still reveals its row.
  useEffect(() => {
    const id = pendingRevealRef.current;
    if (id === null || checks.status !== 'ready') return;
    pendingRevealRef.current = null;
    const finding = checks.result.findings.find((candidate) => candidate.id === id);
    if (!finding) return;
    // The view for this finding renders in the same commit; one scroll of it
    // is owed once the info filter has settled.
    pendingScrollRef.current = id;
    if (finding.severity === 'info') setShowInfoFindings(true);
  }, [checks, hashRevealCount]);

  // A hash-revealed finding usually renders below the fold, under the sample
  // cards, the questions, the check routing panel and the findings list, so
  // scroll the rendered view into the viewport. An info reveal waits for the
  // filter the reveal just turned on, so the added rows cannot push the view
  // out of place, and `prefers-reduced-motion` selects an instant scroll.
  useEffect(() => {
    const id = pendingScrollRef.current;
    if (id === null || checks.status !== 'ready') return;
    const finding = checks.result.findings.find((candidate) => candidate.id === id);
    if (!finding) {
      pendingScrollRef.current = null;
      return;
    }
    if (finding.severity === 'info' && !showInfoFindings) return;
    pendingScrollRef.current = null;
    const view = document.querySelector('[data-testid="finding-view"]');
    if (!(view instanceof HTMLElement)) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    view.scrollIntoView({ block: 'start', behavior: reduced ? 'instant' : 'smooth' });
  }, [checks, hashRevealCount, showInfoFindings]);

  const openFinding = (id: string) => {
    setSelectedFindingId(id);
    // replaceState updates the address without a navigation request.
    window.history.replaceState(null, '', `#finding=${id}`);
  };

  /**
   * The diagram and the evidence table share one selection: a list of evidence
   * row indexes. A node selects every row it represents; a row selects the node
   * that represents it. The first selected row is scrolled into view and
   * focused so a keyboard reader lands on it; a selection made inside the table
   * leaves the focus where the user put it. When a tall diagram gives the
   * sticky lane pane a scrollbar of its own, the selected node is brought into
   * the pane first, so the highlight stays in the same frame as the control.
   */
  const selectEvidence = (indexes: number[], options: { focusRow?: boolean } = {}) => {
    dispatchFindingSelection({ type: 'select', indexes });
    requestAnimationFrame(() => {
      const pane = document.querySelector('[data-testid="process-lanes"]');
      const node = pane?.querySelector('.process-node.is-selected');
      if (node instanceof Element) node.scrollIntoView({ block: 'nearest' });
      if (options.focusRow === false) return;
      const [first] = indexes;
      if (first === undefined) return;
      const row = evidenceRowRefs.current.get(first);
      if (!row) return;
      row.scrollIntoView({ block: 'nearest' });
      row.focus({ preventScroll: true });
    });
  };

  // A different finding starts with no selection.
  useEffect(() => {
    dispatchFindingSelection({ type: 'finding-change' });
    evidenceRowRefs.current.clear();
  }, [selectedFindingId]);

  const checksResult = checks.status === 'ready' ? checks.result : null;
  const shownFindings = checksResult
    ? (visibleFindings(checksResult.findings, showInfoFindings) as Finding[])
    : [];
  const selectedFinding =
    checksResult && selectedFindingId
      ? (checksResult.findings.find((finding) => finding.id === selectedFindingId) ?? null)
      : null;
  const selectedCauses = selectedFinding ? findingCauses(selectedFinding, lang) : [];
  const selectedCountermeasures = selectedFinding
    ? findingCountermeasures(selectedFinding, lang)
    : [];
  // Null when the open finding is not one of the reconciliation rules.
  const selectedCategoryKey = selectedFinding
    ? reconciliationCategoryKey(selectedFinding.rule)
    : null;

  const checksStatus = (): string => {
    switch (checks.status) {
      case 'idle':
        return t('checksIdle');
      case 'running':
        return t('checksRunning');
      case 'ready':
        return t('checksReady');
      case 'error':
        return t('checksFailed');
    }
  };

  const relateStatus = (): string => {
    switch (relate.status) {
      case 'idle':
        return t('relateIdle');
      case 'loading':
        return relate.step === 'seed'
          ? t('relateLoadingSeed')
          : relate.step === 'wasm'
            ? t('relateLoadingWasm')
            : t('relateSeeding');
      case 'ready':
        return t('relateReady');
      case 'trapped':
        return t('relateTrapped');
    }
  };

  const runDisabled =
    engine.status !== 'ready' || running || relate.status === 'trapped';

  const checksDisabled =
    engine.status !== 'ready' ||
    checks.status === 'running' ||
    relate.status === 'trapped';

  return (
    <main>
      <div hidden data-testid="timings">
        {JSON.stringify(timings)}
      </div>
      <header className="app-header">
        <div>
          <h1>{t('title')}</h1>
          <p>{t('subtitle')}</p>
        </div>
        <label className="lang-label">
          {t('language')}{' '}
          <select
            data-testid="lang-toggle"
            value={lang}
            onChange={(event) => setLang(event.target.value as Lang)}
          >
            <option value="ja">日本語</option>
            <option value="en">English</option>
          </select>
        </label>
      </header>

      <details className="farmbot-explain" data-testid="how-it-works">
        <summary className="muted small">{t('howItWorksLabel')}</summary>
        <p className="muted small">{t('explainSources')}</p>
        <p className="muted small">{t('explainEngine')}</p>
      </details>

      {engine.status === 'loading' && (
        <p role="status" className="muted small">
          {t('loadingEngine')}
        </p>
      )}
      {engine.status === 'error' && (
        <div role="alert" className="error-box">
          <p>
            {t('engineFailed')}: {engine.detail}
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            {t('retry')}
          </button>
        </div>
      )}
      {engine.status === 'ready' && (
        <p className="muted small" data-testid="abi">
          {t('engineLabel')}: {engine.engine.abiVersion}
        </p>
      )}

      <section
        className="panel farmbot-samples"
        aria-labelledby="samples-heading"
        data-testid="sample-notifications"
      >
        <h2 id="samples-heading">{t('sampleHeading')}</h2>
        <p className="muted small">{t('sampleIntro')}</p>
        <p className="flow-strip" data-testid="flow-strip">
          <span className="flow-step" data-testid="flow-step-agent">
            {t('flowStepAgent')}
          </span>
          <span className="flow-arrow" aria-hidden="true">
            →
          </span>
          <span className="flow-step" data-testid="flow-step-email">
            {t('flowStepEmail')}
          </span>
          <span className="flow-arrow" aria-hidden="true">
            →
          </span>
          <span className="flow-step" data-testid="flow-step-analysis">
            {t('flowStepAnalysis')}
          </span>
        </p>
        <ul className="sample-list">
          {SAMPLE_NOTIFICATIONS.map((card) => {
            const categoryKey = reconciliationCategoryKey(card.rule);
            return (
              <li
                key={card.id}
                className="sample-card"
                data-testid="sample-card"
                data-finding-id={card.id}
                data-rule={card.rule}
                data-severity={card.severity}
              >
                <p className="sample-card-head">
                  <span className="sample-card-badge" data-testid="sample-badge">
                    {t('sampleCardLabel')}
                  </span>
                  <span className="sample-card-scenario">
                    <span className="muted">{t('sampleScenarioLabel')}:</span>{' '}
                    {t(card.scenarioKey)}
                  </span>
                </p>
                <p className="sample-card-found">
                  <span
                    className={`severity-badge severity-${card.severity}`}
                    data-testid="sample-severity"
                  >
                    {t(SEVERITY_LABEL_KEYS[card.severity])}
                  </span>{' '}
                  {categoryKey !== null && (
                    <>
                      <span
                        className="reconciliation-badge"
                        data-testid={`reconciliation-category-${card.rule}`}
                      >
                        {t(categoryKey)}
                      </span>{' '}
                    </>
                  )}
                  {t(CHECK_RULE_LABEL_KEYS[card.rule])}
                </p>
                <p className="sample-card-summary" data-testid="sample-summary">
                  {t(card.summaryKey)}
                </p>
                <p className="sample-card-link-row">
                  <a data-testid="sample-open-finding" href={`#finding=${card.id}`}>
                    {t('sampleOpenFinding')} <code>{`#finding=${card.id}`}</code>
                  </a>
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel">
        <h2>{t('questionsHeading')}</h2>
        <p className="muted small">{t('questionsHint')}</p>
        <p className="note">{t('quantityNote')}</p>
        <div className="chip-list">
          {questions.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={`chip${candidate.id === selectedId ? ' is-selected' : ''}`}
              data-testid={`question-${candidate.id}`}
              aria-pressed={candidate.id === selectedId}
              onClick={() => selectQuestion(candidate.id)}
            >
              <span className="chip-label">{t(QUESTION_LABEL_KEYS[candidate.id])}</span>
              <span className="chip-description">{t(QUESTION_TEXT_KEYS[candidate.id])}</span>
            </button>
          ))}
        </div>

        {question.selector && (
          <label className="farmbot-selector">
            <span>{t(SELECTOR_LABEL_KEYS[question.selector])}</span>
            <select
              data-testid="filter-value"
              value={selectorValue ?? ''}
              onChange={(event) => selectFilterValue(event.target.value)}
            >
              {selectorOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <span className="muted small">{t('selectorHint')}</span>
          </label>
        )}

        <div className="farmbot-actions">
          <button
            type="button"
            className="primary"
            data-testid="run"
            onClick={run}
            disabled={runDisabled}
          >
            {running ? t('running') : t('run')}
          </button>
          <span className="muted small" role="status">
            {relateStatus()}
          </span>
        </div>
      </section>

      <CheckRoutingPanel
        engine={engine.status === 'ready' ? engine.engine : null}
        disabled={relate.status === 'trapped'}
        onRun={runConfirmedCheck}
        t={t}
      />

      <section className="panel farmbot-findings" aria-labelledby="findings-heading">
        <h2 id="findings-heading">{t('findingsHeading')}</h2>
        <p className="muted small">{t('findingsHint')}</p>
        <div className="farmbot-actions">
          <button
            type="button"
            className="primary"
            data-testid="run-checks"
            onClick={() => void runChecks()}
            disabled={checksDisabled}
          >
            {checks.status === 'running' ? t('runningChecks') : t('runChecks')}
          </button>
          <span className="muted small" role="status">
            {checksStatus()}
          </span>
        </div>

        {checks.status === 'error' && (
          <div role="alert" className="error-box" data-testid="checks-error">
            <p>{t('checksFailed')}</p>
            <pre>{checks.detail}</pre>
          </div>
        )}

        {checksResult && (
          <>
            <div className="severity-counts">
              {SEVERITY_LEVELS.map((level) => (
                <span key={level} className={`severity-chip severity-${level}`}>
                  {t(SEVERITY_LABEL_KEYS[level])}{' '}
                  <span className="count" data-testid={`severity-${level}`}>
                    {checksResult.bySeverity[level]}
                  </span>
                </span>
              ))}
              <span className="muted small">
                {t('findingsTotal')}{' '}
                <span className="count" data-testid="findings-count">
                  {checksResult.count}
                </span>
              </span>
            </div>

            <button
              type="button"
              className="chip findings-filter"
              data-testid="toggle-info-findings"
              aria-pressed={showInfoFindings}
              onClick={() => setShowInfoFindings((current) => !current)}
            >
              {showInfoFindings ? t('hideInfoFindings') : t('showInfoFindings')}
            </button>

            <p
              className={checksResult.matches ? 'muted small' : 'finding-mismatch small'}
              data-testid="findings-digest"
            >
              {checksResult.matches ? t('findingsMatch') : t('findingsMismatch')}{' '}
              <code>{checksResult.digest}</code>
            </p>

            <div className="reconciliation-group" data-testid="reconciliation-group">
              <h3>{t('reconciliationHeading')}</h3>
              <p className="muted small">{t('reconciliationIntro')}</p>
            </div>

            <ol className="finding-list" data-testid="finding-list">
              {shownFindings.map((finding) => {
                const categoryKey = reconciliationCategoryKey(finding.rule);
                return (
                  <li key={finding.id}>
                    <button
                      type="button"
                      className={`finding-row severity-${finding.severity}${
                        finding.id === selectedFindingId ? ' is-selected' : ''
                      }`}
                      data-testid={`finding-row-${finding.id}`}
                      data-finding-id={finding.id}
                      onClick={() => openFinding(finding.id)}
                    >
                      <span className={`severity-badge severity-${finding.severity}`}>
                        {t(SEVERITY_LABEL_KEYS[finding.severity])}
                      </span>{' '}
                      {categoryKey !== null && (
                        <>
                          <span
                            className="reconciliation-badge"
                            data-testid={`reconciliation-category-${finding.rule}`}
                          >
                            {t(categoryKey)}
                          </span>{' '}
                        </>
                      )}
                      <span className="finding-row-summary">
                        {summaryLine(finding, lang)}
                      </span>{' '}
                      <code className="finding-row-id">{finding.id}</code>
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>

      {selectedFinding && (
        <section className="panel farmbot-finding" data-testid="finding-view">
          <div className="finding-view-head">
            <h2>{t('findingHeading')}</h2>
            <button
              type="button"
              className="chip"
              data-testid="close-finding"
              onClick={() => setSelectedFindingId(null)}
            >
              {t('closeFinding')}
            </button>
          </div>
          <p className="finding-summary" data-testid="finding-summary">
            {summaryLine(selectedFinding, lang)}
          </p>
          {selectedFinding.rule === 'R1' && (
            <p className="note" data-testid="reconciliation-r1-note">
              {t('reconciliationR1Note')}
            </p>
          )}
          <dl className="farmbot-meta">
            <dt>{t('findingIdLabel')}</dt>
            <dd>
              <code data-testid="finding-open-id">{selectedFinding.id}</code>
            </dd>
            <dt>{t('ruleLabel')}</dt>
            <dd>
              {CHECK_RULE_LABEL_KEYS[selectedFinding.rule] !== undefined
                ? t(CHECK_RULE_LABEL_KEYS[selectedFinding.rule])
                : selectedFinding.rule}
            </dd>
            {selectedCategoryKey !== null && (
              <>
                <dt>{t('reconciliationCategoryLabel')}</dt>
                <dd>
                  <span
                    className="reconciliation-badge"
                    data-testid={`reconciliation-category-${selectedFinding.rule}`}
                  >
                    {t(selectedCategoryKey)}
                  </span>
                </dd>
              </>
            )}
            <dt>{t('severityLabel')}</dt>
            <dd>
              <span className={`severity-badge severity-${selectedFinding.severity}`}>
                {t(SEVERITY_LABEL_KEYS[selectedFinding.severity])}
              </span>
            </dd>
            <dt>{t('severityScoreLabel')}</dt>
            <dd data-testid="finding-score">{selectedFinding.severityScore}</dd>
            {selectedFinding.rule === 'R6' && (
              <>
                <dt>{t('nameMatchLabel')}</dt>
                <dd>
                  <span
                    className={`fact-label fact-label-${
                      selectedFinding.inferred ? 'inference' : 'fact'
                    }`}
                    data-testid="finding-inferred"
                    data-inferred={selectedFinding.inferred ? 'true' : 'false'}
                  >
                    {t(selectedFinding.inferred ? 'inferenceLabel' : 'factLabel')}
                  </span>
                </dd>
              </>
            )}
            <dt>{t('subjectLabel')}</dt>
            <dd>{selectedFinding.subject.label}</dd>
          </dl>

          <div className="finding-live" data-testid="finding-live">
            <ProcessLanes
              finding={selectedFinding}
              selectedEvidence={selectedEvidence}
              onSelectEvidence={selectEvidence}
              t={t}
            />

            <div className="finding-live-evidence" data-testid="finding-live-evidence">
              <h3>
                {t('evidenceHeading')}{' '}
                <span className="count" data-testid="evidence-count">
                  {orderEvidenceRows(selectedFinding).length}
                </span>
              </h3>
              <ol className="evidence-list" data-testid="finding-evidence">
                {orderEvidenceRows(selectedFinding).map((row, index) => {
                  const identity = JSON.stringify([
                    row.role,
                    row.nodeId,
                    row.sourceFile,
                    row.line,
                  ]);
                  const rowSelected = selectedEvidence.includes(index);
                  const { primary, rest } = splitEvidenceQueries(row, row.queries);
                  return (
                    <li
                      key={identity}
                      className={`evidence-row${rowSelected ? ' is-selected' : ''}`}
                      data-testid="evidence-row"
                      data-selected={rowSelected ? 'true' : 'false'}
                      data-evidence-index={index}
                      tabIndex={-1}
                      ref={(element) => {
                        evidenceRowRefs.current.set(index, element);
                      }}
                      onClick={(event) => {
                        if (
                          event.target instanceof Element &&
                          event.target.closest('details, summary, a, button')
                        ) {
                          return;
                        }
                        selectEvidence([index], { focusRow: false });
                      }}
                    >
                      <dl className="farmbot-meta">
                        <dt>{t('evidenceRoleLabel')}</dt>
                        <dd>{row.role}</dd>
                        <dt>{t('evidenceNodeLabel')}</dt>
                        <dd>
                          <code>{row.nodeId}</code>
                        </dd>
                        {row.sourceFile !== null && (
                          <>
                            <dt>{t('evidenceSourceLabel')}</dt>
                            <dd>{row.sourceFile}</dd>
                          </>
                        )}
                        {row.line !== null && (
                          <>
                            <dt>{t('evidenceLineLabel')}</dt>
                            <dd>{row.line}</dd>
                          </>
                        )}
                      </dl>
                      <ul className="fact-list">
                        {Object.entries(row.facts ?? {}).map(([key, value]) => (
                          <li key={key}>
                            <code>{key}</code>: {cellText(value)}
                          </li>
                        ))}
                      </ul>
                      <details className="evidence-queries">
                        <summary>{t('evidenceQueriesLabel')}</summary>
                        {primary !== null && (
                          <div
                            className="evidence-query evidence-query-primary"
                            data-testid="evidence-query-primary"
                          >
                            <p>
                              <strong>{t('intentLabel')}</strong>: <code>{primary.intent}</code>
                            </p>
                            <pre>{primary.cypher}</pre>
                            <p>
                              <strong>{t('paramsLabel')}</strong>
                            </p>
                            <pre>{JSON.stringify(primary.params, null, 2)}</pre>
                          </div>
                        )}
                        {rest.length > 0 && (
                          <details
                            className="evidence-queries-rest"
                            data-testid="evidence-queries-rest"
                          >
                            <summary>
                              {t('evidenceShowRestLabel')} ({rest.length})
                            </summary>
                            {rest.map((query: FindingQuery) => (
                              <div key={query.intent} className="evidence-query">
                                <p>
                                  <strong>{t('intentLabel')}</strong>: <code>{query.intent}</code>
                                </p>
                                <pre>{query.cypher}</pre>
                                <p>
                                  <strong>{t('paramsLabel')}</strong>
                                </p>
                                <pre>{JSON.stringify(query.params, null, 2)}</pre>
                              </div>
                            ))}
                          </details>
                        )}
                      </details>
                      <button
                        type="button"
                        className="evidence-select"
                        aria-label={`${t('evidenceSelect')}: ${row.nodeId}`}
                        aria-pressed={rowSelected}
                        onClick={() => selectEvidence([index], { focusRow: false })}
                      >
                        {t('evidenceSelect')}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>

          <h3>{t('causesHeading')}</h3>
          <ul className="cause-list" data-testid="finding-causes">
            {selectedCauses.map((cause, index) => (
              <li key={index}>
                <span className={`fact-label fact-label-${cause.kind}`}>
                  {cause.kind === 'fact' ? t('factLabel') : t('inferenceLabel')}
                </span>{' '}
                <span>{cause.text}</span>
                {cause.rule && <span className="muted small"> ({cause.rule})</span>}
              </li>
            ))}
          </ul>

          <h3>{t('countermeasuresHeading')}</h3>
          <ul className="countermeasure-list" data-testid="finding-countermeasures">
            {selectedCountermeasures.map((countermeasure, index) => (
              <li key={index}>{countermeasure}</li>
            ))}
          </ul>

          <p className="muted small">{t('causeDataNote')}</p>
        </section>
      )}

      {error && (
        <div role="alert" className="error-box" data-testid="error">
          <p>{t(ERROR_MESSAGE_KEYS[error.kind])}</p>
          {error.kind === 'seed-digest' ? (
            <dl className="farmbot-meta">
              <dt>{t('digestExpectedLabel')}</dt>
              <dd>
                <code>{error.expected}</code>
              </dd>
              <dt>{t('digestActualLabel')}</dt>
              <dd>
                <code>{error.actual}</code>
              </dd>
            </dl>
          ) : error.kind === 'limit' ? (
            <p className="small">
              {t('limitNote')}: {error.limit} / {t('rowsFoundNote')}: {error.rows}
            </p>
          ) : (
            <pre>{error.detail}</pre>
          )}
        </div>
      )}

      {result && (
        <section className="panel" data-testid="result">
          <h2>{t('resultHeading')}</h2>
          <dl className="farmbot-meta">
            <dt>{t('intentLabel')}</dt>
            <dd>
              {t(QUESTION_LABEL_KEYS[result.questionId])} (
              {questions.find((candidate) => candidate.id === result.questionId)?.intentFile})
            </dd>
            <dt>{t('limitLabel')}</dt>
            <dd>{result.intent.limit}</dd>
            <dt>{t('receivedDigestLabel')}</dt>
            <dd>
              <code>{result.digest}</code>
            </dd>
            <dt>{t('sourcePinLabel')}</dt>
            <dd>
              <code>{SOURCE_PIN}</code>
            </dd>
          </dl>

          <h3>{t('intentLabel')}</h3>
          <pre data-testid="intent">{JSON.stringify(result.intent, null, 2)}</pre>

          <h3>{t('executedCypherLabel')}</h3>
          <pre data-testid="cypher">{result.executed}</pre>

          <h3>{t('paramsLabel')}</h3>
          <pre>{JSON.stringify(result.params, null, 2)}</pre>

          {result.distinctApplied && <p className="note">{t('distinctNote')}</p>}

          <h3>
            {t('rowsHeading')}{' '}
            <span className="count" data-testid="row-count">
              {result.rows.length}
            </span>
          </h3>
          {result.rows.length === 0 ? (
            <p className="no-matches">{t('noRows')}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {result.columns.map((column) => (
                      <th key={column} scope="col">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, index) => (
                    <tr key={index}>
                      {result.columns.map((column) => (
                        <td key={column}>{cellText(row[column])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="panel farmbot-about">
        <h2>{t('aboutHeading')}</h2>
        <p className="small">{t('aboutBody')}</p>
        <dl className="farmbot-meta">
          <dt>{t('digestLabel')}</dt>
          <dd>
            <code data-testid="expected-digest">{SEED_DIGEST}</code>
          </dd>
          <dt>{t('sourcePinLabel')}</dt>
          <dd>
            <code>{SOURCE_PIN}</code>
          </dd>
          <dt>{t('storeDigestLabel')}</dt>
          <dd>
            <code data-testid="store-digest">{STORE_DIGEST}</code>
          </dd>
          <dt>{t('storeNodesLabel')}</dt>
          <dd data-testid="store-nodes">{STORE_NODES}</dd>
          <dt>{t('storeRelationshipsLabel')}</dt>
          <dd data-testid="store-relationships">{STORE_RELATIONSHIPS}</dd>
          {relate.status === 'ready' && (
            <>
              <dt>{t('receivedDigestLabel')}</dt>
              <dd>
                <code data-testid="verified-digest">{relate.digest}</code>
              </dd>
              <dt>{t('seedBytesLabel')}</dt>
              <dd data-testid="seed-bytes">{relate.byteLength}</dd>
              <dt>{t('statementsLabel')}</dt>
              <dd>{relate.statements}</dd>
            </>
          )}
        </dl>
        <p className="small">
          <a href="../">{t('parentEntry')}</a>
        </p>
      </section>
    </main>
  );
}
