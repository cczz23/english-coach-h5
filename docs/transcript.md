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
- Daily site is CloudBase static hosting on the pgdoc env: `https://regional-newt-d8ghvyg140f22c055-1404967840.tcloudbaseapp.com`. github.io CORS is blocked on the free tier, so Pages is not the sync origin.
- Browser calls need that static-hosting domain in 安全来源. Collection ACL is currently 读取全部数据，修改本人数据; a shared Publishable Key (anon off) may still be enough for every phone with the same key. 仅创建者可读写 would split devices. Do not retune ACL in this change.
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

## 2026-11-05 — 混排滑条 + 生疏列表（本批实现）

Chris asked to ship the decided mix slider now, and also a list of words he is not solid on (scan without sliding cards).

Decisions:

- Replace the 全部 / 复习 segmented control with one mobile slider: **新词** left (`mix=0`) ↔ **复习** right (`mix=1`). End labels snap to the ends so one-tap 复习 still exists. Middle is `P(review)=mix`.
- **新词** = `status` empty / unmarked (same unseen pool as before). **复习** = `weak` + `reinforce` (same pool as old 复习 mode). `dropped` stays out. Ends do not fall back; middle falls back if the chosen pool is empty.
- Persist `mix` on `ec_state_v4` (CloudBase sync / EJSON unwrap unchanged). `mode` is derived (`mix>=1` → `review`) so old mode logs still merge. Default `0.5`; old `mode=review` without mix → `1`.
- Card-based 复习 stays (slider at 复习, including the empty-review screen). Do not add mark buttons or SRS.
- New **生疏列表** button opens a sheet grouped 还不熟 then 再巩固, term + `gloss_zh`, ★ for 特别需要. Empty state when none. Tap a row opens that word’s Stage A card. Close without changing marks.

## 2026-11-05 — 间隔回访 / SRS（候选，不要实现）

Discussed. Chris is still thinking. **Do not implement** until he commits.

Candidate sketch only:

- `weak` 回访约 1 天
- `reinforce` 约 3–7 天
- `dropped` 很长，或只出现在全部、不进复习
- 可选：当天少抽同一词；特别需要 `needed` 缩短间隔

Current queue stays weight-random with no calendar due dates.

## 2026-11-05 — CloudBase static hosting + Extended JSON unwrap

pgdoc env. Daily URL is CloudBase static hosting
https://regional-newt-d8ghvyg140f22c055-1404967840.tcloudbaseapp.com
because github.io CORS is blocked on the free tier.

CloudBase document GET returns Strict EJSON (`"v": {"$numberInt": "4"}`, `"seen": {"$numberInt": "1"}`, `"updated": {"$numberLong": "..."}`). `isV4` required `parsed.v === 4`, so `readDocState` returned null, pull skipped the merge, and each device kept its own localStorage while push still showed 已同步. Unwrap `$numberInt` / `$numberLong` / `$numberDouble` before `isV4` / `normalizeState` / merge.

Collection ACL stays 读取全部数据，修改本人数据. Shared Publishable Key + this ACL may still be OK for same-key clients; this change does not retune ACL.

## 2026-11-06 — 用法标签：说 / 读写

Chris practices as an investor: meetings, negotiation, phone, plus reading. Two labels only. Do not add a third. Do not delete words. The tag guides what to practice out loud and how to add words later.

- `usage: "speak"` → badge **说**. He would willingly say it in a meeting, a negotiation, on the phone, or in casual talk. It should sound natural, not like an essay. If he would say it out loud, tag 说 even when it also shows up in writing. Examples: pragmatic, circle back, heads-up, traction, plausible. Business phrases and high-frequency meeting words are 说. If a business term is one he would use in an IC or VC meeting and the call is close, prefer 说.
- `usage: "rw"` → badge **读写**. Mainly for email, memos, reports, news, or for understanding someone else's formal speech. He needs to recognize it, and he would normally say a simpler word instead. Examples: tenuous, precarious, elusive, ubiquitous, exacerbate. Formal advanced adjectives and abstract verbs that feel essay-like go here.
- `sayInstead`: string array, **rw only**, 1–2 spoken alternatives he would actually say (English lemmas or short phrases). precarious → unstable / shaky; tenuous → weak / thin. Omit the field on 说 words (or leave it empty).
- `contrast` / 易混对比 stays. Usage is a separate field and a separate line on the card.
- UI: Stage A and Stage B show the badge next to the track chip. On Stage B, when usage is rw and `sayInstead` is non-empty, show one compact line under the gloss: 「想说时用：unstable / shaky」. 生疏列表 shows the same badge on each row. No new filter in this change. A later 「先练说」 filter (speak only) can sit on top of this field. Queue, marks, `EX_MAX`, and sync stay as they are.

## 2026-11-06 — Lexicon batch from progress gaps

Chris said the previous 126-word batch is finished. Same-day CloudBase snapshot (about 2026-11-06 20:32 Asia/Shanghai): 118 items with a record, weak 19, reinforce 31, dropped 64, needed 44. The weak set is mostly formal adjectives and verbs he is not activating (salient, prudent, plausible, coherent, exacerbate, hinder, circumvent, and similar), plus a few business speak items (traction, lowball, off the top of my head). Reinforce clusters around meeting language he does want (take it offline, contingent on, nuanced, pragmatic, premise, discrepancy).

Decision: do not re-add any existing term. Add 50 adjacent new entries, ids `w263`–`w312`, stable thereafter. No SRS. `EX_MAX` stays 5. Each new entry has one Stage A line and five distinct Stage B scenes.

| track / usage | count | why these |
| --- | --- | --- |
| business / speak | 24 | IC, diligence, negotiation, and running a meeting: upside, downside, conviction, thesis, red flag, non-starter, dig into, flag, bottleneck, ownership, sync up, net-net, park that, get up to speed, unit economics, go-to-market, dry powder, follow-on, pro rata, underwrite, path to profitability, optionality, soft commit, liquidation preference. Unsure IC/VC terms were tagged speak. |
| advanced / speak | 18 | Mid-advanced words he can say in a discussion: material, incremental, nascent, differentiated, sticky, durable, secular, anecdotal, substantive, tentative, skeptical, concise, deliberate, fragmented, saturated, commoditized, catalyst, overhang. Confusable ones carry `contrast` against a basic near-synonym (important, new, different, short, careful, and so on). |
| advanced / rw | 8 | Formal memo, contract, and speech recognition, each with 1–2 `sayInstead` lines: idiosyncratic, pertinent, preclude, consequential, unequivocal, protracted, notwithstanding, bolster. |

Lexicon after this batch: 176 words. Tracks: business 76, advanced 88, life 12. Usage: speak 140, rw 36. Old ids, sentences, and usage tags were left as they were. Business entries use `domain: business`; advanced entries use `domain: both`.

Consciously skipped as near-duplicates of words already in the file, or of a term kept in this batch: hard commit (soft commit only, with a contrast against a firm yes), DRI (ownership covers who drives it), timebox, call out (too close to flag), unblock (too close to bottleneck), momentum (near traction / trajectory), defensibility (near moat), alignment (align is already there), data room (a slice of due diligence), capacity (near bandwidth), deep dive (near dig into), marginal / materially (same size band as material and incremental). No new slang and no new life entries. Upside and downside were both kept: they are opposites, not two ways to say the same thing. red flag (noun) and flag (verb) were both kept on purpose.

## 2026-11-08 — Lexicon batch 3: more advanced words he can say

Chris said the batch through `w312` is finished. Do not re-add existing terms, including the older weak set (traction, salient, prudent, plausible, and the rest). The mix shifts on purpose: more advanced-but-speakable words, in the vein of material, sticky, durable, conviction, soft commit, tentative, skeptical, concise. Fewer formal rw-only words. The previous batch had 8 advanced/rw entries; this one stops at 5. If an IC or VC term is a close call, tag it speak. No new slang. No new life entries. No SRS. `EX_MAX` stays 5. Old ids, sentences, and usage tags stay as they were.

Each new entry has one Stage A line and five distinct Stage B scenes. Ids `w313`–`w362`. Business entries use `domain: business`. Advanced entries use `domain: both`. Every rw entry has 1–2 `sayInstead` lines. Confusable advanced words, and deal terms that collapse into a word already in the file, carry `contrast`.

| track / usage | count | why these |
| --- | --- | --- |
| business / speak | 21 | Scenarios, price, and the model, said out loud: base case, bull case, bear case, pre-money, post-money, step-up, write-down, lock-up, liquidity, concentration risk, gross margin, contribution margin, payback, take rate, pro forma, working assumption, lean in, carve-out, bake in, scrub, sanity-check. Contrasts where they collide with upside / downside, margin, or assumption. |
| advanced / speak | 24 | Judgment and go-to-market language he can volunteer in the room: decisive, assertive, measured, blunt, directional, preliminary, qualitative, quantitative, structural, cyclical, disciplined, selective, defensive, opportunistic, single-threaded, wedge, beachhead, land-and-expand, flywheel, network effect, switching cost, compounding, second-order, devil's advocate. cyclical is set against secular, which was already in the file. blunt is set against candid. |
| advanced / rw | 5 | Recognize in a memo, a contract, or a write-up, and say something simpler: immaterial, nominal, onerous, specious, perfunctory. |

Lexicon after this batch: 226 words. Tracks: business 97, advanced 117, life 12. Usage: speak 185, rw 41.

Consciously skipped: upside case / downside case (too close to upside and downside; the scenario set is base / bull / bear), frank (already the neighbor on the candid card), indicative (directional is the one he would say: "treat it as directional"), provisional (near tentative / preliminary), actionable (generic), aggressive as an investing adjective (easy to hear as rude; defensive, opportunistic, and assertive split the posture), steelman / strawman (devil's advocate is the line he would actually use), first-principles (a slogan), illustrative (near anecdotal), attach rate / mix shift / price realization (gross margin, contribution margin, payback, and take rate already carry this batch's metrics), workstream (near ownership), multi-threaded (the opposite is taught from single-threaded), locked-in / captive (switching cost is the spoken line), accretive (easy to leave "accretive to what" unspecified), albeit / pursuant (connectives and legal boilerplate; the five rw slots went to immaterial, nominal, onerous, specious, perfunctory). Skips from the 2026-11-06 batch still stand: hard commit, momentum, defensibility, deep dive, call out, alignment. No hosting deploy with this batch.

## 2026-11-11 — 沉睡清单（本批实现）

Chris wants a second list, longer than 生疏列表. 生疏列表 stays the daily pool: current `weak` (还不熟) and `reinforce` (再巩固). 沉睡清单 is words he once struggled with, later marked 已放掉, and might still not have mastered. He opens it occasionally. It must not be mixed into the new/review slider. No SRS, no new interval fields, no new persisted status.

A word is on the list only when both are true:

1. Current `items[id].status` is `dropped` (先放掉 / 跳过, including `skip_drop`).
2. `log` has at least one entry for that id whose `action` is `weak` or `reinforce`.

First-sight drops stay off, even when `needed` is true or `seen` ≥ 2. Checked against the 2026-11-11 08:50 Asia/Shanghai CloudBase snapshot: the list is exactly secular (w293, reinforce twice then drop, needed), directional (w338), tenuous (w208), and inherent (w209, needed). unprecedented and advocate are needed drops with no weak/reinforce in the log, so they stay off. The snapshot is not committed and is not shipped in the page.

Membership is derived from the existing `ec_state_v4` log and items. CloudBase still merges that document as today (larger `seen`, newer per-word record, union of log, local undo kept). No schema change.

Marking 再巩固 or 还不熟 leaves the sleeping list and returns the word to 生疏列表 / the review pool. Marking 先放掉 again, or skipping on Stage A, leaves it on the sleeping list because status is still `dropped` and the earlier weak/reinforce log row is still there. 恢复上一个 is unchanged. Undoing a mark from this list restores the previous status; if that status is `dropped` and the log still has weak/reinforce, the word is back on 沉睡清单. ★特别需要, 说 / 读写, and 想说时用 stay on the card.

UI: a text link 「沉睡清单」 under the header row, quieter than the 生疏列表 button. The sheet title is 沉睡清单, with the hint 「看过多次后再放掉的词，偶尔拿出来复习。」 Rows match the short-term list: term, usage badge, gloss, ★ when needed. Empty copy: 「还没有看过多次后再放掉的词。」 Tap a row to open Stage A, same as 生疏列表. `dropped` weight stays 0, so the slider never deals these cards.

## 2026-11-11 — Lexicon batch 4: judgment, stance, and cause-effect

Chris had seen all 226 words. CloudBase record from 2026-11-11 09:29 Asia/Shanghai: 226/226 seen. Instant first-sight drops: 133. At that moment, weak 17, reinforce 72.

The instant-pass cluster is textbook VC / finance / SaaS jargon and common meeting words (contribution margin, gross margin, pre-money / post-money, unit economics, dry powder, flywheel, network effect, GTM, bull / bear / base case, and the like). Batch 3 had 32 of 50 instant passes, mostly of this type. He asked to stop pushing these.

The struggle cluster is precise judgment, stance, and cause-effect adjectives and verbs he can use in a meeting: specious, blunt, measured, exacerbate, circumvent, qualify-like language, plus a few metaphors (wedge).

Decision: do not re-add any existing term. Add 50 new entries, ids `w363`–`w412`, all `track: advanced`, `domain: both`. 45 speak, 5 rw. No slang. No new life entries. No SRS. `EX_MAX` stays 5. No slider, state-machine, or UI change. Old ids, sentences, and usage tags stay as they were. Example scenes are discussion, meetings, memos, and judgment calls, not term sheets or metric tutorials.

Each new entry has one Stage A line and five distinct Stage B scenes. Every entry has `contrast` against a near-synonym and a basic word. Every rw entry has 1–2 `sayInstead` lines.

| track / usage | count | why these |
| --- | --- | --- |
| advanced / speak | 45 | Judgment and discussion he can say out loud. Stance and degree: warranted, unwarranted, overstated, understated, premature, overdue, qualified, emphatic, pointed, diplomatic, noncommittal, far-fetched, telling, muted, irreversible, instrumental, rigorous, airtight, reluctant, granular. Cause and next step: qualify, walk back, reframe, erode, derail, stall, backfire, outweigh, undercut, constrain, surface, tee up, pin down, overreach, distill. Nouns for the discussion: crux, friction, inertia, leeway, tension, mismatch, impasse, straw man, blind spot, red herring. |
| advanced / rw | 5 | Recognize in a mail or memo, and say something simpler: ostensibly, unsubstantiated, cursory, commensurate, corollary. |

`qualified` means a yes with a reservation (有保留的). `qualify` means to narrow a statement (给说法加上限定). Neither means 有资格 / qualify for a role. `red herring` is set against `red flag`: a red flag is a danger signal; a red herring pulls attention onto a false trail.

`important_suggest` is true only for the speak words that are especially useful as judgment verbs or adjectives, plus crux, inertia, impasse, straw man, and red herring. False on the easier speak items (premature, overdue, diplomatic, instrumental, reluctant, stall, outweigh, friction, leeway, tension, mismatch, blind spot) and on all five rw entries.

Lexicon after this batch: 276 words. Tracks: business 97, advanced 167, life 12. Usage: speak 230, rw 46.

Consciously left out: more finance and term-sheet jargon, and any repeat of the metric words he already passes on sight. No hosting deploy with this batch.

## 2026-11-14 — Lexicon batch 5: presentation and Q&A spoken transitions

Chris approved a new expansion type: presentation and Q&A spoken transitions (商务演示和问答里的口语衔接). He wants chunks like “this brings us to…” so he can move through a deck without “number one, number two, number three.” This sits alongside the existing tracks (business practical, advanced general) and the newer 「力度和节奏」 preference. These cards are speak-first discourse chunks, not single advanced adjectives.

Decision: do not re-add any existing term. Add 14 new entries, ids `w413`–`w426`, all `track: business`, `domain: business`, `usage: speak`. No `sayInstead`. `important_suggest` is true on all of them. No slang. No new life entries. No SRS. `EX_MAX` stays 5. No slider, state-machine, sync, or UI change. Old ids, sentences, and usage tags stay as they were. Example scenes are a business presentation, a board or IC update, a client meeting, and Q&A. Spoken, not essay-like, and not loaded with the finance and VC jargon he already passes on sight.

Each new entry has one Stage A line and five distinct Stage B scenes. Confusable chunks carry `contrast`.

| id | term | why |
| --- | --- | --- |
| w413 | this brings us to | Hand the room to the next point without calling a number. Contrasted with next and with “number five.” |
| w414 | before we move on | Close the current point in one line before continuing. |
| w415 | the short answer is | In Q&A, give the conclusion first, then the detail. |
| w416 | that's a fair question | Take the question instead of dodging it. Contrasted with that's a fair point, already in the file. |
| w417 | let me take that one | Claim a question yourself. |
| w418 | I'll come back to that | Note it and return later in the same presentation or Q&A. Contrasted with circle back (follow up after the meeting or later) and park that (set the topic aside). |
| w419 | what I'm trying to get at is | Fold what you just said into one point. Contrasted with what I'm hearing is. |
| w420 | to put it simply | Say the complicated part again, plainly. in plain terms is a contrast only, not its own card. Also set against distill. |
| w421 | the upshot is | What this stretch actually means. Contrasted with net-net and with bottom line. Not a finance-term card. |
| w422 | that said | Grant the previous point, then turn. |
| w423 | unless I'm missing something | A polite check or reservation. |
| w424 | happy to go deeper if useful | Ask whether to expand. |
| w425 | let me rephrase that | The last line was unclear; say it another way. Contrasted with reframe and walk back. |
| w426 | does that answer your question? | Close the answer and check whether it landed. |

Consciously skipped: “let me just flag…”. The lexicon already has w270 flag (“标出来提醒（通常要人接）”) and w267 red flag. Do not add a near-duplicate.

Lexicon after this batch: 290 words. Tracks: business 111, advanced 167, life 12. Usage: speak 244, rw 46. No hosting deploy with this batch.
