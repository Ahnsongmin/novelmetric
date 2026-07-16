// 주간 리포트 생성 PoC:  npx tsx scripts/weekly-poc.ts
import { buildWeeklyReport } from "../lib/weekly";

const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString();
const snaps = [
  { episodes: 40, views: 52000, recommends: 900, chars: null, favorites: 150, collected_at: day(7) },
  { episodes: 42, views: 58000, recommends: 990, chars: null, favorites: 172, collected_at: day(5) },
  { episodes: 44, views: 66500, recommends: 1120, chars: null, favorites: 189, collected_at: day(3) },
  { episodes: 46, views: 74100, recommends: 1230, chars: null, favorites: 214, collected_at: day(1) },
];

const r = buildWeeklyReport({ title: "회귀한 천재 헌터의 아카데미 생활", platform: "munpia", snaps, retention: null });
if (!r) throw new Error("리포트 생성 실패");
console.log("제목:", r.subject);
console.log("---");
console.log(r.body);
