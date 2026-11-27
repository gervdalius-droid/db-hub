// worxmax billing, called from app.worxmax.com by a signed-in person.
//   { action: "status" }                                  is online payment set up?
//   { action: "checkout", plan, interval, setup, terms }  owner: Stripe Checkout link
//   { action: "portal" }                                   owner: Stripe customer portal link
//   { action: "setup" }                                    worxmax admin: create products, prices,
//                                                          the customer portal and the webhook in Stripe
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { APP_URL, SITE_URL, PRODUCTS, PRICES, byKey, db, stripeClient, stripePrices, cors, json } from "../_shared/billing.ts";

const TERMS_URL = SITE_URL + "/terms.html";
// the public (browser) key: the person's own token decides what they may do
const PUBLISHABLE = Deno.env.get("SB_PUBLISHABLE_KEY") ?? "sb_publishable_-eLlb35TXBvv_wj-UucrqA_g-nxGWd1";
const WEBHOOK_URL = Deno.env.get("SUPABASE_URL") + "/functions/v1/stripe-webhook";
const WEBHOOK_EVENTS = [
  "checkout.session.completed", "customer.subscription.created", "customer.subscription.updated",
  "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed",
] as Stripe.WebhookEndpointCreateParams.EnabledEvent[];

async function who(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  if (!data?.user) return null;
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, PUBLISHABLE, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { user: data.user, asUser };
}

async function ownerWorkshop(uid: string) {
  const { data } = await db.from("workshop_members").select("role, active, workshops(*)").eq("user_id", uid).maybeSingle();
  if (!data || !data.active || data.role !== "admin" || !data.workshops) return null;
  return data.workshops as Record<string, any>;
}

let taxRateId: string | null = null;
async function fallbackTaxRate(stripe: Stripe) {
  if (taxRateId) return taxRateId;
  const list = await stripe.taxRates.list({ active: true, limit: 100 });
  const found = list.data.find((t) => t.metadata?.wx === "vat_lt_21");
  taxRateId = found ? found.id : (await stripe.taxRates.create({
    display_name: "VAT", description: "Lithuanian VAT (PVM) 21%", jurisdiction: "LT", country: "LT",
    percentage: 21, inclusive: false, tax_type: "vat", metadata: { wx: "vat_lt_21" },
  })).id;
  return taxRateId;
}

async function checkout(req: Request, uid: string, email: string, b: Record<string, unknown>) {
  const stripe = await stripeClient();
  if (!stripe) return json(req, 503, { error: "not_ready", message: "Online payment is not switched on yet." });
  const w = await ownerWorkshop(uid);
  if (!w) return json(req, 403, { error: "Only the workshop owner can choose the plan." });
  if (b.terms !== true) return json(req, 400, { error: "Please accept the terms first." });

  const plan = String(b.plan ?? ""), interval = String(b.interval ?? "");
  const main = interval === "licence" ? "wx_licence" : `wx_${plan}_${interval === "year" ? "year" : "month"}`;
  if (!byKey(main)) return json(req, 400, { error: "Unknown plan." });
  if (["active", "trialing", "past_due"].includes(w.sub_status) && interval !== "licence") {
    return json(req, 409, { error: "already_subscribed", message: "You already have a plan. Change it under Manage billing." });
  }

  const keys = interval === "licence" ? ["wx_licence", "wx_care_year"] : [main];
  if (b.setup === true) keys.push("wx_setup");
  const prices = await stripePrices(stripe, keys);
  const missing = keys.filter((k) => !prices[k]);
  if (missing.length) return json(req, 503, { error: "not_ready", message: "Prices are not set up in Stripe yet." });

  let customer = w.stripe_customer_id as string | null;
  if (!customer) {
    customer = (await stripe.customers.create({
      email, name: w.name, metadata: { workshop_id: w.id },
      preferred_locales: ["en"],
    })).id;
    await db.from("workshops").update({ stripe_customer_id: customer }).eq("id", w.id);
  }
  await db.from("workshops").update({ terms_accepted_at: new Date().toISOString(), terms_version: String(b.terms_version ?? "").slice(0, 40) || null }).eq("id", w.id);

  const meta = { workshop_id: w.id, plan: byKey(main)!.plan ?? "", billing: byKey(main)!.billing ?? "" };
  const base: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    customer,
    client_reference_id: w.id,
    metadata: meta,
    subscription_data: { metadata: meta, ...(interval === "licence" ? { trial_period_days: 365 } : {}) },
    line_items: keys.map((k) => ({ price: prices[k].id, quantity: 1 })),
    success_url: `${APP_URL}/#/billing?paid=1`,
    cancel_url: `${APP_URL}/#/billing`,
    allow_promotion_codes: true,
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    customer_update: { address: "auto", name: "auto" },
    custom_text: {
      submit: { message: `By paying you agree to the worxmax Terms (${TERMS_URL}), including how long your data is kept.` },
    },
    locale: "auto",
  };
  // worxmax is the seller: Stripe's Managed Payments (Stripe as merchant of record, +3.5%) stays off.
  (base as Record<string, unknown>).managed_payments = { enabled: false };
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({ ...base, automatic_tax: { enabled: true } });
  } catch (e) {
    // Stripe Tax not switched on: add Lithuanian VAT (21%) to every line instead
    const tr = await fallbackTaxRate(stripe);
    session = await stripe.checkout.sessions.create({
      ...base,
      line_items: base.line_items!.map((li) => ({ ...li, tax_rates: [tr] })),
    });
    console.warn("automatic tax unavailable, used the 21% rate:", (e as Error).message);
  }
  return json(req, 200, { url: session.url });
}

async function portal(req: Request, uid: string) {
  const stripe = await stripeClient();
  if (!stripe) return json(req, 503, { error: "not_ready", message: "Online payment is not switched on yet." });
  const w = await ownerWorkshop(uid);
  if (!w) return json(req, 403, { error: "Only the workshop owner can manage billing." });
  if (!w.stripe_customer_id) return json(req, 404, { error: "No payments yet: choose a plan first." });
  const configs = await stripe.billingPortal.configurations.list({ active: true, limit: 20 });
  const mine = configs.data.find((c) => c.metadata?.wx === "1");
  const s = await stripe.billingPortal.sessions.create({
    customer: w.stripe_customer_id, return_url: `${APP_URL}/#/billing`,
    ...(mine ? { configuration: mine.id } : {}),
  });
  return json(req, 200, { url: s.url });
}

// ---------- one click for the worxmax admin: everything Stripe needs ----------
// deno-lint-ignore no-explicit-any
async function setup(req: Request, asUser: any) {
  const { data: isAdmin } = await asUser.rpc("am_i_admin");
  if (isAdmin !== true) return json(req, 403, { error: "admin only" });
  const stripe = await stripeClient();
  if (!stripe) return json(req, 400, { error: "Paste the Stripe secret key first." });
  const done: string[] = [];

  for (const [id, p] of Object.entries(PRODUCTS)) {
    try {
      const cur = await stripe.products.retrieve(id);
      if (cur.name !== p.name || cur.description !== p.description || !cur.active) {
        await stripe.products.update(id, { name: p.name, description: p.description, active: true });
      }
    } catch (_) {
      await stripe.products.create({ id, name: p.name, description: p.description, tax_code: "txcd_10103001" });
      done.push(`product ${id}`);
    }
  }
  const have = await stripePrices(stripe, PRICES.map((p) => p.key));
  const priceIds: Record<string, string> = {};
  for (const p of PRICES) {
    const cur = have[p.key];
    const same = cur && cur.unit_amount === p.amount && cur.currency === "eur" &&
      (cur.recurring?.interval ?? null) === (p.recurring ?? null);
    if (same) { priceIds[p.key] = cur.id; continue; }
    const np = await stripe.prices.create({
      product: p.product, currency: "eur", unit_amount: p.amount, nickname: p.name,
      lookup_key: p.key, transfer_lookup_key: true, tax_behavior: "exclusive",
      ...(p.recurring ? { recurring: { interval: p.recurring } } : {}),
      metadata: { plan: p.plan ?? "", billing: p.billing ?? "" },
    });
    if (cur) await stripe.prices.update(cur.id, { active: false });
    priceIds[p.key] = np.id;
    done.push(`price ${p.key}`);
  }

  // customer portal: change plan, card, invoices, cancel at the end of the period
  const switchable = ["office", "workshop", "complete"].map((pl) => ({
    product: `wx_${pl}`, prices: [priceIds[`wx_${pl}_month`], priceIds[`wx_${pl}_year`]],
  }));
  const portalConf: Stripe.BillingPortal.ConfigurationCreateParams = {
    business_profile: { headline: "worxmax billing", privacy_policy_url: SITE_URL + "/privacy.html", terms_of_service_url: TERMS_URL },
    default_return_url: `${APP_URL}/#/billing`,
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "address", "name", "tax_id"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true, mode: "at_period_end",
        cancellation_reason: { enabled: true, options: ["too_expensive", "missing_features", "switched_service", "unused", "other"] },
      },
      subscription_update: { enabled: true, default_allowed_updates: ["price"], proration_behavior: "create_prorations", products: switchable },
    },
    metadata: { wx: "1" },
  };
  const configs = await stripe.billingPortal.configurations.list({ active: true, limit: 20 });
  const mine = configs.data.find((c) => c.metadata?.wx === "1");
  if (mine) await stripe.billingPortal.configurations.update(mine.id, portalConf as Stripe.BillingPortal.ConfigurationUpdateParams);
  else { await stripe.billingPortal.configurations.create(portalConf); done.push("customer portal"); }

  // webhook: Stripe tells worxmax about payments. Its signing secret is shown only once, so a
  // missing secret means: make the endpoint again and keep the new secret in the vault.
  const { data: st }: { data: any } = await asUser.rpc("admin_billing_status");
  const eps = await stripe.webhookEndpoints.list({ limit: 100 });
  const ours = eps.data.filter((e) => e.url === WEBHOOK_URL);
  if (ours.length && st?.webhook_set) {
    await stripe.webhookEndpoints.update(ours[0].id, { enabled_events: WEBHOOK_EVENTS, disabled: false });
  } else {
    for (const e of ours) await stripe.webhookEndpoints.del(e.id);
    const ep = await stripe.webhookEndpoints.create({ url: WEBHOOK_URL, enabled_events: WEBHOOK_EVENTS, description: "worxmax" });
    const { error } = await asUser.rpc("admin_billing_secret_set", { p_name: "stripe_webhook_secret", p_value: ep.secret });
    if (error) return json(req, 500, { error: "Webhook made, but its secret could not be saved: " + error.message });
    done.push("webhook");
  }
  return json(req, 200, { ok: true, done, mode: (await stripe.balance.retrieve()).livemode ? "live" : "test" });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "POST only" });
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch (_) { /* empty body */ }
  const me = await who(req);
  if (!me) return json(req, 401, { error: "Sign in first." });
  try {
    switch (b.action) {
      case "status": {
        const stripe = await stripeClient();
        let ready = false;
        if (stripe) { try { ready = Object.keys(await stripePrices(stripe, ["wx_office_month"])).length > 0; } catch (_) { ready = false; } }
        return json(req, 200, { ready });
      }
      case "checkout": return await checkout(req, me.user.id, me.user.email ?? "", b);
      case "portal": return await portal(req, me.user.id);
      case "setup": return await setup(req, me.asUser);
      default: return json(req, 400, { error: "unknown action" });
    }
  } catch (e) {
    console.error("billing", b.action, e);
    const msg = (e as { message?: string }).message ?? String(e);
    return json(req, 502, { error: "stripe", message: msg.slice(0, 300) });
  }
});
