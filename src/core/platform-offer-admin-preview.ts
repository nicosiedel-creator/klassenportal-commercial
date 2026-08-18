import type { CoreAuthContext, Env } from './types.js';
import { getPlatformOffer } from './platform-offers.js';

export async function platformOfferAdminPreview(env:Env,auth:CoreAuthContext,quoteId:string){
  const q=await getPlatformOffer(env,auth,quoteId) as Record<string,any>;
  const seller=await env.DB.prepare('SELECT legal_name,street,postal_code,city,country,email,phone,website,vat_id FROM seller_billing_profile WHERE id=1').first<Record<string,unknown>>()??{};
  return{
    adminPreview:true,
    offer:{
      id:q.id,
      number:q.quote_number,
      subject:q.subject,
      kind:q.offer_kind,
      status:q.status,
      validUntil:q.valid_until,
      createdAt:q.created_at,
      customer:{
        name:q.customer_name,
        contactName:q.customer_contact_name,
        email:q.customer_email,
        street:q.customer_street,
        postalCode:q.customer_postal_code,
        city:q.customer_city,
        country:q.customer_country,
      },
      planId:q.plan_id,
      courseCount:q.requested_courses,
      currency:q.currency,
      recurringMonthlyCents:q.recurring_monthly_cents,
      setupCents:q.setup_cents,
      firstTotalCents:q.first_total_cents,
      monthlyListCents:q.monthly_list_cents,
      setupListCents:q.setup_list_cents,
      recurringDiscountCents:q.recurring_discount_cents,
      setupDiscountCents:q.setup_discount_cents,
      manualPricing:!!q.manual_pricing,
      notes:q.notes,
      acceptedAt:q.accepted_at,
      pricing:q.pricing_snapshot||{},
    },
    seller,
  };
}
