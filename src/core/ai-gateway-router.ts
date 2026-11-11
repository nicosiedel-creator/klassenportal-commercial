// Plattform-Admin-Zugang zum KI-Gateway.
//
// Nur der Plattform-Administrator darf den Status abfragen und eine Rolle ausprobieren.
// Das Gateway selbst ist fail-closed: ohne OPENROUTER_API_KEY liefert /invoke nur 503
// und es wird nichts nach aussen gesendet.
import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { requirePlatform } from './permissions.js';
import { assertSameOrigin, authStatus, json, safeErrorCode } from './utils.js';
import { aiGatewayConfigured } from './ai-gateway.js';
import { AI_ROLE_AGENTS, isAiRole, runAiRole } from './ai-agents.js';

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function fail(e: unknown): Response {
  const code = safeErrorCode(e);
  const status = authStatus(code) ?? (code.includes('ADMIN_REQUIRED') ? 403 : 400);
  return json({ ok: false, error: code }, status);
}

export async function handleAiGatewayApi(request: Request, env: Env): Promise<Response | null> {
  const u = new URL(request.url);
  if (!u.pathname.startsWith('/api/platform/ai/')) return null;
  try {
    assertSameOrigin(request, env.APP_ORIGIN);
    const auth = await resolveCoreAuth(env, request);
    requirePlatform(auth);

    if (u.pathname === '/api/platform/ai/status' && request.method === 'GET') {
      return json({
        ok: true,
        configured: aiGatewayConfigured(env),
        roles: Object.values(AI_ROLE_AGENTS).map((agent) => ({ role: agent.role, label: agent.label, purpose: agent.purpose })),
      });
    }

    if (u.pathname === '/api/platform/ai/invoke' && request.method === 'POST') {
      const payload = await body(request);
      const requestedRole = payload.role;
      if (!isAiRole(requestedRole)) return json({ ok: false, error: 'AI_ROLE_UNKNOWN' }, 400);
      const input = typeof payload.input === 'string' ? payload.input.trim() : '';
      if (!input) return json({ ok: false, error: 'AI_INPUT_REQUIRED' }, 400);
      const maxTokens = Number(payload.max_tokens);
      const result = await runAiRole(env, requestedRole, input, Number.isFinite(maxTokens) && maxTokens > 0 ? { maxTokens } : {});
      if (!result.ok) {
        const unavailable = result.code === 'AI_DISABLED' || result.code === 'AI_NOT_CONFIGURED';
        return json({ ok: false, error: result.code }, unavailable ? 503 : 502);
      }
      return json({ ok: true, role: requestedRole, model: result.model, text: result.text });
    }

    return null;
  } catch (e) {
    return fail(e);
  }
}
