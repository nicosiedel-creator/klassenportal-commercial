import type { Env } from './types.js';

const ENABLED_VALUES=new Set(['1','true','yes','on','enabled']);

export function paymentsEnabled(env:Pick<Env,'PAYMENTS_ENABLED'>):boolean{
  const raw=String(env.PAYMENTS_ENABLED??'').trim().toLowerCase();
  return ENABLED_VALUES.has(raw);
}

export function assertPaymentsEnabled(env:Pick<Env,'PAYMENTS_ENABLED'>):void{
  if(!paymentsEnabled(env))throw new Error('PAYMENT_DISABLED');
}

export function paymentPolicy(env:Pick<Env,'PAYMENTS_ENABLED'>){
  const enabled=paymentsEnabled(env);
  return{enabled,mode:enabled?'provider':'disabled'} as const;
}
