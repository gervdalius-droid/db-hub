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
//   NOTIFY_EMAIL (who hears about new requests, comma-separated; default SMTP_USER).
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

// ---------- email templates: table layout and inline styles, so Gmail and Outlook show them the same ----------
const LOGO = "https://worxmax.com/assets/brand/worxmax-logo-email.png";
const SITE = "https://worxmax.com";
function layout(preheader: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#F2F1ED">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F1ED"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:2px solid #1C1A16;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1C1A16">
<tr><td style="height:8px;background:#C6F24E;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:26px 32px 6px"><a href="${SITE}"><img src="${LOGO}" width="150" height="30" alt="worxmax" style="display:block;border:0;width:150px;height:30px"></a></td></tr>
${body}
<tr><td style="padding:22px 32px 26px;border-top:1px solid #E2DFD8;font-size:12px;line-height:1.6;color:#6A665D">
worxmax · software for furniture workshops · <a href="${SITE}" style="color:#6A665D">worxmax.com</a><br>
Questions? Reply to this email or write to <a href="mailto:${SMTP_USER}" style="color:#6A665D">${SMTP_USER}</a>.</td></tr>
</table></td></tr></table></body></html>`;
}
const btn = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#C6F24E;border:2px solid #1C1A16;border-radius:12px">
<a href="${href}" style="display:inline-block;padding:13px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#1C1A16;text-decoration:none">${label}</a></td></tr></table>`;
function steps(items: [string, string][]) {
  return items.map(([t, d], i) => `<tr><td valign="top" style="padding:0 14px 16px 0;width:34px">
<div style="width:30px;height:30px;line-height:30px;border-radius:15px;background:${i === 0 ? "#2D5BD8" : "#1C1A16"};color:#FFFFFF;text-align:center;font-weight:bold;font-size:14px">${i + 1}</div></td>
<td valign="top" style="padding:4px 0 16px;font-size:15px;line-height:1.5"><b>${t}</b><br><span style="color:#47443D">${d}</span></td></tr>`).join("");
}

// 1. Tell the worxmax team. 2. Tell the person their request arrived.
async function notify(lead: Record<string, unknown>) {
  const team = (Deno.env.get("NOTIFY_EMAIL") ?? SMTP_USER).split(",").map((x) => x.trim()).filter(Boolean);
  const name = String(lead.name), company = String(lead.company), email = String(lead.email);
  const first = name.trim().split(/\s+/)[0];
  const pairs: [string, unknown][] = [
    ["Name", name], ["Workshop", company], ["Email", email], ["Phone", lead.phone || "-"],
    ["People", lead.people ?? "-"], ["Plan", lead.plan || "-"], ["What to set up first", lead.message || "-"],
    ["Built in the demo", lead.demo_summary || "-"],
  ];
  const shown = pairs.filter(([, v]) => v !== "-" && v !== null && v !== "");
  const rows = shown.map(([k, v]) => `<tr><td valign="top" style="padding:9px 14px 9px 0;border-bottom:1px solid #E2DFD8;color:#6A665D;font-size:13px;width:140px">${k}</td>
<td valign="top" style="padding:9px 0;border-bottom:1px solid #E2DFD8;font-size:15px;white-space:pre-wrap">${k === "Email" ? `<a href="mailto:${esc(email)}" style="color:#2D5BD8">${esc(email)}</a>` : esc(String(v))}</td></tr>`).join("");

  let toTeam = false;
  for (const to of team) {
    try {
      toTeam = await sendMail({
        to, replyTo: email,
        subject: `New trial request: ${company}`,
        html: layout(`${name} from ${company} wants to try worxmax.`, `
<tr><td style="padding:18px 32px 4px"><div style="font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#2D5BD8">New trial request</div>
<h1 style="margin:6px 0 4px;font-size:24px;line-height:1.25">${esc(company)}</h1>
<p style="margin:0;font-size:15px;color:#47443D">${esc(name)} wants to try worxmax.</p></td></tr>
<tr><td style="padding:16px 32px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
<tr><td style="padding:18px 32px 6px;font-size:15px;line-height:1.5">Reply to this email to answer ${esc(first)} directly. Create the workshop in the admin page, then send the login.</td></tr>
<tr><td style="padding:12px 32px 26px">${btn(SITE + "/admin/", "Open the admin page")}</td></tr>`),
        text: `New trial request: ${company}\n\n` + shown.map(([k, v]) => `${k}: ${v}`).join("\n") + `\n\nReply to this email to answer ${first}. Admin: ${SITE}/admin/`,
      }) || toTeam;
    } catch (_) { /* try the next address */ }
  }

  try {
    await sendMail({
      to: email, replyTo: SMTP_USER,
      subject: `Your worxmax trial for ${company}`,
      html: layout(`Thanks, ${first}. Create your account at worxmax.com/app and your 5-day trial starts.`, `
<tr><td style="padding:18px 32px 6px"><h1 style="margin:0 0 12px;font-size:26px;line-height:1.2">Thanks, ${esc(first)}. Your worxmax trial is ready to start.</h1>
<p style="margin:0;font-size:16px;line-height:1.55;color:#47443D">All nine apps for <b style="color:#1C1A16">${esc(company)}</b>, from the first quote to the last invoice, working from the same numbers. Free for 5 days, nothing is charged.</p></td></tr>
<tr><td style="padding:22px 32px 6px">${btn(SITE + "/app/", "Create your account")}
<p style="margin:10px 0 0;font-size:13px;color:#6A665D">or open <a href="${SITE}/app/" style="color:#2D5BD8">worxmax.com/app</a></p></td></tr>
<tr><td style="padding:22px 32px 4px"><div style="font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#6A665D;margin-bottom:14px">How to start</div>
<table role="presentation" cellpadding="0" cellspacing="0">${steps([
        ["Create your account", `Go to worxmax.com/app, choose Create account and use ${esc(email)}. Confirm it from the email we send you.`],
        ["Set up your workshop", "Give it your workshop name. You become the owner and every app opens for 5 days."],
        ["Add your team", "Invite office people by email from the Team page. Extra people cost nothing."],
      ])}</table></td></tr>
<tr><td style="padding:4px 32px 28px;font-size:15px;line-height:1.55">Want help to start, for example importing your board and hardware prices? Just reply to this email.</td></tr>`),
      text: `Thanks, ${first}. Your worxmax trial is ready to start.\n\nAll nine apps for ${company}, free for 5 days. Nothing is charged.\n\nHow to start\n1. Create your account: go to ${SITE}/app/, choose Create account and use ${email}. Confirm it from the email we send you.\n2. Set up your workshop: give it your workshop name. You become the owner and every app opens for 5 days.\n3. Add your team: invite office people by email from the Team page. Extra people cost nothing.\n\nWant help to start? Just reply to this email.\n\nThe worxmax team\n${SITE}`,
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
