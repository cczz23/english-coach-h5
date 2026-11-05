# Decision log

## 2026-11-05 — Sync: Drive cancelled, GitHub gist instead

Chris (owner) stopped the Google Drive / Google Cloud OAuth direction. Phone progress must not depend on a Google account.

Replacement:

- A secret gist holds `english-coach-state.json` in the existing `ec_state_v4` shape.
- The H5 settings panel takes a GitHub personal access token (classic scope `gist`, or a fine-grained token with gist access) and an optional gist id.
- The token and gist id live in localStorage `ec_sync_v1` on that device only.
- Opening the app merges the gist into local state. Later changes PATCH the gist. Failures stay on a small status line (同步失败 / 已同步) and do not block practice.
- With nothing configured, behavior stays localStorage-only.

Drive folder code, Google Identity Services, and any OAuth client id are out of the product.

## 2026-11-05 — Gist sync stopped; LeanCloud China instead

`api.github.com` fails on Chris’s phone in China without a VPN. He will not use a VPN for daily practice, so gist sync is not the path.

Replacement: LeanCloud 华北. One `ECState` object holds `state` in the `ec_state_v4` shape. Settings take App ID, App Key, the console server URL, and the objectId created by 创建云端记录. Merge rules are unchanged. The H5 remains on GitHub Pages; only the sync host moves to LeanCloud. No Master Key in the client.

## 2026-11-05 — Examples max is 5

Stage B (and any other example list) is capped at 5 sentences instead of an implicit 3. Stage A stays a single short example. Existing `words.json` entries with fewer than 5 examples are unchanged; quality is not padded with duplicates.
