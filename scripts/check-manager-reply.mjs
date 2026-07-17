// 웹연갤 매니저(thisday753159@gmail.com) 답장 수신 확인 스크립트.
//   Gmail IMAP으로 받은편지함을 검색해 새 메일만 JSON으로 출력한다.
//   이미 처리한 메일 UID는 scripts/.manager-reply-state.json에 기록해 중복 알림을 막는다.
//   기본은 조회만(읽음 처리 없음). 처리 완료 표시: node scripts/check-manager-reply.mjs --ack <uid>
// 필요 env: GMAIL_USER, GMAIL_APP_PASSWORD (.env.local 또는 셸 환경변수)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ImapFlow } from "imapflow";

const here = dirname(fileURLToPath(import.meta.url));
const MANAGER = "thisday753159@gmail.com";
const statePath = join(here, ".manager-reply-state.json");

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
if (!user || !pass) {
  console.error(JSON.stringify({ error: "GMAIL_USER / GMAIL_APP_PASSWORD 없음" }));
  process.exit(1);
}

const state = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, "utf8"))
  : { handledUids: [] };

const ackIdx = process.argv.indexOf("--ack");
if (ackIdx !== -1) {
  const uid = Number(process.argv[ackIdx + 1]);
  if (!uid) {
    console.error(JSON.stringify({ error: "--ack 뒤에 uid 숫자 필요" }));
    process.exit(1);
  }
  if (!state.handledUids.includes(uid)) state.handledUids.push(uid);
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log(JSON.stringify({ acked: uid }));
  process.exit(0);
}

const client = new ImapFlow({
  host: "imap.gmail.com",
  port: 993,
  secure: true,
  auth: { user, pass },
  logger: false,
});

try {
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  const results = [];
  try {
    const uids = await client.search({ from: MANAGER }, { uid: true });
    const fresh = (uids || []).filter((u) => !state.handledUids.includes(u));
    for (const uid of fresh) {
      const msg = await client.fetchOne(
        String(uid),
        { envelope: true, bodyParts: ["text"] },
        { uid: true }
      );
      const textPart = msg.bodyParts?.get("text");
      results.push({
        uid,
        date: msg.envelope.date,
        subject: msg.envelope.subject,
        from: msg.envelope.from?.[0]?.address,
        messageId: msg.envelope.messageId,
        body: textPart ? textPart.toString("utf8").slice(0, 3000) : "(본문 추출 실패)",
      });
    }
  } finally {
    lock.release();
  }
  await client.logout();
  console.log(JSON.stringify({ newReplies: results.length, replies: results }, null, 2));
} catch (e) {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
}
