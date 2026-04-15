import { Resend } from "resend";
import { logger } from "./logger.js";
import { getEnvVar } from "./env.js";

const FROM = "Rakesh at Whyroo <hello@whyroo.com>";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = getEnvVar("RESEND_API_KEY");
  if (!apiKey) {
    logger.warn("send-welcome-email: RESEND_API_KEY not set - skipping");
    return res.status(200).json({ ok: true, skipped: true });
  }

  const { email, name } = req.body || {};
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "Invalid email" });
  }

  const firstName = (typeof name === "string" && name.trim()) || "there";
  const safeFirstName = firstName.slice(0, 60);

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: "Welcome to Whyroo 🌟",
      html: buildHtml(safeFirstName),
    });
    logger.info(`send-welcome-email: sent to ${email}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    logger.error("send-welcome-email: failed", { message: err?.message || String(err) });
    // Don't fail the sign-in flow if email fails
    return res.status(200).json({ ok: true, skipped: true });
  }
}

function buildHtml(firstName) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Whyroo</title>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;900&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background:#ede9fe;font-family:'Nunito',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ede9fe;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(139,92,246,0.12);">
          <!-- Header: sky→purple→pink gradient -->
          <tr>
            <td style="background:#a855f7;padding:36px 40px;text-align:center;">
              <p style="margin:0;font-size:48px;">🦘</p>
              <h1 style="margin:10px 0 0;color:#ffffff;font-family:'Nunito',sans-serif;font-size:28px;font-weight:900;letter-spacing:-0.5px;">Welcome to Whyroo!</h1>
              <p style="margin:6px 0 0;color:#f3e8ff;font-size:15px;font-weight:700;font-style:italic;">From why to wow.</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.7;font-family:'Nunito',sans-serif;">
                Hi ${firstName} 👋
              </p>
              <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.7;font-family:'Nunito',sans-serif;">
                You're all set! Whyroo is ready for your little explorer to start asking big questions.
              </p>
              <p style="margin:0 0 28px;font-size:16px;color:#374151;line-height:1.7;font-family:'Nunito',sans-serif;">
                Kids learn best when curiosity leads the way, and now they have a safe companion to answer every &ldquo;Why?&rdquo; with stories, activities, and fun quizzes.
              </p>
              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
                <tr>
                  <td style="background:#a855f7;border-radius:16px;text-align:center;box-shadow:0 4px 14px rgba(168,85,247,0.35);">
                    <a href="https://whyroo.com/app" style="display:inline-block;padding:15px 36px;color:#ffffff;font-size:16px;font-weight:900;text-decoration:none;font-family:'Nunito',sans-serif;letter-spacing:0.01em;">
                      Start exploring →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 0;font-size:14px;color:#6b7280;line-height:1.6;text-align:center;font-family:'Nunito',sans-serif;">
                or go to your
                <a href="https://whyroo.com/parent" style="color:#7c3aed;text-decoration:none;font-weight:700;">Parent Portal</a>
                to set up child profiles &amp; manage your subscription.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#faf5ff;padding:20px 40px;border-top:1px solid #e9d5ff;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;font-family:'Nunito',sans-serif;">
                Whyroo · hello@whyroo.com<br/>
                You're receiving this because you just signed up.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
