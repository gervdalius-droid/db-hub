// worxmax feedback emails (requests, comments and bug reports from app.worxmax.com).
//   POST { action: "new", id }    — a member just posted (feedback_submit): email the worxmax team once.
//   POST { action: "answer", id } — the operator answered (admin_feedback_answer): email the author once.
// Called with the signed-in user's token (supabase-js functions.invoke). The rows are read with the
// service role, but only after checking that the caller wrote the post ("new") or is the operator ("answer").
// Mail goes out the same way as the intake function: Hostinger SMTP (SMTP_PASS), or Resend (RESEND_API_KEY).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const db = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://worxmax.com,https://www.worxmax.com,https://app.worxmax.com,https://gervdalius-droid.github.io")
  .split(",").map((s) => s.trim()).filter(Boolean);

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Vary": "Origin",
  };
}
const reply = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KIND: Record<string, string> = { request: "Request", bug: "Bug report", comment: "Comment" };
const STATUS: Record<string, string> = { new: "New", planned: "Planned", in_progress: "In progress", done: "Done", wont_do: "Not planned" };

const SMTP_USER = Deno.env.get("SMTP_USER") ?? "hello@worxmax.com";
const FROM = `worxmax <${SMTP_USER}>`;
let mailer: { sendMail: (m: Record<string, unknown>) => Promise<unknown> } | null = null;
async function sendMail(m: { to: string; subject: string; html: string; text: string; replyTo?: string }): Promise<boolean> {
  const pass = Deno.env.get("SMTP_PASS");
  if (pass) {
    if (!mailer) {
      const nodemailer = (await import("npm:nodemailer@6.9.16")).default;
      mailer = nodemailer.createTransport({ host: Deno.env.get("SMTP_HOST") ?? "smtp.hostinger.com", port: 465, secure: true, auth: { user: SMTP_USER, pass } });
    }
    await mailer.sendMail({ from: FROM, to: m.to, subject: m.subject, html: m.html, text: m.text, replyTo: m.replyTo });
    return true;
  }
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("NOTIFY_FROM") ?? FROM, to: [m.to], reply_to: m.replyTo, subject: m.subject, html: m.html, text: m.text }),
  });
  return res.ok;
}
function layout(pre: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F2F1ED"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(pre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F1ED"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:2px solid #1C1A16;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1C1A16">
<tr><td style="height:8px;background:#C6F24E;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:26px 32px 6px"><img src="https://worxmax.com/assets/brand/worxmax-logo-email.png" width="150" height="30" alt="worxmax" style="display:block;border:0;width:150px;height:30px"></td></tr>
${body}
<tr><td style="padding:22px 32px 26px;border-top:1px solid #E2DFD8;font-size:12px;line-height:1.6;color:#6A665D">worxmax · software for furniture workshops · <a href="https://worxmax.com" style="color:#6A665D">worxmax.com</a></td></tr>
</table></td></tr></table></body></html>`;
}
const para = (html: string) => `<tr><td style="padding:6px 32px 12px;font-size:15px;line-height:1.55">${html}</td></tr>`;
const quote = (t: string) => `<tr><td style="padding:4px 32px 14px"><div style="border-left:4px solid #C6F24E;background:#F4F3EF;padding:12px 14px;font-size:15px;line-height:1.5;white-space:pre-wrap">${esc(t)}</div></td></tr>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return reply(req, 405, { error: "POST only" });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await db.auth.getUser(token);
  const user = who?.user;
  if (!user) return reply(req, 401, { error: "sign in first" });
  let b: { action?: string; id?: string };
  try { b = await req.json(); } catch { return reply(req, 400, { error: "bad json" }); }
  if (!b.id || !UUID.test(b.id)) return reply(req, 400, { error: "bad id" });
  const { data: f } = await db.from("feedback").select("*, workshops(name)").eq("id", b.id).maybeSingle();
  if (!f) return reply(req, 404, { error: "not found" });
  const ws = (f.workshops as { name?: string } | null)?.name ?? "";

  if (b.action === "new") {
    if (f.user_id !== user.id) return reply(req, 403, { error: "not yours" });
    if (f.notified_at) return reply(req, 200, { ok: true, sent: false });
    const team = (Deno.env.get("NOTIFY_EMAIL") ?? SMTP_USER).split(",").map((x) => x.trim()).filter(Boolean);
    const ctx = Object.entries(f.context ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n");
    const subject = `[worxmax ${KIND[f.kind] ?? f.kind}] ${f.title} — ${ws}`;
    const html = layout(subject,
      para(`<b>${esc(KIND[f.kind] ?? f.kind)}</b> from <b>${esc(f.author_name || user.email || "")}</b> (${esc(ws)}) · app: <b>${esc(f.app)}</b>`) +
      para(`<b style="font-size:18px">${esc(f.title)}</b>`) + (f.body ? quote(f.body) : "") +
      (ctx ? para(`<span style="font-size:12px;color:#6A665D;white-space:pre-wrap">${esc(ctx)}</span>`) : "") +
      para(`Answer it in the <a href="https://app.worxmax.com/admin/#feedback" style="color:#2D5BD8">admin dashboard</a>. Reply to this email to write to ${esc(user.email ?? "the author")} directly.`));
    const text = `${KIND[f.kind] ?? f.kind} from ${f.author_name} (${ws}), app ${f.app}\n\n${f.title}\n\n${f.body}\n\n${ctx}`;
    let ok = true;
    for (const to of team) { try { ok = (await sendMail({ to, subject, html, text, replyTo: user.email ?? undefined })) && ok; } catch { ok = false; } }
    if (ok) await db.from("feedback").update({ notified_at: new Date().toISOString() }).eq("id", f.id);
    return reply(req, 200, { ok: true, sent: ok });
  }

  if (b.action === "answer") {
    const { data: adm } = await db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (!adm) return reply(req, 403, { error: "operator only" });
    if (!f.answer || f.answer_sent_at) return reply(req, 200, { ok: true, sent: false });
    if (!f.user_id) return reply(req, 200, { ok: true, sent: false });
    const { data: au } = await db.auth.admin.getUserById(f.user_id);
    const to = au?.user?.email;
    if (!to) return reply(req, 200, { ok: true, sent: false });
    const subject = `Re: ${f.title} — worxmax`;
    const first = String(f.author_name || "").trim().split(/\s+/)[0];
    const html = layout(`Answer to your ${(KIND[f.kind] ?? "post").toLowerCase()}`,
      para(`${first ? "Hi " + esc(first) + "," : "Hello,"}`) +
      para(`we answered your ${esc((KIND[f.kind] ?? "post").toLowerCase())} <b>${esc(f.title)}</b>. Status: <b>${esc(STATUS[f.status] ?? f.status)}</b>.`) +
      quote(f.answer) +
      para(`You can see all your requests and answers in worxmax under <a href="https://app.worxmax.com/#/feedback" style="color:#2D5BD8">Feedback</a>. Reply to this email if anything is unclear.`));
    const text = `We answered your post "${f.title}". Status: ${STATUS[f.status] ?? f.status}.\n\n${f.answer}\n\nhttps://app.worxmax.com/#/feedback`;
    let ok = false;
    try { ok = await sendMail({ to, subject, html, text, replyTo: SMTP_USER }); } catch { ok = false; }
    if (ok) await db.from("feedback").update({ answer_sent_at: new Date().toISOString() }).eq("id", f.id);
    return reply(req, 200, { ok: true, sent: ok });
  }
  return reply(req, 400, { error: "unknown action" });
});
