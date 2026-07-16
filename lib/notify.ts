// 알림 발송 어댑터 — 채널은 작가가 앱에서 선택(email | kakao)
// 각 채널은 해당 키가 있을 때만 실제 발송, 없으면 graceful skip(로그).
import crypto from "node:crypto";

export type NotifyResult = { sent: boolean; channel: string; reason?: string };

export async function notify(
  channel: string,
  contact: string,
  subject: string,
  body: string
): Promise<NotifyResult> {
  if (!contact) return { sent: false, channel, reason: "no_contact" };
  if (channel === "email") return sendEmail(contact, subject, body);
  if (channel === "kakao") return sendKakao(contact, body);
  return { sent: false, channel, reason: "channel_off" };
}

// ---------- 이메일 (Resend → Gmail SMTP 폴백) ----------
// RESEND_API_KEY가 있으면 Resend, 없으면 GMAIL_USER+GMAIL_APP_PASSWORD로 Gmail SMTP.
// 도메인+Resend로 전환할 때는 env만 바꾸면 된다(코드 수정 없음).
export async function sendEmail(to: string, subject: string, body: string): Promise<NotifyResult> {
  if (process.env.RESEND_API_KEY) return sendViaResend(to, subject, body);
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return sendViaGmail(to, subject, body);
  return { sent: false, channel: "email", reason: "no_email_provider_keys" };
}

async function sendViaResend(to: string, subject: string, body: string): Promise<NotifyResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "노블메트릭 <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html: body.replace(/\n/g, "<br>") }),
    });
    if (!res.ok) return { sent: false, channel: "email", reason: `http_${res.status}` };
    return { sent: true, channel: "email" };
  } catch (e) {
    return { sent: false, channel: "email", reason: String(e) };
  }
}

async function sendViaGmail(to: string, subject: string, body: string): Promise<NotifyResult> {
  try {
    const { default: nodemailer } = await import("nodemailer");
    const user = process.env.GMAIL_USER!;
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass: process.env.GMAIL_APP_PASSWORD! },
    });
    await transporter.sendMail({
      from: `노블메트릭 <${user}>`,
      to,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
    });
    return { sent: true, channel: "email" };
  } catch (e) {
    return { sent: false, channel: "email", reason: String(e) };
  }
}

// ---------- 카카오 알림톡 (솔라피/SOLAPI) ----------
// SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_PFID / SOLAPI_TEMPLATE_ID / SOLAPI_SENDER 필요.
// 알림톡은 사전 승인된 템플릿이 있어야 하므로, 키가 다 갖춰질 때 활성화된다.
async function sendKakao(to: string, body: string): Promise<NotifyResult> {
  const key = process.env.SOLAPI_API_KEY;
  const secret = process.env.SOLAPI_API_SECRET;
  const pfId = process.env.SOLAPI_PFID;
  const templateId = process.env.SOLAPI_TEMPLATE_ID;
  const sender = process.env.SOLAPI_SENDER;
  if (!key || !secret || !pfId || !templateId || !sender) {
    return { sent: false, channel: "kakao", reason: "no_SOLAPI_keys" };
  }
  try {
    const date = new Date().toISOString();
    const salt = crypto.randomBytes(32).toString("hex");
    const signature = crypto.createHmac("sha256", secret).update(date + salt).digest("hex");
    const res = await fetch("https://api.solapi.com/messages/v4/send", {
      method: "POST",
      headers: {
        Authorization: `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          to: to.replace(/\D/g, ""),
          from: sender,
          type: "ATA",
          kakaoOptions: { pfId, templateId, variables: { "#{내용}": body } },
        },
      }),
    });
    if (!res.ok) return { sent: false, channel: "kakao", reason: `http_${res.status}` };
    return { sent: true, channel: "kakao" };
  } catch (e) {
    return { sent: false, channel: "kakao", reason: String(e) };
  }
}
