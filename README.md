# English Coach

Chris Zhang's personal English vocab coach. Static H5: open `index.html` or the live site. No build step.

**Live:** https://cczz23.github.io/english-coach-h5/

Progress is stored in the browser under localStorage key `ec_state_v4` (migrates from `ec_state_v3`, `ec_state_v2`, and `ec_state_v1` when present).

**特别需要** marks a word you especially need (counted in the header; a star shows on the term). **恢复上一个** undoes the last queue action, up to five steps.

**复习模式** is the header toggle between 全部 and 复习. 复习 only queues words marked 还不熟 (weak) or 再巩固 (reinforce). The choice is saved in `ec_state_v4`.
