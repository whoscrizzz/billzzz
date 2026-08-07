import { useRef, useState } from 'react';
import { ActionIcon } from './ActionIcon';
import { type AssistantChatMessage, sendAssistantMessage } from '../lib/api';

interface Props {
  displayName: string | null;
}

const SUGGESTIONS = ['Revisar mis suscripciones', 'Ayúdame a ahorrar', 'Planear mis pagos del mes'];

/** Chat de una sola conversación (no persiste entre sesiones) contra
 * /bills-api/assistant, que corre en Workers AI (modelo open source, sin
 * llave de proveedor externo — ver worker/src/assistant.ts). El asistente
 * solo informa: no puede registrar pagos ni mover dinero. */
export function AssistantChat({ displayName }: Props) {
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);
    const next = [...messages, { role: 'user' as const, content: trimmed }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const { reply } = await sendAssistantMessage(trimmed, next.slice(-8));
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setError('No se pudo contactar al asistente. Intenta de nuevo.');
    } finally {
      setSending(false);
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
      });
    }
  };

  return (
    <div className="assistant-chat">
      {messages.length === 0 ? (
        <div className="assistant-empty">
          <p className="assistant-greeting">
            Hola{displayName ? `, ${displayName}` : ''}. ¿En qué te ayudo hoy?
          </p>
          <div className="assistant-chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="assistant-chip" onClick={() => void send(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="assistant-messages" ref={listRef}>
          {messages.map((m, i) => (
            <div key={i} className={`assistant-bubble assistant-bubble-${m.role}`}>
              {m.content}
            </div>
          ))}
          {sending && (
            <div className="assistant-bubble assistant-bubble-assistant assistant-typing">…</div>
          )}
        </div>
      )}

      {error && <p className="banner error">{error}</p>}

      <form
        className="assistant-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          className="assistant-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu pregunta..."
          disabled={sending}
        />
        <button
          type="submit"
          className="btn-icon-sm assistant-send"
          aria-label="Enviar"
          disabled={sending || !input.trim()}
        >
          <ActionIcon name="chevron-right" />
        </button>
      </form>
    </div>
  );
}
