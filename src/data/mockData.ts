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

/**
 * 多角色版本：给出"整个系统"的完整用例图（全部角色 + 全部用例）。
 *
 * `makeUseCasePreset` 只画单个角色那一份，于是默认图里只见一个角色。
 * 这里把各角色的用例合并去重；被多个角色共享的用例（如"修改密码"）只保留一个节点、
 * 但会得到多条关联 —— 渲染层按角色分块，因此共享用例会在各自的块里各出现一次。
 */
function makeSystemUseCasePreset(
  actors: { id: string; label: string; useCases: { id: string; label: string }[] }[],
): UseCasePreset {
  const nodes: Node<DiagramNodeData>[] = []
  const edges: Edge[] = []
  const jsonNodes: { id: string; type: string; label: string }[] = []
  const jsonEdges: { id: string; source: string; target: string }[] = []
  const seen = new Set<string>()

  for (const a of actors) {
    nodes.push({ id: a.id, type: 'actor', data: { label: a.label }, position: { x: 0, y: 0 } })
    jsonNodes.push({ id: a.id, type: 'actor', label: a.label })
    for (const uc of a.useCases) {
      if (!seen.has(uc.id)) {
        seen.add(uc.id)
        nodes.push({ id: uc.id, type: 'usecase', data: { label: uc.label, rx: 60, ry: 15 }, position: { x: 0, y: 0 } })
        jsonNodes.push({ id: uc.id, type: 'usecase', label: uc.label })
      }
      const eid = `e_${a.id}_${uc.id}`
      edges.push({ id: eid, source: a.id, target: uc.id })
      jsonEdges.push({ id: eid, source: a.id, target: uc.id })
    }
  }

  return {
    actor: nodes[0],
    useCases: nodes.filter((n) => n.type === 'usecase'),
    edges,
    json: JSON.stringify({ nodes: jsonNodes, edges: jsonEdges }, null, 2),
  }
}

export const useCasePresets: Record<string, UseCasePreset> = {
  // 默认展示这一份：整个「公寓报修管理系统」的完整用例图（3 个角色 / 11 个用例）
  system: makeSystemUseCasePreset([
    {
      id: 'a1',
      label: '管理员',
      useCases: [
        { id: 'u1', label: '业主管理' },
        { id: 'u2', label: '维修人员管理' },
        { id: 'u3', label: '公寓设施管理' },
        { id: 'u4', label: '报修服务管理' },
        { id: 'u5', label: '维修服务评价' },
        { id: 'u11', label: '修改密码' },
      ],
    },
    {
      id: 'a2',
      label: '业主',
      useCases: [
        { id: 'u6', label: '个人中心' },
        { id: 'u7', label: '报修服务' },
        { id: 'u8', label: '维修评价' },
        { id: 'u11', label: '修改密码' },
      ],
    },
    {
      id: 'a3',
      label: '维修人员',
      useCases: [
        { id: 'u9', label: '个人资料管理' },
        { id: 'u10', label: '报修服务订单' },
        { id: 'u8', label: '维修评价' },
        { id: 'u11', label: '修改密码' },
      ],
    },
  ]),
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
    {
      id: 'ent_notice', type: 'erEntity', label: '通知公告表', x: 80, y: 40,
      fields: [
        { name: 'notice_id', type: 'INT', pk: true, comment: '公告编号' },
        { name: 'title', type: 'VARCHAR(100)', comment: '标题' },
        { name: 'content', type: 'TEXT', comment: '内容' },
        { name: 'admin_id', type: 'INT', fk: true, comment: '发布人' },
        { name: 'publish_time', type: 'DATETIME', comment: '发布时间' },
      ],
    },
    {
      id: 'ent_admin', type: 'erEntity', label: '管理员表（users）', x: 80, y: 200,
      fields: [
        { name: 'admin_id', type: 'INT', pk: true, comment: '管理员编号' },
        { name: 'username', type: 'VARCHAR(50)', comment: '登录账号' },
        { name: 'password', type: 'VARCHAR(100)', comment: '密码' },
        { name: 'real_name', type: 'VARCHAR(30)', comment: '姓名' },
        { name: 'phone', type: 'VARCHAR(20)', comment: '手机号' },
        { name: 'role', type: 'VARCHAR(20)', comment: '角色' },
      ],
    },
    {
      id: 'ent_meeting', type: 'erEntity', label: '会议记录表', x: 80, y: 360,
      fields: [
        { name: 'meeting_id', type: 'INT', pk: true, comment: '会议编号' },
        { name: 'topic', type: 'VARCHAR(100)', comment: '会议主题' },
        { name: 'content', type: 'TEXT', comment: '会议纪要' },
        { name: 'admin_id', type: 'INT', fk: true, comment: '组织人' },
        { name: 'meeting_time', type: 'DATETIME', comment: '会议时间' },
      ],
    },
    // ===== 中区：部门 / 职位 → 员工主表 =====
    {
      id: 'ent_dept', type: 'erEntity', label: '部门信息表', x: 440, y: 40,
      fields: [
        { name: 'dept_id', type: 'INT', pk: true, comment: '部门编号' },
        { name: 'dept_name', type: 'VARCHAR(50)', comment: '部门名称' },
        { name: 'leader', type: 'VARCHAR(30)', comment: '负责人' },
        { name: 'phone', type: 'VARCHAR(20)', comment: '联系电话' },
      ],
    },
    {
      id: 'ent_position', type: 'erEntity', label: '职位信息表', x: 780, y: 40,
      fields: [
        { name: 'position_id', type: 'INT', pk: true, comment: '职位编号' },
        { name: 'position_name', type: 'VARCHAR(50)', comment: '职位名称' },
        { name: 'level', type: 'INT', comment: '职级' },
        { name: 'base_salary', type: 'DECIMAL(10,2)', comment: '基本工资' },
      ],
    },
    {
      id: 'ent_employee', type: 'erEntity', label: '员工主表（yuangong）', x: 530, y: 250,
      fields: [
        { name: 'emp_id', type: 'INT', pk: true, comment: '员工编号' },
        { name: 'emp_name', type: 'VARCHAR(30)', comment: '姓名' },
        { name: 'gender', type: 'CHAR(1)', comment: '性别' },
        { name: 'phone', type: 'VARCHAR(20)', comment: '手机号' },
        { name: 'dept_id', type: 'INT', fk: true, comment: '所属部门' },
        { name: 'position_id', type: 'INT', fk: true, comment: '职位' },
        { name: 'hire_date', type: 'DATE', comment: '入职日期' },
      ],
    },
    // ===== 右区：员工主表分支 =====
    {
      id: 'ent_salary', type: 'erEntity', label: '工资信息表', x: 1020, y: 40,
      fields: [
        { name: 'salary_id', type: 'INT', pk: true, comment: '工资编号' },
        { name: 'emp_id', type: 'INT', fk: true, comment: '员工编号' },
        { name: 'month', type: 'CHAR(7)', comment: '工资月份' },
        { name: 'base', type: 'DECIMAL(10,2)', comment: '基本工资' },
        { name: 'bonus', type: 'DECIMAL(10,2)', comment: '绩效奖金' },
        { name: 'total', type: 'DECIMAL(10,2)', comment: '实发合计' },
      ],
    },
    {
      id: 'ent_todo', type: 'erEntity', label: '待办事项表', x: 1020, y: 170,
      fields: [
        { name: 'todo_id', type: 'INT', pk: true, comment: '待办编号' },
        { name: 'emp_id', type: 'INT', fk: true, comment: '负责人' },
        { name: 'title', type: 'VARCHAR(100)', comment: '事项' },
        { name: 'status', type: 'TINYINT', comment: '状态' },
        { name: 'due_date', type: 'DATE', comment: '截止日期' },
      ],
    },
    {
      id: 'ent_message', type: 'erEntity', label: '留言板表', x: 1020, y: 300,
      fields: [
        { name: 'msg_id', type: 'INT', pk: true, comment: '留言编号' },
        { name: 'emp_id', type: 'INT', fk: true, comment: '发布人' },
        { name: 'content', type: 'VARCHAR(500)', comment: '留言内容' },
        { name: 'create_time', type: 'DATETIME', comment: '发布时间' },
      ],
    },
    {
      id: 'ent_favorite', type: 'erEntity', label: '收藏记录表', x: 1020, y: 430,
      fields: [
        { name: 'fav_id', type: 'INT', pk: true, comment: '收藏编号' },
        { name: 'emp_id', type: 'INT', fk: true, comment: '收藏人' },
        { name: 'target_type', type: 'VARCHAR(20)', comment: '收藏类型' },
        { name: 'target_id', type: 'INT', comment: '目标编号' },
        { name: 'create_time', type: 'DATETIME', comment: '收藏时间' },
      ],
    },
    // ===== 虚线分组模块 =====
    {
      id: 'ent_sysconfig', type: 'erEntity', label: '系统配置表', x: 80, y: 560, group: 'Spring Boot 系统鉴权与配置模块',
      fields: [
        { name: 'config_id', type: 'INT', pk: true, comment: '配置编号' },
        { name: 'config_key', type: 'VARCHAR(50)', comment: '配置项' },
        { name: 'config_value', type: 'VARCHAR(200)', comment: '配置值' },
        { name: 'remark', type: 'VARCHAR(100)', comment: '说明' },
      ],
    },
    {
      id: 'ent_token', type: 'erEntity', label: 'Token表', x: 440, y: 560, group: 'Spring Boot 系统鉴权与配置模块',
      fields: [
        { name: 'token_id', type: 'INT', pk: true, comment: '令牌编号' },
        { name: 'admin_id', type: 'INT', fk: true, comment: '所属管理员' },
        { name: 'token', type: 'VARCHAR(255)', comment: '令牌串' },
        { name: 'expire_time', type: 'DATETIME', comment: '过期时间' },
        { name: 'create_time', type: 'DATETIME', comment: '签发时间' },
      ],
    },
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

// ====== 时序图：业主提交报修（默认示例）======
// 边标签放在顶层（parseDiagram 会保留），消息类型放在 data.messageType
export const sequenceSystemJson: string = JSON.stringify(
  {
    nodes: [
      { id: 'p_owner', type: 'participant', label: '业主', participantType: 'actor' },
      { id: 'p_web', type: 'participant', label: '报修前端', participantType: 'system' },
      { id: 'p_api', type: 'participant', label: '报修服务', participantType: 'system' },
      { id: 'p_db', type: 'participant', label: '数据库', participantType: 'database' },
      { id: 'p_repairer', type: 'participant', label: '维修人员', participantType: 'actor' },
    ],
    edges: [
      { id: 'm1', source: 'p_owner', target: 'p_web', label: '提交报修申请', data: { messageType: 'sync' } },
      { id: 'm2', source: 'p_web', target: 'p_api', label: 'POST /api/repair', data: { messageType: 'async' } },
      { id: 'm3', source: 'p_api', target: 'p_db', label: '校验设施编号', data: { messageType: 'sync' } },
      { id: 'm4', source: 'p_db', target: 'p_api', label: '返回设施信息', data: { messageType: 'return' } },
      { id: 'm5', source: 'p_api', target: 'p_db', label: '写入报修单', data: { messageType: 'sync' } },
      { id: 'm6', source: 'p_db', target: 'p_api', label: '落库成功', data: { messageType: 'return' } },
      { id: 'm7', source: 'p_api', target: 'p_repairer', label: '推送新工单', data: { messageType: 'async' } },
      { id: 'm8', source: 'p_repairer', target: 'p_api', label: '接单', data: { messageType: 'sync' } },
      { id: 'm9', source: 'p_api', target: 'p_db', label: '更新工单状态', data: { messageType: 'sync' } },
      { id: 'm10', source: 'p_api', target: 'p_web', label: '返回报修单号', data: { messageType: 'return' } },
      { id: 'm11', source: 'p_web', target: 'p_owner', label: '提示提交成功', data: { messageType: 'return' } },
    ],
  },
  null,
  2,
)

// ====== 类图：报修系统领域模型（默认示例）======
export const classSystemJson: string = JSON.stringify(
  {
    nodes: [
      {
        id: 'c_user', type: 'class', label: '用户', isAbstract: true,
        attributes: ['# userId: String', '# name: String', '# phone: String'],
        methods: ['+ login(): boolean', '+ logout(): void'],
      },
      {
        id: 'c_notify', type: 'interface', label: 'Notifiable 可通知', stereotype: 'interface',
        attributes: [],
        methods: ['+ notify(msg: String): void'],
      },
      {
        id: 'c_owner', type: 'class', label: '业主',
        attributes: ['- address: String', '- roomNo: String'],
        methods: ['+ submitRepair(): RepairOrder', '+ review(score: int): void'],
      },
      {
        id: 'c_repairer', type: 'class', label: '维修人员',
        attributes: ['- skillType: String', '- status: int'],
        methods: ['+ acceptOrder(): boolean', '+ finishRepair(): void'],
      },
      {
        id: 'c_admin', type: 'class', label: '管理员',
        attributes: ['- adminLevel: int'],
        methods: ['+ assignOrder(orderId: String): void', '+ manageFacility(): void'],
      },
      {
        id: 'c_order', type: 'class', label: '报修单',
        attributes: ['- orderId: String', '- facilityId: String', '- description: String', '- status: int', '- createTime: Date'],
        methods: ['+ assign(repairerId: String): void', '+ updateStatus(s: int): void'],
      },
      {
        id: 'c_facility', type: 'class', label: '设施',
        attributes: ['- facilityId: String', '- name: String', '- location: String'],
        methods: ['+ getInfo(): String'],
      },
      {
        id: 'c_review', type: 'class', label: '维修评价',
        attributes: ['- reviewId: String', '- score: int', '- content: String'],
        methods: ['+ submit(): void'],
      },
    ],
    edges: [
      { id: 'r1', source: 'c_owner', target: 'c_user', data: { relationType: 'inheritance', label: '' } },
      { id: 'r2', source: 'c_repairer', target: 'c_user', data: { relationType: 'inheritance', label: '' } },
      { id: 'r3', source: 'c_admin', target: 'c_user', data: { relationType: 'inheritance', label: '' } },
      { id: 'r4', source: 'c_owner', target: 'c_notify', data: { relationType: 'implementation', label: '' } },
      { id: 'r5', source: 'c_repairer', target: 'c_notify', data: { relationType: 'implementation', label: '' } },
      { id: 'r6', source: 'c_owner', target: 'c_order', data: { relationType: 'association', label: '提交 1..*' } },
      { id: 'r7', source: 'c_order', target: 'c_facility', data: { relationType: 'association', label: '关联设施' } },
      { id: 'r8', source: 'c_repairer', target: 'c_order', data: { relationType: 'association', label: '处理 0..*' } },
      { id: 'r9', source: 'c_owner', target: 'c_review', data: { relationType: 'association', label: '发表' } },
      { id: 'r10', source: 'c_review', target: 'c_order', data: { relationType: 'dependency', label: '评价' } },
      { id: 'r11', source: 'c_admin', target: 'c_order', data: { relationType: 'dependency', label: '派单' } },
    ],
  },
  null,
  2,
)

// ====== 活动图：报修处理流程（默认示例）======
export const activitySystemJson: string = JSON.stringify(
  {
    nodes: [
      { id: 'a_start', type: 'start', label: '开始' },
      { id: 'a_submit', type: 'action', label: '提交报修申请' },
      { id: 'a_check', type: 'decision', label: '设施是否在保修期' },
      { id: 'a_assign', type: 'action', label: '管理员派单' },
      { id: 'a_paid', type: 'action', label: '转为有偿维修' },
      { id: 'a_visit', type: 'action', label: '维修人员上门维修' },
      { id: 'a_fixed', type: 'decision', label: '是否修复成功' },
      { id: 'a_again', type: 'action', label: '重新派单' },
      { id: 'a_review', type: 'action', label: '业主填写评价' },
      { id: 'a_end', type: 'end', label: '结束' },
    ],
    edges: [
      { id: 'f1', source: 'a_start', target: 'a_submit' },
      { id: 'f3', source: 'a_start', target: 'a_check', data: { guard: '提交后' } },
      { id: 'f4', source: 'a_check', target: 'a_assign', data: { guard: '是' } },
      { id: 'f5', source: 'a_check', target: 'a_paid', data: { guard: '否' } },
      { id: 'f6', source: 'a_assign', target: 'a_visit' },
      { id: 'f7', source: 'a_paid', target: 'a_visit' },
      { id: 'f8', source: 'a_visit', target: 'a_fixed' },
      { id: 'f9', source: 'a_fixed', target: 'a_again', data: { guard: '否' } },
      { id: 'f10', source: 'a_fixed', target: 'a_review', data: { guard: '是' } },
      { id: 'f11', source: 'a_again', target: 'a_visit' },
      { id: 'f12', source: 'a_review', target: 'a_end' },
    ],
  },
  null,
  2,
)

// ====== 部署图：三层架构部署（默认示例）======
export const deploymentSystemJson: string = JSON.stringify(
  {
    nodes: [
      { id: 'd_client', type: 'node', label: '业主/维修人员终端', technology: '浏览器 / 微信小程序' },
      { id: 'd_pkg', type: 'artifact', label: '系统部署包', technology: 'repair-system.jar' },
      { id: 'd_app', type: 'server', label: '应用服务器', technology: 'Spring Boot / Tomcat 9 / JDK17' },
      { id: 'd_db', type: 'database', label: '数据库服务器', technology: 'MySQL 8.0' },
      { id: 'd_file', type: 'component', label: '文件存储', technology: 'MinIO（报修照片）' },
    ],
    edges: [
      { id: 'c1', source: 'd_client', target: 'd_app', label: 'HTTPS' },
      { id: 'c2', source: 'd_app', target: 'd_db', label: 'JDBC / 3306' },
      { id: 'c3', source: 'd_app', target: 'd_file', label: 'S3 API' },
      { id: 'c4', source: 'd_pkg', target: 'd_app', label: '部署' },
    ],
  },
  null,
  2,
)
