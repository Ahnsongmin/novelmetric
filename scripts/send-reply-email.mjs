// 단건 답장 발송 스크립트 (매니저 회신 등).
//   사용: node scripts/send-reply-email.mjs --to <주소> --subject <제목> --body-file <본문파일> [--in-reply-to <messageId>] [--live]
//   기본 dry_run — 실제 발송은 --live 필요.
// 필요 env: GMAIL_USER, GMAIL_APP_PASSWORD (.env.local 또는 셸 환경변수)

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import nodemailer from "nodemailer";

const here = dirname(fileURLToPath(import.meta.url));

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const live = process.argv.includes("--live");
const to = arg("--to");
const subject = arg("--subject");
const bodyFile = arg("--body-file");
const inReplyTo = arg("--in-reply-to");

if (!to || !subject || !bodyFile) {
  console.error("사용법: --to <주소> --subject <제목> --body-file <파일> [--in-reply-to <id>] [--live]");
  process.exit(1);
}

// .env.local 간이 로드 (dotenv 의존성 없이)
const envPath = join(here, "..", ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const user = process.env.GMAIL_USER;
const pass = process.env.GMAIL_APP_PASSWORD;
const body = readFileSync(bodyFile, "utf8").replace(/\r\n/g, "\n");

console.log(`모드: ${live ? "🔴 LIVE 발송" : "dry_run (미발송 — --live로 실발송)"}`);
console.log(`발신: 노블메트릭 <${user ?? "(GMAIL_USER 미설정)"}>`);
console.log(`수신: ${to}`);
console.log(`제목: ${subject}`);
if (inReplyTo) console.log(`In-Reply-To: ${inReplyTo}`);
console.log(`\n--- 본문 ---\n${body}\n------------`);

if (!live) process.exit(0);
if (!user || !pass) {
  console.error("GMAIL_USER / GMAIL_APP_PASSWORD가 없어 발송할 수 없습니다.");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user, pass },
});

const info = await transporter.sendMail({
  from: `노블메트릭 <${user}>`,
  to,
  subject,
  text: body,
  html: body.replace(/\n/g, "<br>"),
  ...(inReplyTo ? { inReplyTo, references: inReplyTo } : {}),
});
console.log(`✅ 발송 완료: ${info.messageId}`);
