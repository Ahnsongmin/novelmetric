# 홍보 링크 UTM — 어느 글이 몇 명 데려왔는지 측정

홍보 글에 그냥 `https://novelmetric.vercel.app`를 붙이면 Vercel Analytics에서 전부 "직접 유입"으로 뭉뚱그려져 **어느 커뮤니티·어느 글이 효과 있었는지 구분이 안 된다.** 아래 태그(UTM) 링크를 쓰면 갈린다.

## 읽는 법
Vercel → novelmetric → **Analytics** → 하단 "Referrers" 옆 **"UTM Parameters"** 탭.
`utm_source`(어느 커뮤니티) · `utm_campaign`(어느 글)별 방문자 수가 표시됨.

## 규칙
- `utm_source` = 커뮤니티 (arca / dcinside / munpia / novelpia …)
- `utm_medium` = 형식 (post=글, comment=댓글, email=메일)
- `utm_campaign` = **글 하나를 가리키는 태그. 글마다 새로 지어 비교** (예: `curiosity-0722`)

## 새 링크 뽑기
```
node scripts/utm.mjs <캠페인이름>
```
예: `node scripts/utm.mjs curiosity-0722` → 채널×도착지별 태그 링크 표 출력.

## 바로 쓸 세트 (campaign=curiosity-0722 — 다음 궁금증/질문형 제목 글용)

| 채널 | 도착지 | 링크 |
|---|---|---|
| 아카 | 트렌드 리포트 | `https://novelmetric.vercel.app/insights?utm_source=arca&utm_medium=post&utm_campaign=curiosity-0722` |
| 아카 | 홈(제목 진단) | `https://novelmetric.vercel.app/?utm_source=arca&utm_medium=post&utm_campaign=curiosity-0722` |
| 디시 | 트렌드 리포트 | `https://novelmetric.vercel.app/insights?utm_source=dcinside&utm_medium=post&utm_campaign=curiosity-0722` |
| 디시 | 홈(제목 진단) | `https://novelmetric.vercel.app/?utm_source=dcinside&utm_medium=post&utm_campaign=curiosity-0722` |
| 문피아 | 트렌드 리포트 | `https://novelmetric.vercel.app/insights?utm_source=munpia&utm_medium=post&utm_campaign=curiosity-0722` |
| 문피아 | 홈(제목 진단) | `https://novelmetric.vercel.app/?utm_source=munpia&utm_medium=post&utm_campaign=curiosity-0722` |
| 노벨피아 | 트렌드 리포트 | `https://novelmetric.vercel.app/insights?utm_source=novelpia&utm_medium=post&utm_campaign=curiosity-0722` |
| 노벨피아 | 홈(제목 진단) | `https://novelmetric.vercel.app/?utm_source=novelpia&utm_medium=post&utm_campaign=curiosity-0722` |

> 댓글/서명에 넣을 땐 `utm_medium=post` → `utm_medium=comment`로 바꿔 쓰기.
> 다음 글은 새 campaign(예: `title-0730`)으로 뽑아야 이전 글과 안 섞인다.
