/**
 * 本地（不依赖 AI）的 ER 中文命名与关系动词推断
 *
 * 策略，逐级回退：
 *   表名：SQL 注释（COMMENT / COMMENT ON TABLE / 建表语句上方的 `-- 注释`）
 *        → 内置业务词表（按 `_` 切词逐段翻译）
 *        → 保留原始表名
 *   联系名：外键列注释 → 外键列名动词表 → 兜底「关联」
 *
 * 词表是"够用就好"的显式数据，可直接增删；未命中的词不会被猜，一律保留原文。
 */

/** 表名业务词表（键为小写单词或常见复数形式） */
export const TABLE_WORDS: Record<string, string> = {
  // 组织与人员
  user: '用户', account: '账户', member: '会员', customer: '客户', client: '客户',
  employee: '员工', staff: '员工', worker: '工人', person: '人员', people: '人员',
  admin: '管理员', manager: '主管', leader: '负责人', owner: '所有者',
  role: '角色', permission: '权限', auth: '鉴权', menu: '菜单', resource: '资源',
  dept: '部门', department: '部门', org: '组织', organization: '组织', company: '公司',
  branch: '分部', team: '团队', group: '分组', position: '职位', job: '职位', title: '职称',
  profile: '档案', info: '信息', detail: '明细',
  // 业务单据
  order: '订单', order_item: '订单明细', item: '条目', product: '商品', goods: '商品',
  category: '分类', type: '类型', brand: '品牌', spec: '规格', stock: '库存',
  warehouse: '仓库', supplier: '供应商', vendor: '供应商', purchase: '采购',
  sale: '销售', contract: '合同', invoice: '发票', payment: '付款', pay: '支付',
  refund: '退款', balance: '余额', salary: '薪资', wage: '工资', bonus: '奖金',
  project: '项目', plan: '计划', task: '任务', todo: '待办', schedule: '日程',
  // 办公协同
  notice: '通知', announcement: '公告', news: '新闻', article: '文章', post: '帖子',
  message: '留言', msg: '消息', board: '留言板', comment: '评论', reply: '回复',
  meeting: '会议', room: '会议室', calendar: '日历', attendance: '考勤', leave: '请假',
  favorite: '收藏', collect: '收藏', tag: '标签', label: '标签', file: '文件',
  attachment: '附件', document: '文档', doc: '文档', image: '图片', photo: '照片',
  // 系统
  token: '令牌', session: '会话', config: '配置', setting: '设置', settings: '设置',
  system: '系统', log: '日志', operation: '操作', audit: '审计', record: '记录',
  history: '历史', flow: '流程', process: '流程', approval: '审批', status: '状态',
  address: '地址', region: '地区', area: '区域', city: '城市', province: '省份',
  // 教育 / 医疗等常见毕设域
  student: '学生', teacher: '教师', course: '课程', grade: '成绩', score: '成绩',
  exam: '考试', question: '题目', answer: '答案', class: '班级', school: '学校',
  book: '图书', borrow: '借阅', reader: '读者', patient: '病人', doctor: '医生',
  medicine: '药品', prescription: '处方', appointment: '预约', bed: '床位',
  car: '车辆', vehicle: '车辆', driver: '司机', route: '路线', ticket: '票',
  seat: '座位', hotel: '酒店', travel: '行程', tour: '旅游',
}

/** 外键列名 → 联系动词（源端是"一"侧，读作「父 动词 子」，如 部门 拥有 员工） */
export const FK_VERBS: Record<string, string> = {
  manager: '管理', supervisor: '管理', leader: '管理', parent: '包含', pid: '包含',
  owner: '拥有', creator: '创建', author: '创建', publisher: '发布', founder: '创建',
  operator: '操作', handler: '处理', approver: '审批', auditor: '审核',
  sender: '发送', from: '发送', receiver: '接收', to: '接收',
  teacher: '教授', student: '选修', customer: '购买', buyer: '购买', seller: '出售',
  dept: '拥有', department: '拥有', org: '拥有', role: '拥有', user: '拥有',
  category: '包含', type: '分类', status: '关联', project: '包含', order: '包含',
}

/** 简单复数还原 */
function singular(w: string): string {
  if (w.endsWith('ies') && w.length > 3) return `${w.slice(0, -3)}y`
  if (/(ch|sh|ss|x|z)es$/.test(w)) return w.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 2) return w.slice(0, -1)
  return w
}

function lookupWord(w: string): string | undefined {
  const k = w.toLowerCase()
  return TABLE_WORDS[k] ?? TABLE_WORDS[singular(k)]
}

/** 表名 → 中文名（按 `_` / 驼峰切词逐段翻译，未命中段保留原文） */
export function translateTableName(name: string): string {
  const cleaned = name.replace(/[`"[\]]/g, '').trim()
  if (!cleaned) return name
  // 去掉 schema 前缀
  const base = cleaned.includes('.') ? cleaned.split('.').pop()! : cleaned
  if (/[\u4e00-\u9fa5]/.test(base)) return base
  const normalized = base.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  const parts = normalized.split(/[_\-\s]+/).filter(Boolean)
  if (!parts.length) return base
  const mapped = parts.map((p) => lookupWord(p))
  // 整段命中才拼接中文（user_role → 用户角色）
  if (mapped.every((v) => v !== undefined)) return mapped.join('')
  // 有未命中的词：保留原分隔符，只翻译命中的段（tb_emp → tb_emp、sys_dept → sys_部门）
  return normalized
    .split(/([_\-\s]+)/)
    .map((seg) => (/^[_\-\s]*$/.test(seg) ? seg : lookupWord(seg) ?? seg))
    .join('')
}

/** 多词表名优先整体命中（如 order_item → 订单明细） */
function translateWhole(name: string): string | undefined {
  const base = (name.includes('.') ? name.split('.').pop()! : name).toLowerCase().replace(/[`"[\]]/g, '')
  return TABLE_WORDS[base] ?? TABLE_WORDS[singular(base)]
}

export interface NameSource {
  name: string
  /** DDL 里的显式表注释（COMMENT '...' / COMMENT ON TABLE） */
  comment?: string
  /** 建表语句上方紧邻的 -- 行注释 */
  lineComment?: string
}

/** 上方行注释常被工具/分节用作占位说明，这类不能当表名 */
function isUsableComment(c: string | undefined): c is string {
  if (!c) return false
  const s = c.trim()
  if (!s || s.length > 16) return false
  if (/[:：,，、;；()（）[\]{}|/\\]/.test(s)) return false
  if (/[-=*]{3,}/.test(s)) return false
  if (/^(table structure|dumping|create table|insert into|索引|约束|外键|说明)/i.test(s)) return false
  return true
}

/** 表名 → 展示用中文名
 *
 * 顺序：DDL 显式注释 → 内置词表 → 上方行注释 → 原表名。
 * 词表排在行注释之前是刻意的：`-- 多对多连接表` 这类分节注释很常见，
 * 让它盖掉 user_role → 用户角色 这种确定的翻译并不划算；
 * 而词表未命中的"不透明表名"（如 t_usr）仍会回退到行注释。
 */
export function resolveTableLabel(t: NameSource): string {
  if (isUsableComment(t.comment)) return t.comment.trim()
  const whole = translateWhole(t.name)
  if (whole) return whole
  const translated = translateTableName(t.name)
  if (translated !== baseOf(t.name)) return translated
  if (isUsableComment(t.lineComment)) return t.lineComment.trim()
  return translated
}

function baseOf(name: string): string {
  const cleaned = name.replace(/[`"[\]]/g, '').trim()
  return cleaned.includes('.') ? cleaned.split('.').pop()!.trim() : cleaned
}

/** 外键 → 联系动词：列名动词表优先，其次列注释，最后兜底
 *
 * 注意顺序：联系名的读法是「父实体 ——动词—— 子实体」（如 部门 拥有 员工），
 * 而列注释通常是名词短语（如「所属部门」），直接放进这个方向会读不通，
 * 因此动词表优先、注释只作为兜底。
 */
export function resolveRelationLabel(column: string, refTable?: string, columnComment?: string): string {
  const raw = column.replace(/[`"[\]]/g, '')
  const parts = raw.replace(/([a-z0-9])([A-Z])/g, '$1_$2').split(/[_\-\s]+/).filter(Boolean)
  for (const p of parts) {
    const v = FK_VERBS[p.toLowerCase()]
    if (v && !/^(id|no|num|code)$/i.test(p)) return v
  }
  // 形如 <refTable>_id 的常规外键：父"拥有"子
  if (refTable) {
    const refBase = (refTable.includes('.') ? refTable.split('.').pop()! : refTable).toLowerCase()
    if (raw.toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(singular(refBase))) return '拥有'
  }
  const cc = (columnComment || '').trim()
  if (cc) return cc
  return '关联'
}
