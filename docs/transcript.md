# Decision log

按时间记产品决定。现行规格以 `docs/requirements.md` 为准。

## 2026-11-05 — Sync: Drive cancelled, GitHub gist instead

Chris (owner) stopped the Google Drive / Google Cloud OAuth direction. Phone progress must not depend on a Google account.

Replacement at the time:

- A secret gist holds `english-coach-state.json` in the existing `ec_state_v4` shape.
- The H5 settings panel takes a GitHub personal access token (classic scope `gist`, or a fine-grained token with gist access) and an optional gist id.
- The token and gist id live in localStorage `ec_sync_v1` on that device only.
- Opening the app merges the gist into local state. Later changes PATCH the gist. Failures stay on a small status line (同步失败 / 已同步) and do not block practice.
- With nothing configured, behavior stays localStorage-only.

Drive folder code, Google Identity Services, and any OAuth client id are out of the product. Gist daily sync was later cancelled (see below).

## 2026-11-05 — Gist sync stopped; LeanCloud China instead

`api.github.com` fails on Chris’s phone in China without a VPN. He will not use a VPN for daily practice, so gist sync is not the path.

Replacement at the time: LeanCloud 华北. That path is superseded by the CloudBase decision below. The H5 stayed on GitHub Pages.

## 2026-11-05 — LeanCloud replaced by Tencent CloudBase

Chris chose 云开发 so sync stays inside mainland China without a VPN. LeanCloud fields and API calls are removed.

- One document in collection `ec_state`, field `state` = `ec_state_v4`.
- Auth is a Publishable Key sent as `Authorization: Bearer`, matching CloudBase Web SDK v3 `accessKey`. Anonymous login is not required and is left off. The secret API Key never goes in the client.
- Browser calls need security domain `cczz23.github.io`. The collection uses a custom rule `{ "read": true, "write": true }` so every phone with the same key shares one record. 仅创建者可读写 would split devices.
- Settings store env id, Publishable Key, and doc id in `ec_tcb_v1`. 创建或绑定 creates the document or upserts an existing id. Merge rules are unchanged. Unset settings stay local-only.

## 2026-11-05 — Examples max is 5

Stage B (and any other example list) is capped at 5 sentences instead of an implicit 3. Stage A stays a single short example. At the time, most entries still had 3 stage-B lines.

## 2026-11-05 — Every word now has 5 Stage B scenes

Chris asked for five quality scenes on every word, not a slice over a short list. All 126 entries gained lines: 121 went from 3 to 5, and 5 (circle back, take it offline, push back, ballpark, runway) went from 4 to 5. That is 247 new sentences. Stage A is still one short line. Each new line is a different scene in the word's track, with the target inside `[[highlight]]`, not a rephrase of a line already on the card.

## 2026-11-05 — 易混对比 (near-synonym contrast)

Chris wants advanced words like *prudent* / *meticulous* / *pragmatic* to say how they differ from each other and especially from everyday words. Concrete example: *pragmatic* vs *practical* both feel like「务实」, but they are not interchangeable.

Decision (this PR):

- Optional `contrast: [{ vs, note_zh }]` on `words.json`. `vs` can be in-lexicon or a basic word that is not (practical, careful, wise).
- Stage B compact block「易混对比」after 释义, before examples; hidden when empty. No new marks. `EX_MAX` stays 5. Sync/state unchanged.
- Prefer advanced vs everyday near-synonyms over abstract-only pairs. 1–3 notes, 宁缺毋滥. Complementary notes when both sides are in the lexicon, not forced symmetry.

## 2026-11-05 — 新词 / 复习混排滑条（已决定，待实现）

Chris decided to add a slider for mix probability between **新词** (unseen / unmarked) and **复习** (weak + reinforce). Today the header is binary 全部 vs 复习.

Not in this PR. When implemented: one mobile slider, persist the mix on `ec_state_v4` so CloudBase can sync it. Likely applies to 全部; 复习 stays weak/reinforce-only. Confirm that split with Chris at implementation time. `dropped` still stays out of the review pool. No new mark buttons.

## 2026-11-05 — 间隔回访 / SRS（候选，不要实现）

Discussed. Chris is still thinking. **Do not implement** until he commits.

Candidate sketch only:

- `weak` 回访约 1 天
- `reinforce` 约 3–7 天
- `dropped` 很长，或只出现在全部、不进复习
- 可选：当天少抽同一词；特别需要 `needed` 缩短间隔

Current queue stays weight-random with no calendar due dates.
