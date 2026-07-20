// 제목 '궁금증(호기심 갭)' 지수 — 제목이 독자 머릿속에 "왜? 뭐지?" 질문을 만드는 정도(0~100).
//   후킹 클리셰(회귀/먼치킨 등 표면 키워드)와는 다른 축이다. 예) "주인공이 1층에서 안 올라감"은
//   클리셰 키워드가 없어도 궁금증은 최고다 — regex로는 못 잡는, 의미 판단이 필요한 지표.
// - ANTHROPIC_API_KEY 가 있으면 Claude 로 배치 채점(하루 ~100제목 = 1회 호출로 미미한 비용)
// - 없으면 휴리스틱 폴백(부정/역설·의문 마커)으로 무료 동작 → 키 없이도 앱이 죽지 않는다.

import Anthropic from "@anthropic-ai/sdk";
import { HOOKS } from "./analyze";

export type CuriosityResult = { scores: number[]; engine: "claude" | "heuristic" };

/** 제목 배열을 입력 순서 그대로 0~100 궁금증 점수 배열로 반환. */
export async function scoreCuriosity(titles: string[]): Promise<CuriosityResult> {
  if (!titles.length) return { scores: [], engine: "heuristic" };
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const scores = await scoreWithClaude(titles);
      return { scores, engine: "claude" };
    } catch (e) {
      console.error("[curiosity] Claude 실패, 휴리스틱 폴백:", e);
    }
  }
  return { scores: titles.map(heuristicScore), engine: "heuristic" };
}

// ---------- Claude 배치 채점 ----------

const SYSTEM_RUBRIC = `당신은 한국 웹소설 제목이 독자에게 '궁금증(호기심 갭)'을 얼마나 만드는지 평가하는 편집자다.
궁금증 지수는 후킹 클리셰(회귀/빙의/먼치킨 같은 표면 키워드)와 별개의 축이다.
핵심 질문: "이 제목을 목록에서 보면 독자 머릿속에 '왜? 뭐지? 어떻게?'라는 질문이 떠올라 1화를 눌러보고 싶어지는가?"

높게 주는 경우(80+): 제목이 결말이 아니라 '상황' 하나를 구체적으로 던져 자연스러운 의문을 만든다.
  예) "주인공이 1층에서 안 올라감"(왜 안 올라가지?), "퇴근 후 소소하게 힐링함"(무슨 내용이지?)
낮게 주는 경우(40-): 장르·클리셰만 나열해 내용이 다 예상돼 궁금할 게 없다.
  예) "SSS급 회귀 천재의 먼치킨 라이프" (뻔해서 질문이 안 생김)
주의: 클리셰 키워드 유무로 점수를 매기지 마라. 클리셰가 있어도 의문을 만들면 높고, 없어도 뻔하면 낮다.

입력은 번호가 붙은 제목 목록이다. 각 제목에 0~100 정수 점수를 매겨,
반드시 아래 JSON 형식으로만 답하라(다른 텍스트 금지). 입력과 같은 개수, 같은 순서:
{"scores":[<제목1 점수>,<제목2 점수>, ...]}`;

async function scoreWithClaude(titles: string[]): Promise<number[]> {
  const client = new Anthropic();
  const list = titles.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: [{ type: "text", text: SYSTEM_RUBRIC, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `제목 목록(${titles.length}개):\n${list}` }],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("JSON 파싱 실패");
  const json = JSON.parse(text.slice(start, end + 1)) as { scores?: unknown };
  const raw = Array.isArray(json.scores) ? json.scores : [];
  if (raw.length !== titles.length) {
    throw new Error(`점수 개수 불일치: 기대 ${titles.length}, 수신 ${raw.length}`);
  }
  // 개별 점수가 깨진 경우만 휴리스틱으로 메워 전체 배치가 버려지지 않게 한다
  return titles.map((t, i) => {
    const n = Number(raw[i]);
    return Number.isFinite(n) ? clamp(n) : heuristicScore(t);
  });
}

// ---------- 휴리스틱 폴백 ----------
// 의미 판단은 못 하지만, "질문을 유발하는 표면 신호"를 근사한다. Claude 없을 때만 쓰인다.

function heuristicScore(title: string): number {
  const t = (title || "").trim();
  if (!t) return 0;
  let score = 45;
  if (/[?？]|\b왜\b|어떻게|무슨|뭐지|뭘로|누가|언제/.test(t)) score += 25; // 명시적 의문
  if (/안\s|못\s|없[다는음]|말고|대신|안올라|않/.test(t)) score += 15; // 부정·역설(기대와 어긋남)
  if (!HOOKS.some((h) => h.re.test(t))) score += 12; // 뻔한 클리셰가 없으면 예측이 덜 됨 → 궁금증 여지
  if ([...t].length <= 8) score -= 8; // 너무 짧으면 던질 상황 자체가 부족
  return clamp(score);
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
