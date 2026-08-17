import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertSameOrigin } from './utils.js';
import { ensureOfferSchema } from './offer-schema.js';
import { acceptPublicOffer, cancelPlatformOffer, createPlatformOffer, getPlatformOffer, listPlatformOffers, platformOfferMeta, previewPlatformOffer, publicOffer } from './platform-offers.js';
import { publishOrRotatePlatformOffer } from './platform-offer-links.js';
import { reissueAcceptedOfferOnboarding } from './platform-offer-onboarding.js';

function out(data:unknown,status=200):Response{return Response.json(data,{status,headers:{'cache-control':'no-store'}});}
async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function error(e:unknown):Response{
  const code=String((e as Error)?.message||'INTERNAL_ERROR');
  const status=code==='UNAUTHENTICATED'||code==='LOGIN_REQUIRED'?401
    :code==='PLATFORM_ADMIN_REQUIRED'||code==='FORBIDDEN'?403
    :code.includes('NOT_FOUND')?404
    :['OFFER_ALREADY_ACCEPTED','OFFER_NOT_DRAFT','OFFER_NOT_CANCELLABLE','OFFER_LINK_NOT_AVAILABLE','OFFER_NOT_ACCEPTED','OFFER_ONBOARDING_ALREADY_COMPLETED'].includes(code)?409
    :code==='OFFER_EXPIRED'?410
    :['SELLER_PROFILE_INCOMPLETE','LEGAL_CONFIGURATION_INCOMPLETE'].includes(code)?428
    :code==='INTERNAL_ERROR'?500:400;
  return out({ok:false,error:code},status);
}

export async function handlePlatformOfferApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url);
  if(!u.pathname.startsWith('/api/offers/')&&!u.pathname.startsWith('/api/platform/offers'))return null;
  try{await ensureOfferSchema(env);}catch(e){return error(e);}
  const publicMatch=u.pathname.match(/^\/api\/offers\/([^/]+)$/);
  if(publicMatch){
    try{
      const token=decodeURIComponent(publicMatch[1]);
      if(request.method==='GET')return out({ok:true,...await publicOffer(env,token)});
      if(request.method==='POST'){assertSameOrigin(request,env.APP_ORIGIN);return out({ok:true,...await acceptPublicOffer(env,token,await body(request),request)},201);}
      return out({ok:false,error:'METHOD_NOT_ALLOWED'},405);
    }catch(e){return error(e);}
  }
  try{
    assertSameOrigin(request,env.APP_ORIGIN);const auth=await resolveCoreAuth(env,request);
    if(u.pathname==='/api/platform/offers/meta'&&request.method==='GET')return out({ok:true,...await platformOfferMeta(env,auth)});
    if(u.pathname==='/api/platform/offers/preview'&&request.method==='POST')return out({ok:true,preview:await previewPlatformOffer(env,auth,await body(request))});
    if(u.pathname==='/api/platform/offers'&&request.method==='GET')return out({ok:true,offers:await listPlatformOffers(env,auth)});
    if(u.pathname==='/api/platform/offers'&&request.method==='POST')return out({ok:true,...await createPlatformOffer(env,auth,await body(request),request)},201);
    const publish=u.pathname.match(/^\/api\/platform\/offers\/([^/]+)\/publish$/);if(publish&&request.method==='POST')return out({ok:true,...await publishOrRotatePlatformOffer(env,auth,decodeURIComponent(publish[1]),request)});
    const onboarding=u.pathname.match(/^\/api\/platform\/offers\/([^/]+)\/onboarding-link$/);if(onboarding&&request.method==='POST')return out({ok:true,...await reissueAcceptedOfferOnboarding(env,auth,decodeURIComponent(onboarding[1]),request)});
    const cancel=u.pathname.match(/^\/api\/platform\/offers\/([^/]+)\/cancel$/);if(cancel&&request.method==='POST'){await cancelPlatformOffer(env,auth,decodeURIComponent(cancel[1]));return out({ok:true});}
    const detail=u.pathname.match(/^\/api\/platform\/offers\/([^/]+)$/);if(detail&&request.method==='GET')return out({ok:true,offer:await getPlatformOffer(env,auth,decodeURIComponent(detail[1]))});
    return out({ok:false,error:'NOT_FOUND'},404);
  }catch(e){return error(e);}
}
