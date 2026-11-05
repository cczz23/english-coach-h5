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

Google Drive, Google OAuth, GitHub gist, and LeanCloud are not the daily path. `api.github.com` does not load on a phone in China without a VPN, and Chris chose Tencent CloudBase instead of LeanCloud.

Backup is **Tencent CloudBase 云开发**, mainland (Shanghai). GitHub Pages still hosts the site. The phone calls `https://{envId}.api.tcloudbasegateway.com` with `Authorization: Bearer <Publishable Key>` — the same accessKey behavior as `@cloudbase/js-sdk` v3. Anonymous login is not used and does not need to be turned on. The app does not call LeanCloud.

- Collection `ec_state`, one document. Field `state` is the `ec_state_v4` object.
- Credentials live only in localStorage `ec_tcb_v1`: env id, Publishable Key, doc id. Never committed, never logged, never the secret API Key.
- If env id, Publishable Key, or doc id is missing, the app does not call CloudBase and keeps working from localStorage.
- On open, GET `.../collections/ec_state/documents/{docId}` and merge (`sync.js`): higher `seen`, newer per-word record, union of history, local undo stack kept.
- After a mark, next card, undo, mode toggle, or needed toggle, wait ~650ms and PATCH that document (`upsert: true`, `state` field). Success shows 已同步. Failure shows 同步失败 · plus the HTTP status, or 同步失败 · 网络. Never block the card flow.
- 创建或绑定: with no 记录 ID, POST one document and store `insertedIds[0]`. With a 记录 ID already filled, PATCH upsert that id (bind the same record on another phone). A failed create leaves the panel open and does not clear the key just typed. Missing keys say 请先填写环境 ID 和 Publishable Key.

### One-time CloudBase console steps

1. Sign in at https://tcb.cloud.tencent.com and create an environment in **上海** (domestic). Copy the 环境 ID (`cloud1-…`). An international environment will not work: this app only calls the mainland gateway.
2. 环境配置 → 安全来源: add `cczz23.github.io` (no `https://`). Wait a few minutes. A browser call before the domain is allowed shows as 同步失败 · 网络.
3. 环境配置 → API Key → create a **Publishable Key** (可发布密钥) and copy it once. Do not put the secret API Key in the page.
4. 文档型数据库 → create collection **`ec_state`**.
5. That collection → 权限设置 → 自定义安全规则:

```json
{ "read": true, "write": true }
```

Do not use 仅创建者可读写. The Publishable Key is one client credential shared by Chris’s phones; a creator-only rule splits progress per login. Anonymous login stays off.

6. Hard-refresh https://cczz23.github.io/english-coach-h5/ → 设置 → paste 环境 ID and Publishable Key → leave 记录 ID empty → 创建或绑定. Status becomes 已同步 and the id is filled in.
7. On another device, paste the same env id, the same key, and that 记录 ID, then 保存.

401 or 403 usually means the collection rule is not the custom rule above, or the secret API Key was pasted instead of the Publishable Key.

## Out of scope

- Changing GitHub Pages (branch `main`, folder `/`).
- Adding lexicon entries in the sync work.
