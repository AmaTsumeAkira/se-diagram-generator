/**
 * ER 图正交寻线引擎
 *
 * 输入：实体盒 + 联系列表（只描述“谁连谁”）
 * 输出：每条联系的正交折线、菱形落点、基数文字落点
 *
 * 策略（由简到繁，取第一个无障碍方案）：
 *   1. 直线     —— 源/目标同行或同列时直接贯通
 *   2. Z 型干线 —— 源实体就近引出“脊线”→ 竖直/水平公共干线 → 分支进入目标
 *      （同一实体同一侧联系共用干线，形成参考图那种整齐的“总线 + 分叉”）
 *   3. 外绕     —— 目标前方被其它实体遮挡时，绕到其上方/下方再俯冲进入
 *   4. 兜底     —— 单折 L 型
 *
 * 全程做障碍检测，菱形与基数文字自动避让，保证不压实体、不互相重叠。
 */

export interface ERBoxInput {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface ERRelationInput {
  id: string
  label: string
  srcId: string
  tgtId: string
  srcCard: string
  tgtCard: string
}

export interface ERRoutedRelation {
  id: string
  label: string
  /** 正交折线（源实体边缘 → … → 目标实体边缘） */
  points: number[][]
  /** 菱形中心落点 */
  diamond: { x: number; y: number }
  /** 源端基数文字落点（全局放置前为 null） */
  srcCardAt: { x: number; y: number } | null
  /** 目标端基数文字落点（全局放置前为 null） */
  tgtCardAt: { x: number; y: number } | null
}

interface Box {
  id: string
  x: number
  y: number
  r: number
  b: number
  cx: number
  cy: number
}

interface Rect {
  id: string
  x: number
  y: number
  r: number
  b: number
}

/** 实体边缘到干线的默认间距 */
const GAP = 40
/** 障碍膨胀，避免线贴边 */
const PAD = 10
/** 菱形落点的安全边距（比连线更小，便于在贴近目标的分支段上落脚） */
const PAD_DIA = 3
/** 判定同行/同列的阈值 */
const EPS = 6
/** 菱形尺寸 */
const DW = 56
const DH = 32
/** 绕行走廊距整体外框的距离 */
const MARGIN = 36

const toBox = (b: ERBoxInput): Box => ({
  id: b.id,
  x: b.x,
  y: b.y,
  r: b.x + b.w,
  b: b.y + b.h,
  cx: b.x + b.w / 2,
  cy: b.y + b.h / 2,
})

/**
 * 障碍命中计数（返回命中数，语义与原实现完全一致）。
 *
 * 原实现是"每个候选路径 × 每个线段 × 全部障碍"的三重循环，障碍数一多就成瓶颈
 * （实测 60 实体 4.1ms/次寻线）。这里改成**均匀网格空间索引**：
 * 线段只查询它经过的那几格，命中约 1~3 个障碍 —— 结果不变，快一个数量级。
 */
export interface RectHitCounter {
  count(pts: number[][], exclude: Set<string>): number
}

function buildRectIndex(rects: Rect[], cell = 180): RectHitCounter {
  if (!rects.length) return { count: () => 0 }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const r of rects) {
    if (r.x < minX) minX = r.x
    if (r.y < minY) minY = r.y
    if (r.r > maxX) maxX = r.r
    if (r.b > maxY) maxY = r.b
  }
  const cols = Math.max(1, Math.ceil((maxX - minX) / cell) + 1)
  const rows = Math.max(1, Math.ceil((maxY - minY) / cell) + 1)
  const buckets: number[][] = Array.from({ length: cols * rows }, () => [])
  const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

  rects.forEach((r, i) => {
    const c0 = clamp(Math.floor((r.x - minX) / cell), 0, cols - 1)
    const c1 = clamp(Math.floor((r.r - minX) / cell), 0, cols - 1)
    const r0 = clamp(Math.floor((r.y - minY) / cell), 0, rows - 1)
    const r1 = clamp(Math.floor((r.b - minY) / cell), 0, rows - 1)
    for (let rr = r0; rr <= r1; rr++) {
      for (let cc = c0; cc <= c1; cc++) buckets[rr * cols + cc].push(i)
    }
  })

  // 用时间戳去重：同一障碍在多个格子里出现时，同一线段只算一次
  const stamp = new Int32Array(rects.length).fill(-1)
  let tick = 0

  return {
    count(pts, exclude) {
      let hits = 0
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i]
        const [x2, y2] = pts[i + 1]
        const segMinX = Math.min(x1, x2)
        const segMaxX = Math.max(x1, x2)
        const segMinY = Math.min(y1, y2)
        const segMaxY = Math.max(y1, y2)
        tick++
        // 正交线段只会落在同一行或同一列的少数格里
        const c0 = clamp(Math.floor((segMinX - minX) / cell), 0, cols - 1)
        const c1 = clamp(Math.floor((segMaxX - minX) / cell), 0, cols - 1)
        const r0 = clamp(Math.floor((segMinY - minY) / cell), 0, rows - 1)
        const r1 = clamp(Math.floor((segMaxY - minY) / cell), 0, rows - 1)
        for (let rr = r0; rr <= r1; rr++) {
          const base = rr * cols
          for (let cc = c0; cc <= c1; cc++) {
            const bucket = buckets[base + cc]
            for (let k = 0; k < bucket.length; k++) {
              const idx = bucket[k]
              if (stamp[idx] === tick) continue
              stamp[idx] = tick
              const o = rects[idx]
              if (exclude.size && exclude.has(o.id)) continue
              if (!(segMaxX < o.x || segMinX > o.r || segMaxY < o.y || segMinY > o.b)) hits++
            }
          }
        }
      }
      return hits
    },
  }
}

/** 已路由的线段（用于"避让已有连线"） */
interface PlacedSeg {
  h: boolean
  k: number
  a: number
  b: number
}

function segsOf(pts: number[][]): PlacedSeg[] {
  const out: PlacedSeg[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    const h = Math.abs(y1 - y2) < 0.5
    out.push({
      h,
      k: h ? y1 : x1,
      a: Math.min(h ? x1 : y1, h ? x2 : y2),
      b: Math.max(h ? x1 : y1, h ? x2 : y2),
    })
  }
  return out
}

/**
 * "已路由线段"的空间索引（可变，边路由边加）。
 *
 * 直接两两比较是 O(候选段 × 已路由段)：n=80 时已路由段累积到 ~470 条，
 * 每次寻线要多出几百万次比较 —— 这是加了避让项之后最大的性能坑。
 * 用均匀网格把已路由段分桶，查询时只看线段经过的那几格，退回到 O(1~3)。
 */
class PlacedSegIndex {
  private buckets = new Map<string, PlacedSeg[]>()

  private static key(cx: number, cy: number) {
    return `${cx},${cy}`
  }

  private static span(seg: PlacedSeg): { c0: number; c1: number; r0: number; r1: number } {
    const cell = 180
    if (seg.h) {
      return {
        c0: Math.floor(seg.a / cell),
        c1: Math.floor(seg.b / cell),
        r0: Math.floor((seg.k - 1) / cell),
        r1: Math.floor((seg.k + 1) / cell),
      }
    }
    return {
      c0: Math.floor((seg.k - 1) / cell),
      c1: Math.floor((seg.k + 1) / cell),
      r0: Math.floor(seg.a / cell),
      r1: Math.floor(seg.b / cell),
    }
  }

  add(segs: PlacedSeg[]): void {
    for (const seg of segs) {
      const { c0, c1, r0, r1 } = PlacedSegIndex.span(seg)
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const k = PlacedSegIndex.key(c, r)
          const list = this.buckets.get(k)
          if (list) list.push(seg)
          else this.buckets.set(k, [seg])
        }
      }
    }
  }

  /** 全部已路由线段（去重）—— 标注打分用 */
  all(): PlacedSeg[] {
    const out: PlacedSeg[] = []
    const seen = new Set<PlacedSeg>()
    for (const list of this.buckets.values()) {
      for (const seg of list) {
        if (seen.has(seg)) continue
        seen.add(seg)
        out.push(seg)
      }
    }
    return out
  }

  count(pts: number[][]): number {
    if (!this.buckets.size) return 0
    let n = 0
    const seen = new Set<PlacedSeg>()
    for (const seg of segsOf(pts)) {
      const { c0, c1, r0, r1 } = PlacedSegIndex.span(seg)
      seen.clear()
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const list = this.buckets.get(PlacedSegIndex.key(c, r))
          if (!list) continue
          for (const t of list) {
            if (seen.has(t) || seg.h === t.h) continue
            seen.add(t)
            const H = seg.h ? seg : t
            const V = seg.h ? t : seg
            if (V.k > H.a + 1 && V.k < H.b - 1 && H.k > V.a + 1 && H.k < V.b - 1) n++
          }
        }
      }
    }
    return n
  }
}

/** 合并相邻重复点 */
function dedupe(pts: number[][]): number[][] {
  const out: number[][] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && Math.abs(last[0] - p[0]) < 0.5 && Math.abs(last[1] - p[1]) < 0.5) continue
    out.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10])
  }
  return out
}

/** 是否全程正交 */
function isOrtho(pts: number[][]): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    if (Math.abs(pts[i][0] - pts[i + 1][0]) > 0.5 && Math.abs(pts[i][1] - pts[i + 1][1]) > 0.5) return false
  }
  return true
}

/** 基数文字离开实体盒后的净空 */
const CARD_CLEAR = 12
/** 落在实体盒外之后再沿路径多推的余量 */
const CARD_PUSH = 10
/** 同一对实体的多条联系之间，平行车道的间距（需大于实体半高 + 菱形半高 + 余量） */
const LANE_GAP = 48
/** 车道候选在实体两侧的引出段长度 */
const LANE_STUB = 24
/** 平行车道候选偏移（按需递增，取第一个不与既有折线重叠的方案） */
const LANE_OFFSETS = [LANE_GAP, -LANE_GAP, LANE_GAP * 2, -LANE_GAP * 2]
/** 与同对实体既有折线重叠的代价（须大于"多绕两个弯"的代价，才会主动分道） */
const LANE_PENALTY = 45
/** 外绕走廊的代价：按引擎既定策略（直线 → 干线 → 外绕 → 兜底），外绕应排在干线之后 */
const CORRIDOR_PENALTY = 30
/**
 * 与"已路由连线"相交的惩罚。
 * 寻线是逐条进行的，此前每条只关心障碍，对其它连线一无所知 —— 于是"各走各的"必然产生交叉。
 * 加这一项后，候选路线会主动绕开已经画好的线。实测 60 / 200 / 600 对计算结果完全相同，
 * 取 200 是因为它还能把「直接铺网格渲染」这条路径上的 5 个交叉一起消掉；
 * 而 200 远小于避障的 1000，所以永远不会为了避让而穿过实体。
 */
const CROSS_PENALTY = 200

/** 一条正交片段：h=是否水平，k=固定坐标（水平记 y / 垂直记 x），[a,b]=变化区间 */
interface OrthoSeg {
  h: boolean
  k: number
  a: number
  b: number
}

function pathSegs(pts: number[][]): OrthoSeg[] {
  const segs: OrthoSeg[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    const h = Math.abs(y1 - y2) < 0.5
    segs.push({
      h,
      k: Math.round(h ? y1 : x1),
      a: Math.round(Math.min(h ? x1 : y1, h ? x2 : y2)),
      b: Math.round(Math.max(h ? x1 : y1, h ? x2 : y2)),
    })
  }
  return segs
}

/** 共线重叠长度（不同轴/不同坐标 → 0） */
function overlapLen(s1: OrthoSeg, s2: OrthoSeg): number {
  if (s1.h !== s2.h || Math.abs(s1.k - s2.k) > 0.5) return 0
  return Math.min(s1.b, s2.b) - Math.max(s1.a, s2.a)
}

/**
 * 与"同一对实体的既有折线"共线重叠的片段数。
 * 必须用共线区间判定而非端点相等：像 [[start],[T.cx,S.cy],[T.cx,T.cy]] 这类
 * 折向目标中心的候选，会与直线候选在视觉上完全重合，但端点并不相同。
 * MIN_OVERLAP 用于忽略每条联系都有的、贴近实体的短引出段。
 */
const MIN_OVERLAP = 40

function countShared(pts: number[][], used: OrthoSeg[]): number {
  if (used.length === 0) return 0
  let n = 0
  for (const s of pathSegs(pts)) {
    if (used.some((u) => overlapLen(s, u) > MIN_OVERLAP)) n++
  }
  return n
}

/**
 * 从折线的某一端向内推进，找到第一个落在实体盒（外扩 margin）之外的点，
 * 再多推 gap 作为基数文字锚点。
 *
 * 之所以要"走出实体盒"：本引擎的多数候选路径终点落在实体中心，
 * 实体又是图层最上层（白底不透明），若按固定距离（如 30px）回退，
 * 文字会落进实体框里被完全遮住。
 */
export function anchorOutside(
  pts: number[][],
  fromStart: boolean,
  box: { x: number; y: number; r: number; b: number },
  margin = CARD_CLEAR,
  gap = CARD_PUSH,
): { x: number; y: number; horizontal: boolean } {
  if (pts.length < 2) {
    const p = pts[0] || [0, 0]
    return { x: p[0], y: p[1], horizontal: true }
  }
  const seq = fromStart ? pts : [...pts].reverse()
  const outside = (x: number, y: number) =>
    x < box.x - margin || x > box.r + margin || y < box.y - margin || y > box.b + margin

  for (let i = 0; i < seq.length - 1; i++) {
    const [x1, y1] = seq[i]
    const [x2, y2] = seq[i + 1]
    const segLen = Math.hypot(x2 - x1, y2 - y1)
    if (segLen < 0.5) continue
    const ux = (x2 - x1) / segLen
    const uy = (y2 - y1) / segLen
    const steps = Math.max(2, Math.ceil(segLen / 3))
    for (let k = 1; k <= steps; k++) {
      const t = k / steps
      const px = x1 + (x2 - x1) * t
      const py = y1 + (y2 - y1) * t
      if (outside(px, py)) {
        return { x: px + ux * gap, y: py + uy * gap, horizontal: Math.abs(ux) >= Math.abs(uy) }
      }
    }
  }
  // 极端情况：整条路径都在盒内 —— 沿末端方向硬推出去
  const last = seq[seq.length - 1]
  const prev = seq[seq.length - 2]
  const d = Math.hypot(last[0] - prev[0], last[1] - prev[1]) || 1
  const ux = (last[0] - prev[0]) / d
  const uy = (last[1] - prev[1]) / d
  return { x: last[0] + ux * (margin + gap), y: last[1] + uy * (margin + gap), horizontal: Math.abs(ux) >= Math.abs(uy) }
}

/**
 * 自环路径（source === target）：从实体某侧引出，绕到上方/下方再回到本框。
 * 返回障碍最少的候选，四个方向依次尝试。
 */
function selfLoopPath(S: Box, obs: RectHitCounter, exclude: Set<string>, placed: PlacedSegIndex): number[][] | null {
  const OUT = 34
  const RISE = 48
  const off = Math.min(10, S.b - S.y) / 2
  const cands: number[][][] = [
    [[S.r, S.cy - off], [S.r + OUT, S.cy - off], [S.r + OUT, S.y - RISE], [S.cx, S.y - RISE], [S.cx, S.y]],
    [[S.r, S.cy + off], [S.r + OUT, S.cy + off], [S.r + OUT, S.b + RISE], [S.cx, S.b + RISE], [S.cx, S.b]],
    [[S.x, S.cy - off], [S.x - OUT, S.cy - off], [S.x - OUT, S.y - RISE], [S.cx, S.y - RISE], [S.cx, S.y]],
    [[S.x, S.cy + off], [S.x - OUT, S.cy + off], [S.x - OUT, S.b + RISE], [S.cx, S.b + RISE], [S.cx, S.b]],
  ]
  let best: number[][] | null = null
  let bestScore = Infinity
  cands.forEach((c, i) => {
    const pts = dedupe(c)
    if (pts.length < 2 || !isOrtho(pts)) return
    const score = obs.count(pts, exclude) * 1000 + placed.count(pts) * CROSS_PENALTY + i
    if (score < bestScore) {
      bestScore = score
      best = pts
    }
  })
  return best
}

/**
 * 为一组联系计算正交路径与落点。
 * @param boxesIn 实体盒（绝对坐标）
 * @param rels 联系列表
 */
export interface RouteOptions {
  /**
   * 跳过基数标注的放置。布局评估只需要"路径 + 菱形落点"，
   * 而标注放置是这里最贵的一段（候选多、每条联系都要比较），跳过可大幅提速。
   */
  skipCards?: boolean
}

export function routeRelations(boxesIn: ERBoxInput[], rels: ERRelationInput[], opts: RouteOptions = {}): ERRoutedRelation[] {
  const boxes = boxesIn.map(toBox)
  if (boxes.length === 0) return []
  const byId = new Map(boxes.map((b) => [b.id, b]))
  const obstacles: Rect[] = boxes.map((b) => ({
    id: b.id, x: b.x - PAD, y: b.y - PAD, r: b.r + PAD, b: b.b + PAD,
  }))
  const diaObstacles: Rect[] = boxes.map((b) => ({
    id: b.id, x: b.x - PAD_DIA, y: b.y - PAD_DIA, r: b.r + PAD_DIA, b: b.b + PAD_DIA,
  }))
  // 障碍命中用空间索引（结果与逐一遍历一致，见 buildRectIndex 注释）
  const obstacleIndex = buildRectIndex(obstacles)
  // 已路由的连线片段：让后续连线主动避让（否则各走各的必然交叉）。用空间索引加速查询。
  const placedSegs = new PlacedSegIndex()

  const minX = Math.min(...boxes.map((b) => b.x))
  const maxX = Math.max(...boxes.map((b) => b.r))
  const minY = Math.min(...boxes.map((b) => b.y))
  const maxY = Math.max(...boxes.map((b) => b.b))
  const outerTop = minY - MARGIN
  const outerBottom = maxY + MARGIN
  const outerLeft = minX - MARGIN
  const outerRight = maxX + MARGIN

  const out: ERRoutedRelation[] = []
  const placedDiamonds: { x: number; y: number }[] = []
  const cardJobs: CardJob[] = []
  // 已启用的干线坐标（竖直干线记 x，水平干线记 y），用于鼓励复用、形成整齐的总线
  const usedX: number[] = []
  const usedY: number[] = []
  // 同一对实体（src->tgt）已用过的路径片段与车道序号：
  // 用于让"同一对实体之间的多条联系"错开成平行车道，而不是完全重叠。
  const pairUsedSegs = new Map<string, OrthoSeg[]>()
  const pairLane = new Map<string, number>()

  for (const rel of rels) {
    const S = byId.get(rel.srcId)
    const T = byId.get(rel.tgtId)
    if (!S || !T) continue

    // 自反联系（source === target）：走自环，不再静默丢弃
    const selfRef = S.id === T.id
    const obs = new Set([S.id, T.id])

    // 同一对实体的第 n 条联系 → 第 n 条平行车道
    const pairKey = `${rel.srcId}->${rel.tgtId}`
    const usedSegs = pairUsedSegs.get(pairKey) || []
    const lane = pairLane.get(pairKey) || 0

    // 候选路径：横向与纵向两套方案一起评估，并鼓励复用已有干线
    interface Cand {
      pts: number[][]
      trunk?: { axis: 'x' | 'y'; coord: number }
      /** 策略优先级代价：外绕等"兜底"方案应排在直线/干线之后 */
      penalty?: number
    }
    const candidates: Cand[] = []

    if (selfRef) {
      const loop = selfLoopPath(S, obstacleIndex, obs, placedSegs)
      if (loop) candidates.push({ pts: loop })
    }

    // —— 横向主导：出口在左右侧，干线为竖直 ——
    if (!selfRef) {
      const dir = T.cx - S.cx >= 0 ? 1 : -1
      const start: number[] = [dir > 0 ? S.r : S.x, S.cy]
      const end: number[] = [dir > 0 ? T.x : T.r, T.cy]
      // 源/目标已共线时，Z 型干线与"折向目标中心"都会退化成同一条直线，不再生成
      const collinear = Math.abs(T.cy - S.cy) < EPS
      if (collinear) candidates.push({ pts: [start, end] })

      // 平行车道（置于绕行方案之前，同分时优先分道，而不是贴边绕过）
      if (lane > 0) {
        const j1 = dir > 0 ? S.r + LANE_STUB : S.x - LANE_STUB
        const j2 = dir > 0 ? T.x - LANE_STUB : T.r + LANE_STUB
        const okSpan = dir > 0 ? j2 - j1 > 8 : j1 - j2 > 8
        if (okSpan) {
          for (const off of LANE_OFFSETS) {
            candidates.push({
              pts: [start, [j1, S.cy], [j1, S.cy + off], [j2, S.cy + off], [j2, T.cy], end],
              trunk: { axis: 'x', coord: j1 },
            })
          }
        }
      }

      if (!collinear) {
        const ta = dir > 0 ? S.r + GAP : S.x - GAP
        const tb = dir > 0 ? T.x - 30 : T.r + 30
        const span = tb - ta
        if (dir > 0 ? span > 10 : span < -10) {
          for (let k = 1; k <= 6; k++) {
            const tx = ta + span * (k / 6)
            candidates.push({ pts: [start, [tx, S.cy], [tx, T.cy], end], trunk: { axis: 'x', coord: tx } })
          }
        }
      }

      const ox = dir > 0 ? S.r + GAP : S.x - GAP
      for (const corr of [T.y - 46, T.b + 46, outerTop, outerBottom]) {
        const entY = corr < T.y ? T.y : T.b
        candidates.push({ pts: [start, [ox, S.cy], [ox, corr], [T.cx, corr], [T.cx, entY]], penalty: CORRIDOR_PENALTY })
      }
      if (!collinear) candidates.push({ pts: [start, [T.cx, S.cy], [T.cx, T.cy]] })
    }

    // —— 纵向主导：出口在上下侧，干线为水平 ——
    if (!selfRef) {
      const dir = T.cy - S.cy >= 0 ? 1 : -1
      const start: number[] = [S.cx, dir > 0 ? S.b : S.y]
      const end: number[] = [T.cx, dir > 0 ? T.y : T.b]
      const collinear = Math.abs(T.cx - S.cx) < EPS
      if (collinear) candidates.push({ pts: [start, end] })

      if (lane > 0) {
        const j1 = dir > 0 ? S.b + LANE_STUB : S.y - LANE_STUB
        const j2 = dir > 0 ? T.y - LANE_STUB : T.b + LANE_STUB
        const okSpan = dir > 0 ? j2 - j1 > 8 : j1 - j2 > 8
        if (okSpan) {
          for (const off of LANE_OFFSETS) {
            candidates.push({
              pts: [start, [S.cx, j1], [S.cx + off, j1], [S.cx + off, j2], [T.cx, j2], end],
              trunk: { axis: 'y', coord: j1 },
            })
          }
        }
      }

      if (!collinear) {
        const ta = dir > 0 ? S.b + GAP : S.y - GAP
        const tb = dir > 0 ? T.y - 30 : T.b + 30
        const span = tb - ta
        if (dir > 0 ? span > 10 : span < -10) {
          for (let k = 1; k <= 6; k++) {
            const ty = ta + span * (k / 6)
            candidates.push({ pts: [start, [S.cx, ty], [T.cx, ty], end], trunk: { axis: 'y', coord: ty } })
          }
        }
      }

      const oy = dir > 0 ? S.b + GAP : S.y - GAP
      for (const corr of [T.x - 46, T.r + 46, outerLeft, outerRight]) {
        const entX = corr < T.x ? T.x : T.r
        candidates.push({ pts: [start, [S.cx, oy], [corr, oy], [corr, T.cy], [entX, T.cy]], penalty: CORRIDOR_PENALTY })
      }
      if (!collinear) candidates.push({ pts: [start, [S.cx, T.cy], [T.cx, T.cy]] })
    }

    // 选路：障碍最少 → 弯数最少 → 越靠前越优先 → 复用已有干线 → 避免与同对实体的既有折线重叠
    let chosen: number[][] | null = null
    let chosenTrunk: { axis: 'x' | 'y'; coord: number } | undefined
    let bestScore = Infinity
    for (let idx = 0; idx < candidates.length; idx++) {
      const c = candidates[idx]
      const pts = dedupe(c.pts)
      if (pts.length < 2 || !isOrtho(pts)) continue
      const hits = obstacleIndex.count(pts, obs)
      const bends = pts.length - 2
      let shared = 0
      const tk = c.trunk
      if (tk) {
        const pool = tk.axis === 'x' ? usedX : usedY
        if (pool.some((v) => Math.abs(v - tk.coord) <= 6)) shared = 1
      }
      const overlap = countShared(pts, usedSegs)
      const crossings = placedSegs.count(pts)
      const score = hits * 1000 + bends * 10 + idx * 0.5 - shared * 3 + overlap * LANE_PENALTY + crossings * CROSS_PENALTY + (c.penalty ?? 0)
      if (score < bestScore) {
        bestScore = score
        chosen = pts
        chosenTrunk = tk
      }
    }
    const pts = chosen
    if (!pts) continue
    if (chosenTrunk) {
      const pool = chosenTrunk.axis === 'x' ? usedX : usedY
      if (!pool.some((v) => Math.abs(v - chosenTrunk!.coord) <= 6)) pool.push(chosenTrunk.coord)
    }
    // 记录本对实体已用片段与车道序号，供后续同对联系避让
    pairUsedSegs.set(pairKey, [...usedSegs, ...pathSegs(pts)])
    pairLane.set(pairKey, lane + 1)
    // 记为"已路由"，供后续连线避让
    placedSegs.add(segsOf(pts))

    // ---- 菱形落点：跳过首段（公共脊线），优先末段 ----
    const segs: { x1: number; y1: number; x2: number; y2: number; len: number; i: number; horizontal: boolean }[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i]
      const [x2, y2] = pts[i + 1]
      segs.push({
        x1, y1, x2, y2,
        len: Math.abs(x2 - x1) + Math.abs(y2 - y1),
        i,
        horizontal: Math.abs(y1 - y2) < 0.5,
      })
    }
    const lastIdx = segs.length - 1
    const lastLen = segs[lastIdx] ? segs[lastIdx].len : 0
    // 排序：末段（贴近目标，且长度足够）优先 → 中间段按长度 → 首段为共用脊线，最后兜底
    const pool = [...segs].sort((a, b) => {
      const rank = (s: { i: number; len: number }) =>
        s.i === lastIdx && lastLen >= 44 ? 0 : (s.i === 0 ? 2 : 1)
      const ra = rank(a)
      const rb = rank(b)
      if (ra !== rb) return ra - rb
      return b.len - a.len
    })

    let diamond: { x: number; y: number } | null = null
    for (const s of pool) {
      if (s.len < 24) continue
      for (const t of [0.5, 0.6, 0.4, 0.7, 0.3, 0.2, 0.15, 0.8]) {
        const x = s.x1 + (s.x2 - s.x1) * t
        const y = s.y1 + (s.y2 - s.y1) * t
        const bx = { x: x - DW / 2, y: y - DH / 2, r: x + DW / 2, b: y + DH / 2 }
        if (diaObstacles.some((o) => !(bx.r < o.x || bx.x > o.r || bx.b < o.y || bx.y > o.b))) continue
        if (placedDiamonds.some((p) => Math.abs(p.x - x) < DW + 6 && Math.abs(p.y - y) < DH + 6)) continue
        diamond = { x, y }
        break
      }
      if (diamond) break
    }
    if (!diamond) {
      // 兜底 1：全段重扫一遍，扩大 t 采样范围
      const wide = [0.5, 0.6, 0.4, 0.7, 0.3, 0.8, 0.2, 0.9, 0.1]
      for (const s of segs) {
        if (s.len < 20 || diamond) continue
        for (const t of wide) {
          const x = s.x1 + (s.x2 - s.x1) * t
          const y = s.y1 + (s.y2 - s.y1) * t
          const bx = { x: x - DW / 2, y: y - DH / 2, r: x + DW / 2, b: y + DH / 2 }
          if (diaObstacles.some((o) => !(bx.r < o.x || bx.x > o.r || bx.b < o.y || bx.y > o.b))) continue
          if (placedDiamonds.some((p) => Math.abs(p.x - x) < DW + 6 && Math.abs(p.y - y) < DH + 6)) continue
          diamond = { x, y }
          break
        }
      }
    }
    if (!diamond) {
      // 兜底 2【关键】：沿末段法线方向按菱形尺寸递增探测，保证落点唯一。
      // 旧实现这里把 pick 固定回 0.5，导致同一对实体的多条联系菱形完全重叠、标签互相遮盖。
      const ls = segs[segs.length - 1]
      const mx = (ls.x1 + ls.x2) / 2
      const my = (ls.y1 + ls.y2) / 2
      const horiz = Math.abs(ls.x2 - ls.x1) >= Math.abs(ls.y2 - ls.y1)
      const stepY = DH + 10
      const stepX = DW + 10
      // 探测半径要够大：长标签会让列很宽、主表周围十几个菱形互相竞争，
      // 只探 6 步（±396px）在极端情况下会探不到空位。
      outer: for (let k = 0; k <= 24; k++) {
        for (const sgn of k === 0 ? [0] : [1, -1]) {
          const x = horiz ? mx + sgn * stepX * k : mx
          const y = horiz ? my : my + sgn * stepY * k
          const bx = { x: x - DW / 2, y: y - DH / 2, r: x + DW / 2, b: y + DH / 2 }
          if (diaObstacles.some((o) => !(bx.r < o.x || bx.x > o.r || bx.b < o.y || bx.y > o.b))) continue
          if (placedDiamonds.some((p) => Math.abs(p.x - x) < DW + 6 && Math.abs(p.y - y) < DH + 6)) continue
          diamond = { x, y }
          break outer
        }
      }
      if (!diamond) {
        // 真的一处空位都没有（几乎不可能）：取"离所有已有菱形最远"的那个候选，而不是硬放回中点
        let best = { x: mx, y: my }
        let bestD = -1
        for (let k = 0; k <= 24; k++) {
          for (const sgn of k === 0 ? [0] : [1, -1]) {
            const x = horiz ? mx + sgn * (DW + 10) * k : mx
            const y = horiz ? my : my + sgn * (DH + 10) * k
            let d = Infinity
            for (const p of placedDiamonds) d = Math.min(d, Math.hypot(p.x - x, p.y - y))
            if (d > bestD) {
              bestD = d
              best = { x, y }
            }
          }
        }
        diamond = best
      }
    }
    placedDiamonds.push(diamond)

    // 基数标注先登记，等所有路径与菱形都定好后再全局放置（见 placeAllCards）
    if (rel.srcCard) cardJobs.push({ relId: rel.id, end: 'src', text: rel.srcCard, pts, box: S })
    if (rel.tgtCard) cardJobs.push({ relId: rel.id, end: 'tgt', text: rel.tgtCard, pts: [...pts].reverse(), box: T })

    out.push({ id: rel.id, label: rel.label, points: pts, diamond, srcCardAt: null, tgtCardAt: null })
  }

  // ---- 全局放置基数标注（布局评估时可跳过）----
  if (!opts.skipCards) placeAllCards(cardJobs, obstacleIndex, placedDiamonds, placedSegs, out)

  return out
}

/** 待放置的基数标注 */
interface CardJob {
  relId: string
  end: 'src' | 'tgt'
  text: string
  /** 折线，方向一律"从所属实体向外" */
  pts: number[][]
  /** 所属实体盒（标注要贴着它、且在它外面） */
  box: Box
}

/** 标注文本的估算宽度（与渲染端 14px 字号一致） */
function cardTextWidth(text: string): number {
  let w = 0
  for (const ch of text) w += ch.charCodeAt(0) > 127 ? 14 : 8.4
  return w
}

/** 折线上距起点 dist 处的点与局部垂直方向 */
function pointAlong(pts: number[][], dist: number): { x: number; y: number; nx: number; ny: number } | null {
  let acc = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    const L = Math.hypot(x2 - x1, y2 - y1)
    if (L < 0.5) continue
    if (acc + L >= dist) {
      const t = (dist - acc) / L
      const ux = (x2 - x1) / L
      const uy = (y2 - y1) / L
      return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, nx: -uy, ny: ux }
    }
    acc += L
  }
  return null
}

/**
 * 全局放置基数标注（1 / N / M / 0..N …）。
 *
 * 旧做法是"每条联系各自找个位置、撞了就往一个方向推 15px"，于是主表周围十几个标注
 * 会被整体推成一列，既远离自己的线、也分不清属于哪条联系。
 *
 * 现在的做法：
 *   · 候选点只沿**自己的折线**由近及远采样（16 → 245px），再沿线的法向小幅偏移；
 *   · 打分 = 与已放标注的距离 + 与菱形的距离 + 偏离本线的代价 + 离实体远近；
 *   · 先放"可选位置最少"的标注（受限者优先），避免最后无处可放；
 *   · 卡片文字带白色描边（渲染端已有），压到线上也仍可读。
 */
function placeAllCards(
  jobs: CardJob[],
  obstacleIndex: RectHitCounter,
  placedDiamonds: { x: number; y: number }[],
  placedSegs: PlacedSegIndex,
  out: ERRoutedRelation[],
): void {
  if (!jobs.length) return
  const along = [14, 22, 32, 45, 62, 84, 112, 150, 200]
  const offs = [-13, 13, -24, 24, 0]
  const placed: { x: number; y: number; w: number }[] = []
  const emptySet = new Set<string>()
  const placedSegList = placedSegs.all()

  const scoreOf = (x: number, y: number, w: number, offIdx: number, alongIdx: number): number | null => {
    const hw = w / 2 + 3
    const hh = 10
    // 压到实体？（把标注的小盒子当成退化的折线段查询，索引里已外扩 PAD=10，天然留出净空）
    if (obstacleIndex.count([[x - hw, y], [x + hw, y]], emptySet) > 0) return null
    let score = offIdx * 6 + alongIdx * 3
    for (const p of placed) {
      const dx = Math.abs(p.x - x)
      const dy = Math.abs(p.y - y)
      const needX = hw + p.w / 2 + 5
      const needY = 19
      if (dx < needX && dy < needY) {
        // 梯度罚分：越近罚得越多，鼓励把标注彼此拉开
        score += 300 + (needX - dx) * 14 + (needY - dy) * 9
      }
    }
    for (const d of placedDiamonds) {
      const dx = Math.abs(d.x - x)
      const dy = Math.abs(d.y - y)
      const needX = 28 + hw
      if (dx < needX && dy < 19) score += 240 + (needX - dx) * 10 + (19 - dy) * 7
    }
    // 压在其它联系线上：有白色描边，扣分但不禁止
    let onLine = 0
    for (const s of placedSegList) {
      if (s.h && Math.abs(s.k - y) < 7 && x + hw > s.a && x - hw < s.b) onLine++
      if (!s.h && Math.abs(s.k - x) < 7 && y + hh > s.a && y - hh < s.b) onLine++
    }
    score += Math.min(onLine, 4) * 12
    return score
  }

  // 受限者优先：先算每个标注有几个可用候选，少的先放
  const plans = jobs.map((job) => {
    const w = cardTextWidth(job.text)
    const cands: { x: number; y: number; offIdx: number; alongIdx: number; base: number }[] = []
    for (let ai = 0; ai < along.length; ai++) {
      const p = pointAlong(job.pts, along[ai])
      if (!p) break
      for (let oi = 0; oi < offs.length; oi++) {
        const o = offs[oi]
        cands.push({ x: p.x + p.nx * o, y: p.y + p.ny * o, offIdx: oi, alongIdx: ai, base: 0 })
      }
    }
    return { job, w, cands }
  })
  const order = plans
    .map((plan, i) => ({ i, n: plan.cands.length }))
    .sort((a, b) => a.n - b.n)
    .map((x) => x.i)

  const result = new Map<string, { src?: { x: number; y: number }; tgt?: { x: number; y: number } }>()
  for (const idx of order) {
    const { job, w, cands } = plans[idx]
    let best: { x: number; y: number } | null = null
    let bestScore = Infinity
    for (const c of cands) {
      const s = scoreOf(c.x, c.y, w, c.offIdx, c.alongIdx)
      if (s === null) continue
      if (s < bestScore) {
        bestScore = s
        best = { x: c.x, y: c.y }
      }
    }
    // 兜底：全部候选都不行时，用离实体最近的那个点
    if (!best && cands.length) best = { x: cands[0].x, y: cands[0].y }
    if (!best) continue
    placed.push({ x: best.x, y: best.y, w })
    const entry = result.get(job.relId) || {}
    if (job.end === 'src') entry.src = best
    else entry.tgt = best
    result.set(job.relId, entry)
  }

  for (const r of out) {
    const e = result.get(r.id)
    if (e?.src) r.srcCardAt = e.src
    if (e?.tgt) r.tgtCardAt = e.tgt
  }
}

/**
 * 从菱形节点 + 边集合解析出统一的联系列表；
 * 同时收集“显式折线”（手动覆盖）关系。
 */
export function collectERRelations(
  diamonds: { id: string; label: string }[],
  edges: { id: string; source: string; target: string; data?: Record<string, unknown> }[]
): { relations: ERRelationInput[]; manual: Map<string, number[][]> } {
  const relations: ERRelationInput[] = []
  const manual = new Map<string, number[][]>()

  for (const dia of diamonds) {
    const relId = dia.id.replace(/^(dia_)+/, '')
    // 显式几何：单条完整折线 e_<relId>
    const lineEdge = edges.find((e) => e.id === `e_${relId}`)
    if (lineEdge) {
      const d = lineEdge.data || {}
      relations.push({
        id: relId,
        label: dia.label,
        srcId: lineEdge.source,
        tgtId: lineEdge.target,
        srcCard: (d.sourceCard as string) || '1',
        tgtCard: (d.targetCard as string) || 'N',
      })
      const line = d.line as number[][] | undefined
      if (Array.isArray(line) && line.length >= 2) manual.set(relId, line)
      continue
    }
    // 自动模式：实体 -> 菱形 -> 实体
    const inEdge = edges.find((e) => e.target === dia.id)
    const outEdge = edges.find((e) => e.source === dia.id)
    if (inEdge && outEdge) {
      relations.push({
        id: relId,
        label: dia.label,
        srcId: inEdge.source,
        tgtId: outEdge.target,
        srcCard: (inEdge.data?.sourceCard as string) || '1',
        tgtCard: (outEdge.data?.targetCard as string) || 'N',
      })
    }
  }

  return { relations, manual }
}
