import type { Env } from './types.js';
import { renderIntakeUploadPage } from './intake-center.js';

export async function renderSecureIntakeUploadPage(env:Env,raw:string):Promise<Response>{
  const base=await renderIntakeUploadPage(env,raw);if(base.status!==200)return base;let html=await base.text();
  html=html.replace(',.rtf,.html,.htm','');
  return new Response(html,{status:200,headers:base.headers});
}
