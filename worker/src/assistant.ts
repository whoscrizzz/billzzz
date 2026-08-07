import type { Env, SubscriptionRow } from './env';
import { error, json, logError } from './env';

const MODEL = '@cf/meta/llama-3.1-8b-instruct';
const MAX_MESSAGE_LEN = 1000;
const MAX_HISTORY = 8;
const MAX_CONTEXT_SUBS = 20;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantRequestBody {
  message?: string;
  history?: ChatMessage[];
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    (v.role === 'user' || v.role === 'assistant') &&
    typeof v.content === 'string' &&
    v.content.length <= MAX_MESSAGE_LEN
  );
}

/** Resumen corto de las suscripciones del usuario — el modelo lo usa como
 *  contexto (no como fuente de verdad para acciones: el asistente solo
 *  responde texto, no muta datos). Se trunca a MAX_CONTEXT_SUBS para no
 *  inflar el prompt en cuentas grandes. */
async function buildContext(db: D1Database, userId: string): Promise<string> {
  const { results } = await db
    .prepare(
      `SELECT name, amount, currency, category, due_day FROM subscriptions
       WHERE user_id = ? AND deleted_at IS NULL AND trashed_at IS NULL
       ORDER BY due_day ASC LIMIT ?`
    )
    .bind(userId, MAX_CONTEXT_SUBS)
    .all<Pick<SubscriptionRow, 'name' | 'amount' | 'currency' | 'category' | 'due_day'>>();

  const subs = results ?? [];
  if (subs.length === 0) return 'El usuario no tiene pagos registrados todavía.';

  const lines = subs.map(
    (s) => `- ${s.name}: ${s.amount} ${s.currency}${s.category ? ` (${s.category})` : ''}`
  );
  return `Pagos registrados del usuario:\n${lines.join('\n')}`;
}

/** POST /bills-api/assistant — chat de una sola vuelta respaldado por
 *  Workers AI (modelo open source, sin API key externa). Solo lee datos para
 *  dar contexto; nunca escribe. */
export async function handleAssistantChat(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as AssistantRequestBody | null;
  if (!body || typeof body.message !== 'string' || !body.message.trim()) {
    return error('Escribe un mensaje', 400, request, env);
  }
  if (body.message.length > MAX_MESSAGE_LEN) {
    return error(`El mensaje no puede superar ${MAX_MESSAGE_LEN} caracteres`, 400, request, env);
  }

  const history = Array.isArray(body.history)
    ? body.history.filter(isChatMessage).slice(-MAX_HISTORY)
    : [];

  try {
    const context = await buildContext(env.DB, userId);
    const result = await env.AI.run(MODEL, {
      messages: [
        {
          role: 'system',
          content:
            'Eres el asistente de Bills, una app de recordatorios de pagos y suscripciones. ' +
            'Responde en español, de forma breve y directa (máximo 4 líneas). ' +
            'Solo puedes informar y sugerir — no puedes registrar pagos, borrar nada ni mover dinero; ' +
            'si te piden una acción, indica qué botón de la app la hace. ' +
            `${context}`,
        },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: body.message },
      ],
      max_tokens: 300,
    });

    const reply =
      typeof result === 'object' && result !== null && 'response' in result
        ? String((result as { response: unknown }).response)
        : '';

    if (!reply) {
      return error('El asistente no pudo responder, intenta de nuevo', 502, request, env);
    }

    return json({ reply }, 200, request, env);
  } catch (err) {
    logError('Assistant chat error', err, { userId });
    return error('El asistente no está disponible en este momento', 502, request, env);
  }
}
