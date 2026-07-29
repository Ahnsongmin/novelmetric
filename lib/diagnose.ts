// 제목·소개글 클릭률(후킹) 진단 로직
// - ANTHROPIC_API_KEY 가 있으면 Claude 로 정밀 진단
// - 없으면 휴리스틱 폴백으로 즉시 데모 동작 (무료 Phase 0 검증용)

import Anthropic from "@anthropic-ai/sdk";

/** 진단 모델. env로 교체 가능 — 비용/품질 비교 후 코드 수정 없이 바꾸기 위함. */
const DIAGNOSE_MODEL = process.env.DIAGNOSE_MODEL || "claude-sonnet-4-6";

/** 대안 제목 개수. 출력 토큰이 비용의 대부분이라 여기가 곧 단가다. */
export const TITLE_SUGGESTION_COUNT = 3;

export type DiagnoseInput = {
  title: string;
  synopsis?: string;
  genre?: string;
  platform?: string;
};

export type DiagnoseResult = {
  score: number; // 0-100 클릭률(후킹) 점수
  grade: string; // S/A/B/C/D
  summary: string; // 한 줄 총평
  strengths: string[];
  weaknesses: string[];
  titleSuggestions: { title: string; reason: string }[];
  keywords: string[];
  engine: "claude" | "heuristic";
};

const GENRES = ["로맨스판타지", "현대판타지", "판타지", "무협", "로맨스", "미스터리", "라이트노벨"];

// 웹소설 제목 후킹 요소(인사이더 클리셰/패턴)
const HOOK_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /회귀|리턴|돌아|다시\s?시작/, label: "회귀" },
  { re: /빙의|빙의했|들어왔/, label: "빙의" },
  { re: /환생|다시\s?태어/, label: "환생" },
  { re: /천재|최강|먼치킨|S급|SSS급|랭커|만렙|최고/, label: "먼치킨/최강" },
  { re: /악역|악녀|빌런|흑막/, label: "악역" },
  { re: /계약|결혼|약혼|남편|아내|황제|황녀|공작|재벌/, label: "관계/신분" },
  { re: /\d/, label: "숫자(구체성)" },
  { re: /\[.+\]|【.+】/, label: "대괄호 키워드" },
  { re: /했더니|하게\s?되었|줍줍|키웠|살렸/, label: "사이다/전개암시" },
];

export async function diagnose(input: DiagnoseInput): Promise<DiagnoseResult> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await diagnoseWithClaude(input);
    } catch (e) {
      // 키 문제/네트워크 등 → 폴백으로 끊김 없이 결과 제공
      console.error("[diagnose] Claude 실패, 휴리스틱 폴백:", e);
    }
  }
  return diagnoseHeuristic(input);
}

// ---------- Claude 정밀 진단 ----------

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

async function diagnoseWithClaude(input: DiagnoseInput): Promise<DiagnoseResult> {
  const client = new Anthropic();
  const userContent = `장르: ${input.genre || "미지정"}
플랫폼: ${input.platform || "미지정"}
제목: ${input.title}
소개글: ${input.synopsis || "(없음)"}`;

  const msg = await client.messages.create({
    model: DIAGNOSE_MODEL,
    // 진단 비용의 대부분은 출력 토큰이다(대안 제목+이유가 한국어라 특히 무겁다).
    // 대안 3개 + 짧은 이유로 스키마를 좁혔으므로 900이면 충분하다.
    max_tokens: 900,
    system: [
      { type: "text", text: SYSTEM_RUBRIC, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const json = extractJson(text);
  return {
    score: clamp(Number(json.score) || 0, 0, 100),
    grade: String(json.grade || gradeFromScore(Number(json.score) || 0)),
    summary: String(json.summary || ""),
    strengths: arr(json.strengths),
    weaknesses: arr(json.weaknesses),
    titleSuggestions: Array.isArray(json.titleSuggestions)
      ? json.titleSuggestions
          .slice(0, TITLE_SUGGESTION_COUNT)
          .map((s: { title?: unknown; reason?: unknown }) => ({
            title: String(s.title ?? ""),
            reason: String(s.reason ?? ""),
          }))
      : [],
    keywords: arr(json.keywords),
    engine: "claude",
  };
}

function extractJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("JSON 파싱 실패");
  return JSON.parse(text.slice(start, end + 1));
}

// ---------- 휴리스틱 폴백 ----------

function diagnoseHeuristic(input: DiagnoseInput): DiagnoseResult {
  const title = (input.title || "").trim();
  const syn = (input.synopsis || "").trim();
  const hits = HOOK_PATTERNS.filter((p) => p.re.test(title));
  const len = [...title].length;

  let score = 45;
  score += Math.min(hits.length, 3) * 12; // 후킹 요소
  if (len >= 6 && len <= 22) score += 8; // 적정 길이
  if (len > 30) score -= 12; // 너무 김
  if (len < 4) score -= 10; // 너무 짧음
  if (syn.length >= 20) score += 6; // 소개글 존재
  if (/[?!]/.test(title)) score += 3;
  score = clamp(score, 5, 95);

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (hits.length) strengths.push(`핵심 후킹 요소 포착: ${hits.map((h) => h.label).join(", ")}`);
  else weaknesses.push("회귀/빙의/환생/먼치킨/악역 등 장르 클리셰 신호가 약합니다. 첫 0.5초에 장르가 안 읽혀요.");
  if (len >= 6 && len <= 22) strengths.push("제목 길이가 가독성 좋은 범위입니다.");
  if (len > 30) weaknesses.push("제목이 너무 깁니다(모바일 목록에서 잘림). 22자 내외로 줄이세요.");
  if (syn.length < 20) weaknesses.push("소개글이 너무 짧습니다. 1~2줄로 '상황 + 떡밥'을 던지세요.");
  if (!/\d/.test(title)) weaknesses.push("숫자/구체적 설정(레벨·횟수·신분)을 넣으면 클릭률이 올라갑니다.");

  const base = title || "무제";
  // 문장형 제목("~했다" 등)에 접두·조사 템플릿을 붙이면 문법이 깨지므로 형태별로 거른다
  const isSentence = /[다요까자네]\s*$/.test(base);
  const lastCode = base.charCodeAt(base.length - 1);
  const hasBatchim = lastCode >= 0xac00 && lastCode <= 0xd7a3 && (lastCode - 0xac00) % 28 > 0;
  const titleSuggestions = [
    !isSentence && !base.includes("회귀")
      ? { title: `회귀한 ${base}`, reason: "‘회귀’ 클리셰로 즉시 장르·대리만족 신호 부여" }
      : { title: `3회차, ${base}`, reason: "‘N회차’ 클리셰로 반복 회귀의 기대감 부여" },
    { title: `${base} [SSS급]`, reason: "대괄호 키워드 + 등급으로 먼치킨 기대감 강화" },
    isSentence
      ? { title: `${base}. 이번엔 다르다`, reason: "재시작 뉘앙스로 호기심 갭 형성" }
      : { title: `${base}, 다시 시작합니다`, reason: "재시작 뉘앙스로 호기심 갭 형성" },
    ...(!isSentence
      ? [
          { title: `악역 ${base}의 사정`, reason: "‘악역’ 시점 + 미스터리로 클릭 유도" },
          { title: `${base}${hasBatchim ? "을" : "를"} 주웠다`, reason: "‘줍줍’ 사이다 클리셰로 가벼운 진입장벽" },
        ]
      : []),
  ].slice(0, TITLE_SUGGESTION_COUNT);

  const keywords = dedupe([
    input.genre || "현대판타지",
    ...hits.map((h) => h.label),
    "회귀",
    "먼치킨",
    "사이다",
  ]).slice(0, 8);

  return {
    score,
    grade: gradeFromScore(score),
    summary:
      hits.length >= 2
        ? "후킹 요소는 살아있어요. 구체성만 더하면 상위권 제목입니다."
        : "장르 신호와 구체성을 더하면 클릭률이 크게 오를 여지가 있습니다.",
    strengths: strengths.length ? strengths : ["기본 가독성은 확보되어 있습니다."],
    weaknesses: weaknesses.length ? weaknesses : ["큰 약점은 없지만 차별화 포인트가 부족합니다."],
    titleSuggestions,
    keywords,
    engine: "heuristic",
  };
}

// ---------- helpers ----------

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
function gradeFromScore(s: number) {
  if (s >= 90) return "S";
  if (s >= 80) return "A";
  if (s >= 65) return "B";
  if (s >= 50) return "C";
  return "D";
}
function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}
function dedupe(a: string[]) {
  return [...new Set(a.filter(Boolean))];
}

export { GENRES };
