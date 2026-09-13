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

// ====== Overall E-R Diagram Preset (总体ER图) ======

/**
 * 员工管理系统 - 总体ER图默认示例
 * 12 个实体（含 1 个虚线分组模块）+ 8 个联系（菱形）
 * 仅声明实体位置与联系关系，连线/菱形/基数全部由 erRouting 正交寻线引擎自动计算
 */
export const erSystemJson: string = JSON.stringify({
  nodes: [
    // ===== 左区：管理员分支 =====
    { id: 'ent_notice', type: 'erEntity', label: '通知公告表', x: 80, y: 40 },
    { id: 'ent_admin', type: 'erEntity', label: '管理员表（users）', x: 80, y: 200 },
    { id: 'ent_meeting', type: 'erEntity', label: '会议记录表', x: 80, y: 360 },
    // ===== 中区：部门 / 职位 → 员工主表 =====
    { id: 'ent_dept', type: 'erEntity', label: '部门信息表', x: 440, y: 40 },
    { id: 'ent_position', type: 'erEntity', label: '职位信息表', x: 780, y: 40 },
    { id: 'ent_employee', type: 'erEntity', label: '员工主表（yuangong）', x: 530, y: 250 },
    // ===== 右区：员工主表分支 =====
    { id: 'ent_salary', type: 'erEntity', label: '工资信息表', x: 1020, y: 40 },
    { id: 'ent_todo', type: 'erEntity', label: '待办事项表', x: 1020, y: 170 },
    { id: 'ent_message', type: 'erEntity', label: '留言板表', x: 1020, y: 300 },
    { id: 'ent_favorite', type: 'erEntity', label: '收藏记录表', x: 1020, y: 430 },
    // ===== 虚线分组模块 =====
    { id: 'ent_sysconfig', type: 'erEntity', label: '系统配置表', x: 80, y: 560, group: 'Spring Boot 系统鉴权与配置模块' },
    { id: 'ent_token', type: 'erEntity', label: 'Token表', x: 440, y: 560, group: 'Spring Boot 系统鉴权与配置模块' },
    // ===== 联系（仅声明，位置由引擎计算） =====
    { id: 'dia_publish_notice', type: 'erDiamond', label: '发布' },
    { id: 'dia_organize', type: 'erDiamond', label: '组织' },
    { id: 'dia_belong', type: 'erDiamond', label: '归属' },
    { id: 'dia_hold', type: 'erDiamond', label: '担任' },
    { id: 'dia_grant', type: 'erDiamond', label: '发放' },
    { id: 'dia_assign', type: 'erDiamond', label: '分配' },
    { id: 'dia_publish_message', type: 'erDiamond', label: '发布' },
    { id: 'dia_favorite', type: 'erDiamond', label: '收藏' },
  ],
  edges: [
    // 管理员表 1 —— 发布 —— N 通知公告表
    { id: 'e_ent_admin_dia_publish_notice', source: 'ent_admin', target: 'dia_publish_notice', data: { sourceCard: '1', targetCard: '' } },
    { id: 'e_dia_publish_notice_ent_notice', source: 'dia_publish_notice', target: 'ent_notice', data: { sourceCard: '', targetCard: 'N' } },
    // 管理员表 1 —— 组织 —— N 会议记录表
    { id: 'e_ent_admin_dia_organize', source: 'ent_admin', target: 'dia_organize', data: { sourceCard: '1', targetCard: '' } },
    { id: 'e_dia_organize_ent_meeting', source: 'dia_organize', target: 'ent_meeting', data: { sourceCard: '', targetCard: 'N' } },
    // 部门信息表 1 —— 归属 —— N 员工主表
    { id: 'e_ent_dept_dia_belong', source: 'ent_dept', target: 'dia_belong', data: { sourceCard: '1', targetCard: '' } },
    { id: 'e_dia_belong_ent_employee', source: 'dia_belong', target: 'ent_employee', data: { sourceCard: '', targetCard: 'N' } },
    // 职位信息表 1 —— 担任 —— N 员工主表
    { id: 'e_ent_position_dia_hold', source: 'ent_position', target: 'dia_hold', data: { sourceCard: '1', targetCard: '' } },
    { id: 'e_dia_hold_ent_employee', source: 'dia_hold', target: 'ent_employee', data: { sourceCard: '', targetCard: 'N' } },
    // 员工主表 1 —— 发放 —— N 工资信息表
    { id: 'e_ent_employee_dia_grant', source: 'ent_employee', target: 'dia_grant', data: { sourceCard: '1', targetCard: '' } },
    { id: 'e_dia_grant_ent_salary', source: 'dia_grant', target: 'ent_salary', data: { sourceCard: '', targetCard: 'N' } },
    // 员工主表 1 —— 分配 —— N 待办事项表
    { id: 'e_ent_employee_dia_assign', source: 'ent_employee', target: 'dia_assign', data: { sourceCard: '1', targetCard: '' } },
    { id: 'e_dia_assign_ent_todo', source: 'dia_assign', target: 'ent_todo', data: { sourceCard: '', targetCard: 'N' } },
    // 员工主表 1 —— 发布 —— N 留言板表
    { id: 'e_ent_employee_dia_publish_message', source: 'ent_employee', target: 'dia_publish_message', data: { sourceCard: '1', targetCard: '' } },
    { id: 'e_dia_publish_message_ent_message', source: 'dia_publish_message', target: 'ent_message', data: { sourceCard: '', targetCard: 'N' } },
    // 员工主表 1 —— 收藏 —— N 收藏记录表
    { id: 'e_ent_employee_dia_favorite', source: 'ent_employee', target: 'dia_favorite', data: { sourceCard: '1', targetCard: '' } },
    { id: 'e_dia_favorite_ent_favorite', source: 'dia_favorite', target: 'ent_favorite', data: { sourceCard: '', targetCard: 'N' } },
  ],
}, null, 2)
