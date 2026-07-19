// 아카라이브 로그인 세션 관리 + 댓글 게시 스크립트 (Playwright 직접 구동).
//   프로필(쿠키)은 scripts/.arca-profile에 영속 — 최초 1회 로그인 후 재사용.
//   사용법:
//     node scripts/arca-session.mjs login                # 로그인(세션 확보)만
//     node scripts/arca-session.mjs comment --text "..." # dry_run: 입력까지만, 게시 안 함
//     node scripts/arca-session.mjs comment --text "..." --live   # 실제 게시
//     node scripts/arca-session.mjs comment --reply <댓글ID> --text "..." --live  # 대댓글
//   계정: .env.local의 ARCA_ID / ARCA_PW

import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(here, ".arca-profile");
const POST_URL = "https://arca.live/b/webfiction/177401493";

// .env.local 로드 (dotenv 없이 직접 파싱)
const envPath = join(here, "..", ".env.local");
const env = {};
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
}
const ID = env.ARCA_ID;
const PW = env.ARCA_PW;

const args = process.argv.slice(2);
const mode = args[0];
const live = args.includes("--live");
const textIdx = args.indexOf("--text");
const text = textIdx >= 0 ? args[textIdx + 1] : null;
const replyIdx = args.indexOf("--reply");
const replyTo = replyIdx >= 0 ? args[replyIdx + 1] : null;

const out = (obj) => console.log(JSON.stringify(obj, null, 2));

if (!ID || !PW) {
  out({ ok: false, error: ".env.local에 ARCA_ID/ARCA_PW 없음" });
  process.exit(1);
}

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false, // Cloudflare 챌린지 통과율 때문에 headed. 창은 화면 밖 좌표로.
  channel: "chrome", // 실제 설치된 크롬 — 자동화 감지 회피
  viewport: null,
  args: ["--window-position=-2400,-2400", "--disable-blink-features=AutomationControlled"],
  ignoreDefaultArgs: ["--enable-automation"],
  locale: "ko-KR",
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

async function isLoggedIn() {
  await page.goto("https://arca.live", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);
  const html = await page.content();
  return html.includes("/u/logout") || html.includes("로그아웃");
}

async function login() {
  await page.goto("https://arca.live/u/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  // Cloudflare 챌린지가 있으면 통과될 때까지 대기
  await page.waitForSelector('input[name="username"]', { timeout: 60000 });
  await page.fill('input[name="username"]', ID);
  await page.fill('input[name="password"]', PW);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {}),
    page.press('input[name="password"]', "Enter"),
  ]);
  await page.waitForTimeout(2500);
  const html = await page.content();
  if (html.includes("/u/logout") || html.includes("로그아웃")) return true;
  const errM = html.match(/alert[^>]*>([\s\S]{0,200}?)</);
  throw new Error("로그인 실패" + (errM ? `: ${errM[1].trim()}` : " (2FA/캡차 여부 확인 필요)"));
}

try {
  let logged = await isLoggedIn();
  if (!logged) {
    await login();
    logged = true;
  }

  if (mode === "login") {
    out({ ok: true, loggedIn: true, note: "세션 확보 완료 (scripts/.arca-profile에 저장)" });
  } else if (mode === "comment") {
    if (!text) throw new Error("--text 필요");
    await page.goto(POST_URL + "#comment", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2000);
    if (replyTo) {
      // 대댓글: 해당 댓글의 답글 버튼 클릭 후 폼에 입력
      await page.click(`#c_${replyTo} .reply-link, #c_${replyTo} [data-action="reply"]`);
      await page.waitForTimeout(800);
    }
    const box = page.locator('textarea[name="contents"], .comment-form textarea, #commentForm textarea').last();
    await box.waitFor({ timeout: 15000 });
    await box.fill(text);
    if (live) {
      await Promise.all([
        page.waitForTimeout(3000),
        page.click('.comment-form button[type="submit"], #commentForm button[type="submit"], button:has-text("작성")'),
      ]);
      await page.waitForTimeout(2500);
      const html = await page.content();
      const posted = html.replace(/\s+/g, " ").includes(text.slice(0, 20).replace(/\s+/g, " "));
      out({ ok: posted, live: true, note: posted ? "댓글 게시 확인됨" : "게시 후 본문에서 미확인 — 브라우저로 검증 필요" });
    } else {
      out({ ok: true, live: false, note: "dry_run — 입력까지만 하고 게시 안 함. 실제 게시는 --live" });
    }
  } else {
    out({ ok: false, error: "mode는 login 또는 comment" });
  }
} catch (e) {
  out({ ok: false, error: String(e.message ?? e) });
  process.exitCode = 1;
} finally {
  await ctx.close();
}
