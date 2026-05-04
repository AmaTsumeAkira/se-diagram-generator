import type { Edge, Node } from '@xyflow/react'
import type { DiagramNodeData } from '../types/diagram'

// ====== Use Case Diagram Presets ======
export interface UseCasePreset {
  actor: Node<DiagramNodeData>
  useCases: Node<DiagramNodeData>[]
  edges: Edge[]
  json: string
}

function makeUseCasePreset(
  actorId: string,
  actorLabel: string,
  useCaseDefs: { id: string; label: string }[]
): UseCasePreset {
  const actor: Node<DiagramNodeData> = {
    id: actorId,
    type: 'actor',
    data: { label: actorLabel },
    position: { x: 0, y: 0 },
  }
  const useCases: Node<DiagramNodeData>[] = useCaseDefs.map((uc) => ({
    id: uc.id,
    type: 'usecase',
    data: { label: uc.label, rx: 60, ry: 15 },
    position: { x: 0, y: 0 },
  }))
  const edges: Edge[] = useCaseDefs.map((uc, i) => ({
    id: `e${i}`,
    source: actorId,
    target: uc.id,
  }))

  const allNodes = [
    { id: actorId, type: 'actor', label: actorLabel },
    ...useCaseDefs.map((uc) => ({
      id: uc.id,
      type: 'usecase',
      label: uc.label,
      rx: 60,
      ry: 15,
    })),
  ]
  const allEdges = edges.map((e) => ({ id: e.id, source: e.source, target: e.target }))

  return {
    actor,
    useCases,
    edges,
    json: JSON.stringify({ nodes: allNodes, edges: allEdges }, null, 2),
  }
}

export const useCasePresets: Record<string, UseCasePreset> = {
  admin: makeUseCasePreset('a1', '管理员', [
    { id: 'u1', label: '业主管理' },
    { id: 'u2', label: '维修人员管理' },
    { id: 'u3', label: '公寓设施管理' },
    { id: 'u4', label: '报修服务管理' },
    { id: 'u5', label: '维修服务评价' },
    { id: 'u6', label: '修改密码' },
  ]),
  owner: makeUseCasePreset('a2', '业主', [
    { id: 'u1', label: '个人中心' },
    { id: 'u2', label: '报修服务' },
    { id: 'u3', label: '维修评价' },
    { id: 'u4', label: '修改密码' },
  ]),
  repairer: makeUseCasePreset('a3', '维修人员', [
    { id: 'u1', label: '个人资料管理' },
    { id: 'u2', label: '报修服务订单' },
    { id: 'u3', label: '维修评价' },
    { id: 'u4', label: '修改密码' },
  ]),
}

// ====== System Functional Structure Diagram ======
export const structureNodes: Node<DiagramNodeData>[] = [
  // Level 1
  { id: 'root', type: 'rectangle', data: { label: '公寓报修管理系统' }, position: { x: 0, y: 0 } },
  // Level 2
  { id: 'm1', type: 'rectangle', data: { label: '管理员' }, position: { x: 0, y: 0 } },
  { id: 'm2', type: 'rectangle', data: { label: '业主' }, position: { x: 0, y: 0 } },
  { id: 'm3', type: 'rectangle', data: { label: '维修人员' }, position: { x: 0, y: 0 } },
  // Level 3 - vertical text nodes
  { id: 'm1a', type: 'rectangle', data: { label: '业主管理', vertical: true }, position: { x: 0, y: 0 } },
  { id: 'm1b', type: 'rectangle', data: { label: '维修人员管理', vertical: true }, position: { x: 0, y: 0 } },
  { id: 'm1c', type: 'rectangle', data: { label: '公寓设施管理', vertical: true }, position: { x: 0, y: 0 } },
  { id: 'm1d', type: 'rectangle', data: { label: '报修服务管理', vertical: true }, position: { x: 0, y: 0 } },
  { id: 'm1e', type: 'rectangle', data: { label: '维修服务评价', vertical: true }, position: { x: 0, y: 0 } },
  { id: 'm1f', type: 'rectangle', data: { label: '修改密码', vertical: true }, position: { x: 0, y: 0 } },
  { id: 'm2a', type: 'rectangle', data: { label: '个人中心', vertical: true }, position: { x: 0, y: 0 } },
  { id: 'm2b', type: 'rectangle', data: { label: '报修服务', vertical: true }, position: { x: 0, y: 0 } },
  { id: 'm2c', type: 'rectangle', data: { label: '维修评价', vertical: true }, position: { x: 0, y: 0 } },
  { id: 'm2d', type: 'rectangle', data: { label: '修改密码', vertical: true }, position: { x: 0, y: 0 } },
  { id: 'm3a', type: 'rectangle', data: { label: '个人资料管理', vertical: true }, position: { x: 0, y: 0 } },
  { id: 'm3b', type: 'rectangle', data: { label: '报修服务订单', vertical: true }, position: { x: 0, y: 0 } },
  { id: 'm3c', type: 'rectangle', data: { label: '维修评价', vertical: true }, position: { x: 0, y: 0 } },
  { id: 'm3d', type: 'rectangle', data: { label: '修改密码', vertical: true }, position: { x: 0, y: 0 } },
]

export const structureEdges: Edge[] = [
  // Root → Level 2
  { id: 's1', source: 'root', target: 'm1' },
  { id: 's2', source: 'root', target: 'm2' },
  { id: 's3', source: 'root', target: 'm3' },
  // m1 → Level 3
  { id: 's4', source: 'm1', target: 'm1a' },
  { id: 's5', source: 'm1', target: 'm1b' },
  { id: 's6', source: 'm1', target: 'm1c' },
  { id: 's7', source: 'm1', target: 'm1d' },
  { id: 's8', source: 'm1', target: 'm1e' },
  { id: 's9', source: 'm1', target: 'm1f' },
  // m2 → Level 3
  { id: 's10', source: 'm2', target: 'm2a' },
  { id: 's11', source: 'm2', target: 'm2b' },
  { id: 's12', source: 'm2', target: 'm2c' },
  { id: 's13', source: 'm2', target: 'm2d' },
  // m3 → Level 3
  { id: 's14', source: 'm3', target: 'm3a' },
  { id: 's15', source: 'm3', target: 'm3b' },
  { id: 's16', source: 'm3', target: 'm3c' },
  { id: 's17', source: 'm3', target: 'm3d' },
]

export function makeStructureJson(): string {
  const nodes = [
    { id: 'root', type: 'rectangle', label: '公寓报修管理系统' },
    { id: 'm1', type: 'rectangle', label: '管理员' },
    { id: 'm2', type: 'rectangle', label: '业主' },
    { id: 'm3', type: 'rectangle', label: '维修人员' },
    { id: 'm1a', type: 'rectangle', label: '业主管理', vertical: true },
    { id: 'm1b', type: 'rectangle', label: '维修人员管理', vertical: true },
    { id: 'm1c', type: 'rectangle', label: '公寓设施管理', vertical: true },
    { id: 'm1d', type: 'rectangle', label: '报修服务管理', vertical: true },
    { id: 'm1e', type: 'rectangle', label: '维修服务评价', vertical: true },
    { id: 'm1f', type: 'rectangle', label: '修改密码', vertical: true },
    { id: 'm2a', type: 'rectangle', label: '个人中心', vertical: true },
    { id: 'm2b', type: 'rectangle', label: '报修服务', vertical: true },
    { id: 'm2c', type: 'rectangle', label: '维修评价', vertical: true },
    { id: 'm2d', type: 'rectangle', label: '修改密码', vertical: true },
    { id: 'm3a', type: 'rectangle', label: '个人资料管理', vertical: true },
    { id: 'm3b', type: 'rectangle', label: '报修服务订单', vertical: true },
    { id: 'm3c', type: 'rectangle', label: '维修评价', vertical: true },
    { id: 'm3d', type: 'rectangle', label: '修改密码', vertical: true },
  ]
  const edges = [
    { id: 's1', source: 'root', target: 'm1' },
    { id: 's2', source: 'root', target: 'm2' },
    { id: 's3', source: 'root', target: 'm3' },
    { id: 's4', source: 'm1', target: 'm1a' }, { id: 's5', source: 'm1', target: 'm1b' },
    { id: 's6', source: 'm1', target: 'm1c' }, { id: 's7', source: 'm1', target: 'm1d' },
    { id: 's8', source: 'm1', target: 'm1e' }, { id: 's9', source: 'm1', target: 'm1f' },
    { id: 's10', source: 'm2', target: 'm2a' }, { id: 's11', source: 'm2', target: 'm2b' },
    { id: 's12', source: 'm2', target: 'm2c' }, { id: 's13', source: 'm2', target: 'm2d' },
    { id: 's14', source: 'm3', target: 'm3a' }, { id: 's15', source: 'm3', target: 'm3b' },
    { id: 's16', source: 'm3', target: 'm3c' }, { id: 's17', source: 'm3', target: 'm3d' },
  ]
  return JSON.stringify({ nodes, edges }, null, 2)
}

// ====== Entity-Attribute Diagram Presets ======
export interface EntityPreset {
  entity: Node<DiagramNodeData>
  attributes: Node<DiagramNodeData>[]
  edges: Edge[]
}

/**
 * 用户实体属性图 - 10 个属性，36° 精准等距环绕
 * 椭圆轨道: a=200, b=110
 */
export const userEntityPreset: EntityPreset = {
  entity: {
    id: 'user',
    type: 'rectangle',
    data: { label: '用户' },
    position: { x: 0, y: 0 },
  },
  attributes: [
    { id: 'ua1', type: 'ellipse', data: { label: '入住时间', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
    { id: 'ua2', type: 'ellipse', data: { label: '房产地址', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
    { id: 'ua3', type: 'ellipse', data: { label: '添加时间', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
    { id: 'ua4', type: 'ellipse', data: { label: '用户名', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
    { id: 'ua5', type: 'ellipse', data: { label: '姓名', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
    { id: 'ua6', type: 'ellipse', data: { label: '性别', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
    { id: 'ua7', type: 'ellipse', data: { label: '手机', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
    { id: 'ua8', type: 'ellipse', data: { label: '身份证', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
    { id: 'ua9', type: 'ellipse', data: { label: '头像', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
    { id: 'ua10', type: 'ellipse', data: { label: '备注', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
  ],
  edges: [
    { id: 'ue1', source: 'user', target: 'ua1' }, { id: 'ue2', source: 'user', target: 'ua2' },
    { id: 'ue3', source: 'user', target: 'ua3' }, { id: 'ue4', source: 'user', target: 'ua4' },
    { id: 'ue5', source: 'user', target: 'ua5' }, { id: 'ue6', source: 'user', target: 'ua6' },
    { id: 'ue7', source: 'user', target: 'ua7' }, { id: 'ue8', source: 'user', target: 'ua8' },
    { id: 'ue9', source: 'user', target: 'ua9' }, { id: 'ue10', source: 'user', target: 'ua10' },
  ],
}

/**
 * 维修人员实体属性图 - 7 个属性，~51.4° 精准等距环绕
 * 椭圆轨道: a=165, b=90
 */
export const repairerEntityPreset: EntityPreset = {
  entity: {
    id: 'repairer',
    type: 'rectangle',
    data: { label: '维修人员' },
    position: { x: 0, y: 0 },
  },
  attributes: [
    { id: 'ra1', type: 'ellipse', data: { label: '邮箱', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
    { id: 'ra2', type: 'ellipse', data: { label: '照片', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
    { id: 'ra3', type: 'ellipse', data: { label: '专业技能', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
    { id: 'ra4', type: 'ellipse', data: { label: '添加时间', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
    { id: 'ra5', type: 'ellipse', data: { label: '账号', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
    { id: 'ra6', type: 'ellipse', data: { label: '名字', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
    { id: 'ra7', type: 'ellipse', data: { label: '电话', rx: 45, ry: 18 }, position: { x: 0, y: 0 } },
  ],
  edges: [
    { id: 're1', source: 'repairer', target: 'ra1' }, { id: 're2', source: 'repairer', target: 'ra2' },
    { id: 're3', source: 'repairer', target: 'ra3' }, { id: 're4', source: 'repairer', target: 'ra4' },
    { id: 're5', source: 'repairer', target: 'ra5' }, { id: 're6', source: 'repairer', target: 'ra6' },
    { id: 're7', source: 'repairer', target: 'ra7' },
  ],
}

export function makeEntityJson(preset: EntityPreset): string {
  const nodes = [
    { id: preset.entity.id, type: 'rectangle', label: preset.entity.data.label },
    ...preset.attributes.map((a) => ({
      id: a.id,
      type: 'ellipse',
      label: a.data.label,
      rx: 45,
      ry: 18,
    })),
  ]
  const edges = preset.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
  }))
  return JSON.stringify({ nodes, edges }, null, 2)
}
