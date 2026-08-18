import type { CoreAuthContext, Env } from './types.js';
import { requireCourseAccess, requireRole } from './permissions.js';
import { safeString } from './utils.js';
import { saveGradebookCategory, saveGradingScale } from './learning-suite.js';

function manager(auth:CoreAuthContext,courseId:string){requireRole(auth,'class_admin');requireCourseAccess(auth,courseId);}
const clean=(v:unknown,n=500)=>safeString(v,n);
export const roundGradePercent=(v:number)=>Math.round((v+Number.EPSILON)*100)/100;
const cents=(v:number)=>Math.round(roundGradePercent(v)*100);

export type NormalizedScaleItem={label:string;min_percent:number;max_percent:number};
export type WeightedGradeValue={pct:number;itemWeight:number};

export function normalizeGradeScaleItems(input:Record<string,unknown>):NormalizedScaleItem[]{
  const raw=Array.isArray(input.items)?input.items as Record<string,unknown>[]:[];
  if(raw.length<2||raw.length>30)throw new Error('GRADING_SCALE_INVALID');
  const items=raw.map(x=>({label:clean(x.label,40),min_percent:roundGradePercent(Number(x.min_percent)),max_percent:roundGradePercent(Number(x.max_percent))}));
  if(items.some(x=>!x.label||!Number.isFinite(x.min_percent)||!Number.isFinite(x.max_percent)||x.min_percent<0||x.max_percent>100||x.min_percent>x.max_percent))throw new Error('GRADING_SCALE_INVALID');
  if(new Set(items.map(x=>x.label.toLocaleLowerCase('de-DE'))).size!==items.length)throw new Error('GRADING_SCALE_LABEL_DUPLICATE');
  const ordered=[...items].sort((a,b)=>a.min_percent-b.min_percent||a.max_percent-b.max_percent);
  if(cents(ordered[0].min_percent)!==0||cents(ordered[ordered.length-1].max_percent)!==10000)throw new Error('GRADING_SCALE_COVERAGE_REQUIRED');
  for(let i=1;i<ordered.length;i++){
    const previousMax=cents(ordered[i-1].max_percent),nextMin=cents(ordered[i].min_percent);
    if(nextMin<=previousMax)throw new Error('GRADING_SCALE_OVERLAP');
    if(nextMin!==previousMax+1)throw new Error('GRADING_SCALE_GAP');
  }
  return items;
}

export function weightedCategoryAverage(values:WeightedGradeValue[],dropLowest:number):{average:number;items:number;itemWeightTotal:number}|null{
  let usable=values.filter(value=>Number.isFinite(value.pct)&&Number.isFinite(value.itemWeight)&&value.itemWeight>0).map(value=>({pct:Math.max(0,Math.min(100,value.pct)),itemWeight:value.itemWeight}));
  usable.sort((a,b)=>a.pct-b.pct);
  const drop=Math.min(Math.max(0,Math.trunc(dropLowest)),Math.max(0,usable.length-1));usable=usable.slice(drop);
  const itemWeightTotal=usable.reduce((sum,value)=>sum+value.itemWeight,0);if(!usable.length||itemWeightTotal<=0)return null;
  return{average:usable.reduce((sum,value)=>sum+value.pct*value.itemWeight,0)/itemWeightTotal,items:usable.length,itemWeightTotal};
}

export function assertCategoryWeightTotal(currentBasisPoints:number,nextBasisPoints:number){
  if(!Number.isFinite(currentBasisPoints)||!Number.isFinite(nextBasisPoints)||currentBasisPoints<0||nextBasisPoints<0||currentBasisPoints+nextBasisPoints>10000)throw new Error('CATEGORY_WEIGHT_TOTAL_EXCEEDED');
}

async function storedScale(env:Env,tenantId:string,courseId:string){
  const s=await env.DB.prepare('SELECT id,name FROM grading_scales WHERE tenant_id=? AND (course_id=? OR course_id IS NULL) ORDER BY CASE WHEN course_id=? THEN 0 ELSE 1 END,is_default DESC,updated_at DESC LIMIT 1').bind(tenantId,courseId,courseId).first<{id:string;name:string}>();
  if(!s)return null;
  const items=(await env.DB.prepare('SELECT label,min_percent,max_percent FROM grading_scale_items WHERE scale_id=? ORDER BY min_percent DESC').bind(s.id).all<{label:string;min_percent:number;max_percent:number}>()).results??[];
  let valid=true;try{normalizeGradeScaleItems({items});}catch{valid=false;}
  return{...s,items,valid};
}

export async function safeSaveGradebookCategory(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,input:Record<string,unknown>){
  manager(auth,courseId);
  const name=clean(input.name,120),existing=clean(input.id,120),weight=Math.trunc(Number(input.weight_basis_points??0));
  if(!name||!Number.isFinite(weight)||weight<0||weight>10000)throw new Error('CATEGORY_POLICY_INVALID');
  if(existing){const row=await env.DB.prepare('SELECT name FROM gradebook_categories WHERE id=? AND tenant_id=? AND course_id=?').bind(existing,tenantId,courseId).first<{name:string}>();if(!row)throw new Error('CATEGORY_NOT_FOUND');if(row.name!==name)throw new Error('CATEGORY_RENAME_NOT_ALLOWED');}
  const duplicate=await env.DB.prepare('SELECT id FROM gradebook_categories WHERE tenant_id=? AND course_id=? AND lower(name)=lower(?) AND (?=\'\' OR id<>?) LIMIT 1').bind(tenantId,courseId,name,existing,existing).first();
  if(duplicate)throw new Error('CATEGORY_NAME_DUPLICATE');
  const current=Number(await env.DB.prepare('SELECT COALESCE(SUM(weight_basis_points),0) AS n FROM gradebook_categories WHERE tenant_id=? AND course_id=? AND (?=\'\' OR id<>?)').bind(tenantId,courseId,existing,existing).first<number>('n')||0);
  assertCategoryWeightTotal(current,weight);
  return saveGradebookCategory(env,auth,tenantId,courseId,input);
}

export async function safeSaveGradingScale(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,input:Record<string,unknown>){
  manager(auth,courseId);const name=clean(input.name,120);if(!name)throw new Error('GRADING_SCALE_INVALID');const items=normalizeGradeScaleItems(input);return saveGradingScale(env,auth,tenantId,courseId,{...input,items});
}

export async function safeAdvancedGradebook(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string){
  manager(auth,courseId);
  const categories=(await env.DB.prepare('SELECT * FROM gradebook_categories WHERE tenant_id=? AND course_id=? ORDER BY sort_order,name').bind(tenantId,courseId).all<Record<string,unknown>>()).results??[];
  const items=(await env.DB.prepare('SELECT * FROM gradebook_items WHERE tenant_id=? AND course_id=? ORDER BY created_at,title').bind(tenantId,courseId).all<Record<string,unknown>>()).results??[];
  const scores=(await env.DB.prepare("SELECT gs.*,u.display_name,u.email FROM gradebook_scores gs JOIN users u ON u.id=gs.user_id WHERE gs.tenant_id=? AND gs.course_id=? AND gs.status='published'").bind(tenantId,courseId).all<Record<string,unknown>>()).results??[];
  const participants=(await env.DB.prepare("SELECT DISTINCT u.id,u.display_name,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? AND m.course_id=? AND m.role='participant' AND u.status='active' ORDER BY u.display_name").bind(tenantId,courseId).all<Record<string,unknown>>()).results??[];
  const configuredWeight=categories.reduce((sum,c)=>sum+Number(c.weight_basis_points||0),0),categoryWeightValid=configuredWeight<=10000;
  const result=participants.map(participant=>{
    let weighted=0,weightUsed=0;const details:Record<string,unknown>[]=[];
    for(const category of categories){
      const categoryName=String(category.name),categoryItems=items.filter(item=>String(item.category||'')===categoryName&&Number(item.max_points||0)>0&&Number(item.weight??1)>0);
      const values=categoryItems.map(item=>{const score=scores.find(x=>x.user_id===participant.id&&x.item_id===item.id);if(!score||score.points===null||score.points===undefined)return null;const pct=Math.max(0,Math.min(100,Number(score.points)/Number(item.max_points)*100));return{pct,itemWeight:Number(item.weight??1)};}).filter(Boolean) as WeightedGradeValue[];
      const summary=weightedCategoryAverage(values,Number(category.drop_lowest||0));if(!summary)continue;
      const categoryWeight=Number(category.weight_basis_points||0)/10000;weighted+=summary.average*categoryWeight;weightUsed+=categoryWeight;
      details.push({category:categoryName,percent:summary.average,weight_basis_points:category.weight_basis_points,items:summary.items,item_weight_total:summary.itemWeightTotal});
    }
    const percent=categoryWeightValid&&weightUsed>0?weighted/weightUsed:null;
    return{...participant,final_percent:percent,complete_weight:Math.round(weightUsed*10000),details};
  });
  return{categories,items,participants:result,policy:{category_weight_basis_points:configuredWeight,category_weight_valid:categoryWeightValid}};
}

export async function safeOfficialGradeReport(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string){
  manager(auth,courseId);const data=await safeAdvancedGradebook(env,auth,tenantId,courseId),scale=await storedScale(env,tenantId,courseId);
  const rows=(data.participants as Record<string,unknown>[]).map(participant=>{const raw=participant.final_percent===null||participant.final_percent===undefined?null:Number(participant.final_percent),percent=raw===null?null:roundGradePercent(raw);const label=percent===null||!scale?.valid?'':scale.items.find(item=>percent>=roundGradePercent(Number(item.min_percent))&&percent<=roundGradePercent(Number(item.max_percent)))?.label||'';return{user_id:participant.id,name:participant.display_name,email:participant.email,percent:percent===null?'':percent,grade:label,weight_complete_basis_points:participant.complete_weight};});
  return{scale:scale?{id:scale.id,name:scale.name,items:scale.items,valid:scale.valid}:null,category_weight_valid:data.policy.category_weight_valid,category_weight_basis_points:data.policy.category_weight_basis_points,rows};
}

export function csvSafeCell(v:unknown):string{const raw=String(v??''),safe=/^[\s]*[=+\-@]/.test(raw)?`'${raw}`:raw;return`"${safe.replace(/"/g,'""')}"`;}
export async function safeOfficialGradeCsv(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string){
  const report=await safeOfficialGradeReport(env,auth,tenantId,courseId);if(!report.category_weight_valid)throw new Error('CATEGORY_WEIGHT_TOTAL_INVALID');if(report.scale&&report.scale.valid===false)throw new Error('GRADING_SCALE_STORED_INVALID');
  const columns=['user_id','name','email','percent','grade','weight_complete_basis_points'];
  return'\uFEFF'+[columns.map(csvSafeCell).join(';'),...report.rows.map(row=>columns.map(column=>csvSafeCell((row as Record<string,unknown>)[column])).join(';'))].join('\r\n');
}
