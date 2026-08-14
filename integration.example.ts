import { handlePortabilityRequest } from './src/portability/index.js';
import type { AuthContext, PortabilityEnv } from './src/portability/types.js';

export async function exampleFetch(request: Request, env: PortabilityEnv, auth: AuthContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/portability/')) {
    return handlePortabilityRequest(request, env, auth);
  }
  return new Response('Not found', { status: 404 });
}

// In the commercial portal, connect your EXISTING authentication/RBAC layer here.
// Never trust role or tenant IDs from request headers/body without server-side verification.
