import { useEffect, useState } from 'react';
import { PasskeyLoginButton } from './PasskeyLoginButton';
import { markPasskeyOfferPending } from './PostLoginPasskeyOffer';
import { markPushOfferPending } from './PostLoginPushOffer';
import { markOnboardingOfferPending } from './PostLoginOnboarding';
import { BrandMark } from './BrandMark';
import { AuthStepIndicator, type AuthStep } from './AuthStepIndicator';
import { ActionIcon } from './ActionIcon';
import { useAuth } from '../contexts/AuthContext';
import { requestMagicLink, verifyWithCode } from '../lib/api';
import { emailValidationMessage, normalizeEmail } from '../lib/email';
import { isStandalonePwa, parseVerifyToken, readClipboardText } from '../lib/pwa';
import { loadLoginEmail, saveLoginEmail } from '../lib/ui-prefs';
import { useTheme, type Theme } from '../lib/theme';

const THEME_CYCLE: Record<Theme, Theme> = { light: 'dark', dark: 'auto', auto: 'light' };

export function LoginForm() {
  const { login } = useAuth();
  const { theme, setTheme } = useTheme();
  const [step, setStep] = useState<AuthStep>('access');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pasteLink, setPasteLink] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [clipboardLoading, setClipboardLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const standalone = isStandalonePwa();

  useEffect(() => {
    const saved = loadLoginEmail();
    if (saved) setEmail(saved);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    setEmailError(null);

    const validationError = emailValidationMessage(email);
    if (validationError) {
      setEmailError(validationError);
      return;
    }

    setLoading(true);
    setVerifyUrl(null);
    setCodeError(null);
    setPasteError(null);
    setCode('');

    const normalized = normalizeEmail(email);
    try {
      const result = await requestMagicLink(normalized);
      saveLoginEmail(normalized);
      setStatus(result.message ?? 'Revisa tu correo');
      if (result.verifyUrl) setVerifyUrl(result.verifyUrl);
      if (result.shortCode) setCode(result.shortCode);
      setStep('verify');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Error al enviar enlace');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setCodeError(null);
    const validationError = emailValidationMessage(email);
    if (validationError) {
      setCodeError(validationError);
      return;
    }
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) {
      setCodeError('Escribe los 6 dígitos del correo.');
      return;
    }

    setCodeLoading(true);
    try {
      const result = await verifyWithCode(normalizeEmail(email), digits);
      markPasskeyOfferPending();
      markPushOfferPending();
      markOnboardingOfferPending();
      login(result.token, result.user);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Código inválido');
    } finally {
      setCodeLoading(false);
    }
  };

  const handlePasteVerify = () => {
    setPasteError(null);
    const token = parseVerifyToken(pasteLink);
    if (!token) {
      setPasteError('Enlace no reconocido. Copia el enlace completo del correo.');
      return;
    }
    window.location.assign(`/auth/verify?token=${encodeURIComponent(token)}`);
  };

  const handleClipboardPaste = async () => {
    setPasteError(null);
    setClipboardLoading(true);
    try {
      const text = await readClipboardText();
      if (!text) {
        setPasteError(
          'No se pudo leer el portapapeles. Escribe el código de 6 dígitos del correo (más fácil en iPhone).'
        );
        return;
      }

      const token = parseVerifyToken(text);
      if (token) {
        window.location.assign(`/auth/verify?token=${encodeURIComponent(token)}`);
        return;
      }

      const digits = text.replace(/\D/g, '').slice(0, 6);
      if (digits.length === 6) {
        setCode(digits);
        return;
      }

      setPasteLink(text);
    } finally {
      setClipboardLoading(false);
    }
  };

  const handleCodeChange = (value: string) => {
    setCode(value.replace(/\D/g, '').slice(0, 6));
    if (codeError) setCodeError(null);
  };

  const handleResend = async () => {
    if (resendLoading) return;
    setResendLoading(true);
    try {
      const result = await requestMagicLink(normalizeEmail(email));
      if (result.shortCode) setCode(result.shortCode);
      setResent(true);
      setTimeout(() => setResent(false), 4000);
    } finally {
      setResendLoading(false);
    }
  };

  const backToEmail = () => {
    setStep('access');
    setCode('');
    setCodeError(null);
    setPasteError(null);
  };

  const emailInvalid = !!emailValidationMessage(email);

  return (
    <div className="auth-card auth-card-login">
      {step === 'access' && (
        <div className="auth-top-row">
          <div className="auth-brand-row">
            <div className="brand-mark" aria-hidden>
              <BrandMark className="brand-icon" />
            </div>
            <span className="auth-brand-name">Bills</span>
          </div>
          <button
            type="button"
            className="auth-theme-btn"
            aria-label="Cambiar tema"
            onClick={() => setTheme(THEME_CYCLE[theme])}
          >
            <ActionIcon name="theme" />
          </button>
        </div>
      )}

      <AuthStepIndicator step={step} />

      {step === 'access' && (
        <>
          <h1 className="auth-access-title">Tus pagos, sin sustos a fin de mes</h1>
          <p className="auth-access-subtitle">
            Te avisamos antes de cada fecha límite para que nunca se te pase un pago.
          </p>

          <PasskeyLoginButton />

          <form className="auth-form" noValidate onSubmit={handleSubmit}>
            <label>
              <span className="auth-field-label">Correo electrónico</span>
              <input
                type="text"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
              />
            </label>
            {emailError && <p className="auth-field-error">{emailError}</p>}
            <button
              type="submit"
              className={`btn-primary btn-add ${emailInvalid ? 'invalid' : ''}`}
              disabled={loading}
            >
              {loading ? 'Enviando...' : 'Enviarme un código'}
            </button>
          </form>

          {status && (
            <p className={`banner ${status.includes('Error') ? 'error' : ''}`}>{status}</p>
          )}

          {verifyUrl && !standalone && (
            <div className="verify-box">
              <p>Abre el enlace y luego toca «Entrar a Bills»:</p>
              <a href={verifyUrl} className="btn-primary verify-link">
                Continuar al acceso
              </a>
            </div>
          )}

          <p className="auth-footnote">Sin contraseñas — el acceso llega a tu correo.</p>
        </>
      )}

      {step === 'verify' && (
        <>
          <div className="auth-step-head">
            <button type="button" className="btn-text auth-back" onClick={backToEmail}>
              ← Cambiar correo
            </button>
            <p className="auth-step-email">{email}</p>
          </div>

          {standalone && (
            <div className="standalone-notice">
              <strong>App instalada</strong>
              <p>
                Mira el correo y escribe el <strong>código de 6 dígitos</strong> — es la forma más
                fácil en iPhone.
              </p>
            </div>
          )}

          {status && !status.includes('Error') && <p className="banner">{status}</p>}

          <h1 className="auth-verify-title">Escribe el código</h1>

          <div className="code-cells-wrap">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={6}
              pattern="[0-9]*"
              className="code-cells-input"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              aria-label="Código de 6 dígitos"
              autoFocus
            />
            <div className="code-cells" aria-hidden>
              {Array.from({ length: 6 }, (_, i) => (
                <span
                  key={i}
                  className={`code-cell ${i === code.length ? 'active' : ''} ${codeError ? 'error' : ''}`}
                >
                  {code[i] ?? ''}
                </span>
              ))}
            </div>
          </div>

          <div className="code-keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '·', '0', '⌫'].map((k) => (
              <button
                key={k}
                type="button"
                className={`code-keypad-btn ${k === '·' ? 'code-keypad-filler' : ''}`}
                tabIndex={-1}
                disabled={k === '·'}
                onClick={() => {
                  if (k === '⌫') handleCodeChange(code.slice(0, -1));
                  else handleCodeChange(code + k);
                }}
              >
                {k !== '·' && k}
              </button>
            ))}
          </div>

          {codeError && <p className="auth-field-error">{codeError}</p>}

          <button
            type="button"
            className="btn-primary btn-add"
            disabled={codeLoading || code.length !== 6}
            onClick={() => void handleVerifyCode()}
          >
            {codeLoading
              ? 'Verificando...'
              : code.length !== 6
                ? 'Escribe los 6 dígitos'
                : 'Entrar'}
          </button>

          <div className="auth-verify-footer">
            <button
              type="button"
              className="btn-text"
              disabled={clipboardLoading}
              onClick={() => void handleClipboardPaste()}
            >
              {clipboardLoading ? 'Leyendo portapapeles...' : 'Pegar enlace del correo'}
            </button>
            <button
              type="button"
              className="btn-text auth-link-muted"
              disabled={resendLoading}
              onClick={() => void handleResend()}
            >
              {resent ? 'Código reenviado' : resendLoading ? 'Reenviando...' : 'Reenviar código'}
            </button>
          </div>

          {pasteError && <p className="auth-field-error">{pasteError}</p>}

          <details className="paste-details paste-verify">
            <summary>Pegar el enlace manualmente</summary>
            <label>
              <span className="auth-field-label">Enlace de acceso</span>
              <textarea
                rows={2}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="https://bills.whoscrizzz.com/auth/verify?token=..."
                value={pasteLink}
                onChange={(e) => setPasteLink(e.target.value)}
              />
            </label>
            <button type="button" className="btn-secondary btn-add" onClick={handlePasteVerify}>
              Continuar con enlace
            </button>
          </details>
        </>
      )}
    </div>
  );
}
