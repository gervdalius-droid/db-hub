// worxmax billing: the price list and the Stripe connection, shared by the billing
// and stripe-webhook functions. Prices are in euro cents, excluding VAT.
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "jsr:@supabase/supabase-js@2";

export const APP_URL = "https://app.worxmax.com";
export const SITE_URL = "https://worxmax.com";

export type Plan = "office" | "workshop" | "complete";
export type PriceDef = {
  key: string; product: string; name: string; amount: number;
  recurring?: "month" | "year"; plan?: Plan; billing?: "monthly" | "yearly" | "licence" | "setup";
};

// One product per thing sold; lookup keys are how the code finds each price in Stripe.
export const PRODUCTS: Record<string, { name: string; description: string }> = {
  wx_office: { name: "worxmax Office", description: "CRM, Offers, Project Overview and Invoices for one workshop, unlimited people." },
  wx_workshop: { name: "worxmax Workshop", description: "Office plus ShopFlow, Shopfloor plan, Nesting and DXF Editor for one workshop, unlimited people." },
  wx_complete: { name: "worxmax Complete", description: "All nine apps, including Cabinet Studio, for one workshop, unlimited people." },
  wx_licence: { name: "worxmax Complete — licence", description: "One-time licence for all nine apps. The first year of hosting, updates and support is included." },
  wx_care: { name: "worxmax licence care", description: "Hosting, updates and support for a worxmax licence, per year." },
  wx_setup: { name: "worxmax guided setup", description: "We set up your workshop with you and import your price lists." },
};

export const PRICES: PriceDef[] = [
  { key: "wx_office_month", product: "wx_office", name: "Office, monthly", amount: 3900, recurring: "month", plan: "office", billing: "monthly" },
  { key: "wx_office_year", product: "wx_office", name: "Office, yearly", amount: 39000, recurring: "year", plan: "office", billing: "yearly" },
  { key: "wx_workshop_month", product: "wx_workshop", name: "Workshop, monthly", amount: 8900, recurring: "month", plan: "workshop", billing: "monthly" },
  { key: "wx_workshop_year", product: "wx_workshop", name: "Workshop, yearly", amount: 89000, recurring: "year", plan: "workshop", billing: "yearly" },
  { key: "wx_complete_month", product: "wx_complete", name: "Complete, monthly", amount: 14900, recurring: "month", plan: "complete", billing: "monthly" },
  { key: "wx_complete_year", product: "wx_complete", name: "Complete, yearly", amount: 149000, recurring: "year", plan: "complete", billing: "yearly" },
  { key: "wx_licence", product: "wx_licence", name: "Complete licence", amount: 249000, plan: "complete", billing: "licence" },
  { key: "wx_care_year", product: "wx_care", name: "Licence care, yearly", amount: 39000, recurring: "year", plan: "complete", billing: "licence" },
  { key: "wx_setup", product: "wx_setup", name: "Guided setup", amount: 35000, billing: "setup" },
];
export const byKey = (k: string) => PRICES.find((p) => p.key === k);

export const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function secret(name: string): Promise<string | null> {
  const env = Deno.env.get(name.toUpperCase());   // a function secret wins, if one is set
  if (env) return env;
  const { data, error } = await db.rpc("billing_secret", { p_name: name });
  if (error) return null;
  return (data as string) || null;
}

let cached: { key: string; stripe: Stripe } | null = null;
export async function stripeClient(): Promise<Stripe | null> {
  const key = await secret("stripe_secret_key");
  if (!key) return null;
  if (cached && cached.key === key) return cached.stripe;
  // pinned: this version knows checkout's managed_payments switch (worxmax keeps it off)
  const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient(), apiVersion: "2025-03-31.basil" as Stripe.LatestApiVersion });
  cached = { key, stripe };
  return stripe;
}
export const webhookSecret = () => secret("stripe_webhook_secret");

// price objects by lookup key (one call)
export async function stripePrices(stripe: Stripe, keys: string[]) {
  const res = await stripe.prices.list({ lookup_keys: keys, active: true, limit: 20, expand: ["data.product"] });
  const map: Record<string, Stripe.Price> = {};
  for (const p of res.data) if (p.lookup_key) map[p.lookup_key] = p;
  return map;
}

export function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  const ok = [APP_URL, SITE_URL].includes(o);
  return {
    "Access-Control-Allow-Origin": ok ? o : APP_URL,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Vary": "Origin",
  };
}
export function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}
