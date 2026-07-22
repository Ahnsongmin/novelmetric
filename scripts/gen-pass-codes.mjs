// 대기자 무료 체험 Pro 코드 발급기.
//   scripts/waitlist-recipients.txt 의 이메일마다 NM-코드 1개 생성 →
//   ① Supabase에 붙여넣을 INSERT SQL 출력 (nm_pass)
//   ② 메일 병합용 매핑 scripts/waitlist-codes.json 저장 (email → code)
// 실행: node scripts/gen-pass-codes.mjs
// 코드 자체는 결제와 무관하게 /pro 코드 입력으로 30일(여기선 넉넉히) Pro가 열린다.
//
// 재실행 주의: 코드가 매번 새로 생성된다. 이미 SQL을 Supabase에 넣었다면 재실행 말 것.
// 추가 발급(송금 고객 등 1건)은 node scripts/gen-pass-codes.mjs --one 로.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));

// 첫 팬 10명 선물: 넉넉하게 2026-09-30까지 (KST). 프로모션 종료일.
const EXPIRES = "2026-09-30T23:59:59+09:00";

function newCode() {
  return `NM-${randomBytes(6).toString("hex").toUpperCase()}`;
}

function sqlRow(code, orderId, amount) {
  const esc = (s) => String(s).replace(/'/g, "''");
  return `  ('${esc(code)}', '${esc(orderId)}', 'TRIAL', ${amount}, '${EXPIRES}')`;
}

const one = process.argv.includes("--one");

if (one) {
  // 송금 고객 1명 즉석 발급용 (order_id는 고유해야 하므로 코드 자체를 붙임)
  const code = newCode();
  const orderId = `manual-${code}`;
  console.log(`\n== 1건 발급 (송금 고객용) ==`);
  console.log(`발급 코드: ${code}   (손님에게 이 코드를 전달)`);
  console.log(`\n-- Supabase SQL Editor에 붙여넣기 --`);
  console.log(`insert into nm_pass (code, order_id, payment_key, amount, expires_at) values`);
  console.log(sqlRow(code, orderId, 9900) + ";");
  process.exit(0);
}

const recipients = readFileSync(join(here, "waitlist-recipients.txt"), "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

if (!recipients.length) {
  console.error("waitlist-recipients.txt에 수신자가 없습니다.");
  process.exit(1);
}

const codesPath = join(here, "waitlist-codes.json");
if (existsSync(codesPath)) {
  console.error(`이미 ${codesPath} 가 있습니다. 재발급하면 코드가 바뀝니다. 정말 재발급하려면 이 파일을 지우고 다시 실행하세요.`);
  process.exit(1);
}

const mapping = recipients.map((email) => ({ email, code: newCode() }));
writeFileSync(codesPath, JSON.stringify(mapping, null, 2), "utf8");

const rows = mapping.map((m) => sqlRow(m.code, `trial-${m.email}`, 0)).join(",\n");
const sql = `-- 대기자 ${mapping.length}명 무료 체험 코드 (만료 ${EXPIRES})\ninsert into nm_pass (code, order_id, payment_key, amount, expires_at) values\n${rows}\non conflict (code) do nothing;`;
writeFileSync(join(here, "waitlist-codes.sql"), sql + "\n", "utf8");

console.log(`✅ ${mapping.length}명 코드 생성 완료`);
console.log(`   매핑: scripts/waitlist-codes.json (메일 병합용)`);
console.log(`   SQL : scripts/waitlist-codes.sql (Supabase에 붙여넣기)\n`);
console.log(`--- email → code ---`);
for (const m of mapping) console.log(`  ${m.email}  →  ${m.code}`);
console.log(`\n--- 이 SQL을 Supabase SQL Editor에서 실행하세요 ---\n${sql}`);
