import type { Env } from './types.js';
import { getSession } from './auth.js';
import { productionOriginStatus } from './production-release-state.js';
import { stripeModeIfConfigured } from './stripe-mode.js';

const WORKER_SERVICE_NAME='klassenportal-commercial';
const READ_METHODS=new Set(['GET','HEAD']);

function normalizedPath(path:string):string{return path==='/'?'/':path.replace(/\/+$/,'');}

export function isLockedAcceptanceEnvironment(env:Env,request:Request):boolean{
  if(productionOriginStatus(env).ok)return false;
  try{
    const u=new URL(request.url),host=u.hostname.toLowerCase();
    if(u.protocol!=='https:'||!host.endsWith('.workers.dev'))return false;
    return (host.split('.')[0]||'')===WORKER_SERVICE_NAME;
  }catch{return false;}
}

function publicAcceptanceCapability(request:Request):boolean{
  const path=normalizedPath(new URL(request.url).pathname),read=READ_METHODS.has(request.method);
  if(read&&['/produkt','/kunden-admin','/klassen-admin','/dozentenportal.html','/zahlung/erfolg','/zahlung/abgebrochen','/api/public/product'].includes(path))return true;
  if(read&&(/^\/portal\/[^/]+\/[^/]+$/.test(path)||/^\/einrichtung\/[^/]+$/.test(path)||/^\/angebot\/[^/]+$/.test(path)||/^\/eingang\/[^/]+$/.test(path)))return true;
  if(read&&(path.startsWith('/public/')||path.startsWith('/calendar/')||path.startsWith('/sso/')))return true;
  if(/^\/api\/offers\/[^/]+$/.test(path))return request.method==='GET'||request.method==='POST';
  if(/^\/api\/onboarding\/[^/]+\/quote$/.test(path))return request.method==='GET';
  if(/^\/api\/onboarding\/[^/]+$/.test(path))return request.method==='GET'||request.method==='POST';
  if(/^\/api\/intake\/upload\/[^/]+$/.test(path))return request.method==='POST';
  if(path.startsWith('/scim/')||path.startsWith('/api/v1/'))return true;
  return false;
}

function livePaymentWouldBePossible(env:Env,request:Request):boolean{
  if(READ_METHODS.has(request.method))return false;
  const path=normalizedPath(new URL(request.url).pathname);
  const paymentMutation=/^\/api\/onboarding\/[^/]+$/.test(path)||path.startsWith('/api/billing/');
  if(!paymentMutation)return false;
  try{return stripeModeIfConfigured(env)==='live';}catch{return true;}
}

export async function acceptanceModeAllowsLockedRequest(env:Env,request:Request):Promise<boolean>{
  if(!isLockedAcceptanceEnvironment(env,request))return false;
  if(livePaymentWouldBePossible(env,request))return false;
  if(publicAcceptanceCapability(request))return true;
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/api/'))return false;
  try{return !!await getSession(env,request);}catch{return false;}
}
