// The log-in code email (design 23d), sent through Resend's HTTP API.
import type { Env } from "../env";

export function loginCodeEmail(code: string): { subject: string; text: string; html: string } {
  // The code leads the subject, so it shows in the phone's notification without opening the email.
  const subject = `${code} is your TrailZ code`;
  const text = [
    "Here's your code to log in to TrailZ:",
    "",
    code,
    "",
    "Type it in TrailZ within 15 minutes. It works once.",
    "Didn't try to log in? Ignore this email. Nobody can get in without the code.",
    "",
    "You got this because someone typed this address on TrailZ.",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#E6EBF3;font-family:Lexend,Helvetica,Arial,sans-serif;color:#0B1B3F">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E6EBF3;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#FFFFFF;border-radius:20px">
<tr><td style="padding:28px 24px">
<div style="font-weight:800;font-size:22px;letter-spacing:-0.4px;margin:0 0 16px">TrailZ</div>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5">Here's your code to log in:</p>
<div style="background:#F2F5FB;border-radius:16px;padding:18px 0 18px 10px;text-align:center;font-weight:800;font-size:40px;letter-spacing:10px;font-family:'Courier New',Courier,monospace">${code}</div>
<p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:#4E5D78">Type it in TrailZ within 15 minutes. It works once.</p>
<p style="margin:12px 0 0;font-size:14px;line-height:1.5;color:#4E5D78">Didn't try to log in? Ignore this email. Nobody can get in without the code.</p>
<p style="margin:20px 0 0;padding-top:14px;border-top:1px solid #E6ECF5;font-size:12px;line-height:1.5;color:#4E5D78">You got this because someone typed this address on TrailZ.</p>
</td></tr></table>
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}

export async function sendLoginCode(env: Env, to: string, code: string): Promise<void> {
  const m = loginCodeEmail(code);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject: m.subject, text: m.text, html: m.html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
}
