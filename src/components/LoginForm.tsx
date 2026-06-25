import { useState } from "react";
import { NavIcon } from "./NavIcon";
import { useAuth } from "../contexts/AuthContext";
import { requestMagicLink, verifyWithCode } from "../lib/api";
import { emailValidationMessage, normalizeEmail } from "../lib/email";
import { isStandalonePwa, parseVerifyToken, readClipboardText } from "../lib/pwa";

export function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pasteLink, setPasteLink] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [clipboardLoading, setClipboardLoading] = useState(false);
  const standalone = isStandalonePwa();
  const linkSent = Boolean(status && !status.includes("Error") && !status.includes("inválido"));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    setVerifyUrl(null);
    setCodeError(null);
    setPasteError(null);

    const validationError = emailValidationMessage(email);
    if (validationError) {
      setStatus(validationError);
      setLoading(false);
      return;
    }

    try {
      const result = await requestMagicLink(normalizeEmail(email));
      setStatus(result.message ?? "Revisa tu correo");
      if (result.verifyUrl) setVerifyUrl(result.verifyUrl);
      if (result.shortCode) setCode(result.shortCode);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Error al enviar enlace");
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
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setCodeError("Escribe los 6 dígitos del correo.");
      return;
    }

    setCodeLoading(true);
    try {
      const result = await verifyWithCode(normalizeEmail(email), digits);
      login(result.token, result.user);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "Código inválido");
    } finally {
      setCodeLoading(false);
    }
  };

  const handlePasteVerify = () => {
    setPasteError(null);
    const token = parseVerifyToken(pasteLink);
    if (!token) {
      setPasteError("Enlace no reconocido. Copia el enlace completo del correo.");
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
          "No se pudo leer el portapapeles. Escribe el código de 6 dígitos del correo (más fácil en iPhone).",
        );
        return;
      }

      const token = parseVerifyToken(text);
      if (token) {
        window.location.assign(`/auth/verify?token=${encodeURIComponent(token)}`);
        return;
      }

      const digits = text.replace(/\D/g, "").slice(0, 6);
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
    setCode(value.replace(/\D/g, "").slice(0, 6));
  };

  return (
    <div className="auth-card auth-card-brand">
      <div className="auth-brand-row">
        <div className="brand-mark" aria-hidden>
          <NavIcon name="home" className="brand-icon" />
        </div>
        <div>
          <h1>Bills</h1>
          <p className="subtitle">Suscripciones y fechas de pago</p>
        </div>
      </div>

      {standalone && (
        <div className="standalone-notice">
          <strong>App instalada</strong>
          <p>
            Pide el enlace abajo. Cuando llegue el correo, usa el <strong>código de 6 dígitos</strong>{" "}
            — es la forma más fácil en iPhone (no hace falta pegar el enlace).
          </p>
        </div>
      )}

      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        <label>
          Correo electrónico
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
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button type="submit" className="btn-primary btn-add" disabled={loading}>
          {loading ? "Enviando..." : "Enviar enlace mágico"}
        </button>
      </form>

      {status && (
        <p className={`banner ${status.includes("inválido") || status.includes("Error") ? "error" : ""}`}>
          {status}
        </p>
      )}

      {(standalone || linkSent) && (
        <div className="paste-verify code-verify">
          <h2>Código de 6 dígitos</h2>
          <p className="panel-hint">
            {linkSent
              ? "Mira el correo y escribe el código aquí (asunto: «Tu código Bills: …»)."
              : "Primero envía el correo arriba. Luego escribe el código que recibas."}
          </p>
          <label>
            Código
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={6}
              pattern="[0-9]*"
              placeholder="123456"
              className="code-input"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              disabled={!linkSent}
            />
          </label>
          {codeError && <p className="banner error">{codeError}</p>}
          <button
            type="button"
            className="btn-primary btn-add"
            disabled={!linkSent || codeLoading || code.length !== 6}
            onClick={() => void handleVerifyCode()}
          >
            {codeLoading ? "Verificando..." : "Entrar con código"}
          </button>
        </div>
      )}

      {(standalone || linkSent) && (
        <details className="paste-details paste-verify">
          <summary>Pegar enlace (alternativa)</summary>
          <p className="panel-hint">
            Toca «Pegar del portapapeles» o escribe el enlace manualmente.
          </p>
          <button
            type="button"
            className="btn-secondary btn-add"
            disabled={clipboardLoading}
            onClick={() => void handleClipboardPaste()}
          >
            {clipboardLoading ? "Leyendo portapapeles..." : "Pegar del portapapeles"}
          </button>
          <label>
            Enlace de acceso
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
          {pasteError && <p className="banner error">{pasteError}</p>}
          <button type="button" className="btn-secondary btn-add" onClick={handlePasteVerify}>
            Continuar con enlace
          </button>
        </details>
      )}

      {verifyUrl && !standalone && (
        <div className="verify-box">
          <p>Abre el enlace y luego toca «Entrar a Bills»:</p>
          <a href={verifyUrl} className="btn-primary verify-link">
            Continuar al acceso
          </a>
        </div>
      )}

      {status && !status.includes("Error") && !status.includes("inválido") && !standalone && (
        <p className="panel-hint auth-tip">
          También puedes usar el código de 6 dígitos del correo en la sección de arriba.
        </p>
      )}
    </div>
  );
}
