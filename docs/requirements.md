# English Coach 需求（单一事实源）

Chris Zhang 的个人英语词汇教练。静态 H5，无构建步骤。打开 `index.html` 或线上（云开发静态托管，pgdoc 环境）：

https://regional-newt-d8ghvyg140f22c055-1404967840.tcloudbaseapp.com

GitHub Pages `https://cczz23.github.io/english-coach-h5/` 仍能打开页面，但免费版拦了 github.io CORS，不能当日常同步入口。

本文是产品与实现的单一事实源。决策经过写在 `docs/transcript.md`。

面向手机 H5、中文释义。场景保持商务 / 高级通用，不加俚语。词库 tracks：`business` + `advanced`（+ `life` 若有）。

## 决策一览

| 项 | 状态 |
| --- | --- |
| Tencent CloudBase 同步（取代 Drive / gist / LeanCloud） | 已上 main |
| Stage B 每词 5 条不重复场景；`EX_MAX=5` | 已上 main |
| 易混对比 `contrast` | 已上 main |
| CloudBase Strict EJSON 数字展开（`$numberInt` 等） | 已上 main |
| 日常入口改为云开发静态托管（github.io CORS 免费版被拦） | 已上 main |
| **新词 / 复习混排滑条**（new↔review 抽卡概率） | **已上 main** |
| **生疏列表**（还不熟 / 再巩固，可点开卡片） | **已上 main** |
| **间隔回访 / SRS** | **讨论中，Chris 还在想；不要实现**（只记候选） |
| **用法标签 说 / 读写**（`usage` + `sayInstead`） | **本 PR 实现** |
| **词库按进度缺口再扩 50 条**（`w263`–`w312`） | **2026-11-06 本批** |

---

## 词库

- 数据：`words.json`。当前 176 词（2026-11-06 在原 126 条上加了 50 条，id `w263`–`w312`）。
- `track`：`business` / `advanced` / `life`。`domain` 可为 `business` / `life` / `both`。商务轨 `domain` 用 `business`；高级轨用 `both`。
- 每词：`id`, `term`, `pos`, `ipa`, `gloss_zh`, `examples_stage_a`, `examples_stage_b`，`usage`（`speak` | `rw`），以及可选 `important_suggest`, `contrast`, `sayInstead`。
- 不删旧词，不改旧 id。用法标签只排练习优先级。同步那次改动本身不加词条；扩词是单独决定，见下。易混对比是可选字段，新旧词都可以有。

### 2026-11-06 扩批（进度缺口的相邻新词）

Chris 说上一批 126 词已经练完。同一天 CloudBase 进度大约是：118 条有记录，还不熟 19、再巩固 31、先放掉 64、特别需要 44。还不熟的词里，一大半是正式形容词和动词（salient、prudent、plausible、coherent、exacerbate、hinder、circumvent 等），商务开口词只有少数（traction、lowball、off the top of my head）。再巩固里则是会上真用得上的说法（take it offline、contingent on、nuanced、pragmatic、premise、discrepancy）。

本批**不回加**这些旧词，按相邻缺口新写 50 条。旧词的 id、例句、用法都不改。没有 SRS，没有改 `EX_MAX`。

| 轨 / 用法 | 条数 | 选词口径 |
| --- | --- | --- |
| business / speak | 24 | IC、尽调、谈判、开会推进：upside、downside、conviction、thesis、red flag、non-starter、dig into、flag、bottleneck、ownership、sync up、net-net、park that、get up to speed、unit economics、go-to-market、dry powder、follow-on、pro rata、underwrite、path to profitability、optionality、soft commit、liquidation preference |
| advanced / speak | 18 | 开会愿意说出口的中高阶词：material、incremental、nascent、differentiated、sticky、durable、secular、anecdotal、substantive、tentative、skeptical、concise、deliberate、fragmented、saturated、commoditized、catalyst、overhang。容易和 important / new / different / short / careful 搅在一起的，写了 `contrast` |
| advanced / rw | 8 | 备忘、条款、正式发言里要认得、开口会换简单说法的：idiosyncratic、pertinent、preclude、consequential、unequivocal、protracted、notwithstanding、bolster。每条 1–2 个 `sayInstead` |

全库 176：business 76、advanced 88、life 12；speak 140、rw 36。

刻意没加、避免和已有词叠义：hard commit（只留 soft commit，对比里点明 a firm yes）、DRI（用 ownership）、timebox、call out（与 flag 太近）、unblock（与 bottleneck 太近）、momentum（靠近 traction / trajectory）、defensibility（靠近 moat）、alignment（已有 align）、data room（due diligence 的一小块）、capacity（靠近 bandwidth）、deep dive（靠近 dig into）、marginal / materially（和 material、incremental 挤在一档「大不大」里）。不加俚语，不加 life。

## 学习流 Stage A → B

1. **Stage A**：词、音标、track、用法徽章（说 / 读写）、一条短例句。没有释义，也没有「想说时用」。按钮：跳过 / 查看释义。
2. **查看释义** → **Stage B**：中文释义、读写词的「想说时用」、可选「易混对比」、最多 5 条例句、特别需要、三态标记。用法徽章仍在。
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

- `mix`：0–1 的抽卡比例，写在 `ec_state_v4` 里，随 CloudBase 同步。**0 = 只抽新词，1 = 只抽复习**，中间按该比例掷骰子选池子。默认 `0.5`。旧数据没有 `mix` 时：`mode=review` → `1`，否则 `0.5`。
- `mode`：由 `mix` 推导，兼容旧合并逻辑。`mix >= 1` → `review`，否则 `all`。
- `recent`：最近出现过的 id，最多 10，用来少立刻重复。
- `log`：操作历史。滑条松手后记一条 `mix`（带当前比例）；若推导出的 mode 变了，再记 `mode_all` / `mode_review`。
- `undo`：本地撤销栈，最多 5。**恢复上一个**只弹本机栈，不同步合并。滑条本身不进 undo。

### 抽卡（当前，无 SRS）

先按 `mix` 选池子，再在池子里用原权重抽：

- **新词**：`status` 为空 / 未标记（队列里还能抽到的 unseen）。`dropped` 不进。
- **复习**：已标 `weak` 或 `reinforce`，与旧「复习」模式同一池。
- 滑条两端不回退到另一池（抽空则空状态）。中间若选中的池是空的，才用另一池，避免无卡可刷。
- 池内权重不变：`dropped` 为 0；weak > reinforce > unseen。`important_suggest` 和非 `life` domain 略加权。最近出现过的 id 仍尽量避开。

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
- 和用法标签分开。有 `contrast` 的词照旧显示「易混对比」；`usage` 不替代它。

## 用法：说 / 读写（本 PR）

只有两档，不要发明第三档。给 Chris（投资人；开会 + 阅读）标「开口会不会说」，不删任何词。

| 键 `usage` | 卡片徽章 | 什么时候用 |
| --- | --- | --- |
| `speak` | **说** | 他愿意在会议、谈判、电话或闲聊里说出口，听着自然，不像作文。书面里也会出现，仍标说。例：pragmatic, circle back, heads-up, traction, plausible。 |
| `rw` | **读写** | 主要出现在邮件、备忘、报告、新闻，或用来听懂别人的正式说法。他需要认得，但自己开口通常会换一个更简单的词。例：tenuous, precarious, elusive, ubiquitous, exacerbate。 |

口径：

- 他愿意说出口（哪怕书面也常见）→ **说**。
- 开口时他通常会换更简单的词 → **读写**。
- 拿不准、又是他在 IC / VC 会上会说的商务词 → **说**。
- 商务套话、会上高频词 → **说**。书面腔的高级形容词、抽象动词 → **读写**，并写 `sayInstead`。

`sayInstead`：只给 **读写**。1–2 个他真的会说的口语替代（英文 lemma 或短语）。例：precarious → `unstable` / `shaky`；tenuous → `weak` / `thin`。**说** 不写这个字段（省略或空数组）。

字段：

```json
"usage": "rw",
"sayInstead": ["unstable", "shaky"]
```

UI：

- Stage A 和 Stage B 的词卡，音标那一行、track 旁边，小徽章「说」或「读写」。
- `usage` 为 `rw` 且 `sayInstead` 非空时，Stage B 在释义和易混对比之间加一行：「想说时用：unstable / shaky」。手机上保持一行、不另开大块。
- 生疏列表每一行同样显示这个徽章。
- 本 PR 不加筛选。以后可以加「先练说」（只抽 `usage=speak`）。
- 不改抽卡、不改标记按钮、不改 `EX_MAX`、不改同步。

## 同步：Tencent CloudBase（已上 main）

Google Drive、Google OAuth、GitHub gist、LeanCloud **都不是**日常方案。`api.github.com` 在国内手机上无 VPN 不可用。Chris 选了腾讯云开发。

备份是 **Tencent CloudBase 云开发**（国内上海，当前 pgdoc 环境）。日常站点是云开发静态托管：

https://regional-newt-d8ghvyg140f22c055-1404967840.tcloudbaseapp.com

不要用 GitHub Pages 当同步入口：免费版安全来源 / CORS 拦了 `cczz23.github.io`。手机请求 `https://{envId}.api.tcloudbasegateway.com`，头 `Authorization: Bearer <Publishable Key>`，与 `@cloudbase/js-sdk` v3 的 accessKey 相同。不用匿名登录，也不用打开匿名登录。客户端不调 LeanCloud。

- 集合 `ec_state`，一篇文档。字段 `state` 就是 `ec_state_v4`。
- 凭证只在本机 localStorage `ec_tcb_v1`：环境 ID、Publishable Key、文档 id。永不进仓库、不打日志、不放密钥 API Key。
- 缺环境 ID、Publishable Key 或文档 id 时不请求 CloudBase，继续用 localStorage。
- 打开时 GET `.../collections/ec_state/documents/{docId}`。CloudBase 文档 GET 是 **Strict EJSON**：`v` / `seen` 会变成 `{ "$numberInt": "4" }`，`updated` 会变成 `{ "$numberLong": "..." }`。`sync.js` 先 `fromExtendedJson` 展开再 `isV4` / 合并，否则 `parsed.v === 4` 失败、`readDocState` 返回 null，Pull 不合并远端，两边都显示「已同步」却各用各的 localStorage。
- 合并：`seen` 取大；每词取较新记录；历史做并集；**本地 undo 栈保留**。`mix` / `mode` 跟最新的 `mix` / `mode_all` / `mode_review` log；没有这类 log 时跟较新的 per-word `updated` 那一侧。
- 标记、下一张、撤销、切模式 / 滑条、特别需要之后，等约 650ms，PATCH 该文档（`upsert: true`，字段 `state`，含 `mix`）。成功显示「已同步」。失败显示「同步失败 · 」加 HTTP 状态，或「同步失败 · 网络」。不打断刷卡。
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

## 新词 / 复习混排滑条（本 PR）

顶栏用一条滑条取代原来的「全部 / 复习」二分开关，仍然能一键偏新词或偏复习：

- 左端按钮 **新词**（`mix=0`）：只抽未见 / 未标的词（`status` 空）。抽空显示「没有新词了」。
- 右端按钮 **复习**（`mix=1`）：只抽 `weak` + `reinforce`，和旧复习模式同一池。抽空仍是「复习队列为空」，卡片复习没去掉。
- 中间：`P(复习) = mix`，`P(新词) = 1-mix`。选中的池为空时才落到另一池。
- 拖动时只改标签；松手（`change`）才写入 `ec_state_v4.mix`、按需记 log、换下一张、650ms 后同步。
- `dropped` 仍不进任一池。不要新标记按钮。不要为此改词库。

## 生疏列表（本 PR）

顶栏 **生疏列表** 打开底部列表，方便扫一眼还没掌握的词，不替代卡片复习。

- 分组：**还不熟**（`weak`）在上，**再巩固**（`reinforce`）在下。标签与 Stage B 按钮一致。
- 每行：词/短语 + 用法徽章（说 / 读写）+ `words.json` 的 `gloss_zh`。特别需要只在该行加 ★，不单独成组。
- `dropped` 和未标记的词不出现。两边都空时显示「还没有标为「还不熟」或「再巩固」的词。」
- 点一行打开该词 Stage A 卡片（计入 seen / recent）。关闭按钮收起列表。

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
- 本 PR：SRS、改 `EX_MAX`、新标记按钮、用法筛选（「先练说」只记在上面，不实现）。
