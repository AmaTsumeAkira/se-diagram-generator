# 总体 ER 图模块 · 检查报告

检查对象：`总体ER图` 标签页（Chen 表示法）
链路：`App.tsx:634 ERDiagram` → `components/diagrams/ERDiagram.tsx` → `utils/svgExport.ts:erSvg()` → `utils/erRouting.ts:routeRelations()`
输入侧：`components/panels/NodeEditor.tsx:EREditor`（SQL 导入 / AI 解析 / 手工增删）→ `erToJson()` → `App.tsx:configToERState()`
导出侧：`ExportModal`（PNG/SVG/drawio/Visio）、`ExportDataModal`（JSON/MD）、`localStorage` 持久化

检查方式：以真实代码路径离线复现 7 个场景（默认示例、刷新后、SQL 导入、并排联系、自反联系、单实体、显式折线），
对产出 SVG 做几何断言（菱形 × 实体重叠、菱形 × 菱形间距、基数标注落点、连线穿越实体内部）。
可视化证据见 `docs/er-module-check.html`。

结论：**正交寻线引擎本身质量良好（7 个场景全部 0 条连线穿越实体、默认示例菱形 0 压框）**，
问题集中在「坐标持久化」「菱形落点去重」「基数标注边距」三处。

---

## P0-1 刷新页面 / 导出再导入后，实体绝对坐标 x、y 丢失

**现象**：首次打开时按业务语义手工排布的布局（左区管理员分支 / 中区部门-职位-员工 / 右区员工下属 4 表），
刷新一次后变成 4×3 的均质网格，连线随之重排，图形语义完全改变。

**证据**：同一份 `erSystemJson`，保留 x/y → `viewBox="14 0 1166 670"`；
去掉 x/y → `viewBox="80 50 1174 630"`（见证据页"场景 A vs 场景 G"）。

**根因**：坐标序列化白名单漏字段。
- `src/App.tsx:104`（`configsToJson`，被 `localStorage` 持久化调用，第 389 行）
  `{ ... row: n.data.row, col: n.data.col, group: n.data.group }` —— 无 `x` / `y`
- `src/components/panels/ExportDataModal.tsx:74`（「导出全部数据」JSON）同样只有 `row / col`

而渲染端判定绝对坐标的依据是 `svgExport.ts:546` 的 `ent.data.x / ent.data.y`：

```ts
const hasAbsEntity = entities.some(ent => typeof ent.data.x === 'number' && typeof ent.data.y === 'number')
```

导入端 `parseConfigJson`（`App.tsx:83-84`）其实**已经支持** x/y 回灌，因此这是一处纯粹的写入侧漏项。

**影响面**：`localStorage`（每次 `configs` 变化都会写盘）+ 「导出全部数据」JSON → 两条主路径都丢。
用户只要刷新一次（或在 ER 编辑器点一次"应用"后刷新），手工布局即永久回退为自动网格。

**修复建议**：
1. `configsToJson` 与 `ExportDataModal` 的 `base` 各补 `x: d.x, y: d.y` 两行即可闭环；
2. 建议把两个序列化实现收敛成一个共享函数，避免再次各自演化、反复漏字段。

---

## P0-2 同一对实体之间的多条联系完全重合

**现象**：`订单 → 用户` 之间建「下单 / 支付 / 退款」3 条联系，画布上只看到 1 条连线 + 1 个菱形。

**证据**：3 个菱形中心全部为 `(315,112)`，3 条路径均为 `M 240 112 L 390 112`（完全同点）。
后画的白色菱形会覆盖前一个的标签，最终仅最后一条「退款」可见。

**根因**：`erRouting.ts:284-313` 菱形落点的两级策略都缺少"最终偏移"与"平行错开"：

```ts
for (const s of pool) {                       // 一级：沿候选段试 t
  for (const t of [0.5, 0.6, 0.4, 0.7, 0.3, 0.2, 0.15, 0.8]) {
    if (placedDiamonds.some(p => Math.abs(p.x - x) < DW + 6 && Math.abs(p.y - y) < DH + 6)) continue
    ...
  }
}
if (!diamond) {                               // 二级兜底：只在同一段上换 5 个 t
  let pick = 0.5
  for (const cand of [0.5, 0.35, 0.65, 0.2, 0.8]) { ... }
  diamond = { ...pick }                       // ← 全部冲突时仍取 0.5，与既有菱形原位叠放
}
```

同一实体对的候选路径只有一条直线（`erRouting.ts:189`），3 条联系必然选中同一条线；
而"避让半径" `DW+6 = 62 / DH+6 = 38` 大于该段可提供的偏移量（±45px），于是 5 个兜底候选全部被判冲突，
`pick` 保持 0.5，菱形精确重合。

**影响面**：多对多联系、同一对实体间的不同语义联系（下单/支付/退款、创建/审批/归档）都会丢信息。
SQL 导入场景同样命中（6 表 6 联系时菱形 #1 与 #5 同在 `(621,112)`）。

**修复建议**：
1. 兜底分支必须保证唯一性：候选全部冲突时，沿线段方向或垂直方向做递增偏移（如 `±(DW+10)×k`）直到空位，而不是回退到 0.5；
2. 为同一实体对的重复联系引入"平行偏移"：直线候选按索引横向/纵向错开（或对同源同目标的多条联系强制走 Z 型干线并分配不同 `t`）；
3. 建议在菱形落点冲突时优先扩大搜索范围（相邻段、外绕段），而不是仅在同一段上试 `t`。

---

## P1-1 自反联系被静默丢弃

**现象**：`员工 — 管理 — 员工`（`source === target`）在图上完全不出现：0 个菱形、0 条连线、0 个基数，
且界面没有任何提示，用户无法察觉关系已丢失。

**根因**：`erRouting.ts:173`

```ts
if (!S || !T || S.id === T.id) continue   // 自反联系直接丢弃
```

`erSvg()` 仅渲染 `routedById` 中存在的联系（`svgExport.ts:641-648`），被跳过的联系连兜底绘制都没有。

**影响面**：员工上下级、分类树、BOM 结构、组织层级等最常见的自反建模场景。

**修复建议**：为 `S.id === T.id` 单独生成一条自环路径（如"右侧引出 → 上行 → 回到本框上方"的三段折线），
菱形置于回折段中点；若暂不实现，至少应降级为"框外绕行 + 菱形"或在导入时给出提示，不能静默丢弃。

---

## P1-2 基数标注压住实体框（默认示例中可见）

**现象**（默认示例，可直接目视）：
| 位置 | 标注 | 结果 |
|---|---|---|
| 管理员表 | `1` @(107,213) | 实体框覆盖 → **完全不可见** |
| 留言板表 | `N` @(1068,299.5) | 约 40% 字高被实体白底压住 |
| 通知公告表 / 会议记录表 / 待办事项表 / 员工主表 | `N` | 净空仅 0～1px，紧贴边框 |
| 显式折线场景 | `0..1` @(130,113) | 整块压在实体框内 |

**根因**：`erRouting.ts:317-326` 的 `cardAlong()` 只按线段长度回退，不感知实体尺寸：

```ts
const dist = Math.min(30, len * 0.45)   // 末端段 50px 时 → 22.5px，实体半高 22px → 净空 0.5px
```

且 `resolveCard()`（`erRouting.ts:156-168`）的冲突检测只比对**已放置的基数与菱形**，
不检测实体矩形，因此"错开"只在文字互压时才生效。实体在图层最上层（`svgExport.ts:733` 的绘制顺序
`分组框 → 连线 → 菱形 → 基数 → 实体`）且白底不透明，落在框内的文字会被完全遮盖。
显式折线路径（`svgExport.ts:584-606 manualCardAt`）有同样问题——它从实体边缘点起步，前 30px 仍在框内。

**修复建议**：
1. `dist` 下限改为"实体沿该方向半尺寸 + 字高余量 + 8px"，例如垂直进出取 `max(30, entH/2 + 18)`，水平进出取 `max(dist, w/2…)`（需要在 `routeRelations` 中拿到端点实体盒尺寸）；
2. `resolveCard` 的冲突检测加入实体矩形（与 `diaObstacles` 同理）；
3. 更稳的做法：把基数落点约束在"实体框外的净空带"内，再沿线段方向微调。

---

## P2 其余观察

- **Visio 导出对 ER 图不成形**：`visioExport.ts:305 erVisio()` 直接复用通用 `exportToVisio()` —
  菱形被渲染成 120×60 矩形（`:247` 仅区分 `ellipse` / `rectangle`）、基数字段（`sourceCard` / `targetCard`）完全未导出、
  联系名依赖 `node.data.label` 而实体与菱形混排、正交折线被 `calculateLayout()` 重算为直线。导出结果与屏幕所见不一致。
- **菱形间距过近**：默认示例 x=1080 处两枚菱形中心距 39.5px，菱形高 32px，视觉净空仅 7.5px（肉眼近乎相接）。
  建议将菱形最小净空纳入判定（如 `DH + 12`）。
- **绝对坐标无法在界面维护**：`EREditor` 只提供实体名 / 分组 / 联系三组字段，没有 `x / y / row / col` 输入。
  叠加 P0-1，用户"手工排布"的能力实际上是不可用的。
- **字体宽度假设**：`svgExport.ts:539 entWOf()` 固定按 12px 估算框宽；若通过 JSON 指定 `fontSize`，
  框宽不随之变化，可能出现文字溢出（ER 编辑器目前无字号入口，属潜在问题）。
- **未发现的问题**：连线穿越实体内部（7 个场景 0 命中）、`dangerouslySetInnerHTML` 注入（`esc()` 已覆盖 `& < > " '`）、
  空数据 / 单实体 / 无联系 / 分组虚线框均正常。

---

## 复现方式

本次检查用 rolldown 直接把 `erSvg()` 打成离线包渲染（`rolldown er-check.entry.ts -o /tmp/er-check/bundle.mjs -p node -e node:fs`），
再用几何断言脚本校验产出 SVG。7 个场景的 SVG 与断言输出见 `/tmp/er-check/`。
若需要长期回归，建议把该脚本固化到 `scripts/` 并接入 `npm run lint` 之后的检查步骤。

## 建议修复优先级

1. **P0-1**（两行改动，收益最大：布局不再"刷新即变"）
2. **P0-2** 兜底唯一性 + 平行偏移（多对多联系不丢信息）
3. **P1-1** 自反联系兜底绘制（不静默丢数据）
4. **P1-2** 基数落点边距（影响默认示例的第一眼观感）
5. **P2** Visio 导出单独实现 ER 分支

---

# 修复进展（同日晚间更新）

修复前后对比见 `docs/er-module-fix.html`（内嵌两侧真实渲染）。

| 编号 | 状态 | 改动 |
|---|---|---|
| P0-1 | ✅ 已修复 | 新建 `src/utils/configSerialize.ts`，把 `configsToJson` / `parseConfigJson` / `jsonToConfigs` / `tabKeys` 收敛为**唯一一份双向实现**；字段策略由"白名单"改为**排除式**（`data` 里除 `label` 外全部序列化），未来新增字段不会再漏 |
| P0-2 | ✅ 已修复 | `erRouting.ts`：同一对实体（`src->tgt`）的第 n 条联系走**平行车道**（`LANE_GAP=48`，4 档偏移）；重叠判定改为**共线区间**比较（`MIN_OVERLAP=40`，忽略贴实体的短引出段），并按引擎既定策略给"外绕走廊"加 `CORRIDOR_PENALTY=30`，避免绕行方案抢在车道之前 |
| P1-1 | ✅ 已修复 | `erRouting.ts`：新增 `selfLoopPath()`，四个方向候选 + 避障择优，复用统一的菱形/基数落点逻辑 |
| P1-2 | ✅ 已修复 | `erRouting.ts`：新增并导出 `anchorOutside()` —— 沿折线推进到实体盒之外（`CARD_CLEAR=12`）再推 `CARD_PUSH=10` 落点；`resolveCard()` 增加实体矩形避让；`svgExport.ts` 的手动折线路径复用同一函数 |
| P2（菱形重合兜底） | ✅ 已修复 | 兜底改为"法线方向按菱形尺寸递增探测"，保证落点唯一（旧实现回退到 `pick=0.5` 造成精确重叠） |
| P2（新增实体就位） | ✅ 已修复 | `svgExport.ts` 实体定位改为 **绝对坐标 → row/col → 空位搜索**三级：编辑器新增的实体（无坐标）会在网格中找第一个与已有实体保持 30px 净空的空位，而不是按全局序号套网格（默认示例上会落到 `(120,810)`，被甩到画布下方） |
| P2（Visio 导出） | ⬜ 未处理 | `erVisio()` 仍复用通用导出：菱形渲染为矩形、基数与联系名丢失、布局被 `calculateLayout()` 重算。需要为 ER 单独写 Visio 分支（菱形形状 + 基数文本 + 正交折线） |

## 改动文件

```
src/utils/configSerialize.ts            新增：配置（反）序列化唯一实现
src/utils/erRouting.ts                  寻线引擎：车道 / 自环 / 落点 / 净空
src/utils/svgExport.ts                  ER 实体定位（空位搜索）+ 手动折线复用 anchorOutside
src/App.tsx                             改为引用统一序列化实现
src/components/panels/ExportDataModal.tsx  同上
```

## 复验结果

| 检查项 | 结果 |
|---|---|
| `npm run build`（`tsc -b && vite build`） | ✅ 通过 |
| `npm run lint` | ✅ 72 problems（修复前基线 80，净减 8） |
| 持久化回环 `configsToJson → jsonToConfigs` | ✅ 12/12 实体保留 `x/y` |
| 9 个场景 × 5 项几何不变式（实体×实体、菱形×实体、菱形间距、基数落点、连线穿越） | ✅ 全部通过 |

> 界面复验提示：既有用户的 `localStorage` 里仍是缺坐标的旧数据，点一次工具栏「重置」即可恢复内置设计布局；
> 之后刷新不再退化。

## 仍未覆盖

- **Visio 导出的 ER 分支**（P2，见上表）。
- **ER 编辑器没有坐标入口**：`EREditor` 只提供实体名 / 分组 / 联系字段，用户无法在界面里微调 `x/y/row/col`；
  内置示例与 JSON 导入可用，新增实体走空位搜索，但"手工排版"能力仍不完整。
- **`entWOf()` 固定按 12px 估算框宽**：若 JSON 指定 `fontSize`，框宽不随之变化。
