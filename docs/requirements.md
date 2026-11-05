# English Coach requirements

Static H5 vocab coach. No build step. Hosted from the repo root on GitHub Pages: https://cczz23.github.io/english-coach-h5/

## Learning state

- Browser key: `ec_state_v4` (migrates forward from `ec_state_v3`, `ec_state_v2`, `ec_state_v1`).
- Per word: `status` (`dropped` / `reinforce` / `weak` / null), `seen`, `needed`, optional `updated` and `important`.
- `mode` is `all` or `review`. 复习 queues only weak and reinforce.
- 特别需要 sets `needed`. 恢复上一个 pops the local undo stack (max 5).

## Examples

- Stage A shows one short example (`examples_stage_a`).
- Stage B shows more examples, capped at **5** (`examples_stage_b` sliced at 5). Words with fewer than 5 stay as written; do not pad with duplicates.
- The lexicon is not expanded in this change. Most entries still have 3 stage-B lines; a few have 4. The UI will show a 5th when the data has one.

## Sync

Google Drive and Google OAuth are cancelled. GitHub gist sync is also cancelled for daily use: `api.github.com` does not load on a phone in China without a VPN.

Backup is **LeanCloud China** (华北 / cn-n1). GitHub Pages still hosts the site.

- Class `ECState`, one object. Field `state` is the `ec_state_v4` object.
- Credentials live only in localStorage `ec_lc_v1`: App ID, App Key, optional server URL, objectId. Never committed, never logged, never the Master Key.
- Server URL comes from 控制台 → 设置 → 应用凭证 → 服务器地址. If blank, the app calls `https://<AppId 前 8 位>.lc-cn-n1-shared.com` (the console’s China-north test host; no VPN).
- If App ID, App Key, or objectId is missing, the app does not call LeanCloud and keeps working from localStorage.
- On open, GET `/1.1/classes/ECState/{objectId}` and merge (`sync.js`): higher `seen`, newer per-word record, union of history, local undo stack kept.
- After a mark, next card, undo, mode toggle, or needed toggle, wait ~650ms and PUT the full state. Success shows 已同步. Failure shows 同步失败 · plus the HTTP status, or 同步失败 · 网络. Never block the card flow.
- 创建云端记录 POSTs the class when App ID and App Key are set, then saves the returned objectId. A failed create leaves the panel open and does not clear the key just typed. Missing keys say 请先填写 App ID 和 App Key.

## Out of scope

- Changing GitHub Pages (branch `main`, folder `/`).
- Adding lexicon entries in the sync work.
