# English Coach requirements

Static H5 vocab coach. No build step. Hosted from the repo root on GitHub Pages: https://cczz23.github.io/english-coach-h5/

## Learning state

- Browser key: `ec_state_v4` (migrates forward from `ec_state_v3`, `ec_state_v2`, `ec_state_v1`).
- Per word: `status` (`dropped` / `reinforce` / `weak` / null), `seen`, `needed`, optional `updated` and `important`.
- `mode` is `all` or `review`. 复习 queues only weak and reinforce.
- 特别需要 sets `needed`. 恢复上一个 pops the local undo stack (max 5).

## Sync

Google Drive and Google OAuth are cancelled. Do not add Google Identity Services, the Drive API, an OAuth client id, or any Drive folder.

Backup is a **secret GitHub gist** owned by Chris:

- File name: `english-coach-state.json` (same shape as `ec_state_v4`).
- Credentials: a GitHub personal access token with gist access only, plus the gist id.
- Stored only in localStorage key `ec_sync_v1` on the device. Never committed, never logged, never placed in `words.json` or the README as a real secret.
- If `ec_sync_v1` is missing a token or a gist id, the app does not call GitHub and keeps working from localStorage.
- On open, GET the gist and merge (see comments in `sync.js`): higher `seen`, newer per-word record, union of history, local undo stack kept.
- After a mark, next card, undo, mode toggle, or needed toggle, wait ~650ms and PATCH the full state. Show 已同步 or 同步失败. Never block the card flow.
- 创建 private gist POSTs a secret gist (`public: false`) when a token is present and the gist id field is empty, then stores the returned id.

## Out of scope

- Changing GitHub Pages (branch `main`, folder `/`).
- Adding lexicon entries in the sync work.
