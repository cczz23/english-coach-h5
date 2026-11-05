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
