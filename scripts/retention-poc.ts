// 연독률 PoC:  npx tsx scripts/retention-poc.ts [novelId]
import { fetchEpisodes, computeRetention, fetchNovel } from "../lib/munpia";

async function main() {
  const id = Number(process.argv[2] || 555698);
  const [novel, eps] = await Promise.all([fetchNovel(id), fetchEpisodes(id)]);
  const r = computeRetention(eps);
  console.log(`작품: ${novel.title} (id=${id})`);
  console.log(`수집 회차: ${eps.length} / 메타 연재수: ${novel.episodes}`);
  console.log(`1화 조회수: ${r.firstViews?.toLocaleString()} → 최신화: ${r.latestViews?.toLocaleString()}`);
  console.log(`누적 연독률(최신/1화): ${r.cumulativeRate}%`);
  console.log(`보정 연독률((최신-3)/4화): ${r.adjustedRate}%  → 등급: ${r.grade}`);
  console.log("\n회차별 조회수(앞5/뒤5):");
  const show = [...eps.slice(0, 5), ...eps.slice(-5)];
  for (const e of show) console.log(`  ${String(e.no).padStart(2)}화 ${e.date}  ${e.views?.toLocaleString().padStart(9)}  ${e.title.slice(0, 20)}`);
}
main().catch((e) => { console.error("실패:", e); process.exit(1); });
