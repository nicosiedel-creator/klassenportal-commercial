import type { Env } from './types.js';

export type StripeMode='test'|'live';

export function stripeMode(env:Pick<Env,'STRIPE_SECRET_KEY'>):StripeMode{
  const key=String(env.STRIPE_SECRET_KEY||'');
  if(key.startsWith('sk_live_')||key.startsWith('rk_live_'))return 'live';
  if(key.startsWith('sk_test_')||key.startsWith('rk_test_'))return 'test';
  throw new Error('STRIPE_KEY_MODE_UNKNOWN');
}

export function stripeModeIfConfigured(env:Pick<Env,'STRIPE_SECRET_KEY'>):StripeMode|null{
  if(!env.STRIPE_SECRET_KEY)return null;
  return stripeMode(env);
}
