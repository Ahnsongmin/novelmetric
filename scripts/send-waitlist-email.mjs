// 대기자 안내 메일 일회성 발송 스크립트.
//   수신자: scripts/waitlist-recipients.txt (한 줄당 이메일 1개, # 주석 가능)
//   본문:   scripts/waitlist-message.txt   (1번째 줄 = 제목, 빈 줄 하나 건너뛰고 나머지 = 본문 그대로)
//   기본 dry_run — 실제 발송은 `node scripts/send-waitlist-email.mjs --live`
// 필요 env: GMAIL_USER, GMAIL_APP_PASSWORD (.env.local 또는 셸 환경변수)

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import nodemailer from "nodemailer";

const here = dirname(fileURLToPath(import.meta.url));
const live = process.argv.includes("--live");

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

const recipients = readFileSync(join(here, "waitlist-recipients.txt"), "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

const raw = readFileSync(join(here, "waitlist-message.txt"), "utf8").replace(/\r\n/g, "\n");
const [subject, ...rest] = raw.split("\n");
const body = rest.join("\n").replace(/^\n+/, "");

if (!subject.trim() || !body.trim()) {
  console.error("waitlist-message.txt가 비어 있습니다. 1번째 줄=제목, 나머지=본문으로 채워주세요.");
  process.exit(1);
}

console.log(`모드: ${live ? "🔴 LIVE 발송" : "dry_run (미발송 — --live로 실발송)"}`);
console.log(`발신: 노블메트릭 <${user ?? "(GMAIL_USER 미설정)"}>`);
console.log(`제목: ${subject}`);
console.log(`수신자 ${recipients.length}명:\n  ${recipients.join("\n  ")}`);
console.log(`\n--- 본문 ---\n${body}\n------------\n`);

if (!live) {
  console.log("dry_run 종료. 위 내용 그대로 보내려면 --live 를 붙여 실행하세요.");
  process.exit(0);
}

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

let sent = 0;
for (const to of recipients) {
  try {
    await transporter.sendMail({
      from: `노블메트릭 <${user}>`,
      to,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
    });
    sent++;
    console.log(`✅ ${to}`);
  } catch (e) {
    console.error(`❌ ${to}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 2000)); // Gmail 스팸 판정 회피용 간격
}
console.log(`\n완료: ${sent}/${recipients.length} 발송`);
