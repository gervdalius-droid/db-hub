// worxmax website intake: the only way the public site writes to the database.
//   POST { kind: "demo", session, cabinets, parts, sheets, quote, summary, csv, form }
//   POST { kind: "lead", name, company, email, phone, people, plan, message, session, attach }
// Tables are closed to the public key; this function validates, rate-limits and
// writes with the service role, then emails a notification for each new lead.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://worxmax.com,https://www.worxmax.com,https://gervdalius-droid.github.io")
  .split(",").map((s) => s.trim()).filter(Boolean);

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}
function reply(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

async function ipHash(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const salt = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").slice(-24);
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ip));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const hourAgo = () => new Date(Date.now() - 3600_000).toISOString();

function cleanCabinets(v: unknown) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 40).map((c) => ({
    type: ["base", "wall", "tall"].includes(c?.type) ? c.type : "base",
    mat: str(c?.mat, 20),
    w: num(c?.w, 100, 3000),
    h: num(c?.h, 100, 3000),
    d: num(c?.d, 100, 1500),
    shelves: num(c?.shelves, 0, 20),
  }));
}

async function saveDemo(req: Request, b: Record<string, unknown>, ip: string) {
  const id = str(b.session, 40);
  if (!UUID.test(id)) return reply(req, 400, { error: "bad session" });
  const cabinets = cleanCabinets(b.cabinets);
  const row = {
    cabinets,
    cabinet_count: cabinets.length,
    parts: num(b.parts, 0, 100000),
    sheets: num(b.sheets, 0, 10000),
    quote_eur: num(b.quote, 0, 10_000_000),
    summary: str(b.summary, 4000) || null,
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await db.from("demo_sessions")
    .select("id, updates, downloaded_cut_list, opened_trial_form").eq("id", id).maybeSingle();
  if (existing) {
    if (existing.updates >= 300) return reply(req, 200, { ok: true });
    const { error } = await db.from("demo_sessions").update({
      ...row,
      updates: existing.updates + 1,
      downloaded_cut_list: existing.downloaded_cut_list || b.csv === true,
      opened_trial_form: existing.opened_trial_form || b.form === true,
    }).eq("id", id);
    if (error) return reply(req, 500, { error: "save failed" });
    return reply(req, 200, { ok: true });
  }
  const { count } = await db.from("demo_sessions").select("id", { count: "exact", head: true })
    .eq("ip_hash", ip).gte("created_at", hourAgo());
  if ((count ?? 0) >= 30) return reply(req, 429, { error: "too many" });
  const { error } = await db.from("demo_sessions").insert({
    id, ...row,
    downloaded_cut_list: b.csv === true,
    opened_trial_form: b.form === true,
    referrer: str(b.referrer, 300) || null,
    page_lang: str(b.lang, 10) || null,
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
    ip_hash: ip,
  });
  if (error) return reply(req, 500, { error: "save failed" });
  return reply(req, 200, { ok: true });
}

// Email goes out from the worxmax mailbox (Hostinger SMTP, port 465). Secrets:
//   SMTP_PASS (required), SMTP_USER (default hello@worxmax.com), SMTP_HOST (default smtp.hostinger.com),
//   NOTIFY_EMAIL (who hears about new requests; default SMTP_USER).
// Without SMTP_PASS it falls back to Resend if RESEND_API_KEY is set, otherwise sends nothing.
const SMTP_USER = Deno.env.get("SMTP_USER") ?? "hello@worxmax.com";
const FROM = `worxmax <${SMTP_USER}>`;
type Mail = { to: string; subject: string; html: string; text: string; replyTo?: string };
let mailer: { sendMail: (m: Record<string, unknown>) => Promise<unknown> } | null = null;

async function sendMail(m: Mail): Promise<boolean> {
  const pass = Deno.env.get("SMTP_PASS");
  if (pass) {
    if (!mailer) {
      const nodemailer = (await import("npm:nodemailer@6.9.16")).default;
      mailer = nodemailer.createTransport({
        host: Deno.env.get("SMTP_HOST") ?? "smtp.hostinger.com", port: 465, secure: true,
        auth: { user: SMTP_USER, pass },
      });
    }
    await mailer.sendMail({ from: FROM, to: m.to, subject: m.subject, html: m.html, text: m.text, replyTo: m.replyTo });
    return true;
  }
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("NOTIFY_FROM") ?? FROM, to: [m.to], reply_to: m.replyTo, subject: m.subject, html: m.html, text: m.text }),
  });
  return res.ok;
}

const wrap = (body: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1C1A16;max-width:560px">${body}</div>`;

// 1. Tell the worxmax team. 2. Tell the person their request arrived.
async function notify(lead: Record<string, unknown>) {
  const team = Deno.env.get("NOTIFY_EMAIL") ?? SMTP_USER;
  const pairs: [string, unknown][] = [
    ["Name", lead.name], ["Workshop", lead.company], ["Email", lead.email], ["Phone", lead.phone || "-"],
    ["People", lead.people ?? "-"], ["Plan", lead.plan || "-"], ["Message", lead.message || "-"],
    ["Built in the demo", lead.demo_summary || "-"],
  ];
  const rows = pairs.map(([k, v]) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">${k}</td><td style="padding:4px 0;white-space:pre-wrap">${esc(String(v))}</td></tr>`
  ).join("");
  const toTeam = await sendMail({
    to: team, replyTo: String(lead.email),
    subject: `worxmax trial request: ${lead.company}`,
    html: wrap(`<h2 style="margin:0 0 12px">New worxmax trial request</h2><table style="font-size:14px;border-collapse:collapse">${rows}</table>
      <p style="margin-top:16px">Reply to this email to answer ${esc(String(lead.name))} directly. Set up the workshop in the admin page: https://worxmax.com/admin/</p>`),
    text: pairs.map(([k, v]) => `${k}: ${v}`).join("\n"),
  });
  const first = String(lead.name).trim().split(/\s+/)[0];
  try {
    await sendMail({
      to: String(lead.email), replyTo: team,
      subject: "We have your worxmax trial request",
      html: wrap(`<p>Hi ${esc(first)},</p>
        <p>Thank you for asking to try worxmax for <b>${esc(String(lead.company))}</b>. We have your request.</p>
        <p>We set up your workshop and send your login, usually the same working day. Your 5-day free trial starts when you first sign in, and nothing is charged during it.</p>
        <p>If you want us to start with something specific, such as your kitchen quotes or nesting for your CNC, just reply to this email.</p>
        <p>The worxmax team<br><a href="https://worxmax.com" style="color:#2D5BD8">worxmax.com</a></p>`),
      text: `Hi ${first},\n\nThank you for asking to try worxmax for ${lead.company}. We have your request.\n\nWe set up your workshop and send your login, usually the same working day. Your 5-day free trial starts when you first sign in, and nothing is charged during it.\n\nIf you want us to start with something specific, just reply to this email.\n\nThe worxmax team\nhttps://worxmax.com`,
    });
  } catch (_) { /* the team email is what marks the lead notified */ }
  return toTeam;
}

async function saveLead(req: Request, b: Record<string, unknown>, ip: string) {
  const name = str(b.name, 120), company = str(b.company, 160), email = str(b.email, 200).toLowerCase();
  if (!name || !company || !EMAIL.test(email)) return reply(req, 400, { error: "missing fields" });
  const { count } = await db.from("leads").select("id", { count: "exact", head: true })
    .eq("ip_hash", ip).gte("created_at", hourAgo());
  if ((count ?? 0) >= 5) return reply(req, 429, { error: "too many" });

  let session: string | null = str(b.session, 40);
  if (!UUID.test(session)) session = null;
  let demo_summary: string | null = null;
  if (session) {
    const { data } = await db.from("demo_sessions").select("summary").eq("id", session).maybeSingle();
    if (!data) session = null;
    else if (b.attach === true) demo_summary = data.summary;
    if (data) await db.from("demo_sessions").update({ opened_trial_form: true }).eq("id", session);
  }
  const lead = {
    name, company, email,
    phone: str(b.phone, 60) || null,
    people: num(b.people, 1, 5000),
    plan: str(b.plan, 60) || null,
    message: str(b.message, 3000) || null,
    demo_session_id: session,
    demo_summary,
    referrer: str(b.referrer, 300) || null,
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
    ip_hash: ip,
  };
  const { data: saved, error } = await db.from("leads").insert(lead).select("id").single();
  if (error) return reply(req, 500, { error: "save failed" });
  try {
    if (await notify(lead)) {
      await db.from("leads").update({ notified_at: new Date().toISOString() }).eq("id", saved.id);
    }
  } catch (_) { /* the lead is saved; the email is best effort */ }
  return reply(req, 200, { ok: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return reply(req, 405, { error: "POST only" });
  let b: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 30_000) return reply(req, 413, { error: "too large" });
    b = JSON.parse(text);
  } catch (_) {
    return reply(req, 400, { error: "bad json" });
  }
  if (!b || typeof b !== "object") return reply(req, 400, { error: "bad json" });
  if (str(b.website, 200)) return reply(req, 200, { ok: true }); // honeypot: bots fill this, people never see it
  const ip = await ipHash(req);
  if (b.kind === "demo") return saveDemo(req, b, ip);
  if (b.kind === "lead") return saveLead(req, b, ip);
  return reply(req, 400, { error: "unknown kind" });
});
