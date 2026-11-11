# English Coach

Chris Zhang's personal English vocab coach. Static H5: open `index.html` or the live site. No build step.

**Live:** https://cczz23.github.io/english-coach-h5/

Progress is stored in the browser under localStorage key `ec_state_v4` (migrates from `ec_state_v3`, `ec_state_v2`, and `ec_state_v1` when present).

**特别需要** marks a word you especially need (counted in the header; a star shows on the term). **恢复上一个** undoes the last queue action, up to five steps.

**新词 / 复习滑条** sits in the header: left is only unseen/unmarked words, right is only 还不熟 (weak) + 再巩固 (reinforce), middle is a probability mix. The value is saved as `mix` on `ec_state_v4` (and still derives `mode` so CloudBase merge stays compatible). **生疏列表** opens those weak/reinforce rows so you can scan without flipping cards; tap a row to open that card. Card-based 复习 is unchanged. **沉睡清单** is the quieter link under that row: words once marked 还不熟 or 再巩固 and now 已放掉. It is computed from the existing log and is not mixed into the slider.

**CloudBase sync (China, no VPN):** the site stays on GitHub Pages. Progress backup talks to Tencent CloudBase’s mainland gateway, not GitHub’s API and not LeanCloud. One-time console setup is in `docs/requirements.md`. Then open 设置, paste the 环境 ID and Publishable Key, leave 记录 ID empty, and tap 创建或绑定 once. That stores one `ec_state` document id in this browser under `ec_tcb_v1`. On open the app merges that document’s `state` field into `ec_state_v4`. Marks, next, undo, mode, and 特别需要 then upload the full state. Leave settings empty and the coach stays local-only. Do not paste the secret API Key. The key stays on the device and is never committed.
