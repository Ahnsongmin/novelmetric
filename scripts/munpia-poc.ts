// 문피아 수집 PoC 실행기
//   npx tsx scripts/munpia-poc.ts
// 1) 오늘 무료 베스트 랭킹 수집 → 표 출력
// 2) 1위 작품의 개별 페이지 지표 수집 → 출력
import { fetchBest, fetchNovel } from "../lib/munpia";

function fmt(n: number | null) {
  return n === null ? "-" : n.toLocaleString("ko-KR");
}

async function main() {
  console.log("⏳ 문피아 오늘 무료 베스트 수집 중…\n");
  const best = await fetchBest("today");
  console.log(`✅ ${best.length}개 작품 수집\n`);

  console.log("순위 | 제목 | 장르 | 작가 | 화수 | 조회수 | 추천수 | ID");
  console.log("-".repeat(90));
  for (const it of best.slice(0, 10)) {
    console.log(
      `${String(it.rank).padStart(2)} | ${it.title.slice(0, 22).padEnd(22)} | ${it.genre.padEnd(7)} | ${it.author.slice(0, 8).padEnd(8)} | ${fmt(it.episodes).padStart(4)} | ${fmt(it.views).padStart(10)} | ${fmt(it.recommends).padStart(8)} | ${it.novelId}`
    );
  }

  const target = best.find((b) => b.novelId);
  if (target?.novelId) {
    console.log(`\n⏳ 개별 작품 지표 수집: [${target.title}] (id=${target.novelId})\n`);
    const s = await fetchNovel(target.novelId);
    console.log(JSON.stringify(s, null, 2));
  }
}

main().catch((e) => {
  console.error("❌ 실패:", e);
  process.exit(1);
});
