import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { resolveCoreAuth } from '../dist/core/auth.js';
import { authStatus, sha256Text } from '../dist/core/utils.js';

// A minimal D1 adapter over node:sqlite so the real authorization code runs against real SQL
// instead of a hand-stubbed mock that can silently drift from the queries it is meant to model.
function d1(db){
  const bindable=v=>v===undefined||v===null?null:typeof v==='boolean'?(v?1:0):v;
  const stmt=sql=>{
    let values=[];
    const run=()=>{
      const s=db.prepare(sql);
      return{s,v:values.map(bindable)};
    };
    const api={
      bind(...args){values=args;return api;},
      async first(column){
        const{s,v}=run();const row=s.get(...v);
        if(row===undefined)return null;
        return column===undefined?row:row[column]??null;
      },
      async all(){const{s,v}=run();return{results:s.all(...v),success:true};},
      async run(){const{s,v}=run();const r=s.run(...v);return{success:true,meta:{changes:Number(r.changes||0)}};},
      async raw(){const{s,v}=run();return s.all(...v).map(row=>Object.values(row));},
    };
    return api;
  };
  return{prepare:stmt,async batch(list){const out=[];for(const item of list)out.push(await item.run());return out;}};
}

const SCHEMA=`
CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,display_name TEXT,password_hash TEXT,force_password_change INTEGER DEFAULT 0,is_platform_admin INTEGER DEFAULT 0,status TEXT DEFAULT 'active',created_at TEXT,updated_at TEXT);
CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT,slug TEXT,status TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE memberships(id TEXT PRIMARY KEY,tenant_id TEXT,course_id TEXT,user_id TEXT,role TEXT,created_at TEXT);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires_at TEXT,created_at TEXT,last_seen_at TEXT,auth_method TEXT,auth_tenant_id TEXT);
`;
const TENANT_USERS=`CREATE TABLE tenant_users(tenant_id TEXT,user_id TEXT,status TEXT,source TEXT,created_at TEXT,updated_at TEXT,PRIMARY KEY(tenant_id,user_id));`;

async function world({tenantUsersTable=true,tenantUsersRows=[]}={}){
  const db=new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  if(tenantUsersTable)db.exec(TENANT_USERS);
  const now=new Date().toISOString(),future=new Date(Date.now()+3600_000).toISOString();
  db.exec(`INSERT INTO tenants(id,name,slug,status) VALUES('ten_a','A','a','active'),('ten_b','B','b','active');`);
  db.exec(`INSERT INTO users(id,email,display_name,status) VALUES('usr_a','a@example.invalid','A','active'),('usr_b','b@example.invalid','B','active'),('usr_platform','p@example.invalid','P','active');`);
  db.exec(`UPDATE users SET is_platform_admin=1 WHERE id='usr_platform';`);
  db.exec(`INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_a','ten_a',NULL,'usr_a','tenant_admin','${now}'),('mem_b','ten_b',NULL,'usr_b','tenant_admin','${now}');`);
  if(tenantUsersTable){
    const rows=tenantUsersRows.length?tenantUsersRows:[['ten_a','usr_a','active'],['ten_b','usr_b','active']];
    for(const [t,u,s] of rows)db.prepare(`INSERT INTO tenant_users(tenant_id,user_id,status,source,created_at,updated_at) VALUES(?,?,?,'manual',?,?)`).run(t,u,s,now,now);
  }
  const tokens={};
  for(const user of ['usr_a','usr_b','usr_platform']){
    const raw=`token-${user}-0123456789abcdef`;
    db.prepare(`INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_seen_at,auth_method,auth_tenant_id) VALUES(?,?,?,?,?,'password',NULL)`).run(await sha256Text(raw),user,future,now,now);
    tokens[user]=raw;
  }
  return{env:{DB:d1(db)},tokens,db};
}
const request=token=>new Request('https://portal.example.invalid/api/tenant/settings',{headers:{cookie:`kp_session=${token}`}});
async function denial(env,token,tenantId){
  try{await resolveCoreAuth(env,request(token),tenantId);return null;}catch(e){return e.message;}
}

// 1. A member reaches their own tenant, and only their own tenant.
{
  const{env,tokens}=await world();
  const auth=await resolveCoreAuth(env,request(tokens.usr_a),'ten_a');
  assert.equal(auth.role,'tenant_admin');
  assert.deepEqual(auth.tenantIds,['ten_a']);
  assert.equal(await denial(env,tokens.usr_a,'ten_b'),'FORBIDDEN','a tenant admin must never reach another tenant');
  assert.equal(await denial(env,tokens.usr_b,'ten_a'),'FORBIDDEN');
}

// 2. Regression: a tenant_users row without a membership must not grant tenant access. The
// membership check used to be unreachable because the fallback context seeded the requested
// tenant into tenantIds, which left tenant_users as the only boundary.
{
  const{env,tokens}=await world({tenantUsersRows:[['ten_a','usr_a','active'],['ten_b','usr_b','active'],['ten_b','usr_a','active']]});
  assert.equal(await denial(env,tokens.usr_a,'ten_b'),'FORBIDDEN','an active tenant lifecycle link without a membership must not grant access');
}

// 3. Regression: on a database created before tenant_users existed, tenantUserActive answers
// "active" for everyone. Membership must still be the boundary.
{
  const{env,tokens}=await world({tenantUsersTable:false});
  const auth=await resolveCoreAuth(env,request(tokens.usr_a),'ten_a');
  assert.equal(auth.role,'tenant_admin','members must keep working on databases without tenant_users');
  assert.equal(await denial(env,tokens.usr_a,'ten_b'),'FORBIDDEN','a database without tenant_users must not fall open across tenants');
}

// 4. A member whose tenant lifecycle link is not active is suspended, not merely forbidden:
// the customer admin surface tells those users something different.
{
  const{env,tokens}=await world({tenantUsersRows:[['ten_a','usr_a','suspended'],['ten_b','usr_b','active']]});
  assert.equal(await denial(env,tokens.usr_a,'ten_a'),'TENANT_ACCESS_SUSPENDED');
  assert.equal(await denial(env,tokens.usr_a,'ten_b'),'FORBIDDEN','suspension in one tenant must not be reported for a foreign tenant');
}

// 5. Platform admins keep cross-tenant access, and a caller without any tenant is refused.
{
  const{env,tokens}=await world();
  for(const tenantId of ['ten_a','ten_b']){
    const auth=await resolveCoreAuth(env,request(tokens.usr_platform),tenantId);
    assert.equal(auth.isPlatformAdmin,true);
    assert.equal(auth.role,'platform_admin');
  }
  assert.equal(await denial(env,tokens.usr_a,'ten_unknown'),'FORBIDDEN','an unknown tenant id must be refused, never treated as accessible');
  assert.equal(await denial(env,'not-a-session-token-value','ten_a'),'UNAUTHENTICATED');
}

// Every authorization outcome must be reported as an authorization outcome, never as a bad
// request or a server error, on every router.
assert.equal(authStatus('FORBIDDEN'),403);
assert.equal(authStatus('TENANT_ACCESS_SUSPENDED'),403);
assert.equal(authStatus('SSO_REQUIRED'),403);
assert.equal(authStatus('FORBIDDEN_PERMISSION'),403);
assert.equal(authStatus('PLATFORM_ADMIN_REQUIRED'),403);
assert.equal(authStatus('TENANT_ADMIN_REQUIRED'),403);
assert.equal(authStatus('UNAUTHENTICATED'),401);
assert.equal(authStatus('COURSE_NOT_FOUND'),null,'domain codes must stay with the router that owns them');

const routers=['router','runtime-schema-router','payment-router','billing-lifecycle-router','platform-offer-router','launch-readiness-router','owner-security-router','custom-domain-router','account-recovery-router','collaboration-reporting-router','education-operations-router','learning-suite-router','live-study-router','microsoft-graph-router','platform-accounting-router','platform-accounting-autopilot-router'];
for(const name of routers){
  const source=await readFile(`src/core/${name}.ts`,'utf8');
  assert.match(source,/const status=authStatus\(code\)\?\?\(/,`${name} must map authorization failures through the shared contract`);
}

console.log('Tenant boundary authorization, legacy-schema fail-closed behaviour and shared authorization status contract: OK');
