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

Replacement at the time: LeanCloud 华北. That path is superseded by the CloudBase decision below. The H5 stayed on GitHub Pages.

## 2026-11-05 — LeanCloud replaced by Tencent CloudBase

Chris chose 云开发 so sync stays inside mainland China without a VPN. LeanCloud fields and API calls are removed.

- One document in collection `ec_state`, field `state` = `ec_state_v4`.
- Auth is a Publishable Key sent as `Authorization: Bearer`, matching CloudBase Web SDK v3 `accessKey`. Anonymous login is not required and is left off. The secret API Key never goes in the client.
- Browser calls need security domain `cczz23.github.io`. The collection uses a custom rule `{ "read": true, "write": true }` so every phone with the same key shares one record. 仅创建者可读写 would split devices.
- Settings store env id, Publishable Key, and doc id in `ec_tcb_v1`. 创建或绑定 creates the document or upserts an existing id. Merge rules are unchanged. Unset settings stay local-only.

## 2026-11-05 — Examples max is 5

Stage B (and any other example list) is capped at 5 sentences instead of an implicit 3. Stage A stays a single short example. Existing `words.json` entries with fewer than 5 examples are unchanged; quality is not padded with duplicates.
