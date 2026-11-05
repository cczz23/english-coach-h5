# English Coach 需求（单一事实源）

Chris Zhang 的个人英语词汇教练。静态 H5，无构建步骤。打开 `index.html` 或线上（云开发静态托管，pgdoc 环境）：

https://regional-newt-d8ghvyg140f22c055-1404967840.tcloudbaseapp.com

GitHub Pages `https://cczz23.github.io/english-coach-h5/` 仍能打开页面，但免费版拦了 github.io CORS，不能当日常同步入口。

本文是产品与实现的单一事实源。决策经过写在 `docs/transcript.md`。

面向手机 H5、中文释义。场景保持商务 / 高级通用，不加俚语。词库 tracks：`business` + `advanced`（+ `life` 若有）。

## 2026-11-05 决策一览

| 项 | 状态 |
| --- | --- |
| Tencent CloudBase 同步（取代 Drive / gist / LeanCloud） | 已上 main |
| Stage B 每词 5 条不重复场景；`EX_MAX=5` | 已上 main |
| 易混对比 `contrast` | 已上 main |
| CloudBase Strict EJSON 数字展开（`$numberInt` 等） | **本 PR 实现** |
| 日常入口改为云开发静态托管（github.io CORS 免费版被拦） | **本 PR 记入** |
| **新词 / 复习混排滑条**（new↔review 抽卡概率） | **已决定做，尚未实现**（本 PR 不写代码） |
| **间隔回访 / SRS** | **讨论中，Chris 还在想；不要实现**（只记候选） |

---

## 词库

- 数据：`words.json`。当前 126 词。
- `track`：`business` / `advanced` / `life`。`domain` 可为 `business` / `life` / `both`。
- 每词：`id`, `term`, `pos`, `ipa`, `gloss_zh`, `examples_stage_a`, `examples_stage_b`，以及可选 `important_suggest`, `contrast`。
- 不在同步工作里加词条。易混对比只给已有词加 optional 字段，不加新 lemma。

## 学习流 Stage A → B

1. **Stage A**：只给词、音标、track、一条短例句。没有释义。按钮：跳过 / 查看释义。
2. **查看释义** → **Stage B**：中文释义、可选「易混对比」、最多 5 条例句、特别需要、三态标记。
3. 标记后进入下一张卡，仍从 Stage A 开始。
4. 跳过 = 先放掉（`dropped`），计入 undo。

不要拆这套 A→B。不要为对比或混排加新的标记按钮。

## 学习状态机（已实现）

浏览器 key：`ec_state_v4`（从 `ec_state_v3` / `v2` / `v1` 向前迁）。

每词 `items[id]`：

| 字段 | 含义 |
| --- | --- |
| `status` | `dropped` 先放掉 / `reinforce` 再巩固 / `weak` 还不熟 / `null` 未见或未标 |
| `seen` | 出现次数 |
| `needed` | 特别需要 |
| `updated` | 可选，最近一次改这条记录 |
| `important` | 可选，迁入保留 |

全局：

- `mode`：`all`（全部）或 `review`（复习）。复习只抽 `weak` 和 `reinforce`。
- `recent`：最近出现过的 id，最多 10，用来少立刻重复。
- `log`：操作历史。
- `undo`：本地撤销栈，最多 5。**恢复上一个**只弹本机栈，不同步合并。

### 抽卡权重（当前，无 SRS）

`dropped` 权重 0，不进队列。其余：weak > reinforce > unseen。`important_suggest` 和非 `life` domain 略加权。`review` 模式下池子只有 weak / reinforce。

### 迁移

- v1 `mastered` → `dropped`；`shaky` / `unknown` → `weak`。
- v2 `keep` → `weak`（含糊的「还要再看」当缺口）。
- v3 → v4：补 `needed: false` 和 `undo`。

## 例句

- Stage A：一条短句（`examples_stage_a`）。
- Stage B：5 条场景（`examples_stage_b`），UI `EX_MAX=5` 再切一刀。
- 每条是该 track 下不同场景，不是近义改写。`both` 可以一条工作、一条日常。目标词放在 `[[highlight]]` 里。
- 不要为凑数复制句子。不要改 `EX_MAX`。

## 易混对比

给容易和日常近义词搅在一起的**高级词**写 1–3 条对比。宁缺毋滥。典型：*pragmatic* vs *practical* 中文都像「务实」，但用法不同。

Optional 字段：

```json
"contrast": [
  {"vs": "practical", "note_zh": "中文都像「务实」：practical 偏这办法用得上、好操作；pragmatic 偏不纠结理想，按现实约束选能落地的那条"}
]
```

- `vs` 可以是词库里的词，也可以是词库没有的基础词（`practical` / `careful` / `wise` 都可以）。
- `note_zh` 一句短中文；需要时带一点点英文线索。
- 优先 **advanced vs 日常近义词**（candid vs honest，precarious vs dangerous），少写纯抽象互比。商务短语只在真会混时才加。
- 两边都在词库时，互补各写一条，不强求对称（如 prudent ↔ meticulous，viable ↔ feasible）。
- UI：Stage B、释义之后、例句之前。标题「易混对比」，行如 `vs practical — …`。没有 `contrast` 或空数组则整块不渲染。
- 只是内容：不加标记按钮，不改 `EX_MAX`，不改同步 / `ec_state_v4`。

## 同步：Tencent CloudBase（已上 main）

Google Drive、Google OAuth、GitHub gist、LeanCloud **都不是**日常方案。`api.github.com` 在国内手机上无 VPN 不可用。Chris 选了腾讯云开发。

备份是 **Tencent CloudBase 云开发**（国内上海，当前 pgdoc 环境）。日常站点是云开发静态托管：

https://regional-newt-d8ghvyg140f22c055-1404967840.tcloudbaseapp.com

不要用 GitHub Pages 当同步入口：免费版安全来源 / CORS 拦了 `cczz23.github.io`。手机请求 `https://{envId}.api.tcloudbasegateway.com`，头 `Authorization: Bearer <Publishable Key>`，与 `@cloudbase/js-sdk` v3 的 accessKey 相同。不用匿名登录，也不用打开匿名登录。客户端不调 LeanCloud。

- 集合 `ec_state`，一篇文档。字段 `state` 就是 `ec_state_v4`。
- 凭证只在本机 localStorage `ec_tcb_v1`：环境 ID、Publishable Key、文档 id。永不进仓库、不打日志、不放密钥 API Key。
- 缺环境 ID、Publishable Key 或文档 id 时不请求 CloudBase，继续用 localStorage。
- 打开时 GET `.../collections/ec_state/documents/{docId}`。CloudBase 文档 GET 是 **Strict EJSON**：`v` / `seen` 会变成 `{ "$numberInt": "4" }`，`updated` 会变成 `{ "$numberLong": "..." }`。`sync.js` 先 `fromExtendedJson` 展开再 `isV4` / 合并，否则 `parsed.v === 4` 失败、`readDocState` 返回 null，Pull 不合并远端，两边都显示「已同步」却各用各的 localStorage。
- 合并：`seen` 取大；每词取较新记录；历史做并集；**本地 undo 栈保留**。
- 标记、下一张、撤销、切模式、特别需要之后，等约 650ms，PATCH 该文档（`upsert: true`，字段 `state`）。成功显示「已同步」。失败显示「同步失败 · 」加 HTTP 状态，或「同步失败 · 网络」。不打断刷卡。
- **创建或绑定**：没有记录 ID 时 POST 一篇，存 `insertedIds[0]`。已填记录 ID 则 PATCH upsert（另一部手机绑同一条）。失败时面板不关，刚打的 key 不清。缺字段提示「请先填写环境 ID 和 Publishable Key」。
- 当前集合权限是控制台预设「读取全部数据，修改本人数据」。几部手机共用同一份 Publishable Key 时，同一 key 身份下这份 ACL 可能仍然够用（匿名登录关着也一样，请求都带这份 key）。不必为此改成 `{ "read": true, "write": true }`，除非出现 403。代码这次只修 Extended JSON。

### 一次即可：CloudBase 控制台

1. 打开 https://tcb.cloud.tencent.com ，建**上海**国内环境。复制环境 ID（`cloud1-…`）。国际环境不行：本应用只打国内网关。
2. 环境配置 → 安全来源：加静态托管域名 `regional-newt-d8ghvyg140f22c055-1404967840.tcloudbaseapp.com`（不要 `https://`）。免费版不要指望 `cczz23.github.io` CORS 能过。等几分钟。域名未生效时浏览器侧会显示「同步失败 · 网络」。
3. 环境配置 → API Key → 建 **Publishable Key**（可发布密钥），复制一次。密钥 API Key 不要进页面。
4. 文档型数据库 → 建集合 **`ec_state`**。
5. 该集合权限当前是「读取全部数据，修改本人数据」。共用同一份 Publishable Key 时通常够用。不要用「仅创建者可读写」（会按登录拆开进度）。若写失败 403，再改自定义 `{ "read": true, "write": true }`。匿名登录保持关闭。

6. 强刷 https://regional-newt-d8ghvyg140f22c055-1404967840.tcloudbaseapp.com → 设置 → 贴环境 ID 和 Publishable Key → 记录 ID 留空 → 创建或绑定。状态变「已同步」，id 会填上。
7. 另一台设备：同一环境 ID、同一 key、那条记录 ID，然后保存。

401 / 403 多半是集合规则过严，或误贴了密钥 API Key。

## 已决定、待实现：新词 / 复习混排滑条

**做。本 PR 不写代码。**

现在模式是二分：全部（新词 + 复习按权重）vs 复习（只 weak / reinforce）。Chris 要一条**滑条**，调「新词 ↔ 复习」的抽卡概率，而不是只能二选一。

草案（实现时再钉 UI 细节）：

- **新词**：`status` 为空 / 未标记（队列里还能抽到的 unseen）。
- **复习**：已标 `weak` 或 `reinforce`。
- 滑条偏新词 → 更常抽 unseen；偏复习 → 更常抽 weak/reinforce。
- `dropped` 仍不进复习池。
- 倾向：滑条作用在「全部」；「复习」仍只抽 weak/reinforce。是否保留二分开关，实现时和 Chris 确认。
- 概率写入 `ec_state_v4`（随 CloudBase 同步）。不要为此改词库。
- 移动端一条滑条即可，不要加新标记按钮。

## 候选、不要实现：间隔回访 / SRS

**Chris 还在想。在他拍板前不要写 SRS 代码。** 下面只是讨论稿，方便以后接着聊。

现在的队列是权重随机，**没有**按天间隔。若以后做间隔回访，草案是：

| 标记 | 草案间隔 |
| --- | --- |
| `weak` 还不熟 | 约 **1 天** 后再回访 |
| `reinforce` 再巩固 | 约 **3–7 天** |
| `dropped` 先放掉 | **很长**，或只出现在「全部」、不进复习 |

可选：

- **当天上限**：同一词同一天少抽几次。
- **特别需要 `needed`**：缩短间隔，更快回访。

未决：和现有权重如何叠；到期前是否完全隐藏；是否要新字段（`due` / `interval`）进 `ec_state_v4`。拍板前保持当前权重抽卡。

## 明确不做 / 已取消

- 改 GitHub Pages 的分支或目录（`main`，仓库根 `/`）。
- Google Drive / Google OAuth；GitHub gist 日常同步；LeanCloud 日常同步。
- 为同步工作扩词库。
- 本 PR：混排滑条、SRS、改 `EX_MAX`、新标记按钮。
