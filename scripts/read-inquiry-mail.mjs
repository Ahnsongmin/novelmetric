// 노블메트릭 문의 메일 읽기 — 제목이 "[노블메트릭 문의]"인 메일 본문을 출력한다.
// nm_inquiry 표 저장이 실패해도 메일은 나가므로, 문의 원문은 여기서 확인한다.
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import fs from "node:fs";

const env = {};
for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const client = new ImapFlow({
  host: "imap.gmail.com",
  port: 993,
  secure: true,
  auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
  logger: false,
});

await client.connect();
const lock = await client.getMailboxLock("INBOX");
try {
  // 최근 7일 내 문의 메일
  const since = new Date(Date.now() - 7 * 864e5);
  const uids = await client.search({ since, subject: "노블메트릭 문의" });
  console.log(`문의 메일 ${uids.length}건\n`);

  for (const uid of uids) {
    const msg = await client.fetchOne(uid, { envelope: true, source: true }, { uid: true });
    const parsed = await simpleParser(msg.source);
    const body = parsed.text || parsed.html || "(본문 없음)";
    const d = msg.envelope.date;
    const kst = new Date(d.getTime() + 9 * 36e5).toISOString().replace("T", " ").slice(0, 16);
    console.log("=".repeat(60));
    console.log(`받은시각(KST): ${kst}`);
    console.log(`제목: ${msg.envelope.subject}`);
    console.log("-".repeat(60));
    console.log(body.trim().slice(0, 1500));
    console.log();
  }
} finally {
  lock.release();
  await client.logout();
}
