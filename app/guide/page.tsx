import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "연독률·투베·선작 완전 정리 — 웹소설 작가 지표 가이드",
  description:
    "연독률 계산법, 투데이베스트(투베) 진입 조건, 선작 기준까지. 웹소설 작가가 꼭 알아야 할 성적 지표를 한 번에 정리했습니다.",
  alternates: { canonical: "/guide" },
};

export default function GuidePage() {
  return (
    <main className="mx-auto max-w-3xl flex-1 px-5 py-10">
      {/* 뒤로 가기 링크는 layout.tsx의 SiteNav(전 페이지 공통 네비)로 대체됐다. */}
      <h1 className="text-2xl font-extrabold md:text-3xl">
        웹소설 작가 지표 완전 정리: 연독률·투베·선작
      </h1>
      <p className="mt-2 text-muted">
        “내 작품 잘 되고 있나?”를 판단하는 핵심 지표를 정리했습니다. 개념만 잡고, 실제 계산은
        <a href="/dashboard" className="text-accent underline"> 대시보드</a>에서 자동으로 받아보세요.
      </p>

      <Section title="1. 연독률 (가장 중요한 지표)">
        <p>
          연독률은 독자가 1화부터 최신화까지 얼마나 따라오는지의 비율입니다. 작가들이 작품의
          ‘건강 상태’를 볼 때 가장 먼저 보는 수치예요.
        </p>
        <p className="mt-2">
          <b className="text-foreground">계산법(작가 커뮤니티 통용 방식):</b> 앞 1~3화는 ‘구경 유입’이 빠져나가는
          구간이라 빼고, 갓 올라온 최신 3화도(아직 조회수가 덜 쌓여서) 뺀 뒤,
          <code className="mx-1 rounded bg-card px-1.5 py-0.5">(최신화-3) ÷ 4화 조회수 × 100</code>으로 구합니다.
        </p>
        <p className="mt-2">
          <b className="text-foreground">해석 눈금(커뮤니티 통용, 비공식):</b> 80% 이상이면 상위권, 60%대면 무난,
          50%대는 방어선, 40% 미만이면 위기 신호로 봅니다. 떨어진다면 어느 회차에서 독자가 이탈했는지(꺾이는
          지점)를 보는 게 핵심이에요.
        </p>
        <div className="mt-3 rounded-lg border border-border bg-card/40 p-3 text-foreground">
          <p className="text-xs font-bold text-accent">계산 예시</p>
          <p className="mt-1">
            4화 조회수 <b>60,000</b>, 최신화-3 회차 조회수 <b>36,000</b>이라면 →{" "}
            <code className="rounded bg-background px-1.5 py-0.5">36,000 ÷ 60,000 = 60%</code>. 무난한 편입니다.
          </p>
          <p className="mt-1 text-muted">
            노블메트릭은 회차별 조회수를 자동으로 모아 이 값을 계산하고, 급락한 ‘이탈 회차’까지 짚어줍니다.
          </p>
        </div>
      </Section>

      <Section title="2. 투데이베스트(투베) 진입">
        <p>
          투베에 올라야 노출이 늘고, 노출이 늘면 독자·선작이 늘어 상위권을 유지하는 선순환이 생깁니다.
          그래서 신인 작가들이 “투베 드는 법”을 그렇게 찾는 거예요.
        </p>
        <p className="mt-2">
          작가 통념상 <b className="text-foreground">선작 200 정도</b>가 투베를 노려볼 적기로 알려져 있습니다.
          노블메트릭의 ‘투베 게이지’가 현재 선작이 200에 얼마나 가까운지 보여줍니다.
        </p>
        <div className="mt-3 rounded-lg border border-border bg-card/40 p-3 text-foreground">
          <p className="text-xs font-bold text-accent">투베 진입 체크리스트</p>
          <ul className="mt-1.5 space-y-1 text-sm">
            <li>☐ 선작 200 이상 모였는가</li>
            <li>☐ 연독률 60% 이상으로 유지되는가</li>
            <li>☐ 매일 같은 시간 꾸준히 연재(연참)하는가</li>
            <li>☐ 제목·소개가 클릭을 유도하는가 (유입이 받쳐주는가)</li>
            <li>☐ 초반 회차(특히 1~5화)의 이탈이 크지 않은가</li>
          </ul>
        </div>
      </Section>

      <Section title="3. 선작(선호작) · 조회수 · 추천">
        <p>
          선작은 독자가 ‘이 작품 계속 볼게’라고 누른 별표예요. 연독·구매 전환과 직결돼 가장 의미 있는 지표 중
          하나입니다. 조회수는 유입 규모, 추천은 반응 강도를 봅니다. 절대값보다 <b className="text-foreground">매일의 증감</b>이
          중요해요.
        </p>
      </Section>

      <Section title="4. 제목 (클릭이 없으면 위 지표도 없다)">
        <p>
          독자는 제목과 표지만으로 0.5초 안에 클릭을 결정합니다. 남성향은 특히 10자 안팎으로 장르·주인공 스펙·
          클리셰(회귀/빙의/먼치킨 등)가 바로 읽혀야 하고, 문장형이면 ‘~함/~임/~했다’ 같은 명사형 종결로 가볍게
          어그로를 끄는 게 정석입니다.
        </p>
      </Section>

      <div className="mt-10 rounded-2xl border border-border bg-card/40 p-6 text-center">
        <p className="font-bold">개념은 알았으니, 내 작품 숫자로 확인하세요</p>
        <p className="mt-1 text-sm text-muted">작품 ID만 넣으면 연독률·투베 게이지·경쟁 비교가 자동으로.</p>
        <a
          href="/dashboard"
          className="mt-4 inline-block rounded-lg bg-gradient-to-r from-accent to-accent-2 px-6 py-2.5 font-bold text-background"
        >
          내 작품 분석하기 →
        </a>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}
