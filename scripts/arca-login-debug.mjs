// 아카 로그인: 캡차 단계까지 진행 → 자동 클릭 시도 → 실패 시 창을 화면에 띄워 사용자 클릭 대기 (최대 3분)
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(join(here, "..", ".env.local"), "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const ctx = await chromium.launchPersistentContext(join(here, ".arca-profile"), {
  headless: false,
  channel: "chrome", // 실제 설치된 크롬 사용 — Cloudflare 통과율 개선
  viewport: null,
  args: ["--window-position=200,120", "--disable-blink-features=AutomationControlled"],
  ignoreDefaultArgs: ["--enable-automation"],
  locale: "ko-KR",
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

const loggedIn = async () => {
  const html = await page.content();
  return html.includes("/u/logout") || html.includes("로그아웃");
};

await page.goto("https://arca.live/u/login", { waitUntil: "domcontentloaded", timeout: 60000 });
if (await loggedIn()) {
  console.log(JSON.stringify({ ok: true, note: "이미 로그인됨" }));
  await ctx.close();
  process.exit(0);
}
await page.waitForSelector('input[name="username"]', { timeout: 60000 });
await page.fill('input[name="username"]', env.ARCA_ID);
await page.fill('input[name="password"]', env.ARCA_PW);
await Promise.all([
  page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {}),
  page.press('input[name="password"]', "Enter"),
]);
await page.waitForTimeout(3000);

// 캡차는 자동 클릭하지 않음(자동화 감지 유발) — 사용자가 직접 체크박스 클릭.
// 로그인 완료 대기 — 최대 300초
const deadline = Date.now() + 300000;
let ok = false;
while (Date.now() < deadline) {
  await page.waitForTimeout(3000);
  if (page.url().includes("/u/login") === false || (await loggedIn())) {
    await page.goto("https://arca.live", { waitUntil: "domcontentloaded" }).catch(() => {});
    if (await loggedIn()) {
      ok = true;
      break;
    }
  }
}
await page.screenshot({ path: join(here, "arca-login-debug.png") }).catch(() => {});
console.log(JSON.stringify({ ok, note: ok ? "로그인 성공 — 세션 저장됨" : "시간 내 로그인 미완료 — 스크린샷 확인" }));
await ctx.close();
