// Stripe → worxmax: keeps each workshop's plan and "paid until" date in step with Stripe,
// and records every payment for the admin page. Stripe signs each call; anything unsigned
// is refused. Each event is handled once (stripe_events).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.7.0";
import { byKey, db, stripeClient, webhookSecret } from "../_shared/billing.ts";

const cryptoProvider = Stripe.createSubtleCryptoProvider();
const day = (unix?: number | null) => (unix ? new Date(unix * 1000).toISOString().slice(0, 10) : null);
const iso = (unix?: number | null) => (unix ? new Date(unix * 1000).toISOString() : null);

async function workshopFor(customer: string | null, metaId?: string | null) {
  if (metaId) {
    const { data } = await db.from("workshops").select("id, stripe_customer_id").eq("id", metaId).maybeSingle();
    if (data) {
      if (customer && !data.stripe_customer_id) await db.from("workshops").update({ stripe_customer_id: customer }).eq("id", data.id);
      return data.id as string;
    }
  }
  if (!customer) return null;
  const { data } = await db.from("workshops").select("id").eq("stripe_customer_id", customer).maybeSingle();
  return (data?.id as string) ?? null;
}

// the subscription decides plan, billing and the "paid until" date
async function applySubscription(sub: Stripe.Subscription) {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const wid = await workshopFor(customer, sub.metadata?.workshop_id);
  if (!wid) return null;
  const item = sub.items.data.find((i) => i.price.recurring) ?? sub.items.data[0];
  const def = item?.price.lookup_key ? byKey(item.price.lookup_key) : undefined;
  // newer Stripe API versions keep the period on the item
  const start = (sub as any).current_period_start ?? (item as any)?.current_period_start;
  const end = (sub as any).current_period_end ?? (item as any)?.current_period_end;
  const unpaid = ["past_due", "unpaid", "incomplete", "incomplete_expired"].includes(sub.status);
  const ended = sub.status === "canceled";
  const paidUntil = ended ? day(sub.ended_at ?? end) : unpaid ? day(start) : day(sub.trial_end && sub.status === "trialing" ? sub.trial_end : end);

  const upd: Record<string, unknown> = {
    stripe_customer_id: customer,
    stripe_subscription_id: sub.id,
    sub_status: sub.status,
    sub_price: item?.price.lookup_key ?? null,
    cancel_at: iso(sub.cancel_at ?? (sub.cancel_at_period_end ? end : null)),
    paid_until: paidUntil,
  };
  if (def?.plan) upd.plan = def.plan;
  if (def?.billing && def.billing !== "setup") upd.billing = def.billing;
  if (item?.price.unit_amount != null) upd.price_eur = item.price.unit_amount / 100;
  const { error } = await db.from("workshops").update(upd).eq("id", wid);
  if (error) throw new Error("workshop update: " + error.message);
  return wid;
}

async function recordInvoice(inv: Stripe.Invoice) {
  const customer = typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? null;
  const wid = await workshopFor(customer, (inv as any).subscription_details?.metadata?.workshop_id ?? inv.metadata?.workshop_id);
  if (!wid || !inv.amount_paid) return wid;
  const ref = inv.number ?? inv.id;
  const { data: dup } = await db.from("payments").select("id").eq("workshop_id", wid).eq("reference", ref).maybeSingle();
  if (dup) return wid;
  const periods = inv.lines.data.map((l) => l.period).filter(Boolean);
  const from = periods.length ? Math.min(...periods.map((p) => p.start)) : inv.period_start;
  const to = periods.length ? Math.max(...periods.map((p) => p.end)) : inv.period_end;
  const { error } = await db.from("payments").insert({
    workshop_id: wid, amount_eur: inv.amount_paid / 100, paid_on: day(inv.status_transitions?.paid_at ?? inv.created),
    covers_from: day(from), covers_to: day(to), method: "card", reference: ref,
    note: `Stripe ${inv.id}${inv.hosted_invoice_url ? " · " + inv.hosted_invoice_url : ""}`.slice(0, 500),
    created_by: null,
  });
  if (error) throw new Error("payment insert: " + error.message);
  return wid;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const secret = await webhookSecret();
  const stripe = await stripeClient();
  if (!secret || !stripe) return new Response("billing not set up", { status: 503 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, req.headers.get("stripe-signature") ?? "", secret, undefined, cryptoProvider);
  } catch (e) {
    return new Response("bad signature: " + (e as Error).message, { status: 400 });
  }

  const { data: seen } = await db.from("stripe_events").select("processed_at").eq("id", event.id).maybeSingle();
  if (seen?.processed_at) return new Response("ok (seen)", { status: 200 });
  if (!seen) await db.from("stripe_events").insert({ id: event.id, type: event.type, payload: event.data.object as unknown as Record<string, unknown> });

  let wid: string | null = null;
  try {
    const o = event.data.object as any;
    switch (event.type) {
      case "checkout.session.completed": {
        const s = o as Stripe.Checkout.Session;
        const customer = typeof s.customer === "string" ? s.customer : s.customer?.id ?? null;
        wid = await workshopFor(customer, s.client_reference_id ?? s.metadata?.workshop_id);
        if (s.subscription) {
          const sub = await stripe.subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
          wid = (await applySubscription(sub)) ?? wid;
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        wid = await applySubscription(o as Stripe.Subscription);
        break;
      case "invoice.paid":
        wid = await recordInvoice(o as Stripe.Invoice);
        break;
      case "invoice.payment_failed": {
        const customer = typeof o.customer === "string" ? o.customer : o.customer?.id ?? null;
        wid = await workshopFor(customer, null);
        break;   // the subscription update that follows marks it past_due
      }
    }
    await db.from("stripe_events").update({ processed_at: new Date().toISOString(), workshop_id: wid, error: null }).eq("id", event.id);
    return new Response("ok", { status: 200 });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    await db.from("stripe_events").update({ error: msg.slice(0, 500), workshop_id: wid }).eq("id", event.id);
    console.error("stripe-webhook", event.type, msg);
    return new Response("error: " + msg, { status: 500 });   // Stripe retries
  }
});
