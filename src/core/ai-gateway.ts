// KI-Gateway (OpenRouter) fuer rollenspezifische Assistenten.
//
// ADDITIV & FAIL-CLOSED:
// - Ohne OPENROUTER_API_KEY ist das Gateway inaktiv und liefert nur einen Fehlercode.
//   Es werden dann KEINE Daten an einen externen Dienst gesendet.
// - Es wird nichts geloggt, was Nutzerinhalte enthaelt.
// - Dieses Modul verdrahtet von sich aus nichts: aufrufende Stellen entscheiden bewusst,
//   welche (ggf. personenbezogenen) Daten ueberhaupt uebergeben werden duerfen.
import type { Env } from './types.js';

export type AiRole = 'lerncoach' | 'lehrkraft' | 'verwaltung' | 'qm' | 'compliance' | 'red_team';

export interface AiCallInput {
  role: AiRole;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export type AiCallResult =
  | { ok: true; text: string; model: string }
  | { ok: false; code: 'AI_DISABLED' | 'AI_NOT_CONFIGURED' | 'AI_UPSTREAM_ERROR' | 'AI_EMPTY_RESPONSE' };

const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const MAX_TOKENS_LIMIT = 4096;
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

function isDisabled(env: Env): boolean {
  return String(env.AI_GATEWAY_ENABLED ?? '').toLowerCase() === 'false';
}

export function aiGatewayConfigured(env: Env): boolean {
  if (isDisabled(env)) return false;
  return String(env.OPENROUTER_API_KEY ?? '').trim().length > 0;
}

export async function callRoleModel(env: Env, input: AiCallInput): Promise<AiCallResult> {
  if (isDisabled(env)) return { ok: false, code: 'AI_DISABLED' };
  const key = String(env.OPENROUTER_API_KEY ?? '').trim();
  if (!key) return { ok: false, code: 'AI_NOT_CONFIGURED' };

  const model = String(env.OPENROUTER_MODEL ?? '').trim() || DEFAULT_MODEL;
  const maxTokens = Math.min(Math.max(Math.trunc(Number(input.maxTokens) || 1024), 1), MAX_TOKENS_LIMIT);
  const payload = {
    model,
    messages: [
      { role: 'system', content: `[${input.role}] ${input.system}` },
      { role: 'user', content: input.user },
    ],
    max_tokens: maxTokens,
    temperature: typeof input.temperature === 'number' ? input.temperature : 0.2,
  };

  try {
    const res = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, code: 'AI_UPSTREAM_ERROR' };
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = String(data?.choices?.[0]?.message?.content ?? '').trim();
    if (!text) return { ok: false, code: 'AI_EMPTY_RESPONSE' };
    return { ok: true, text, model };
  } catch {
    return { ok: false, code: 'AI_UPSTREAM_ERROR' };
  }
}
