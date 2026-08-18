import type { CoreAuthContext, Env } from './types.js';
import { requireCourseAccess } from './permissions.js';

type Course={id:string;name:string;code:string;is_active:number};
type Unit={id:string;parent_id:string|null;name:string;code:string|null;external_id:string|null;status:string};
type Link={course_id:string;org_unit_id:string};

type Model={courses:Course[];paths:Map<string,Unit[][]>};
export type ParticipantTargetInput={courseId?:string|null;courseCode?:string|null;courseName?:string|null;orgContext?:string[]|null;fallbackCourseId?:string|null;fallbackOrgUnitId?:string|null};
export type ParticipantTarget={courseId:string|null;orgPath:string|null;status:'automatic'|'review'|'blocked';warning:string|null};

export function normalizeOrgToken(v:unknown):string{return String(v??'').trim().toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
export function splitOrgPath(v:unknown):string[]{return String(v??'').split(/\s*(?:>|›|→|\/|\\|\||;)\s*/).map(normalizeOrgToken).filter(Boolean);}
function tokens(u:Unit){return new Set([u.name,u.code,u.external_id].map(normalizeOrgToken).filter(Boolean));}
function pathOf(id:string,byId:Map<string,Unit>){const out:Unit[]=[],seen=new Set<string>();let u=byId.get(id);while(u&&!seen.has(u.id)){seen.add(u.id);out.unshift(u);u=u.parent_id?byId.get(u.parent_id):undefined;}return out;}
function matches(path:Unit[],ctx:string[]){if(path.some(u=>u.status!=='active'))return false;return ctx.every(x=>path.some(u=>tokens(u).has(x)));}
function allowed(auth:CoreAuthContext,id:string){try{requireCourseAccess(auth,id);return true;}catch{return false;}}
async function model(env:Env,tenantId:string):Promise<Model>{const [c,u,l]=await Promise.all([env.DB.prepare('SELECT id,name,code,is_active FROM courses WHERE tenant_id=?').bind(tenantId).all<Course>(),env.DB.prepare('SELECT id,parent_id,name,code,external_id,status FROM org_units WHERE tenant_id=?').bind(tenantId).all<Unit>(),env.DB.prepare('SELECT course_id,org_unit_id FROM course_org_units WHERE tenant_id=?').bind(tenantId).all<Link>()]),units=u.results??[],byId=new Map(units.map(x=>[x.id,x])),paths=new Map<string,Unit[][]>();for(const x of l.results??[]){const p=pathOf(x.org_unit_id,byId);if(!p.length)continue;const list=paths.get(x.course_id)??[];list.push(p);paths.set(x.course_id,list);}return{courses:c.results??[],paths};}
function coursePaths(m:Model,id:string,ctx:string[]){const p=m.paths.get(id)??[];return ctx.length?p.filter(x=>matches(x,ctx)):p.filter(x=>x.every(u=>u.status==='active'));}
function label(p:Unit[]|undefined){return p?.map(x=>x.name).join(' › ')||null;}
export async function resolveParticipantTarget(env:Env,auth:CoreAuthContext,tenantId:string,input:ParticipantTargetInput):Promise<ParticipantTarget>{
  const m=await model(env,tenantId),ctx=[...new Set((input.orgContext??[]).map(normalizeOrgToken).filter(Boolean))],explicit=input.courseId?m.courses.find(x=>x.id===input.courseId):undefined;
  const accept=(c:Course,why:string):ParticipantTarget=>{if(!c.is_active)return{courseId:null,orgPath:null,status:'blocked',warning:'COURSE_INACTIVE'};if(!allowed(auth,c.id))return{courseId:null,orgPath:null,status:'blocked',warning:'COURSE_FORBIDDEN'};const p=coursePaths(m,c.id,ctx);if(ctx.length&&!p.length)return{courseId:null,orgPath:null,status:'blocked',warning:'ORG_CONTEXT_MISMATCH'};if(p.length>1&&ctx.length)return{courseId:null,orgPath:null,status:'review',warning:'ORG_CONTEXT_AMBIGUOUS'};void why;return{courseId:c.id,orgPath:label(p[0]),status:'automatic',warning:null};};
  if(explicit)return accept(explicit,'explicit');
  const code=normalizeOrgToken(input.courseCode),name=normalizeOrgToken(input.courseName);let candidates=code?m.courses.filter(x=>normalizeOrgToken(x.code)===code):name?m.courses.filter(x=>normalizeOrgToken(x.name)===name):m.courses.slice();if(ctx.length)candidates=candidates.filter(c=>coursePaths(m,c.id,ctx).length>0);const active=candidates.filter(c=>c.is_active&&allowed(auth,c.id));if(active.length===1)return accept(active[0],'unique');if(active.length>1)return{courseId:null,orgPath:null,status:'review',warning:'COURSE_AMBIGUOUS'};
  if(input.fallbackCourseId){const fallback=m.courses.find(x=>x.id===input.fallbackCourseId);if(fallback){const r=accept(fallback,'fallback');if(r.status==='automatic')return{...r,warning:'COURSE_FALLBACK_USED'};}}
  if(input.fallbackOrgUnitId){const fallbackPath=pathOf(input.fallbackOrgUnitId,new Map((await env.DB.prepare('SELECT id,parent_id,name,code,external_id,status FROM org_units WHERE tenant_id=?').bind(tenantId).all<Unit>()).results?.map(x=>[x.id,x])??[]));const fctx=fallbackPath.map(x=>normalizeOrgToken(x.name));const scoped=m.courses.filter(c=>c.is_active&&allowed(auth,c.id)&&coursePaths(m,c.id,fctx).length);if(scoped.length===1)return{courseId:scoped[0].id,orgPath:label(fallbackPath),status:'automatic',warning:'ORG_FALLBACK_USED'};if(scoped.length>1)return{courseId:null,orgPath:label(fallbackPath),status:'review',warning:'COURSE_AMBIGUOUS'};}
  if(candidates.some(x=>!x.is_active))return{courseId:null,orgPath:null,status:'blocked',warning:'COURSE_INACTIVE'};if(candidates.length&&!active.length)return{courseId:null,orgPath:null,status:'blocked',warning:'COURSE_FORBIDDEN'};return{courseId:null,orgPath:null,status:'review',warning:ctx.length?'ORG_CONTEXT_UNRESOLVED':'COURSE_NOT_RESOLVED'};
}
