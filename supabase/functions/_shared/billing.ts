// worxmax billing: the price list and the Stripe connection, shared by the billing
// and stripe-webhook functions. Prices are in euro cents, excluding VAT.
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "jsr:@supabase/supabase-js@2";

export const APP_URL = "https://app.worxmax.com";
export const SITE_URL = "https://worxmax.com";

// ---------------------------------------------------------------- what is sold
// Sellable apps. ShopFlow includes Project Overview and Shopfloor plan (they only work with it).
export const ALL_APPS = ["studio", "shopflow", "nesting", "offers", "dxf", "invoices", "crm"];
export type BillingKind = "monthly" | "yearly" | "licence" | "setup";
export type PriceDef = {
  key: string; product: string; name: string; amount: number;
  recurring?: "month" | "year"; billing?: BillingKind; apps: string[]; legacy?: boolean;
};

// Items a plan is made of: single apps, two bundles and the full suite. Monthly price in euro;
// yearly costs ten months. bestItems() picks the cheapest mix for the apps a workshop wants.
export const ITEMS: Record<string, { name: string; month: number; apps: string[]; description: string }> = {
  studio:   { name: "Cabinet Studio", month: 49, apps: ["studio"], description: "Cabinet sizes to a 3D model, part list and CNC programs." },
  shopflow: { name: "ShopFlow", month: 39, apps: ["shopflow"], description: "Shop floor tracking, with Project Overview and the Shopfloor plan." },
  nesting:  { name: "Nesting", month: 29, apps: ["nesting"], description: "Parts nested on boards, labels and cutting files." },
  offers:   { name: "Offers", month: 19, apps: ["offers"], description: "Quotes priced cabinet by cabinet from your own rates." },
  dxf:      { name: "DXF Editor", month: 15, apps: ["dxf"], description: "Fix DXF drawings in the browser." },
  invoices: { name: "Invoices", month: 15, apps: ["invoices"], description: "VAT invoices, waybills and who still owes you." },
  crm:      { name: "CRM", month: 15, apps: ["crm"], description: "Enquiries, clients and follow-ups in one pipeline." },
  cnc:      { name: "Design to CNC bundle", month: 69, apps: ["studio", "nesting", "dxf"], description: "Cabinet Studio, Nesting and DXF Editor." },
  office:   { name: "Office bundle", month: 39, apps: ["crm", "offers", "invoices"], description: "CRM, Offers and Invoices." },
  suite:    { name: "Full suite", month: 129, apps: ALL_APPS, description: "All seven apps, with the ShopFlow add-ons." },
};
const SINGLES = ["studio", "shopflow", "nesting", "offers", "dxf", "invoices", "crm"];
const PACKS = ["cnc", "office"];

/** Cheapest set of items that covers the wanted apps (a bundle may add apps for free). */
type Combo = { items: string[]; cost: number; apps: string[] };
export function bestItems(wanted: string[]): Combo {
  const want = [...new Set(wanted.filter((a) => ALL_APPS.includes(a)))];
  const combo = (items: string[]): Combo => ({
    items, cost: items.reduce((t, k) => t + ITEMS[k].month, 0), apps: [...new Set(items.flatMap((k) => ITEMS[k].apps))].sort(),
  });
  const all: Combo[] = [combo(["suite"])];
  for (let mask = 0; mask < 1 << PACKS.length; mask++) {
    const packs = PACKS.filter((_, i) => mask & (1 << i));
    const covered = new Set(packs.flatMap((k) => ITEMS[k].apps));
    all.push(combo([...packs, ...SINGLES.filter((a) => want.includes(a) && !covered.has(a))]));
  }
  return all.reduce((b, c) => (c.cost < b.cost || (c.cost === b.cost &&
    (c.apps.length > b.apps.length || (c.apps.length === b.apps.length && c.items.length < b.items.length)))) ? c : b);
}

// One Stripe product per item; lookup keys are how the code finds each price in Stripe.
export const PRODUCTS: Record<string, { name: string; description: string }> = {
  ...Object.fromEntries(Object.entries(ITEMS).map(([k, it]) => [`wx_${k}`, { name: `worxmax ${it.name}`, description: `${it.description} One workshop, unlimited people.` }])),
  wx_licence: { name: "worxmax full suite — licence", description: "One-time licence for all seven apps. The first year of hosting, updates and support is included." },
  wx_care: { name: "worxmax licence care", description: "Hosting, updates and support for a worxmax licence, per year." },
  wx_setup: { name: "worxmax guided setup", description: "We set up your workshop with you and import your price lists." },
};

export const PRICES: PriceDef[] = [
  ...Object.entries(ITEMS).flatMap(([k, it]): PriceDef[] => [
    { key: `wx_${k}_month`, product: `wx_${k}`, name: `${it.name}, monthly`, amount: it.month * 100, recurring: "month", billing: "monthly", apps: it.apps },
    { key: `wx_${k}_year`, product: `wx_${k}`, name: `${it.name}, yearly`, amount: it.month * 1000, recurring: "year", billing: "yearly", apps: it.apps },
  ]),
  { key: "wx_licence", product: "wx_licence", name: "Full suite licence", amount: 249000, billing: "licence", apps: ALL_APPS },
  { key: "wx_care_year", product: "wx_care", name: "Licence care, yearly", amount: 39000, recurring: "year", billing: "licence", apps: ALL_APPS },
  { key: "wx_setup", product: "wx_setup", name: "Guided setup", amount: 35000, billing: "setup", apps: [] },
  // sold before per-app plans (November 2026): still recognised for workshops that have them
  { key: "wx_workshop_month", product: "wx_workshop", name: "Workshop, monthly", amount: 8900, recurring: "month", billing: "monthly", apps: ["crm", "offers", "invoices", "shopflow", "nesting", "dxf"], legacy: true },
  { key: "wx_workshop_year", product: "wx_workshop", name: "Workshop, yearly", amount: 89000, recurring: "year", billing: "yearly", apps: ["crm", "offers", "invoices", "shopflow", "nesting", "dxf"], legacy: true },
  { key: "wx_complete_month", product: "wx_complete", name: "Complete, monthly", amount: 14900, recurring: "month", billing: "monthly", apps: ALL_APPS, legacy: true },
  { key: "wx_complete_year", product: "wx_complete", name: "Complete, yearly", amount: 149000, recurring: "year", billing: "yearly", apps: ALL_APPS, legacy: true },
];
export const byKey = (k: string) => PRICES.find((p) => p.key === k);

/** plan, apps and billing kind from the lookup keys of a subscription's prices */
export function planOf(keys: string[]) {
  const defs = keys.map(byKey).filter(Boolean) as PriceDef[];
  const apps = [...new Set(defs.flatMap((d) => d.apps))].filter((a) => ALL_APPS.includes(a)).sort();
  const billing = defs.some((d) => d.billing === "licence") ? "licence"
    : defs.find((d) => d.billing === "yearly" || d.billing === "monthly")?.billing ?? null;
  return { apps, plan: apps.length === ALL_APPS.length ? "suite" : "apps", billing };
}

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

// price objects by lookup key
export async function stripePrices(stripe: Stripe, keys: string[]) {
  const map: Record<string, Stripe.Price> = {};
  for (let i = 0; i < keys.length; i += 10) {   // Stripe takes at most 10 lookup keys per call
    const res = await stripe.prices.list({ lookup_keys: keys.slice(i, i + 10), active: true, limit: 100 });
    for (const p of res.data) if (p.lookup_key) map[p.lookup_key] = p;
  }
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
