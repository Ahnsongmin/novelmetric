// 아카라이브 로그인 세션 관리 + 댓글 게시 스크립트 (Playwright 직접 구동).
//   프로필(쿠키)은 scripts/.arca-profile에 영속 — 최초 1회 로그인 후 재사용.
//   사용법:
//     node scripts/arca-session.mjs login                # 로그인(세션 확보)만
//     node scripts/arca-session.mjs comment --text "..." # dry_run: 입력까지만, 게시 안 함
//     node scripts/arca-session.mjs comment --text "..." --live   # 실제 게시
//     node scripts/arca-session.mjs comment --reply <댓글ID> --text "..." --live  # 대댓글
//     node scripts/arca-session.mjs post --file scripts/arca-post-XXXX.txt [--category 정보] [--live]
//       (--file 형식: [제목] 줄 다음 제목, [본문] 줄 다음 본문. dry_run은 입력 후 스크린샷만)
//   계정: .env.local의 ARCA_ID / ARCA_PW

import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(here, ".arca-profile");
const POST_URL = "https://arca.live/b/webfiction/178096419"; // 7/27 출시 글 (이전 데이터 글: 177401493)

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
const fileIdx = args.indexOf("--file");
const postFile = fileIdx >= 0 ? args[fileIdx + 1] : null;
const catIdx = args.indexOf("--category");
const category = catIdx >= 0 ? args[catIdx + 1] : null;

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

    // 입력·게시 대상을 감싸는 폼 셀렉터. 대댓글이면 이 댓글 전용 폼(#replyForm<id>)으로 고정한다.
    let formSel;
    if (replyTo) {
      // 대댓글: 정확히 이 댓글(#c_<id>) 헤더의 '답글' 링크만 클릭한다.
      // (Playwright의 텍스트 클릭이나 AI 셀렉터는 다른 댓글의 답글을 짚을 수 있어 DOM 스코프로 제한)
      const opened = await page.evaluate((id) => {
        const c = document.querySelector("#c_" + id);
        if (!c) return { ok: false, err: `댓글 #c_${id} 를 찾지 못함` };
        const link = [...c.querySelectorAll("a, button")].find((e) => /답글/.test(e.textContent));
        if (!link) return { ok: false, err: `#c_${id} 에서 '답글' 링크를 찾지 못함` };
        link.click();
        return { ok: true };
      }, replyTo);
      if (!opened.ok) throw new Error(opened.err);

      // ★ 핵심 검증: 반드시 이 댓글 전용 폼(#replyForm<id>)이 열려야 한다.
      // 다른 댓글 폼이 열렸다면 여기서 타임아웃 → 엉뚱한 댓글에 게시되는 사고를 원천 차단.
      formSel = `#replyForm${replyTo}`;
      await page.waitForSelector(`${formSel} textarea[name="content"]`, { timeout: 15000 });
    } else {
      // 최상위 댓글: replyForm(대댓글 폼)이 아닌 메인 작성창을 표시하고 스코프한다.
      const marked = await page.evaluate(() => {
        const box = [...document.querySelectorAll('textarea[name="content"]')].find(
          (t) => !t.closest('[id^="replyForm"]'),
        );
        if (!box) return false;
        const container = box.closest("form") || box.closest(".reply-form") || box.parentElement;
        container.setAttribute("data-nm-mainform", "1");
        return true;
      });
      if (!marked) throw new Error("메인 댓글 작성창을 찾지 못함");
      formSel = '[data-nm-mainform="1"]';
    }

    const box = page.locator(`${formSel} textarea[name="content"]`).first();
    await box.waitFor({ timeout: 15000 });
    await box.fill(text);

    if (live) {
      await page.click(`${formSel} button:has-text("작성")`);
      await page.waitForTimeout(2500);
      const needle = text.slice(0, 20).replace(/\s+/g, " ");
      const posted = await page.evaluate(
        (n) =>
          [...document.querySelectorAll('.comment-item, [id^="c_"]')].some((c) =>
            c.textContent.replace(/\s+/g, " ").includes(n),
          ),
        needle,
      );
      out({
        ok: posted,
        live: true,
        target: replyTo ? `reply→#c_${replyTo}` : "top-level",
        note: posted ? "댓글 게시 확인됨" : "게시 후 본문에서 미확인 — 브라우저로 검증 필요",
      });
    } else {
      out({
        ok: true,
        live: false,
        target: replyTo ? `reply→#c_${replyTo} (폼 #replyForm${replyTo} 확인됨)` : "top-level",
        note: "dry_run — 입력까지만 하고 게시 안 함. 실제 게시는 --live",
      });
    }
  } else if (mode === "post") {
    if (!postFile) throw new Error("--file 필요 ([제목]/[본문] 형식 텍스트 파일)");
    const rawPost = readFileSync(postFile, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
    const m = rawPost.match(/\[제목\]\s*\n([\s\S]*?)\n\s*\[본문\]\s*\n([\s\S]*)$/);
    if (!m) throw new Error(`${postFile}에서 [제목]/[본문] 구획을 찾지 못함`);
    const title = m[1].trim();
    const body = m[2].trim();

    await page.goto("https://arca.live/b/webfiction/write", { waitUntil: "domcontentloaded", timeout: 60000 });
    const titleBox = page.locator('input[name="title"], #title').first();
    await titleBox.waitFor({ timeout: 30000 });

    // 말머리(카테고리) 선택 — 옵션 목록도 결과에 남겨 dry_run에서 확인 가능하게
    let categories = [];
    const catSel = page.locator('select[name="category"], select#category').first();
    if (await catSel.count()) {
      categories = await catSel.locator("option").allTextContents();
      if (category) {
        const target = categories.find((c) => c.trim() === category) ?? categories.find((c) => c.includes(category));
        if (!target) throw new Error(`말머리 "${category}" 없음. 가능한 값: ${categories.join(", ")}`);
        await catSel.selectOption({ label: target });
      }
    }

    await titleBox.fill(title);

    // 본문: Froala 에디터(contenteditable). 줄 단위 입력으로 문단 유지.
    const editor = page.locator('.fr-element[contenteditable="true"]').first();
    await editor.waitFor({ timeout: 30000 });
    await editor.click();
    for (const line of body.split("\n")) {
      if (line) await page.keyboard.insertText(line);
      await page.keyboard.press("Enter");
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: join(here, "arca-post-preview.png"), fullPage: true });

    if (live) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {}),
        page.click('button[type="submit"]:has-text("작성"), .article-write button[type="submit"], button:has-text("등록")'),
      ]);
      await page.waitForTimeout(3000);
      const url = page.url();
      await page.screenshot({ path: join(here, "arca-post-live.png"), fullPage: false });
      const posted = /\/b\/webfiction\/\d+/.test(url);
      out({ ok: posted, live: true, url, categories, note: posted ? "게시 완료" : "게시 후 URL이 글 주소가 아님 — arca-post-live.png 확인 필요" });
    } else {
      out({ ok: true, live: false, title, categories, note: "dry_run — 입력까지만. 스크린샷 scripts/arca-post-preview.png 확인 후 --live" });
    }
  } else {
    out({ ok: false, error: "mode는 login, comment 또는 post" });
  }
} catch (e) {
  out({ ok: false, error: String(e.message ?? e) });
  process.exitCode = 1;
} finally {
  await ctx.close();
}
