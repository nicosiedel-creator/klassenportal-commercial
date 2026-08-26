import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const action=String(process.argv[2]||'').trim();
const config=String(process.argv[3]||'wrangler.browser-e2e.json').trim();
if(!['seed','verify'].includes(action))throw new Error('USAGE: commercial-onboarding-e2e-state.mjs seed|verify <browser-e2e-config>');
if(!/browser-e2e/i.test(config))throw new Error('E2E_STATE_GUARD_REQUIRES_BROWSER_CONFIG');
if(String(process.env.PAYMENTS_ENABLED||'false').toLowerCase()==='true')throw new Error('E2E_STATE_GUARD_REFUSES_ENABLED_PAYMENTS');

const npx=process.platform==='win32'?'npx.cmd':'npx';
function runWrangler(args,{capture=false}={}){
  const result=spawnSync(npx,['wrangler',...args],{encoding:'utf8',stdio:capture?['ignore','pipe','pipe']:'inherit',env:{...process.env,PAYMENTS_ENABLED:'false'}});
  if(result.error)throw result.error;
  if((result.status??1)!==0)throw new Error(`WRANGLER_E2E_FAILED:${result.stderr||result.stdout||result.status}`);
  return result.stdout||'';
}
function parseJson(text){
  const clean=String(text||'').replace(/\u001b\[[0-9;]*m/g,'').trim();
  const starts=[clean.indexOf('['),clean.indexOf('{')].filter(x=>x>=0).sort((a,b)=>a-b);
  for(const start of starts){try{return JSON.parse(clean.slice(start));}catch{}}
  throw new Error(`WRANGLER_E2E_JSON_PARSE_FAILED:${clean.slice(0,300)}`);
}
function rowsFrom(value){
  const rows=[],seen=new Set();
  function walk(x){
    if(!x||typeof x!=='object')return;
    if(Array.isArray(x)){for(const item of x)walk(item);return;}
    if(Array.isArray(x.results))for(const row of x.results)if(row&&typeof row==='object'){const key=JSON.stringify(row);if(!seen.has(key)){seen.add(key);rows.push(row);}}
    for(const [key,val] of Object.entries(x))if(key!=='results')walk(val);
  }
  walk(value);return rows;
}
function query(sql){return rowsFrom(parseJson(runWrangler(['d1','execute','DB','--local','--config',config,'--json','--command',sql],{capture:true})));}
function execute(sql){runWrangler(['d1','execute','DB','--local','--config',config,'--command',sql]);}
function q(value){return `'${String(value).replaceAll("'","''")}'`;}
function b64Sha256(value){return createHash('sha256').update(value).digest('base64');}

const fixtures=[
  {key:'primary',token:'commercial-browser-e2e-primary-token-20260826-safe',invitation:'obi_e2e_primary',quote:'quo_e2e_primary',quoteNumber:'ANG-E2E-PRIMARY',org:'Browser E2E Bildungswerk GmbH',customer:'browser-buyer-primary@example.invalid',admin:'browser-admin-primary@example.invalid',password:'Browser-E2E-Primary-2026!',courses:7,monthly:12900,setup:4900},
  {key:'race',token:'commercial-browser-e2e-race-token-20260826-safe',invitation:'obi_e2e_race',quote:'quo_e2e_race',quoteNumber:'ANG-E2E-RACE',org:'Browser E2E Paralleltest GmbH',customer:'browser-buyer-race@example.invalid',admin:'browser-admin-race@example.invalid',password:'Browser-E2E-Race-2026!',courses:11,monthly:23920,setup:0},
];

function snapshot(f){return JSON.stringify({offerKind:'paid',billingCycle:'monthly',planId:'provider',planName:'Bildungsträger',courseCount:f.courses,currency:'EUR',recurringMonthlyCents:f.monthly,annualTotalCents:f.monthly*10,managedSetupOptionId:'self_service',managedSetupName:'Selbsteinrichtung',managedSetupCents:f.setup,setupCents:f.setup,firstTotalCents:f.monthly+f.setup,manualPricing:false,pricingReady:true});}

if(action==='seed'){
  const tables=new Set(query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('tenant_users','commercial_quotes','commercial_orders','commercial_invoices','onboarding_invitations','onboarding_claims');").map(row=>String(row.name)));
  for(const required of ['tenant_users','commercial_quotes','commercial_orders','commercial_invoices','onboarding_invitations','onboarding_claims'])assert.ok(tables.has(required),`migrated local D1 is missing ${required}`);
  const now='2026-08-26T16:00:00.000Z',validUntil='2099-12-31T23:59:59.000Z';
  for(const f of fixtures){
    const snap=snapshot(f),hash=b64Sha256(f.token);
    execute(`
      DELETE FROM commercial_offer_acceptances WHERE quote_id=${q(f.quote)};
      DELETE FROM commercial_offer_events WHERE quote_id=${q(f.quote)};
      DELETE FROM commercial_quotes WHERE id=${q(f.quote)};
      DELETE FROM onboarding_claims WHERE invitation_id=${q(f.invitation)};
      DELETE FROM onboarding_invitations WHERE id=${q(f.invitation)};
      INSERT INTO onboarding_invitations(id,token_hash,customer_email,plan_id,status,expires_at,created_by,created_at)
      VALUES(${q(f.invitation)},${q(hash)},${q(f.customer)},'provider','open',${q(validUntil)},'browser-e2e',${q(now)});
      INSERT INTO commercial_quotes(
        id,quote_number,onboarding_invitation_id,tenant_id,plan_id,requested_courses,currency,
        recurring_monthly_cents,setup_cents,first_total_cents,status,valid_until,pricing_snapshot_json,
        accepted_at,created_at,updated_at,offer_kind,billing_cycle,customer_name,customer_contact_name,
        customer_email,customer_street,customer_postal_code,customer_city,customer_country,
        manual_pricing,accepted_terms,accepted_dpa
      ) VALUES(
        ${q(f.quote)},${q(f.quoteNumber)},${q(f.invitation)},NULL,'provider',${f.courses},'EUR',
        ${f.monthly},${f.setup},${f.monthly+f.setup},'accepted',${q(validUntil)},${q(snap)},
        ${q(now)},${q(now)},${q(now)},'paid','monthly',${q(f.org)},'Browser E2E Kontakt',
        ${q(f.customer)},'Teststraße 1','10115','Berlin','Deutschland',0,1,1
      );
      UPDATE onboarding_invitations SET quote_id=${q(f.quote)} WHERE id=${q(f.invitation)};
      INSERT INTO commercial_offer_acceptances(quote_id,accepted_name,accepted_email,accepted_at,terms_accepted,dpa_accepted,snapshot_json)
      VALUES(${q(f.quote)},'Browser E2E Kontakt',${q(f.customer)},${q(now)},1,1,${q(snap)});
      INSERT INTO commercial_offer_events(id,quote_id,event_type,detail_json,created_at)
      VALUES(${q(`ofe_e2e_${f.key}`)},${q(f.quote)},'accepted','{}',${q(now)});
    `);
  }
  const envFile=process.env.GITHUB_ENV;
  if(!envFile)throw new Error('GITHUB_ENV_REQUIRED_FOR_BROWSER_E2E_SEED');
  appendFileSync(envFile,fixtures.map(f=>[
    `E2E_ONBOARDING_${f.key.toUpperCase()}_TOKEN=${f.token}`,
    `E2E_ONBOARDING_${f.key.toUpperCase()}_ADMIN=${f.admin}`,
    `E2E_ONBOARDING_${f.key.toUpperCase()}_PASSWORD=${f.password}`,
  ].join('\n')).join('\n')+'\n','utf8');
  console.log('Seeded two accepted-offer onboarding fixtures into migrated local Wrangler D1.');
}else{
  const ids=fixtures.map(f=>q(f.invitation)).join(','),quotes=fixtures.map(f=>q(f.quote)).join(',');
  function count(sql){const row=query(sql)[0]||{};return Number(row.n||0);}
  assert.equal(count(`SELECT COUNT(*) n FROM onboarding_invitations WHERE id IN (${ids}) AND status='completed' AND tenant_id IS NOT NULL AND form_json IS NOT NULL`),2,'both onboarding invitations must complete exactly once');
  assert.equal(count(`SELECT COUNT(*) n FROM onboarding_claims WHERE invitation_id IN (${ids})`),0,'all onboarding claims must be released');
  assert.equal(count(`SELECT COUNT(*) n FROM commercial_quotes WHERE id IN (${quotes}) AND status='accepted' AND tenant_id IS NOT NULL`),2,'accepted quotes must bind to exactly one tenant');
  assert.equal(count(`SELECT COUNT(*) n FROM commercial_orders WHERE quote_id IN (${quotes}) AND status='active'`),2,'payment-frozen accepted offers must create active manual orders');
  assert.equal(count(`SELECT COUNT(*) n FROM commercial_orders WHERE quote_id IN (${quotes}) AND status='pending_payment'`),0,'payment-frozen flow must never create pending-payment orders');
  assert.equal(count(`SELECT COUNT(*) n FROM commercial_invoices ci JOIN commercial_orders o ON o.id=ci.order_id WHERE o.quote_id IN (${quotes}) AND ci.status='draft'`),2,'manual invoices must remain draft while payments are frozen');
  assert.equal(count(`SELECT COUNT(*) n FROM commercial_invoices ci JOIN commercial_orders o ON o.id=ci.order_id WHERE o.quote_id IN (${quotes}) AND ci.status='pending_provider'`),0,'no provider invoice may be created while payments are frozen');
  assert.equal(count(`SELECT COUNT(*) n FROM subscriptions s JOIN onboarding_invitations i ON i.tenant_id=s.tenant_id WHERE i.id IN (${ids}) AND s.status='active'`),2,'both completed tenants need active manual subscriptions');
  assert.equal(count(`SELECT COUNT(*) n FROM tenant_users tu JOIN onboarding_invitations i ON i.tenant_id=tu.tenant_id WHERE i.id IN (${ids}) AND tu.status='active'`),2,'both admins need active tenant-user lifecycle links');
  assert.equal(count(`SELECT COUNT(*) n FROM memberships m JOIN onboarding_invitations i ON i.tenant_id=m.tenant_id WHERE i.id IN (${ids}) AND m.role='tenant_admin'`),2,'both admins need tenant-admin memberships');
  assert.equal(count(`SELECT COUNT(*) n FROM courses c JOIN onboarding_invitations i ON i.tenant_id=c.tenant_id WHERE i.id IN (${ids})`),2,'both onboarding paths must persist their optional first course once');
  console.log('Verified completed onboarding, duplicate protection, tenant access, orders, draft invoices, active subscriptions and payment freeze in real local D1.');
}
