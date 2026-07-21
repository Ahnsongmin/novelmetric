// 홍보 링크 UTM 태그 생성기 — 채널별로 어느 글이 몇 명 데려왔는지 Vercel Analytics에서 구분하기 위함.
//   사용: node scripts/utm.mjs [campaign]
//   예:   node scripts/utm.mjs curiosity-0722
//   결과: 채널(source) × 도착지(destination)별 태그 링크 표를 출력.
//
// 읽는 법: Vercel → novelmetric → Analytics → 하단 "Referrers" 옆 "UTM Parameters" 탭.
//   utm_source(어느 커뮤니티)·utm_campaign(어느 글)별 방문자 수가 갈려서 표시됨.
//
// 규칙:
//   utm_source   = 커뮤니티/채널 (arca, dcinside, munpia, novelpia, gmail …)
//   utm_medium   = 형식 (post=글, comment=댓글, email=메일)
//   utm_campaign = 글 하나를 가리키는 태그. 글마다 새로 지어 서로 비교 (예: curiosity-0722)

const BASE = "https://novelmetric.vercel.app";

// 홍보에서 실제로 링크하는 도착지 2곳
const DESTINATIONS = [
  { key: "insights", path: "/insights", label: "트렌드 리포트(데이터 글이 링크하는 곳)" },
  { key: "home", path: "/", label: "홈 · 무료 제목 진단(전환 핵심)" },
];

// 주로 쓰는 채널 (medium은 기본 post — 댓글에 넣을 땐 medium=comment로 바꿔 쓰기)
const CHANNELS = [
  { source: "arca", medium: "post", label: "아카라이브" },
  { source: "dcinside", medium: "post", label: "디시인사이드" },
  { source: "munpia", medium: "post", label: "문피아 커뮤니티" },
  { source: "novelpia", medium: "post", label: "노벨피아 커뮤니티" },
];

function tag(path, source, medium, campaign) {
  const u = new URL(BASE + path);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", medium);
  u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}

const campaign = process.argv[2] || "trend";

console.log(`\n# UTM 링크 세트 — campaign="${campaign}"\n`);
console.log(`Vercel Analytics → Analytics 하단 "UTM Parameters" 탭에서 source·campaign별 방문자 확인.\n`);

for (const ch of CHANNELS) {
  console.log(`## ${ch.label} (source=${ch.source})`);
  for (const d of DESTINATIONS) {
    console.log(`- ${d.label}\n  ${tag(d.path, ch.source, ch.medium, campaign)}`);
  }
  console.log("");
}

console.log(`팁: 댓글/서명에 넣을 땐 medium을 comment로 → 위 링크의 utm_medium=post를 utm_medium=comment로 바꾸면 됩니다.`);
