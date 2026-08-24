import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertSameOrigin, safeString } from './utils.js';
import { ensureOfferSchema } from './offer-schema.js';
import { acceptPublicOffer, cancelPlatformOffer, createPlatformOffer, getPlatformOffer, listPlatformOffers, platformOfferMeta, previewPlatformOffer, publicOffer } from './platform-offers.js';
import { platformOfferAdminPreview } from './platform-offer-admin-preview.js';
import { publishOrRotatePlatformOffer } from './platform-offer-links.js';
import { reissueAcceptedOfferOnboarding } from './platform-offer-onboarding.js';
import { deliverPublishedPlatformOffer, emailPlatformOffer } from './platform-offer-mail.js';
import { deliverOnboardingLinkMail } from './platform-onboarding-mail.js';

function out(data:unknown,status=200):Response{return Response.json(data,{status,headers:{'cache-control':'no-store'}});}
async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function error(e:unknown):Response{
  const code=String((e as Error)?.message||'INTERNAL_ERROR');
  const status=code==='UNAUTHENTICATED'||code==='LOGIN_REQUIRED'?401
    :code==='PLATFORM_ADMIN_REQUIRED'||code==='FORBIDDEN'?403
    :code.includes('NOT_FOUND')?404
    :['OFFER_ALREADY_ACCEPTED','OFFER_NOT_DRAFT','OFFER_NOT_CANCELLABLE','OFFER_LINK_NOT_AVAILABLE','OFFER_NOT_ACCEPTED','OFFER_ONBOARDING_ALREADY_COMPLETED','OFFER_EMAIL_NOT_AVAILABLE'].includes(code)?409
    :code==='OFFER_EXPIRED'?410
    :['SELLER_PROFILE_INCOMPLETE','LEGAL_CONFIGURATION_INCOMPLETE','MAIL_PROVIDER_NOT_CONFIGURED'].includes(code)?428
    :code==='INTERNAL_ERROR'?500:400;
  return out({ok:false,error:code},status);
}
function deliveryError(e:unknown){return{sent:false,mailId:null,error:String((e as Error)?.message||'MAIL_SEND_FAILED')};}
function activeOriginUrl(request:Request,value:string):string{
  try{const src=new URL(value),dst=new URL(request.url);return `${dst.origin}${src.pathname}${src.search}${src.hash}`;}catch{return value;}
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
      if(request.method==='POST'){
        assertSameOrigin(request,env.APP_ORIGIN);const payload=await body(request),accepted=await acceptPublicOffer(env,token,payload,request),onboardingUrl=activeOriginUrl(request,accepted.onboardingUrl);
        const onboardingDelivery=await deliverOnboardingLinkMail(env,{to:safeString(payload.accepted_email,320),name:safeString(payload.accepted_name,200),quoteNumber:accepted.quoteNumber,onboardingUrl,expiresAt:accepted.onboardingExpiresAt,idemKey:`offer-onboarding:${accepted.quoteNumber}:${safeString(payload.accepted_email,320)}`});
        return out({ok:true,...accepted,onboardingUrl,onboardingDelivery},201);
      }
      return out({ok:false,error:'METHOD_NOT_ALLOWED'},405);
    }catch(e){return error(e);}
  }
  try{
    assertSameOrigin(request,env.APP_ORIGIN);const auth=await resolveCoreAuth(env,request);
    if(u.pathname==='/api/platform/offers/meta'&&request.method==='GET')return out({ok:true,...await platformOfferMeta(env,auth)});
    if(u.pathname==='/api/platform/offers/preview'&&request.method==='POST')return out({ok:true,preview:await previewPlatformOffer(env,auth,await body(request))});
    if(u.pathname==='/api/platform/offers'&&request.method==='GET')return out({ok:true,offers:await listPlatformOffers(env,auth)});
    if(u.pathname==='/api/platform/offers'&&request.method==='POST'){
      const created=await createPlatformOffer(env,auth,await body(request),request);let delivery=null;
      if(created.publicUrl){
        const publicUrl=activeOriginUrl(request,created.publicUrl);created.publicUrl=publicUrl;
        try{delivery=await deliverPublishedPlatformOffer(env,auth,String((created.offer as Record<string,unknown>).id),publicUrl,false);}catch(e){delivery=deliveryError(e);}
      }
      return out({ok:true,...created,delivery},201);
    }
    const publish=u.pathname.match(/^\/api\/platform\/offers\/([^/]+)\/publish$/);if(publish&&request.method==='POST'){
      const quoteId=decodeURIComponent(publish[1]),published=await publishOrRotatePlatformOffer(env,auth,quoteId,request);let delivery;
      try{delivery=await deliverPublishedPlatformOffer(env,auth,quoteId,published.publicUrl,published.rotated);}catch(e){delivery=deliveryError(e);}
      return out({ok:true,...published,delivery});
    }
    const email=u.pathname.match(/^\/api\/platform\/offers\/([^/]+)\/email$/);if(email&&request.method==='POST')return out({ok:true,...await emailPlatformOffer(env,auth,decodeURIComponent(email[1]),request)});
    const onboarding=u.pathname.match(/^\/api\/platform\/offers\/([^/]+)\/onboarding-link$/);if(onboarding&&request.method==='POST')return out({ok:true,...await reissueAcceptedOfferOnboarding(env,auth,decodeURIComponent(onboarding[1]),request)});
    const adminPreview=u.pathname.match(/^\/api\/platform\/offers\/([^/]+)\/admin-preview$/);if(adminPreview&&request.method==='GET')return out({ok:true,...await platformOfferAdminPreview(env,auth,decodeURIComponent(adminPreview[1]))});
    const cancel=u.pathname.match(/^\/api\/platform\/offers\/([^/]+)\/cancel$/);if(cancel&&request.method==='POST'){await cancelPlatformOffer(env,auth,decodeURIComponent(cancel[1]));return out({ok:true});}
    const detail=u.pathname.match(/^\/api\/platform\/offers\/([^/]+)$/);if(detail&&request.method==='GET')return out({ok:true,offer:await getPlatformOffer(env,auth,decodeURIComponent(detail[1]))});
    return out({ok:false,error:'NOT_FOUND'},404);
  }catch(e){return error(e);}
}
