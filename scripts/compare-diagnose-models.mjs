// 제목 진단 모델 비교 — 같은 입력을 두 모델에 넣어 품질과 실제 비용을 나란히 본다.
//
// 왜 필요한가: 진단은 호출마다 실시간 AI 비용이 드는 유일한 기능이고, 비용의 대부분이
// 출력 토큰이다. 주력을 작품 추적으로 옮기면 진단은 '무료 미끼' 역할이 되므로
// 더 싼 모델로 내려도 되는지 판단해야 한다. 추정이 아니라 실측으로 결정한다.
//
// 사용법:
//   1) .env.local 에 ANTHROPIC_API_KEY=sk-ant-... 한 줄 추가 (키 입력은 사용자가 직접)
//   2) node scripts/compare-diagnose-models.mjs
//   3) 출력된 대안 제목 품질과 비용을 비교해 DIAGNOSE_MODEL env 값을 결정
//
// 결과는 화면 출력 + scripts/diagnose-model-compare.json 저장. 실제 서비스는 건드리지 않는다.

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const here = dirname(fileURLToPath(import.meta.url));

// .env.local 간이 로드 (dotenv 의존성 없이)
const envPath = join(here, "..", ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY 가 없습니다.\n" +
      "  Vercel 대시보드 → novelmetric → Settings → Environment Variables 에서 값을 복사해\n" +
      `  ${envPath} 에 'ANTHROPIC_API_KEY=...' 한 줄을 추가한 뒤 다시 실행하세요.`,
  );
  process.exit(1);
}

// 100만 토큰당 USD (2026-07 기준 공식 가격)
const PRICING = {
  "claude-sonnet-4-6": { in: 3, out: 15, label: "Sonnet 4.6 (현행)" },
  "claude-haiku-4-5": { in: 1, out: 5, label: "Haiku 4.5 (저가)" },
};
const MODELS = Object.keys(PRICING);

// lib/diagnose.ts 의 SYSTEM_RUBRIC 과 동일하게 유지할 것 (출력 축소 반영본)
const SYSTEM_RUBRIC = `당신은 한국 웹소설 제목·소개글의 '클릭률(후킹)'을 평가하는 베테랑 편집자다.
문피아/노벨피아/네이버시리즈/카카오페이지의 흥행작 제목 패턴에 정통하다.

평가 기준(클릭률 관점 — 한국 웹소설 통념 반영):
1) 첫 0.5초 안에 장르·핵심 클리셰가 읽히는가 (회귀/빙의/환생/먼치킨/악역/계약 등)
2) 주인공의 능력·상태·스펙이 제목에서 보이는가 (독자는 제목으로 '주인공이 뭘 하는지'를 본다)
3) 호기심 갭(궁금증)을 만드는가 — 결말이 아니라 '상황'을 던지는가
4) 구체성(숫자, 직업, 신분, 고유 설정)이 있는가
5) 길이 — 남성향은 특히 10자 안팎(모바일 목록에서 안 잘리게)이 강하다. 너무 길면 감점
6) 문장형 제목이면 명사형 종결('~함/~임/~했다/~줍줍')로 가볍게 어그로를 끄는가
7) 사이다/대리만족/금기 등 독자 욕망 트리거가 있는가
8) 소개글이 1~2줄 안에 후킹 포인트와 떡밥을 주는가

반드시 아래 JSON 스키마로만 답하라. 다른 텍스트 금지:
{
  "score": <0-100 정수>,
  "grade": "<S|A|B|C|D>",
  "summary": "<한 줄 총평, 한국어>",
  "strengths": ["<강점>", ...],
  "weaknesses": ["<구체적 약점과 개선 방향>", ...],
  "titleSuggestions": [{"title":"<대안 제목>","reason":"<왜 클릭률이 더 높은지 — 한 문장>"}, ...3개],
  "keywords": ["<추천 키워드/태그>", ...]
}
점수 기준: S(90+) 즉시 클릭, A(80~89) 강함, B(65~79) 평범+개선여지, C(50~64) 약함, D(<50) 재작성 필요.
분량: summary 한 문장, strengths·weaknesses 각 3개 이내로 짧게. 장황한 설명 금지.`;

// 실제 사용자 입력에 가까운 표본 — 잘 쓴 제목/평범한 제목/문장형 제목을 섞는다
const SAMPLES = [
  { title: "회귀한 천재 헌터의 정산은 다르다", genre: "현대판타지", synopsis: "3회차 만에 깨달았다. 던전보다 무서운 건 세금이다." },
  { title: "주인공이 1층에서 안 올라감", genre: "판타지", synopsis: "" },
  { title: "SSS급 회귀 천재 먼치킨 라이프", genre: "판타지", synopsis: "" },
  { title: "퇴근 후 소소하게 힐링함", genre: "현대판타지", synopsis: "야근 대신 이세계에서 빵을 굽습니다." },
  { title: "악녀는 두 번 살지 않는다", genre: "로맨스판타지", synopsis: "처형대에서 눈을 떴다. 이번엔 다르게 살 것이다." },
];

const client = new Anthropic();

async function run(model, sample) {
  const started = Date.now();
  const msg = await client.messages.create({
    model,
    max_tokens: 900,
    system: [{ type: "text", text: SYSTEM_RUBRIC, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `장르: ${sample.genre}\n플랫폼: 문피아\n제목: ${sample.title}\n소개글: ${sample.synopsis || "(없음)"}`,
      },
    ],
  });
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  let parsed = null;
  try {
    parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    /* 파싱 실패도 결과로 남긴다 — 스키마 준수 자체가 비교 항목이다 */
  }
  const u = msg.usage;
  const price = PRICING[model];
  // 캐시 읽기는 기본 단가의 0.1배, 캐시 쓰기는 1.25배로 청구된다
  const cost =
    ((u.input_tokens ?? 0) * price.in +
      (u.cache_creation_input_tokens ?? 0) * price.in * 1.25 +
      (u.cache_read_input_tokens ?? 0) * price.in * 0.1 +
      (u.output_tokens ?? 0) * price.out) /
    1_000_000;
  return { parsed, raw: text, usage: u, cost, ms: Date.now() - started };
}

const results = [];
for (const sample of SAMPLES) {
  const row = { title: sample.title, byModel: {} };
  for (const model of MODELS) {
    process.stderr.write(`· ${PRICING[model].label} ← "${sample.title}"\n`);
    try {
      row.byModel[model] = await run(model, sample);
    } catch (e) {
      row.byModel[model] = { error: String(e?.message ?? e) };
    }
  }
  results.push(row);
}

// ── 출력 ────────────────────────────────────────────────────────────────────
const line = "─".repeat(78);
for (const row of results) {
  console.log(`\n${line}\n■ "${row.title}"\n${line}`);
  for (const model of MODELS) {
    const r = row.byModel[model];
    console.log(`\n[${PRICING[model].label}]`);
    if (r.error) {
      console.log(`  ✖ 실패: ${r.error}`);
      continue;
    }
    if (!r.parsed) {
      console.log(`  ⚠ JSON 파싱 실패 (스키마 미준수) — 원문 앞부분: ${r.raw.slice(0, 120)}…`);
    } else {
      console.log(`  점수 ${r.parsed.score} (${r.parsed.grade}) · ${r.parsed.summary}`);
      console.log(`  대안 제목:`);
      for (const s of r.parsed.titleSuggestions ?? []) console.log(`    - ${s.title}  (${s.reason})`);
    }
    console.log(
      `  토큰 in ${r.usage.input_tokens} / cacheW ${r.usage.cache_creation_input_tokens ?? 0}` +
        ` / cacheR ${r.usage.cache_read_input_tokens ?? 0} / out ${r.usage.output_tokens}` +
        ` · $${r.cost.toFixed(5)} · ${(r.ms / 1000).toFixed(1)}s`,
    );
  }
}

console.log(`\n${line}\n■ 합계 (표본 ${SAMPLES.length}건)\n${line}`);
const totals = {};
for (const model of MODELS) {
  const rows = results.map((r) => r.byModel[model]).filter((r) => !r.error);
  const sum = rows.reduce((a, r) => a + r.cost, 0);
  const avg = rows.length ? sum / rows.length : 0;
  const avgOut = rows.length ? rows.reduce((a, r) => a + (r.usage.output_tokens ?? 0), 0) / rows.length : 0;
  totals[model] = { avgCost: avg, avgOutputTokens: Math.round(avgOut), samples: rows.length };
  console.log(
    `${PRICING[model].label.padEnd(22)} 호출당 평균 $${avg.toFixed(5)}` +
      ` · 평균 출력 ${Math.round(avgOut)}토큰 · 1,000회당 $${(avg * 1000).toFixed(2)}`,
  );
}
const [a, b] = MODELS;
if (totals[a].avgCost && totals[b].avgCost) {
  console.log(`\n→ ${PRICING[b].label}가 ${(totals[a].avgCost / totals[b].avgCost).toFixed(1)}배 저렴`);
}
console.log(`\n판단 기준: 대안 제목이 실제로 쓸 만한가, JSON 스키마를 지키는가, 점수가 납득되는가.`);
console.log(`교체하려면 Vercel env 에 DIAGNOSE_MODEL=claude-haiku-4-5 추가 (코드 수정 불필요).`);

const outPath = join(here, "diagnose-model-compare.json");
writeFileSync(outPath, JSON.stringify({ totals, results }, null, 2), "utf8");
console.log(`\n상세 결과 저장: ${outPath}`);
