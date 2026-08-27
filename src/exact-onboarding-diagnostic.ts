import type { Env } from './core/types.js';

const TOKEN_HASH='10a43231fb8127c6dc21e3a8fcc9bc54549cdc060b5fa433e7455d7bd82af6ed';
const PROBE_PATH='/__diag/onboarding/6d5c8da4b5e64c83927d9cd6dbe74ec2';

type Row=Record<string,unknown>;

async function rows(env:Env,sql:string,...bindings:unknown[]):Promise<Row[]>{
  const result=await env.DB.prepare(sql).bind(...bindings).all<Row>();
  return result.results??[];
}
async function one(env:Env,sql:string,...bindings:unknown[]):Promise<Row|null>{
  return await env.DB.prepare(sql).bind(...bindings).first<Row>()??null;
}
async function tableExists(env:Env,name:string):Promise<boolean>{
  return !!await env.DB.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?").bind(name).first();
}
async function columns(env:Env,name:string):Promise<string[]>{
  if(!await tableExists(env,name))return[];
  return (await rows(env,`PRAGMA table_info(${name})`)).map(row=>String(row.name??''));
}
function flag(value:unknown):number{return Number(value)?1:0;}

async function diagnostic(env:Env){
  const invitationTable=await tableExists(env,'onboarding_invitations');
  if(!invitationTable)return{found:0,failure:'onboarding_invitations_missing'};

  const invitationColumns=await columns(env,'onboarding_invitations');
  const hasQuoteId=invitationColumns.includes('quote_id');
  const select=[
    'id','status','expires_at','tenant_id','form_json','plan_id',
    hasQuoteId?'quote_id':'NULL AS quote_id',
  ].join(',');
  const invitation=await one(env,`SELECT ${select} FROM onboarding_invitations WHERE token_hash=? LIMIT 1`,TOKEN_HASH);

  const inviteSql=String((await one(env,"SELECT COALESCE(sql,'') AS sql FROM sqlite_master WHERE type='table' AND name='onboarding_invitations'"))?.sql??'');
  const claimTable=await tableExists(env,'onboarding_claims');
  const tombTable=await tableExists(env,'onboarding_claim_tombstones');
  const migrationTable=await tableExists(env,'d1_migrations');
  const tenantUsersColumns=await columns(env,'tenant_users');

  const base={
    found:invitation?1:0,
    status:String(invitation?.status??'none'),
    expired:invitation?.expires_at&&Date.parse(String(invitation.expires_at))<=Date.now()?1:0,
    hasTenant:invitation?.tenant_id?1:0,
    hasForm:invitation?.form_json?1:0,
    hasQuote:invitation?.quote_id?1:0,
    invitationHasQuoteColumn:hasQuoteId?1:0,
    processingColumn:invitationColumns.includes('processing_nonce')?1:0,
    processingAllowedByCheck:inviteSql.includes("'processing'")?1:0,
    claimTable:claimTable?1:0,
    tombstoneTable:tombTable?1:0,
    migration0089:migrationTable&&!!await one(env,"SELECT 1 AS ok FROM d1_migrations WHERE name='0089_onboarding_claim_tombstone.sql' LIMIT 1")?1:0,
    tenantUsersCompatible:['tenant_id','user_id','status'].every(name=>tenantUsersColumns.includes(name))?1:0,
    tenantUsersCurrent:['tenant_id','user_id','status','external_id','source','created_at','updated_at'].every(name=>tenantUsersColumns.includes(name))?1:0,
  };
  if(!invitation)return{...base,claimCount:0,tombstoneCount:0,quoteStatus:'none',quoteKind:'none',acceptanceCount:0,planActive:0,pricingUsable:0};

  const invitationId=String(invitation.id??'');
  const quoteId=String(invitation.quote_id??'');
  const planId=String(invitation.plan_id??'');
  const claimCount=claimTable?Number((await one(env,'SELECT COUNT(*) AS n FROM onboarding_claims WHERE invitation_id=?',invitationId))?.n??0):0;
  const tombstoneCount=tombTable?Number((await one(env,'SELECT COUNT(*) AS n FROM onboarding_claim_tombstones WHERE invitation_id=?',invitationId))?.n??0):0;
  const planActive=!!await one(env,'SELECT 1 AS ok FROM plans WHERE id=? AND is_active=1 LIMIT 1',planId)?1:0;

  let quoteStatus='none',quoteKind='none',acceptanceCount=0,pricingUsable=0;
  if(quoteId&&await tableExists(env,'commercial_quotes')){
    const quoteColumns=await columns(env,'commercial_quotes');
    const fields=['status'];
    fields.push(quoteColumns.includes('offer_kind')?'offer_kind':'NULL AS offer_kind');
    fields.push(quoteColumns.includes('recurring_monthly_cents')?'recurring_monthly_cents':'NULL AS recurring_monthly_cents');
    fields.push(quoteColumns.includes('setup_cents')?'setup_cents':'NULL AS setup_cents');
    fields.push(quoteColumns.includes('first_total_cents')?'first_total_cents':'NULL AS first_total_cents');
    const quote=await one(env,`SELECT ${fields.join(',')} FROM commercial_quotes WHERE id=? LIMIT 1`,quoteId);
    quoteStatus=String(quote?.status??'none');
    quoteKind=String(quote?.offer_kind??(quote?'legacy':'none'));
    pricingUsable=quote&&Number(quote.recurring_monthly_cents??0)>0&&Number(quote.setup_cents??-1)>=0&&Number(quote.first_total_cents??0)>0?1:0;
    if(await tableExists(env,'commercial_offer_acceptances'))acceptanceCount=Number((await one(env,'SELECT COUNT(*) AS n FROM commercial_offer_acceptances WHERE quote_id=?',quoteId))?.n??0);
  }

  return{...base,claimCount,tombstoneCount,quoteStatus,quoteKind,acceptanceCount,planActive,pricingUsable};
}

export default{
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(request.method!=='GET'||url.pathname!==PROBE_PATH)return new Response('Not found',{status:404});
    try{
      return new Response(JSON.stringify(await diagnostic(env)),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
    }catch(error){
      const message=String((error as Error)?.message??'DIAGNOSTIC_FAILED').replace(/[^A-Za-z0-9_:. -]/g,'').slice(0,240);
      return new Response(JSON.stringify({ok:false,error:message}),{status:500,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
    }
  }
};
