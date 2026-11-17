import type { MessageKey } from './i18n';
import {
  INTENT_MODEL_DOWNLOAD_BYTES,
  INTENT_MODEL_ID,
  INTENT_MODEL_VRAM_MB,
} from './check-webllm';
import type { CheckPanelError } from './check-routing-types';

export type CheckFreeTextPhase =
  | 'checking'
  | 'unsupported'
  | 'consent'
  | 'declined'
  | 'loading'
  | 'ready'
  | 'generating'
  | 'error';

interface CheckFreeTextPanelProps {
  phase: CheckFreeTextPhase;
  progress: number;
  progressText: string;
  notice: 'cancelled' | null;
  error: CheckPanelError | null;
  value: string;
  convertDisabled: boolean;
  onValueChange(value: string): void;
  onConsent(): void;
  onDecline(): void;
  onReviewConsent(): void;
  onLoad(): void;
  onCancelLoad(): void;
  onConvert(): void;
  t(key: MessageKey): string;
}

const ERROR_TITLE_KEYS: Record<CheckPanelError['kind'], MessageKey> = {
  load: 'checkModelLoadFailed',
  generate: 'checkModelGenerateFailed',
  validation: 'checkRoutingRejected',
  compile: 'checkRoutingCompileFailed',
  execute: 'checkRoutingExecuteFailed',
};

export function CheckFreeTextPanel({
  phase,
  progress,
  progressText,
  notice,
  error,
  value,
  convertDisabled,
  onValueChange,
  onConsent,
  onDecline,
  onReviewConsent,
  onLoad,
  onCancelLoad,
  onConvert,
  t,
}: CheckFreeTextPanelProps) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const inputDisabled =
    phase === 'checking' ||
    phase === 'unsupported' ||
    phase === 'loading' ||
    phase === 'generating';

  return (
    <div className="farmbot-check-free-text" data-testid="farmbot-free-text-panel">
      <h3>{t('checkFreeTextHeading')}</h3>
      <p className="muted small">{t('checkFreeTextIntro')}</p>

      {phase === 'checking' && (
        <p role="status" data-testid="farmbot-webgpu-checking">
          {t('checkWebgpuChecking')}
        </p>
      )}
      {phase === 'unsupported' && (
        <div className="notice-box" role="status" data-testid="farmbot-webgpu-notice">
          {t('checkWebgpuNotice')}
        </div>
      )}

      {phase === 'consent' && (
        <div className="consent-box" data-testid="farmbot-free-text-consent">
          <h4>{t('checkConsentTitle')}</h4>
          <dl className="farmbot-meta">
            <div>
              <dt>{t('checkModelLabel')}</dt>
              <dd>
                <code>{INTENT_MODEL_ID}</code>
              </dd>
            </div>
            <div>
              <dt>{t('checkVramLabel')}</dt>
              <dd>{INTENT_MODEL_VRAM_MB.toFixed(2)} MB</dd>
            </div>
            <div>
              <dt>{t('checkDownloadLabel')}</dt>
              <dd>{INTENT_MODEL_DOWNLOAD_BYTES.toLocaleString('en-US')} bytes</dd>
            </div>
          </dl>
          <p>{t('checkConsentBody')}</p>
          <p className="muted small">{t('checkDownloadSource')}</p>
          <div className="farmbot-actions">
            <button
              type="button"
              className="primary"
              data-testid="farmbot-free-text-consent-button"
              onClick={onConsent}
            >
              {t('checkConsentAllow')}
            </button>
            <button
              type="button"
              data-testid="farmbot-free-text-decline-button"
              onClick={onDecline}
            >
              {t('checkConsentDecline')}
            </button>
          </div>
        </div>
      )}

      {phase === 'declined' && (
        <div className="notice-box" data-testid="farmbot-free-text-declined">
          <p>{t('checkConsentDeclined')}</p>
          <button type="button" onClick={onReviewConsent}>
            {t('checkReviewConsent')}
          </button>
        </div>
      )}

      {phase === 'loading' && (
        <div className="free-text-progress" role="status" data-testid="farmbot-free-text-progress">
          <p>{t('checkModelLoading')}</p>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="muted small">
            {percent}%{progressText ? ` — ${progressText}` : ''}
          </p>
          <button
            type="button"
            data-testid="farmbot-free-text-cancel"
            onClick={onCancelLoad}
          >
            {t('checkCancelModelLoad')}
          </button>
        </div>
      )}

      {notice === 'cancelled' && (
        <p role="status" className="muted small" data-testid="farmbot-free-text-cancelled">
          {t('checkModelLoadCancelled')}
        </p>
      )}

      {error && (
        <div className="error-box" role="alert" data-testid="farmbot-free-text-error">
          <strong>{t(ERROR_TITLE_KEYS[error.kind])}</strong>
          {error.kind === 'validation' && <p>{t('checkRoutingRejectedBody')}</p>}
          {error.detail && <pre>{error.detail}</pre>}
          {(error.kind === 'load' || error.kind === 'generate') && (
            <button
              type="button"
              data-testid="farmbot-free-text-retry"
              onClick={error.kind === 'load' ? onLoad : onConvert}
            >
              {t('retry')}
            </button>
          )}
        </div>
      )}

      <div className="free-text-form">
        <label htmlFor="farmbot-check-input">{t('checkInputLabel')}</label>
        <textarea
          id="farmbot-check-input"
          data-testid="farmbot-free-text-input"
          value={value}
          rows={3}
          maxLength={2000}
          placeholder={t('checkInputPlaceholder')}
          disabled={inputDisabled}
          onChange={(event) => onValueChange(event.target.value)}
        />
        <div className="farmbot-actions">
          <button
            type="button"
            className="primary"
            data-testid="farmbot-free-text-convert"
            disabled={convertDisabled}
            onClick={onConvert}
          >
            {t('checkConvert')}
          </button>
          {phase === 'generating' && (
            <span className="muted small" role="status" data-testid="farmbot-free-text-status">
              {t('checkGenerating')}
            </span>
          )}
        </div>
      </div>
      <p className="muted small">{t('checkFreeTextPrivacy')}</p>
      <p className="muted small">{t('checkModelNoCypher')}</p>
    </div>
  );
}
