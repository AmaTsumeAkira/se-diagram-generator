/**
 * ER 实体本地布局（不依赖 AI，确定性）
 *
 * 解决什么问题：SQL 解析出的实体如果按"声明顺序"铺网格，主表往往落在角落，
 * 它的十几条联系就会横穿整张画布（扇形长线），非常难读。
 *
 * 做法：
 *   1. 选"核"：核评分 = 2×介数中心性 + 入度 + 0.5×出度 +（既被引用又引用他人 ? 3 : 0），
 *      即以**结构性核心**为主（避免"被引用得多但只是字典表"抢走中心），可多核，也可由调用方指定；
 *   2. 多源 BFS 得到每个实体到最近核的跳数，按「跳数 → 核评分 → 声明序」排序；
 *   3. 网格行列取奇数（唯一中心格），格子按「环序 → 与中心同行/同列优先 → 曼哈顿距离」排序，
 *      使核的近邻落在其正上/正下/正左/正右，正交寻线引擎可用短直线连接；
 *   4. 两段式优化，邻域含两类动作：**与其它实体交换格子**、**移动到空格**（空格往往是
 *      "交换解决不了"的交叉的唯一出路）：
 *      · 粗排 —— 代理代价（格子坐标）爬山：小图全配对 + 允许移空格；大图只与图上有联系的
 *        邻居交换（O(n·度)），并按规模收紧评估预算；
 *      · 精修 —— 小图用**真实正交寻线的结果**当代价（实际交叉数 + 实际连线总长）做限量爬山，
 *        使优化目标与最终渲染完全一致；
 *   5. 列宽按该列最宽实体计算，实体列内居中，输出绝对坐标 x/y
 *      （与手工布局同一套坐标系，可继续微调，刷新也不会丢）。
 */

import { routeRelations, type ERBoxInput, type ERRelationInput, type ERRoutedRelation } from './erRouting'

/** 真实代价的权重，按"视觉显眼程度"排序：
 *   交叉点（最刺眼）> 最长的那条线（画布上最显眼的杂乱来源）> 总墨量。
 * 权重经脚本扫描比较后选定。
 */
const WIRE_W = 1
const MAXSEG_W = 4

/** 实体框高度（与 svgExport.erSvg 保持一致） */
export const ER_ENT_H = 44
/** 实体标签字号：放大一号（12 → 14），框宽估算与此保持一致 */
export const ER_ENTITY_FONT = 14
/** 列间距 / 行间距 */
const H_GAP = 150
const V_GAP = 180
const MIN_W = 120
const MAX_W = 220
const START_X = 80
const START_Y = 60

/** 核评分的门槛：不低于最高分的 60%，且度数 ≥ 3；核数量上限随规模放宽 */
const HUB_RATIO = 0.6
const HUB_MIN_DEGREE = 3
const hubMaxFor = (n: number) => Math.min(6, Math.max(3, Math.round(n / 6)))

/** 粗排：全配对交换的规模上限（超过则只与图上邻居交换） */
const ALLPAIRS_MAX_ENTITIES = 40
/** 允许"移动到空格"的规模上限（大图的空格邻域太大） */
const EMPTYMOVE_MAX_ENTITIES = 60
const REFINE_PASSES = 6
/** 粗排的评估预算（按规模收紧；代理代价便宜） */
const proxyBudgetFor = (n: number) => (n <= 20 ? 2500 : n <= 40 ? 1800 : 800)
/**
 * 连续坐标微调：格子解只当起点，实体还能在像素空间里移动与对齐。
 *   · 分离约束 —— 有联系的实体之间必须留出菱形/基数的位置（横向 ≥100px 或纵向 ≥130px），
 *     没有联系的实体只需不贴住（≥28px）；
 *   · 邻域 —— "吸附到邻居的 x/y"（保住直线） + 由粗到细的步长（48/24/12/6）；
 *   · 规模与预算 —— 评估次数按规模反比分配，上限对齐"实测饱和点"：
 *     把预算再放大一倍，13 表 schema 的各项指标完全相同（搜索已收敛），
 *     因此没有必要吃满 5s 上限；当前定标下 11~80 实体约 0.4~2.4s。
 *
 * 关于"联合移动"（两个实体协同位移）：已实测并放弃 —— 在 13 表 / 星型 / 随机 20 实体三种形态下，
 * 加上"两实体共同对齐 + 同步平移"的邻域后所有指标逐项相同（布局在单实体邻域下已是不动点），
 * 却要多花约 15% 时间。因此不保留这段代码。
 */
const SEP_H_CONNECTED = 100
const SEP_V_CONNECTED = 130
const SEP_MIN = 28
const COORD_STEPS = [48, 24, 12, 6]
const COORD_MAX_ENTITIES = 80
const coordBudgetFor = (n: number) => Math.max(400, Math.min(3000, Math.round(28000 / n)))
/** 代价项：菱形离线距离（菱形必须落在自己的折线上） */
const OFFLINE_W = 20
/** 代价项：直线奖励（同行/同列的有联系实体可一笔画过去） */
const ALIGN_BONUS = 60

/** 精修：真实寻线评估的分档上限（耗时随规模上升，实测 11 实体 0.46ms/次、60 实体 4.1ms/次） */
const POLISH_TIERS = [
  { max: 24, budget: 900, passes: 3 },
  { max: 40, budget: 500, passes: 2 },
  { max: 60, budget: 300, passes: 2 },
  { max: 80, budget: 150, passes: 1 },
]

export interface ErLayoutEntity {
  id: string
  label: string
}

export interface ErLayoutEdge {
  /** "一"侧（被引用表） */
  source: string
  /** "多"侧（引用表） */
  target: string
}

export interface ErLayoutOptions {
  /** 指定中心实体（解决"度数最高 ≠ 业务核心"的语义问题）；缺省则自动判定 */
  centerId?: string
}

export interface ErPlacement {
  id: string
  x: number
  y: number
}

/** 与 erSvg.entWOf 同一套估算，保证布局与渲染的框宽一致 */
export function estimateEntityWidth(label: string, fontSize = ER_ENTITY_FONT): number {
  let w = 0
  for (const ch of label) w += ch.charCodeAt(0) > 127 ? fontSize : fontSize * 0.6
  return Math.max(MIN_W, Math.min(MAX_W, Math.round(w) + 36))
}

const oddAtLeast = (v: number) => (v % 2 === 1 ? v : v + 1)

interface Cell {
  r: number
  c: number
}

const cellKey = (c: Cell) => `${c.r},${c.c}`

// ====== 图结构：邻接、度数、入度、介数中心性 ======

interface GraphStat {
  adj: Map<string, Set<string>>
  degreeOf: (id: string) => number
  /** 核评分：结构性核心（介数）×2 + 入度 + 0.5×出度 + 桥接奖励 */
  hubScore: (id: string) => number
}

function buildGraph(entities: ErLayoutEntity[], edges: ErLayoutEdge[]): GraphStat {
  const ids = entities.map((e) => e.id)
  const adj = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]))
  const inDeg = new Map<string, number>(ids.map((id) => [id, 0]))
  const outDeg = new Map<string, number>(ids.map((id) => [id, 0]))
  for (const e of edges) {
    if (e.source === e.target) continue
    const a = adj.get(e.source)
    const b = adj.get(e.target)
    if (!a || !b) continue
    a.add(e.target)
    b.add(e.source)
    outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1)
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1)
  }

  // Brandes 介数中心性（无向图，O(n·m)）
  const betweenness = new Map<string, number>(ids.map((id) => [id, 0]))
  if (ids.length <= 200) {
    for (const s of ids) {
      const S: string[] = []
      const pred = new Map<string, string[]>(ids.map((id) => [id, []]))
      const sigma = new Map<string, number>(ids.map((id) => [id, 0]))
      const dist = new Map<string, number>(ids.map((id) => [id, -1]))
      const delta = new Map<string, number>(ids.map((id) => [id, 0]))
      sigma.set(s, 1)
      dist.set(s, 0)
      const queue: string[] = [s]
      while (queue.length) {
        const v = queue.shift()!
        S.push(v)
        for (const w of adj.get(v)!) {
          if (dist.get(w)! < 0) {
            dist.set(w, dist.get(v)! + 1)
            queue.push(w)
          }
          if (dist.get(w) === dist.get(v)! + 1) {
            sigma.set(w, sigma.get(w)! + sigma.get(v)!)
            pred.get(w)!.push(v)
          }
        }
      }
      while (S.length) {
        const w = S.pop()!
        for (const v of pred.get(w)!) {
          delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!))
        }
        if (w !== s) betweenness.set(w, betweenness.get(w)! + delta.get(w)!)
      }
    }
  }

  const degreeOf = (id: string) => adj.get(id)!.size
  const hubScore = (id: string) => {
    const i = inDeg.get(id) ?? 0
    const o = outDeg.get(id) ?? 0
    return (betweenness.get(id) ?? 0) * 2 + i + o * 0.5 + (i > 0 && o > 0 ? 3 : 0)
  }
  return { adj, degreeOf, hubScore }
}

/** 自动判定的中心实体（供 UI 显示"系统建议"） */
export function suggestCenter(entities: ErLayoutEntity[], edges: ErLayoutEdge[]): { id: string; label: string } | null {
  if (entities.length < 2) return null
  const g = buildGraph(entities, edges)
  let best: ErLayoutEntity | null = null
  for (const e of entities) {
    if (!best || g.hubScore(e.id) > g.hubScore(best.id)) best = e
  }
  return best ? { id: best.id, label: best.label } : null
}

// ====== 代价函数 ======

/** 线段相交（代理代价用，取实体中心连线；共享端点不算） */
function segmentsCross(a1: Cell, a2: Cell, b1: Cell, b2: Cell): boolean {
  const cross = (o: Cell, p: Cell, q: Cell) => (p.c - o.c) * (q.r - o.r) - (p.r - o.r) * (q.c - o.c)
  if ((a1.r === b1.r && a1.c === b1.c) || (a1.r === b2.r && a1.c === b2.c) ||
      (a2.r === b1.r && a2.c === b1.c) || (a2.r === b2.r && a2.c === b2.c)) return false
  const d1 = cross(b1, b2, a1)
  const d2 = cross(b1, b2, a2)
  const d3 = cross(a1, a2, b1)
  const d4 = cross(a1, a2, b2)
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))
}

function hubOffsetOf(cellOf: Map<string, Cell>, hubIds: string[], center: Cell): number {
  let off = 0
  for (const h of hubIds) {
    const c = cellOf.get(h)
    if (c) off += Math.max(Math.abs(c.r - center.r), Math.abs(c.c - center.c))
  }
  return off
}

/** 代理代价：交叉数权重最高，其次是总线长，同行/同列与"核居中"给予奖励 */
function proxyCost(cellOf: Map<string, Cell>, pairs: [string, string][], hubIds: string[], center: Cell): number {
  let aligned = 0
  let dist = 0
  // 先算端点的包围盒，只有包围盒相交的两条联系才可能相交（剪枝，避免全配对）
  const items: { a: Cell; b: Cell; rMin: number; rMax: number; cMin: number; cMax: number }[] = []
  for (const [a1, a2] of pairs) {
    const c1 = cellOf.get(a1)
    const c2 = cellOf.get(a2)
    if (!c1 || !c2) continue
    dist += Math.abs(c1.r - c2.r) + Math.abs(c1.c - c2.c)
    if (c1.r === c2.r || c1.c === c2.c) aligned++
    items.push({
      a: c1,
      b: c2,
      rMin: Math.min(c1.r, c2.r),
      rMax: Math.max(c1.r, c2.r),
      cMin: Math.min(c1.c, c2.c),
      cMax: Math.max(c1.c, c2.c),
    })
  }
  let crossings = 0
  for (let i = 0; i < items.length; i++) {
    const A = items[i]
    for (let j = i + 1; j < items.length; j++) {
      const B = items[j]
      if (A.rMax < B.rMin || B.rMax < A.rMin || A.cMax < B.cMin || B.cMax < A.cMin) continue
      if (segmentsCross(A.a, A.b, B.a, B.b)) crossings++
    }
  }
  return crossings * 1000 + dist * 10 - aligned * 100 + hubOffsetOf(cellOf, hubIds, center) * 120
}

/** 格子分配 → 像素坐标（列宽取该列最宽实体，实体列内居中） */
function cellsToPlacements(cellOf: Map<string, Cell>, entities: ErLayoutEntity[], cols: number): ErPlacement[] {
  const colW = new Array(cols).fill(MIN_W)
  for (const e of entities) {
    const cell = cellOf.get(e.id)
    if (!cell) continue
    colW[cell.c] = Math.max(colW[cell.c], estimateEntityWidth(e.label || e.id))
  }
  const colX: number[] = []
  let acc = START_X
  for (let c = 0; c < cols; c++) {
    colX[c] = acc
    acc += colW[c] + H_GAP
  }
  return entities.map((e) => {
    const cell = cellOf.get(e.id)
    if (!cell) return { id: e.id, x: START_X, y: START_Y }
    const w = estimateEntityWidth(e.label || e.id)
    return {
      id: e.id,
      x: Math.round(colX[cell.c] + (colW[cell.c] - w) / 2),
      y: Math.round(START_Y + cell.r * (ER_ENT_H + V_GAP)),
    }
  })
}

interface RouteGeometry {
  wire: number
  maxSeg: number
  crossings: number
  /** 菱形中心到自身折线的最短距离之和（>0 表示菱形被挤到线外） */
  offline: number
  /** 同行/同列的有联系实体数（正交寻线可一笔画过去） */
  aligned: number
}

function routeGeometry(routed: ERRoutedRelation[]): RouteGeometry {
  let wire = 0
  let maxSeg = 0
  let offline = 0
  let aligned = 0
  const segs: { h: boolean; k: number; a: number; b: number }[] = []
  for (const r of routed) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const [x1, y1] = r.points[i]
      const [x2, y2] = r.points[i + 1]
      const segLen = Math.abs(x2 - x1) + Math.abs(y2 - y1)
      wire += segLen
      if (segLen > maxSeg) maxSeg = segLen
      const h = Math.abs(y1 - y2) < 0.5
      segs.push({
        h,
        k: h ? y1 : x1,
        a: Math.min(h ? x1 : y1, h ? x2 : y2),
        b: Math.max(h ? x1 : y1, h ? x2 : y2),
      })
    }
    // 首尾两端若同行或同列，寻线只需一段 —— 记作直线奖励
    const p0 = r.points[0]
    const pn = r.points[r.points.length - 1]
    if (Math.abs(p0[0] - pn[0]) < 1 || Math.abs(p0[1] - pn[1]) < 1) aligned++
    // 菱形离线距离：菱形应当落在自己的折线上
    let best = Infinity
    for (let i = 0; i < r.points.length - 1; i++) {
      const [x1, y1] = r.points[i]
      const [x2, y2] = r.points[i + 1]
      const dx = x2 - x1
      const dy = y2 - y1
      const len2 = dx * dx + dy * dy
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((r.diamond.x - x1) * dx + (r.diamond.y - y1) * dy) / len2)) : 0
      best = Math.min(best, Math.hypot(r.diamond.x - (x1 + dx * t), r.diamond.y - (y1 + dy * t)))
    }
    if (best > 1) offline += best
  }
  let crossings = 0
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const A = segs[i]
      const B = segs[j]
      if (A.h === B.h) continue
      const H = A.h ? A : B
      const V = A.h ? B : A
      if (V.k > H.a + 1 && V.k < H.b - 1 && H.k > V.a + 1 && H.k < V.b - 1) crossings++
    }
  }
  return { wire, maxSeg, crossings, offline, aligned }
}

function toBoxes(placed: ErPlacement[], entities: ErLayoutEntity[]): ERBoxInput[] {
  const pos = new Map(placed.map((p) => [p.id, p]))
  return entities.map((e) => ({
    id: e.id,
    x: pos.get(e.id)!.x,
    y: pos.get(e.id)!.y,
    w: estimateEntityWidth(e.label || e.id),
    h: ER_ENT_H,
  }))
}

/**
 * 像素坐标下的真实代价：直接跑一次真实正交寻线，口径与最终渲染一致
 * （交叉点、最长段、连线总长，外加"菱形离线距离"与"直线奖励"）。
 */
function pixelCost(placed: ErPlacement[], entities: ErLayoutEntity[], rels: ERRelationInput[]): number {
  // skipCards：布局代价只关心路径与菱形落点，标注放置留到最终渲染
  const geo = routeGeometry(routeRelations(toBoxes(placed, entities), rels, { skipCards: true }))
  return (
    geo.crossings * 1000 +
    geo.maxSeg * MAXSEG_W +
    geo.wire * WIRE_W +
    geo.offline * OFFLINE_W -
    geo.aligned * ALIGN_BONUS
  )
}

/** 格子坐标下的真实代价（供粗排/精修用；额外带"核居中"偏好） */
function routedCost(
  cellOf: Map<string, Cell>,
  entities: ErLayoutEntity[],
  cols: number,
  rels: ERRelationInput[],
  hubIds: string[],
  center: Cell,
): number {
  return pixelCost(cellsToPlacements(cellOf, entities, cols), entities, rels) + hubOffsetOf(cellOf, hubIds, center) * 300
}

// ====== 统一的邻域爬山（交换 + 移到空格） ======

interface ClimbOptions {
  ids: string[]
  allCells: Cell[]
  costOf: () => number
  /** 是否允许"移动到空格" */
  emptyMove: boolean
  /** 交换候选：true = 与所有实体交换；false = 只与图上有联系的邻居交换 */
  allPairs: boolean
  neighborOf: Map<string, Set<string>>
  maxPasses: number
  /** 评估次数上限 */
  evalBudget: number
  canMove: (id: string) => boolean
}

function hillClimb(cellOf: Map<string, Cell>, o: ClimbOptions): void {
  let cost = o.costOf()
  let evals = 0
  for (let pass = 0; pass < o.maxPasses; pass++) {
    if (evals >= o.evalBudget) return
    let improved = false

    for (const a of o.ids) {
      if (!o.canMove(a)) continue
      const startCell = cellOf.get(a)!

      // ① 移到空格 —— 交叉/距离常常只能靠空位化解，靠交换做不到
      if (o.emptyMove) {
        const used = new Set<string>()
        for (const c of cellOf.values()) used.add(cellKey(c))
        for (const cell of o.allCells) {
          if (used.has(cellKey(cell))) continue
          if (evals >= o.evalBudget) return
          evals++
          cellOf.set(a, cell)
          const next = o.costOf()
          if (next < cost) {
            cost = next
            improved = true
            break
          }
          cellOf.set(a, startCell)
        }
      }

      // ② 与其它实体交换
      const swapTargets = o.allPairs ? o.ids : o.ids.filter((id) => o.neighborOf.get(a)?.has(id))
      for (const b of swapTargets) {
        if (b === a || !o.canMove(b)) continue
        if (evals >= o.evalBudget) return
        evals++
        const curA = cellOf.get(a)!
        const curB = cellOf.get(b)!
        cellOf.set(a, curB)
        cellOf.set(b, curA)
        const next = o.costOf()
        if (next < cost) {
          cost = next
          improved = true
        } else {
          cellOf.set(a, curA)
          cellOf.set(b, curB)
        }
      }
    }

    if (!improved) break
  }
}


// ====== 连续坐标微调 ======

/**
 * 连续坐标微调：从格子解出发，在像素空间里移动实体
 *   ① 吸附到"有联系实体/核"的 x 或 y —— 保住正交寻线的一笔画直线；
 *   ② 由粗到细的步长移动（含对角），把实体拉近它真正需要靠近的邻居。
 * 每一步都用**真实寻线代价**验收，并强制满足分离约束（不给菱形留位就否掉）。
 */
function coordinatePolish(
  placed: ErPlacement[],
  entities: ErLayoutEntity[],
  rels: ERRelationInput[],
  neighborOf: Map<string, Set<string>>,
  hubIds: string[],
  pinned: string | null,
  budget: number,
): ErPlacement[] {
  const pos = new Map(placed.map((p) => [p.id, { ...p }]))
  const sizeOf = new Map(entities.map((e) => [e.id, estimateEntityWidth(e.label || e.id)]))
  const connected = new Set<string>()
  for (const [a, set] of neighborOf) for (const b of set) connected.add(a < b ? `${a}|${b}` : `${b}|${a}`)
  const ids = entities.map((e) => e.id)

  const violates = (moved: ErPlacement): boolean => {
    const w = sizeOf.get(moved.id) ?? MIN_W
    for (const other of ids) {
      if (other === moved.id) continue
      const p = pos.get(other)
      if (!p) continue
      const ow = sizeOf.get(other) ?? MIN_W
      const key = moved.id < other ? `${moved.id}|${other}` : `${other}|${moved.id}`
      const needH = connected.has(key) ? SEP_H_CONNECTED : SEP_MIN
      const needV = connected.has(key) ? SEP_V_CONNECTED : SEP_MIN
      const gapH = Math.max(p.x - (moved.x + w), moved.x - (p.x + ow))
      const gapV = Math.max(p.y - (moved.y + ER_ENT_H), moved.y - (p.y + ER_ENT_H))
      if (gapH < needH && gapV < needV) return true
    }
    return false
  }

  const snapshot = () => Array.from(pos.values())
  let cost = pixelCost(snapshot(), entities, rels)
  let evals = 0

  /** 提交一组位移（1 个或 2 个实体）：全部合法且更优才接受，否则整体回滚 */
  const tryApply = (moves: { id: string; x: number; y: number }[]): boolean => {
    if (evals >= budget) return false
    const prev: ErPlacement[] = []
    let changed = false
    for (const m of moves) {
      const cur = pos.get(m.id)!
      const nx = Math.round(m.x)
      const ny = Math.round(m.y)
      prev.push(cur)
      if (nx !== cur.x || ny !== cur.y) changed = true
    }
    if (!changed) return false
    evals++
    const next: ErPlacement[] = moves.map((m) => ({ id: m.id, x: Math.round(m.x), y: Math.round(m.y) }))
    next.forEach((p) => pos.set(p.id, p))
    const rollback = () => prev.forEach((p) => pos.set(p.id, p))
    if (next.some((p) => violates(p))) {
      rollback()
      return false
    }
    const c = pixelCost(snapshot(), entities, rels)
    if (c < cost) {
      cost = c
      return true
    }
    rollback()
    return false
  }

  const tryMove = (id: string, x: number, y: number) => tryApply([{ id, x, y }])

  for (let pass = 0; pass < 3; pass++) {
    let improved = false
    for (const id of ids) {
      if (id === pinned) continue
      // ① 吸附对齐：与有联系的实体、以及核对齐 x 或 y
      const refs: string[] = [...(neighborOf.get(id) ?? [])]
      for (const h of hubIds) if (h !== id) refs.push(h)
      for (const r of refs) {
        const rp = pos.get(r)
        if (!rp) continue
        const cur = pos.get(id)!
        if (tryMove(id, rp.x, cur.y)) improved = true
        if (tryMove(id, cur.x, rp.y)) improved = true
      }
      // ② 步长移动（由粗到细，含对角）
      for (const step of COORD_STEPS) {
        const cur = pos.get(id)!
        for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step], [step, step], [step, -step], [-step, step], [-step, -step]]) {
          if (tryMove(id, cur.x + dx, cur.y + dy)) improved = true
        }
      }
    }

    if (!improved) break
  }

  return entities.map((e) => pos.get(e.id)!)
}

// ====== 主入口 ======

export function layoutErEntities(
  entities: ErLayoutEntity[],
  edges: ErLayoutEdge[],
  opts: ErLayoutOptions = {},
): ErPlacement[] {
  const n = entities.length
  if (n === 0) return []
  if (n === 1) return [{ id: entities[0].id, x: START_X, y: START_Y }]

  const indexOf = new Map(entities.map((e, i) => [e.id, i]))
  const g = buildGraph(entities, edges)
  const { adj, degreeOf, hubScore } = g

  // ---- 1. 核：可由调用方指定；否则按核评分取（支持多核）----
  const specified = opts.centerId && adj.has(opts.centerId) ? opts.centerId : undefined
  const byScore = [...entities].sort((a, b) => {
    const s = hubScore(b.id) - hubScore(a.id)
    return s !== 0 ? s : (indexOf.get(a.id) ?? 0) - (indexOf.get(b.id) ?? 0)
  })
  let hubs: ErLayoutEntity[]
  if (specified) {
    hubs = [entities.find((e) => e.id === specified)!]
  } else {
    const maxScore = hubScore(byScore[0].id)
    const threshold = Math.max(1, maxScore * HUB_RATIO)
    hubs = byScore
      .filter((e) => degreeOf(e.id) >= HUB_MIN_DEGREE && hubScore(e.id) >= threshold)
      .slice(0, hubMaxFor(n))
    if (!hubs.length) hubs = [byScore[0]]
  }
  const hubIds = hubs.map((h) => h.id)

  // ---- 2. 多源 BFS：到最近核的跳数 ----
  const depth = new Map<string, number>(hubIds.map((id) => [id, 0]))
  const queue: string[] = [...hubIds]
  while (queue.length) {
    const cur = queue.shift()!
    for (const nb of adj.get(cur)!) {
      if (!depth.has(nb)) {
        depth.set(nb, depth.get(cur)! + 1)
        queue.push(nb)
      }
    }
  }

  // ---- 3. 排序：核优先（按核评分）→ 跳数 → 核评分 → 声明序 ----
  const rank = new Map(hubIds.map((id, i) => [id, i]))
  const ordered = [...entities].sort((a, b) => {
    const ha = rank.has(a.id)
    const hb = rank.has(b.id)
    if (ha !== hb) return ha ? -1 : 1
    if (ha && hb) return rank.get(a.id)! - rank.get(b.id)!
    const da = depth.get(a.id) ?? 99
    const db = depth.get(b.id) ?? 99
    if (da !== db) return da - db
    const s = hubScore(b.id) - hubScore(a.id)
    if (s !== 0) return s
    return (indexOf.get(a.id) ?? 0) - (indexOf.get(b.id) ?? 0)
  })

  // ---- 4. 基准形状：sqrt(n) 定列数（真正的形状选择见下方多起点）----
  const cols = Math.max(3, oddAtLeast(Math.ceil(Math.sqrt(n))))

  // ---- 5. 去重后的联系对（代理代价用）----
  const pairs: [string, string][] = []
  const seen = new Set<string>()
  for (const e of edges) {
    if (e.source === e.target) continue
    if (!adj.has(e.source) || !adj.has(e.target)) continue
    const key = e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push([e.source, e.target])
  }

  // 显式指定的中心实体钉在正中格，不参与交换（否则会被线长优化挪走，失去"指定"意义）
  const pinned = specified ?? null
  const canMove = (id: string) => id !== pinned
  const ids = ordered.map((e) => e.id)

  /**
   * 多起点：网格"形状"（列数）对最终版式影响很大，而 sqrt(n) 只是拍脑袋的经验值。
   * 因此对 3 种候选形状各跑一遍"初始分配 + 代理粗排"，用代理代价挑最好的那个，
   * 再让它独享后面昂贵的真实寻线精修 / 连续坐标微调。
   */
  const shapeCandidates = [...new Set(
    [cols - 2, cols, cols + 2].filter((c) => c >= 3).map((c) => oddAtLeast(c)),
  )]
  let bestShape: { cellOf: Map<string, Cell>; cols: number; allCells: Cell[]; center: Cell; cost: number } | null = null

  for (const c of shapeCandidates) {
    const r = Math.max(3, oddAtLeast(Math.ceil(n / c)))
    const cellsForShape = ringOrderedCells(r, c)
    const shapeCenter = { r: (r - 1) / 2, c: (c - 1) / 2 }
    const shapeCellOf = new Map<string, Cell>()
    ordered.forEach((e, i) => {
      const cell = cellsForShape[i]
      if (cell) shapeCellOf.set(e.id, cell)
    })
    hillClimb(shapeCellOf, {
      ids,
      allCells: cellsForShape,
      costOf: () => proxyCost(shapeCellOf, pairs, hubIds, shapeCenter),
      emptyMove: n <= EMPTYMOVE_MAX_ENTITIES,
      allPairs: n <= ALLPAIRS_MAX_ENTITIES,
      neighborOf: adj,
      maxPasses: REFINE_PASSES,
      evalBudget: proxyBudgetFor(n),
      canMove,
    })
    const cost = proxyCost(shapeCellOf, pairs, hubIds, shapeCenter)
    if (!bestShape || cost < bestShape.cost) {
      bestShape = { cellOf: shapeCellOf, cols: c, allCells: cellsForShape, center: shapeCenter, cost }
    }
  }

  const chosen = bestShape!
  const finalCols = chosen.cols

  // 精修：用真实寻线结果做限量爬山
  const rels = relsOf(edges, chosen.cellOf)
  const tier = POLISH_TIERS.find((t) => n <= t.max)
  if (tier && rels.length > 0) {
    hillClimb(chosen.cellOf, {
      ids,
      allCells: chosen.allCells,
      costOf: () => routedCost(chosen.cellOf, entities, finalCols, rels, hubIds, chosen.center),
      emptyMove: n <= EMPTYMOVE_MAX_ENTITIES,
      allPairs: true,
      neighborOf: adj,
      maxPasses: tier.passes,
      evalBudget: tier.budget,
      canMove,
    })
  }

  // ---- 7. 落坐标 ----
  let placed = cellsToPlacements(chosen.cellOf, entities, finalCols)

  // ---- 8. 连续坐标微调：格子只是起点，实体还能在像素空间移动/对齐 ----
  if (n <= COORD_MAX_ENTITIES && rels.length > 0) {
    placed = coordinatePolish(placed, entities, rels, adj, hubIds, pinned, coordBudgetFor(n))
  }
  return placed
}

/**
 * 按"环序 → 与中心同行/同列优先 → 曼哈顿距离"排好的格子。
 *
 * 用途：把"实体按 BFS 展开的顺序"填进这些格子，就是枢纽居中、邻居围成一圈的版式。
 * 表格型也复用这个排序（见 svgExport 的 erSvgTable）。
 */
export function ringOrderedCells(rows: number, cols: number): Cell[] {
  const cr = (rows - 1) / 2
  const cc = (cols - 1) / 2
  const cells: Cell[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ r, c })
  const ring = (x: Cell) => Math.max(Math.abs(x.r - cr), Math.abs(x.c - cc))
  const manhattan = (x: Cell) => Math.abs(x.r - cr) + Math.abs(x.c - cc)
  const sameAxis = (x: Cell) => (x.r === cr || x.c === cc ? 0 : 1)
  cells.sort((a, b) => {
    if (ring(a) !== ring(b)) return ring(a) - ring(b)
    if (sameAxis(a) !== sameAxis(b)) return sameAxis(a) - sameAxis(b)
    if (manhattan(a) !== manhattan(b)) return manhattan(a) - manhattan(b)
    return a.r - b.r || a.c - b.c
  })
  return cells
}

/** 精修用的联系列表（基数只影响文字落点，给固定值即可） */
function relsOf(edges: ErLayoutEdge[], cellOf: Map<string, Cell>): ERRelationInput[] {
  const rels: ERRelationInput[] = []
  edges.forEach((e, i) => {
    if (e.source === e.target || !cellOf.has(e.source) || !cellOf.has(e.target)) return
    rels.push({ id: `r${i}`, label: '', srcId: e.source, tgtId: e.target, srcCard: '1', tgtCard: 'N' })
  })
  return rels
}
