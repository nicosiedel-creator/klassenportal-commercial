import type { Env } from './types.js';
import { publicLegal } from './legal.js';

export async function publicProduct(env:Env){
  const [plans,setups,legal]=await Promise.all([
    env.DB.prepare(`SELECT p.id,p.name,p.monthly_price_cents,r.included_courses,r.extra_course_monthly_cents,r.currency,r.pricing_enabled
      FROM plans p JOIN plan_commerce_rules r ON r.plan_id=p.id WHERE p.is_active=1 AND r.pricing_enabled=1 ORDER BY p.monthly_price_cents,p.name`).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,name,description,max_courses,price_cents FROM managed_setup_options WHERE is_active=1 AND is_trial_setup=0 ORDER BY sort_order,name`).all<Record<string,unknown>>(),
    publicLegal(env)
  ]);
  return{plans:(plans.results??[]).map(x=>({id:x.id,name:x.name,monthlyPriceCents:Number(x.monthly_price_cents||0),includedCourses:x.included_courses===null?null:Number(x.included_courses),extraCourseMonthlyCents:x.extra_course_monthly_cents===null?null:Number(x.extra_course_monthly_cents),currency:String(x.currency||'EUR')})),managedSetup:setups.results??[],supportEmail:legal.supportEmail,legalReady:legal.complete};
}
