import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { commerceConfig, checkoutParameters, assertPaidSession, validSessionId, downloadPageUrl, paidSession, CommerceError } from '../lib/commerce';
import { ESSAY_PRODUCT } from '../lib/site';
const env = { ESSAY_SALES_ENABLED:'true', STRIPE_SECRET_KEY:'sk_test_example_not_a_real_key', STRIPE_WEBHOOK_SECRET:'whsec_example', USER_EMAIL:'owner@example.com', GMAIL_APP_PASSWORD:'example', BLOB_READ_WRITE_TOKEN:'example', ESSAY_BUNDLE_BLOB_URL:'https://example.private.blob.vercel-storage.com/essays.zip', COMMERCE_ORIGIN:'https://prameshsharma.com' };
const settings = commerceConfig(env)!;
function paid(): Stripe.Checkout.Session {
  return { id:'cs_test_1234567890abcdef1234567890abcdef',mode:'payment',status:'complete',payment_status:'paid',livemode:false,metadata:{product_id:ESSAY_PRODUCT.id},currency:'usd',amount_subtotal:500,line_items:{data:[{quantity:1,price:{unit_amount:500,product:{metadata:{product_id:ESSAY_PRODUCT.id}}}}]},payment_intent:{status:'succeeded',latest_charge:{refunded:false,amount_refunded:0,disputed:false}} } as unknown as Stripe.Checkout.Session;
}
test('checkout fails closed when a required service is missing or disabled',()=>{
  assert.ok(settings);
  for (const key of ['ESSAY_SALES_ENABLED','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','USER_EMAIL','GMAIL_APP_PASSWORD','BLOB_READ_WRITE_TOKEN','ESSAY_BUNDLE_BLOB_URL']) assert.equal(commerceConfig({...env,[key]:''}),null,key);
});
test('private asset and return origin are constrained',()=>{
  for (const url of ['https://example.public.blob.vercel-storage.com/file.zip','http://example.private.blob.vercel-storage.com/x','https://example.private.blob.vercel-storage.com.evil.test/x','https://user:pass@example.private.blob.vercel-storage.com/x']) assert.equal(commerceConfig({...env,ESSAY_BUNDLE_BLOB_URL:url}),null);
  assert.equal(commerceConfig({...env,COMMERCE_ORIGIN:'https://prameshsharma.com/wrong-path'}),null);
  assert.equal(commerceConfig({...env,STRIPE_SECRET_KEY:'sk_live_example',COMMERCE_ORIGIN:'http://localhost:3000'}),null);
  assert.ok(commerceConfig({...env,COMMERCE_ORIGIN:'http://localhost:3000'}));
});
test('server fixes product price, quantity, currency and fulfillment marker',()=>{
  const p=checkoutParameters(settings);assert.equal(p.mode,'payment');assert.equal(p.line_items?.length,1);assert.equal(p.line_items?.[0].quantity,1);assert.equal(p.line_items?.[0].price_data?.unit_amount,500);assert.equal(p.line_items?.[0].price_data?.currency,'usd');assert.equal(p.metadata?.product_id,ESSAY_PRODUCT.id);assert.match(p.success_url!,/#session_id=\{CHECKOUT_SESSION_ID\}$/);assert.deepEqual(p.allowed_payment_method_types,['card']);
});
test('only a matching completed, paid, unrefunded purchase grants access',()=>{
  assert.doesNotThrow(()=>assertPaidSession(paid(),settings));
  for (const change of [{payment_status:'unpaid'},{payment_status:'no_payment_required'},{status:'open'},{mode:'subscription'},{currency:'eur'},{amount_subtotal:100},{livemode:true},{metadata:{product_id:'different'}}]) assert.throws(()=>assertPaidSession({...paid(),...change} as Stripe.Checkout.Session,settings),CommerceError);
  for (const change of [{refunded:true},{amount_refunded:1},{disputed:true}]) {const s=paid();Object.assign((s.payment_intent as Stripe.PaymentIntent).latest_charge!,change);assert.throws(()=>assertPaidSession(s,settings),CommerceError);}
  for (const mutate of [(s:Stripe.Checkout.Session)=>{s.line_items!.data[0].quantity=2;},(s:Stripe.Checkout.Session)=>{s.line_items!.data[0].price!.unit_amount=1;},(s:Stripe.Checkout.Session)=>{s.line_items!.data=[];},(s:Stripe.Checkout.Session)=>{(s.payment_intent as Stripe.PaymentIntent).latest_charge=null;},(s:Stripe.Checkout.Session)=>{(s.line_items!.data[0].price!.product as Stripe.Product).metadata.product_id='wrong';}]) {const s=paid();mutate(s);assert.throws(()=>assertPaidSession(s,settings),CommerceError);}
});
test('invalid session input never reaches Stripe',async()=>{
  let calls=0;const client={checkout:{sessions:{retrieve:async()=>{calls++;return paid();}}}} as unknown as Stripe;
  for (const id of [null,{},'../../file','cs_test_short','https://evil.test', ['cs_test_1234567890abcdef']]) await assert.rejects(()=>paidSession(id,settings,client),CommerceError);
  assert.equal(calls,0);await paidSession(paid().id,settings,client);assert.equal(calls,1);
});
test('purchase references remain in a fragment, not a query or analytics event',()=>{
  assert.ok(validSessionId(paid().id));const url=new URL(downloadPageUrl(settings.origin,paid().id));assert.equal(url.search,'');assert.ok(url.hash.includes(paid().id));
});
test('Stripe SDK verifies a raw webhook signature and rejects tampering',()=>{
  const stripe=new Stripe(env.STRIPE_SECRET_KEY),payload=JSON.stringify({id:'evt_test',object:'event',type:'checkout.session.completed',data:{object:paid()}});
  const header=stripe.webhooks.generateTestHeaderString({payload,secret:env.STRIPE_WEBHOOK_SECRET});
  assert.equal(stripe.webhooks.constructEvent(payload,header,env.STRIPE_WEBHOOK_SECRET).id,'evt_test');
  assert.throws(()=>stripe.webhooks.constructEvent(payload+' ',header,env.STRIPE_WEBHOOK_SECRET));
});
