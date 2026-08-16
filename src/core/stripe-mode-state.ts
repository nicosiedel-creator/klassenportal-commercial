import type { Env } from './types.js';
import { stripeMode, type StripeMode } from './stripe-mode.js';

const planColumns='plan_id,billing_cycle,stripe_mode,currency,base_product_id,base_price_id,base_amount_cents,extra_product_id,extra_price_id,extra_amount_cents,tax_behavior,tax_code,updated_at';
const accountColumns='tenant_id,stripe_mode,provider,stripe_customer_id,stripe_subscription_id,stripe_checkout_session_id,stripe_subscription_status,billing_cycle,current_plan_id,current_course_limit,current_period_end,cancel_at_period_end,last_invoice_id,updated_at';

function archiveStatements(env:Env){
  return [
    env.DB.prepare(`INSERT OR REPLACE INTO stripe_plan_prices_modes(${planColumns}) SELECT ${planColumns} FROM stripe_plan_prices`),
    env.DB.prepare(`INSERT OR REPLACE INTO tenant_payment_accounts_modes(${accountColumns}) SELECT ${accountColumns} FROM tenant_payment_accounts`),
  ];
}

export async function prepareStripeModeState(env:Env):Promise<StripeMode>{
  const mode=stripeMode(env);
  await env.DB.batch([
    ...archiveStatements(env),
    env.DB.prepare('DELETE FROM stripe_plan_prices WHERE stripe_mode<>?').bind(mode),
    env.DB.prepare('DELETE FROM tenant_payment_accounts WHERE stripe_mode<>?').bind(mode),
    env.DB.prepare(`INSERT OR IGNORE INTO stripe_plan_prices(${planColumns}) SELECT ${planColumns} FROM stripe_plan_prices_modes WHERE stripe_mode=?`).bind(mode),
    env.DB.prepare(`INSERT OR IGNORE INTO tenant_payment_accounts(${accountColumns}) SELECT ${accountColumns} FROM tenant_payment_accounts_modes WHERE stripe_mode=?`).bind(mode),
  ]);
  return mode;
}

export async function persistStripeModeState(env:Env):Promise<void>{
  await env.DB.batch(archiveStatements(env));
}

export async function stripeModeStateSummary(env:Env):Promise<{mode:StripeMode;test:{catalog:number;accounts:number};live:{catalog:number;accounts:number}}>{
  const mode=await prepareStripeModeState(env);
  const rows=await env.DB.prepare(`SELECT stripe_mode,kind,COUNT(*) AS n FROM (
      SELECT stripe_mode,'catalog' AS kind FROM stripe_plan_prices_modes
      UNION ALL
      SELECT stripe_mode,'accounts' AS kind FROM tenant_payment_accounts_modes
    ) GROUP BY stripe_mode,kind`).all<{stripe_mode:StripeMode;kind:'catalog'|'accounts';n:number}>();
  const out={mode,test:{catalog:0,accounts:0},live:{catalog:0,accounts:0}};
  for(const r of rows.results??[])out[r.stripe_mode][r.kind]=Number(r.n||0);
  return out;
}
