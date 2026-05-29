import type { Node, Edge } from '@xyflow/react'
import type { DiagramNodeData } from '../types/diagram'
import { layoutTreeStructure } from './layout'

type DNode = Node<DiagramNodeData>

// ====== Helpers ======

function esc(s: string) {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeLabel(data: Record<string, unknown>): string {
  return (data.label as string) || ''
}

function fontSize(data?: Record<string, unknown>): number {
  return (data?.fontSize as number) || 14
}

function fontFamily(data?: Record<string, unknown>): string {
  return (data?.fontFamily as string) || 'SimSun'
}

function textWidth(s: string, fs: number): number {
  let w = 0
  for (const ch of s) w += ch.charCodeAt(0) > 127 ? fs : fs * 0.6
  return w
}

function bounds(nodes: { x: number; y: number; w?: number; h?: number }[]) {
  if (nodes.length === 0) return { x: 0, y: 0, w: 400, h: 300 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  nodes.forEach((n) => {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + (n.w || 80)); maxY = Math.max(maxY, n.y + (n.h || 30))
  })
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function markerDef(id: string) {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#000"/></marker>`
}

// ====== Use Case SVG ======

export function useCaseSvg(nodes: DNode[], edges: Edge[]): string {
  const groups = new Map<string, { actor: DNode; useCases: DNode[] }>()
  const actors = nodes.filter((n) => n.type === 'actor')
  actors.forEach((a) => {
    const ucIds = new Set(edges.filter((e) => e.source === a.id).map((e) => e.target))
    groups.set(a.id, { actor: a, useCases: nodes.filter((n) => n.type === 'usecase' && ucIds.has(n.id)) })
  })

  const cols = Math.ceil(Math.sqrt(groups.size))
  const cellW = 380; const spacing = 48
  let svg = ''; const boxes: { x: number; y: number; w: number; h: number }[] = []
  let gi = 0

  groups.forEach((g) => {
    const ci = gi % cols; const ri = Math.floor(gi / cols)
    const baseX = ci * cellW; const baseY = ri * 360
    const actorY = baseY + 160
    const ucBlockH = (g.useCases.length - 1) * spacing + 30
    const startY = baseY + 140 - ucBlockH / 2
    const ucCx = baseX + 280
    const maxW = g.useCases.reduce((m, uc) => {
      const lbl = safeLabel(uc.data)
      return Math.max(m, textWidth(lbl, fontSize(uc.data)))
    }, 0)
    const rx = Math.max(55, Math.ceil(maxW / 2) + 18)

    // stick figure
    const ax = baseX + 40; const ay = actorY
    const actorFs = fontSize(g.actor.data)
    const actorFont = esc(fontFamily(g.actor.data))
    svg += `<g stroke="#000" stroke-width="1.5" fill="none"><circle cx="${ax + 27}" cy="${ay + 12}" r="10"/><line x1="${ax + 27}" y1="${ay + 22}" x2="${ax + 27}" y2="${ay + 68}"/><line x1="${ax + 27}" y1="${ay + 40}" x2="${ax}" y2="${ay + 40}"/><line x1="${ax + 27}" y1="${ay + 68}" x2="${ax + 10}" y2="${ay + 102}"/><line x1="${ax + 27}" y1="${ay + 68}" x2="${ax + 44}" y2="${ay + 102}"/></g>`
    svg += `<text x="${ax + 27}" y="${ay + 120}" font-family="${actorFont}" font-size="${actorFs}" text-anchor="middle" fill="#000">${esc(safeLabel(g.actor.data))}</text>`

    // use case ellipses + lines
    g.useCases.forEach((uc, ui) => {
      const ucy = startY + ui * spacing
      const ucFs = fontSize(uc.data)
      const ucFont = esc(fontFamily(uc.data))
      svg += `<line x1="${ax + 55}" y1="${ay + 40}" x2="${ucCx - rx}" y2="${ucy}" stroke="#000" stroke-width="1" marker-end="url(#arrow)"/>`
      svg += `<ellipse cx="${ucCx}" cy="${ucy}" rx="${rx}" ry="15" fill="#fff" stroke="#000" stroke-width="1"/>`
      svg += `<text x="${ucCx}" y="${ucy + ucFs * 0.35}" font-family="${ucFont}" font-size="${ucFs}" text-anchor="middle" fill="#000">${esc(safeLabel(uc.data))}</text>`
    })

    boxes.push({ x: baseX, y: baseY, w: cellW, h: 360 })
    gi++
  })

  const bb = bounds(boxes); const pad = 20
  return wrapSvg(markerDef('arrow') + svg, bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2)
}

// ====== Structure SVG ======

export function structureSvg(nodes: DNode[], edges: Edge[]): string {
  const { nodes: ln } = layoutTreeStructure(nodes, edges)
  const nodeMap = new Map(ln.map((n) => [n.id, n]))
  let svg = ''

  ln.forEach((n) => {
    const x = n.position.x; const y = n.position.y
    const rawLabel = safeLabel(n.data)
    const label = esc(rawLabel)
    const vert = n.data.vertical as boolean
    const fs = (n.data.fontSize as number) || 14
    const ff = esc(fontFamily(n.data))
    const vh = (n.data.nodeH as number) || 110
    const vw = Math.max(18, fs * 1.2)

    if (vert) {
      svg += `<rect x="${x}" y="${y}" width="${vw}" height="${vh}" fill="#fff" stroke="#000" stroke-width="1"/>`
      // vertical text char by char
      const chars = rawLabel.split('')
      const ls = Math.max(1, fs * 0.15)
      const charH = fs + ls
      const startY = y + (vh - chars.length * charH + ls) / 2 + fs * 0.8
      chars.forEach((ch, ci) => {
        svg += `<text x="${x + vw / 2}" y="${startY + ci * charH}" font-family="${ff}" font-size="${fs}" text-anchor="middle" fill="#000">${esc(ch)}</text>`
      })
    } else {
      const h = (n.data.nodeH as number) || (fs * 1.6)
      const w = (n.data.nodeW as number) || n.measured?.width || Math.max(80, label.length * fs * 0.8 + 32)
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#000" stroke-width="1"/>`
      svg += `<text x="${x + w / 2}" y="${y + h / 2 + fs * 0.3}" font-family="${ff}" font-size="${fs}" text-anchor="middle" fill="#000">${label}</text>`
    }
  })

  // step edges
  edges.forEach((e) => {
    const src = nodeMap.get(e.source); const tgt = nodeMap.get(e.target)
    if (!src || !tgt) return
    const sx = src.position.x + ((src.measured?.width as number) || 80) / 2
    const sy = src.position.y + (src.data.vertical ? (src.data.nodeH as number || 110) : ((src.data.nodeH as number) || (src.data.fontSize as number || 14) * 1.6))
    const tx = tgt.position.x + (tgt.data.vertical ? Math.max(18, (tgt.data.fontSize as number || 14) * 1.2) : (tgt.measured?.width as number) || 80) / 2
    const ty = tgt.position.y
    const oy = (ty - sy) / 2
    svg += `<path d="M ${sx} ${sy} L ${sx} ${sy + oy} L ${tx} ${sy + oy} L ${tx} ${ty}" fill="none" stroke="#000" stroke-width="1"/>`
  })

  const bb = bounds(ln.map((n) => {
    const v = n.data.vertical as boolean
    const fs = (n.data.fontSize as number) || 14
    const h = v ? ((n.data.nodeH as number) || 110) : ((n.data.nodeH as number) || fs * 1.6)
    const w = v ? Math.max(18, fs * 1.2) : ((n.data.nodeW as number) || n.measured?.width || 80)
    return { x: n.position.x, y: n.position.y, w, h }
  }))
  return wrapSvg(svg, bb.x - 20, bb.y - 20, bb.w + 40, bb.h + 40)
}

// ====== Entity SVG ======

export function entitySvg(nodes: DNode[], edges: Edge[]): string {
  const entities = nodes.filter((n) => n.type === 'rectangle')
  const cols = Math.ceil(Math.sqrt(entities.length))
  const cellW = 400; const cellH = 400
  const cyOff = 220
  let svg = ''; const boxes: { x: number; y: number; w: number; h: number }[] = []

  entities.forEach((ent, ei) => {
    const ci = ei % cols; const ri = Math.floor(ei / cols)
    const baseX = ci * cellW; const baseY = ri * cellH
    const cx = baseX + 200; const cy = baseY + cyOff
    const entEdges = edges.filter((e) => e.source === ent.id)
    const entFs = fontSize(ent.data)
    const entFont = esc(fontFamily(ent.data))
    const attrIds = new Set(entEdges.map((e) => e.target))
    const attrs = nodes.filter((n) => n.type === 'ellipse' && attrIds.has(n.id))
    const n = attrs.length
    const a = 100 + n * 10; const b = Math.round(a * 0.55)

    // entity rectangle
    const ew = 90; const eh = 36
    svg += `<rect x="${cx - ew / 2}" y="${cy - eh / 2}" width="${ew}" height="${eh}" fill="#fff" stroke="#000" stroke-width="1.5"/>`
    svg += `<text x="${cx}" y="${cy + entFs * 0.35}" font-family="${entFont}" font-size="${entFs}" text-anchor="middle" fill="#000">${esc(safeLabel(ent.data))}</text>`

    // attributes + lines
    attrs.forEach((attr, ai) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * ai) / n
      const ax = cx + a * Math.cos(angle); const ay = cy + b * Math.sin(angle)
      const rx = 45; const ry = 18
      const attrFs = fontSize(attr.data)
      const attrFont = esc(fontFamily(attr.data))
      svg += `<line x1="${cx}" y1="${cy}" x2="${ax}" y2="${ay}" stroke="#000" stroke-width="1.2"/>`
      svg += `<ellipse cx="${ax}" cy="${ay}" rx="${rx}" ry="${ry}" fill="#fff" stroke="#000" stroke-width="1.2"/>`
      svg += `<text x="${ax}" y="${ay + attrFs * 0.35}" font-family="${attrFont}" font-size="${attrFs}" text-anchor="middle" fill="#000">${esc(safeLabel(attr.data))}</text>`
    })

    boxes.push({ x: baseX, y: baseY, w: cellW, h: cellH })
  })

  const bb = bounds(boxes); const pad = 20
  return wrapSvg(svg, bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2)
}

function wrapSvg(content: string, x: number, y: number, w: number, h: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">${content}</svg>`
}

// ====== Sequence SVG ======

export function sequenceSvg(nodes: DNode[], edges: Edge[]): string {
  let svg = ''
  const boxes: { x: number; y: number; w: number; h: number }[] = []
  const participants = nodes.filter(n => n.type === 'participant')
  const spacing = 200
  const startX = 100
  const startY = 50

  // 参与者
  participants.forEach((p, i) => {
    const x = startX + i * spacing
    const y = startY

    svg += `<rect x="${x}" y="${y}" width="120" height="50" fill="#fff" stroke="#000" stroke-width="1.5"/>`
    svg += `<text x="${x + 60}" y="${y + 30}" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#000">${esc(safeLabel(p.data))}</text>`

    // 生命线
    const lifelineX = x + 60
    svg += `<line x1="${lifelineX}" y1="${y + 50}" x2="${lifelineX}" y2="${y + 50 + edges.length * 60 + 100}" stroke="#000" stroke-width="1" stroke-dasharray="5,5"/>`

    boxes.push({ x, y, w: 120, h: 50 + edges.length * 60 + 100 })
  })

  // 消息
  edges.forEach((msg, i) => {
    const srcIdx = participants.findIndex(p => p.id === msg.source)
    const tgtIdx = participants.findIndex(p => p.id === msg.target)
    if (srcIdx === -1 || tgtIdx === -1) return

    const srcX = startX + srcIdx * spacing + 60
    const tgtX = startX + tgtIdx * spacing + 60
    const y = startY + 80 + i * 60

    const msgData = (msg.data as any) || {}
    const msgType = msgData.messageType || 'sync'
    const dashAttr = msgType === 'async' ? ' stroke-dasharray="6,3"' : ''
    svg += `<line x1="${srcX}" y1="${y}" x2="${tgtX}" y2="${y}" stroke="#000" stroke-width="1.5" marker-end="url(#arrow)"${dashAttr}/>`

    // 消息文字标签
    const msgLabel = msgData.label || ''
    if (msgLabel) {
      const midX = (srcX + tgtX) / 2
      svg += `<text x="${midX}" y="${y - 8}" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#333">${esc(msgLabel)}</text>`
    }
  })

  const bb = bounds(boxes)
  const pad = 40
  return wrapSvg(markerDef('arrow') + svg, bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2)
}

// ====== Class SVG ======

export function classSvg(nodes: DNode[], edges: Edge[]): string {
  let svg = ''
  const boxes: { x: number; y: number; w: number; h: number }[] = []
  const cols = Math.ceil(Math.sqrt(nodes.length))
  const spacing = 200
  const startX = 100
  const startY = 60

  // 跟踪节点位置用于边渲染
  const nodeBounds = new Map<string, { cx: number; cy: number; x: number; y: number; w: number; h: number }>()

  nodes.forEach((node, i) => {
    const x = startX + (i % cols) * spacing
    const y = startY + Math.floor(i / cols) * 250
    const width = 180
    const attrs = (node.data as any).attributes || []
    const methods = (node.data as any).methods || []
    const attrHeight = Math.max(attrs.length * 18 + 8, 30)
    const methodHeight = Math.max(methods.length * 18 + 8, 30)
    const totalHeight = 26 + attrHeight + methodHeight

    // 类容器
    svg += `<rect x="${x}" y="${y}" width="${width}" height="${totalHeight}" fill="#fff" stroke="#000" stroke-width="1.5"/>`

    // 类名区域
    svg += `<rect x="${x}" y="${y}" width="${width}" height="26" fill="#f0f0f0" stroke="#000" stroke-width="1"/>`
    svg += `<text x="${x + width / 2}" y="${y + 18}" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#000">${esc(safeLabel(node.data))}</text>`

    // 属性区域
    svg += `<line x1="${x}" y1="${y + 26}" x2="${x + width}" y2="${y + 26}" stroke="#000" stroke-width="1"/>`
    attrs.forEach((attr: string, j: number) => {
      svg += `<text x="${x + 4}" y="${y + 42 + j * 18}" font-family="sans-serif" font-size="10" fill="#000">${esc(attr)}</text>`
    })

    // 方法区域
    svg += `<line x1="${x}" y1="${y + 26 + attrHeight}" x2="${x + width}" y2="${y + 26 + attrHeight}" stroke="#000" stroke-width="1"/>`
    methods.forEach((method: string, j: number) => {
      svg += `<text x="${x + 4}" y="${y + 42 + attrHeight + j * 18}" font-family="sans-serif" font-size="10" fill="#000">${esc(method)}</text>`
    })

    boxes.push({ x, y, w: width, h: totalHeight })
    nodeBounds.set(node.id, { cx: x + width / 2, cy: y + totalHeight / 2, x, y, w: width, h: totalHeight })
  })

  // 渲染类关系边
  const markers: string[] = []
  markers.push(markerDef('arrow'))
  markers.push(`<marker id="hollow-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#fff" stroke="#000" stroke-width="1"/></marker>`)
  markers.push(`<marker id="diamond" viewBox="0 0 12 8" refX="0" refY="4" markerWidth="10" markerHeight="8" orient="auto"><path d="M 0 4 L 6 0 L 12 4 L 6 8 z" fill="#fff" stroke="#000" stroke-width="1"/></marker>`)
  markers.push(`<marker id="filled-diamond" viewBox="0 0 12 8" refX="0" refY="4" markerWidth="10" markerHeight="8" orient="auto"><path d="M 0 4 L 6 0 L 12 4 L 6 8 z" fill="#000" stroke="#000" stroke-width="1"/></marker>`)

  edges.forEach((edge) => {
    const src = nodeBounds.get(edge.source)
    const tgt = nodeBounds.get(edge.target)
    if (!src || !tgt) return

    // 计算从源中心到目标中心的连线，裁剪到节点边界
    const dx = tgt.cx - src.cx
    const dy = tgt.cy - src.cy
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len === 0) return

    // 简化：使用中心连线
    const sx = src.cx
    const sy = src.cy
    const tx = tgt.cx
    const ty = tgt.cy

    const relData = (edge.data as any) || {}
    const relType = relData.relationType || 'association'

    let strokeAttr = 'stroke="#000" stroke-width="1.5"'
    let dashAttr = ''
    let markerStart = ''
    let markerEnd = `marker-end="url(#arrow)"`

    switch (relType) {
      case 'inheritance':
        // 继承：实线 + 空心三角箭头
        markerEnd = `marker-end="url(#hollow-arrow)"`
        break
      case 'implementation':
        // 实现：虚线 + 空心三角箭头
        dashAttr = ' stroke-dasharray="8,4"'
        markerEnd = `marker-end="url(#hollow-arrow)"`
        break
      case 'dependency':
        // 依赖：虚线 + 箭头
        dashAttr = ' stroke-dasharray="8,4"'
        break
      case 'aggregation':
        // 聚合：实线 + 空心菱形（源端）
        markerStart = `marker-start="url(#diamond)"`
        markerEnd = ''
        break
      case 'composition':
        // 组合：实线 + 实心菱形（源端）
        markerStart = `marker-start="url(#filled-diamond)"`
        markerEnd = ''
        break
      default:
        // 关联：实线 + 箭头
        break
    }

    svg += `<line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" ${strokeAttr}${dashAttr} ${markerStart} ${markerEnd}/>`

    // 边标签（如多重性标注）
    const edgeLabel = relData.label || ''
    if (edgeLabel) {
      const midX = (sx + tx) / 2
      const midY = (sy + ty) / 2
      svg += `<text x="${midX}" y="${midY - 6}" font-family="sans-serif" font-size="10" text-anchor="middle" fill="#555">${esc(edgeLabel)}</text>`
    }
  })

  const bb = bounds(boxes)
  const pad = 40
  return wrapSvg(markers.join('') + svg, bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2)
}

// ====== Activity SVG ======

export function activitySvg(nodes: DNode[], edges: Edge[]): string {
  let svg = ''
  const boxes: { x: number; y: number; w: number; h: number }[] = []
  const cols = Math.ceil(Math.sqrt(nodes.length))
  const spacing = 150
  const startX = 100
  const startY = 60

  // 跟踪节点位置用于边渲染
  const nodeBounds = new Map<string, { cx: number; cy: number }>()

  nodes.forEach((node, i) => {
    const x = startX + (i % cols) * spacing
    const y = startY + Math.floor(i / cols) * 120

    switch (node.type) {
      case 'start':
        svg += `<circle cx="${x + 15}" cy="${y + 15}" r="14" fill="#000" stroke="#000" stroke-width="2"/>`
        boxes.push({ x, y, w: 30, h: 30 })
        nodeBounds.set(node.id, { cx: x + 15, cy: y + 15 })
        break
      case 'end':
        svg += `<circle cx="${x + 15}" cy="${y + 15}" r="14" fill="none" stroke="#000" stroke-width="2"/>`
        svg += `<circle cx="${x + 15}" cy="${y + 15}" r="10" fill="#000"/>`
        boxes.push({ x, y, w: 30, h: 30 })
        nodeBounds.set(node.id, { cx: x + 15, cy: y + 15 })
        break
      case 'decision':
        svg += `<polygon points="${x + 30},${y} ${x + 60},${y + 30} ${x + 30},${y + 60} ${x},${y + 30}" fill="#fff" stroke="#000" stroke-width="2"/>`
        svg += `<text x="${x + 30}" y="${y + 35}" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#000">${esc(safeLabel(node.data))}</text>`
        boxes.push({ x, y, w: 60, h: 60 })
        nodeBounds.set(node.id, { cx: x + 30, cy: y + 30 })
        break
      default:
        svg += `<rect x="${x}" y="${y}" width="140" height="50" rx="10" ry="10" fill="#fff" stroke="#000" stroke-width="2"/>`
        svg += `<text x="${x + 70}" y="${y + 30}" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#000">${esc(safeLabel(node.data))}</text>`
        boxes.push({ x, y, w: 140, h: 50 })
        nodeBounds.set(node.id, { cx: x + 70, cy: y + 25 })
    }
  })

  // 渲染活动流程边
  edges.forEach((edge) => {
    const src = nodeBounds.get(edge.source)
    const tgt = nodeBounds.get(edge.target)
    if (!src || !tgt) return

    const flowData = (edge.data as any) || {}
    const flowType = flowData.flowType || flowData.activityEdgeType || 'flow'
    const dashAttr = flowType === 'condition' ? ' stroke-dasharray="6,3"' : ''

    svg += `<line x1="${src.cx}" y1="${src.cy}" x2="${tgt.cx}" y2="${tgt.cy}" stroke="#000" stroke-width="1.5" marker-end="url(#arrow)"${dashAttr}/>`

    // 守卫条件标签
    const guard = flowData.guard || flowData.label || ''
    if (guard) {
      const midX = (src.cx + tgt.cx) / 2
      const midY = (src.cy + tgt.cy) / 2
      svg += `<text x="${midX}" y="${midY - 6}" font-family="sans-serif" font-size="10" text-anchor="middle" fill="#555">${esc(guard)}</text>`
    }
  })

  const bb = bounds(boxes)
  const pad = 40
  return wrapSvg(markerDef('arrow') + svg, bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2)
}

// ====== Deployment SVG ======

export function deploymentSvg(nodes: DNode[], edges: Edge[]): string {
  let svg = ''
  const boxes: { x: number; y: number; w: number; h: number }[] = []
  const cols = Math.ceil(Math.sqrt(nodes.length))
  const spacing = 200
  const startX = 100
  const startY = 60

  // 跟踪节点位置用于边渲染
  const nodeBounds = new Map<string, { cx: number; cy: number }>()

  nodes.forEach((node, i) => {
    const x = startX + (i % cols) * spacing
    const y = startY + Math.floor(i / cols) * 200
    const width = 140
    const height = 100

    switch (node.type) {
      case 'server':
        svg += `<path d="M ${x + 10} ${y + 25} L ${x + 10} ${y + height - 10} L ${x + width - 10} ${y + height - 10} L ${x + width - 10} ${y + 25} L ${x + width / 2} ${y + 5} L ${x + 10} ${y + 25} Z" fill="#fff" stroke="#000" stroke-width="2"/>`
        svg += `<line x1="${x + 10}" y1="${y + 25}" x2="${x + width - 10}" y2="${y + 25}" stroke="#000" stroke-width="1"/>`
        svg += `<text x="${x + width / 2}" y="${y + 60}" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#000">${esc(safeLabel(node.data))}</text>`
        break
      case 'database': {
        const ry = 12
        svg += `<ellipse cx="${x + width / 2}" cy="${y + ry}" rx="${width / 2 - 5}" ry="${ry}" fill="#fff" stroke="#000" stroke-width="2"/>`
        svg += `<line x1="${x + 5}" y1="${y + ry}" x2="${x + 5}" y2="${y + height - ry}" stroke="#000" stroke-width="2"/>`
        svg += `<line x1="${x + width - 5}" y1="${y + ry}" x2="${x + width - 5}" y2="${y + height - ry}" stroke="#000" stroke-width="2"/>`
        svg += `<path d="M ${x + 5} ${y + height - ry} A ${width / 2 - 5} ${ry} 0 0 0 ${x + width - 5} ${y + height - ry}" fill="#fff" stroke="#000" stroke-width="2"/>`
        svg += `<text x="${x + width / 2}" y="${y + height / 2 + 5}" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#000">${esc(safeLabel(node.data))}</text>`
        break
      }
      default:
        svg += `<rect x="${x}" y="${y}" width="120" height="60" fill="#fff" stroke="#000" stroke-width="1.5"/>`
        svg += `<text x="${x + 60}" y="${y + 35}" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#000">${esc(safeLabel(node.data))}</text>`
    }

    boxes.push({ x, y, w: width, h: height })
    nodeBounds.set(node.id, { cx: x + width / 2, cy: y + height / 2 })
  })

  // 渲染部署节点之间的通信路径（虚线）
  edges.forEach((edge) => {
    const src = nodeBounds.get(edge.source)
    const tgt = nodeBounds.get(edge.target)
    if (!src || !tgt) return

    const edgeData = (edge.data as any) || {}
    const edgeType = edgeData.deploymentEdgeType || edgeData.edgeType || 'communication'

    // 通信路径用虚线，关联用实线
    const dashAttr = edgeType === 'communication' ? ' stroke-dasharray="8,4"' : ''

    svg += `<line x1="${src.cx}" y1="${src.cy}" x2="${tgt.cx}" y2="${tgt.cy}" stroke="#000" stroke-width="1.5"${dashAttr}/>`

    // 边标签
    const edgeLabel = edgeData.label || ''
    if (edgeLabel) {
      const midX = (src.cx + tgt.cx) / 2
      const midY = (src.cy + tgt.cy) / 2
      svg += `<text x="${midX}" y="${midY - 6}" font-family="sans-serif" font-size="10" text-anchor="middle" fill="#555">${esc(edgeLabel)}</text>`
    }
  })

  const bb = bounds(boxes)
  const pad = 40
  return wrapSvg(svg, bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2)
}

// ====== ER Diagram SVG (Chen-style) ======

export function erSvg(nodes: DNode[], edges: Edge[]): string {
  const entities = nodes.filter(n => n.type === 'erEntity')
  const diamonds = nodes.filter(n => n.type === 'erDiamond')

  const cols = Math.max(2, Math.ceil(Math.sqrt(entities.length)))
  const cellW = 300
  const cellH = 240
  const entW = 160
  const entH = 46
  const startX = 100
  const startY = 80
  const diaW = 56
  const diaHalf = diaW / 2

  let svg = ''
  const svgBoxes: { x: number; y: number; w: number; h: number }[] = []
  const entityPos = new Map<string, { cx: number; cy: number }>()

  // Entity rectangles
  entities.forEach((ent, i) => {
    const hasAI = ent.data.col !== undefined && ent.data.row !== undefined
    const col = hasAI ? Number(ent.data.col) : (i % cols)
    const row = hasAI ? Number(ent.data.row) : Math.floor(i / cols)
    
    const finalCol = isNaN(col) ? 0 : col
    const finalRow = isNaN(row) ? 0 : row

    const x = startX + finalCol * cellW
    const y = startY + finalRow * cellH
    const cx = x + entW / 2
    const cy = y + entH / 2

    entityPos.set(ent.id, { cx, cy })

    const fs = fontSize(ent.data)
    const ff = esc(fontFamily(ent.data))
    svg += `<rect x="${x}" y="${y}" width="${entW}" height="${entH}" rx="4" fill="#fff" stroke="#000" stroke-width="2"/>`
    svg += `<text x="${cx}" y="${cy + fs * 0.35}" font-family="'SimHei', '${ff}', sans-serif" font-size="${fs}" font-weight="bold" text-anchor="middle" fill="#000">${esc(safeLabel(ent.data))}</text>`

    svgBoxes.push({ x, y, w: entW, h: entH })
  })

  // Group edges by diamond
  const diamondEdgeMap = new Map<string, { srcId: string; tgtId: string; srcCard: string; tgtCard: string }>()
  for (const e of edges) {
    const eData = (e as any).data || {}
    const srcIsDiamond = diamonds.some(d => d.id === e.source)
    const tgtIsDiamond = diamonds.some(d => d.id === e.target)
    if (tgtIsDiamond) {
      const existing = diamondEdgeMap.get(e.target) || { srcId: '', tgtId: '', srcCard: '', tgtCard: '' }
      existing.srcId = e.source
      existing.srcCard = eData.sourceCard || ''
      diamondEdgeMap.set(e.target, existing)
    } else if (srcIsDiamond) {
      const existing = diamondEdgeMap.get(e.source) || { srcId: '', tgtId: '', srcCard: '', tgtCard: '' }
      existing.tgtId = e.target
      existing.tgtCard = eData.targetCard || ''
      diamondEdgeMap.set(e.source, existing)
    }
  }

  const placedDiamonds = new Map<string, number>()

  // Diamond relationships + lines
  diamonds.forEach((dia) => {
    const info = diamondEdgeMap.get(dia.id)
    if (!info) return
    const srcPos = entityPos.get(info.srcId)
    const tgtPos = entityPos.get(info.tgtId)
    if (!srcPos || !tgtPos) return

    let diaCx = (srcPos.cx + tgtPos.cx) / 2
    let diaCy = (srcPos.cy + tgtPos.cy) / 2
    const diaR = 14 // half height

    const dx = Math.abs(srcPos.cx - tgtPos.cx)
    const dy = Math.abs(srcPos.cy - tgtPos.cy)
    if (dx >= cellW * 1.5 && dy < cellH * 0.5) diaCy -= 90
    else if (dy >= cellH * 1.5 && dx < cellW * 0.5) diaCx += 110
    else if (dx >= cellW * 1.5 && dy >= cellH * 1.5) diaCx += 60

    const posKey = `${Math.round(diaCx)},${Math.round(diaCy)}`
    const count = placedDiamonds.get(posKey) || 0
    placedDiamonds.set(posKey, count + 1)
    if (count > 0) diaCy += 45 * count

    // Lines: source entity -> diamond -> target entity
    svg += `<path d="M ${srcPos.cx} ${srcPos.cy} L ${diaCx} ${diaCy}" stroke="#000" stroke-width="2" fill="none"/>`
    svg += `<path d="M ${diaCx} ${diaCy} L ${tgtPos.cx} ${tgtPos.cy}" stroke="#000" stroke-width="2" fill="none"/>`

    // Diamond shape
    svg += `<polygon points="${diaCx},${diaCy - diaR} ${diaCx + diaHalf},${diaCy} ${diaCx},${diaCy + diaR} ${diaCx - diaHalf},${diaCy}" fill="#fff" stroke="#000" stroke-width="2" stroke-linejoin="round"/>`

    // Diamond label
    svg += `<text x="${diaCx}" y="${diaCy + 5}" font-family="'SimHei', 'Heiti SC', sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="#000">${esc(safeLabel(dia.data))}</text>`

    // Cardinality labels with white background for readability
    if (info.srcCard) {
      const lx = srcPos.cx + (diaCx - srcPos.cx) * 0.2
      const ly = srcPos.cy + (diaCy - srcPos.cy) * 0.2 - 10
      svg += `<text x="${lx}" y="${ly}" stroke-linejoin="round" stroke-linecap="round" stroke-width="4" stroke="#fff" paint-order="stroke fill" font-family="Arial, sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="#000">${esc(info.srcCard)}</text>`
    }
    if (info.tgtCard) {
      const lx = tgtPos.cx + (diaCx - tgtPos.cx) * 0.2
      const ly = tgtPos.cy + (diaCy - tgtPos.cy) * 0.2 - 10
      svg += `<text x="${lx}" y="${ly}" stroke-linejoin="round" stroke-linecap="round" stroke-width="4" stroke="#fff" paint-order="stroke fill" font-family="Arial, sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="#000">${esc(info.tgtCard)}</text>`
    }

    svgBoxes.push({ x: diaCx - diaHalf, y: diaCy - diaR, w: diaW, h: diaR * 2 })
  })

  const bb = bounds(svgBoxes)
  const pad = 40
  return wrapSvg(svg, bb.x - pad, bb.y - pad, bb.w + pad * 2, bb.h + pad * 2)
}
