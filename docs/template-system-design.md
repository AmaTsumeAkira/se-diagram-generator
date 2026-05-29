# 软件工程图生成器 - 模板库系统设计文档

## 一、系统概述

### 1.1 设计目标
- 提供丰富的预置模板，降低用户使用门槛
- 支持按图表类型、行业场景、复杂度多维度筛选
- 符合中国论文规范的黑白配色方案
- 支持用户自定义模板的保存与分享

### 1.2 技术约束
- 复用现有 `ConfigMap` 数据结构
- 本地 JSON 文件存储（无需后端）
- 与现有导入导出系统兼容

---

## 二、模板分类体系

### 2.1 按图表类型分类

| 类型 | 代码 | 说明 |
|------|------|------|
| 用例图 | `usecase` | 系统角色与功能交互 |
| 功能结构图 | `structure` | 系统模块层次结构 |
| 实体属性图 | `entity` | 数据库实体设计 |
| 时序图 | `sequence` | 对象间交互时序（新增） |
| 类图 | `class` | 面向对象类结构（新增） |
| 活动图 | `activity` | 业务流程活动（新增） |
| 部署图 | `deployment` | 系统部署架构（新增） |

### 2.2 按行业/场景分类

```typescript
export type Industry = 
  | 'ecommerce'      // 电商
  | 'education'      // 教育
  | 'healthcare'     // 医疗
  | 'finance'        // 金融
  | 'social'         // 社交
  | 'logistics'      // 物流
  | 'government'     // 政务
  | 'general'        // 通用
```

### 2.3 按复杂度分类

| 级别 | 代码 | 节点数 | 适用场景 |
|------|------|--------|----------|
| 基础 | `basic` | 3-8 | 课程作业、简单演示 |
| 进阶 | `intermediate` | 8-15 | 毕业设计、小型项目 |
| 完整 | `advanced` | 15+ | 企业项目、论文插图 |

---

## 三、模板数据结构设计

### 3.1 TypeScript 类型定义

```typescript
// src/types/template.ts

import type { Node, Edge } from '@xyflow/react'
import type { DiagramNodeData } from './diagram'

// ====== 图表类型（扩展） ======
export type DiagramType = 
  | 'usecase' 
  | 'structure' 
  | 'entity'
  | 'sequence'
  | 'class'
  | 'activity'
  | 'deployment'

// ====== 行业分类 ======
export type Industry = 
  | 'ecommerce'
  | 'education'
  | 'healthcare'
  | 'finance'
  | 'social'
  | 'logistics'
  | 'government'
  | 'general'

// ====== 复杂度 ======
export type Complexity = 'basic' | 'intermediate' | 'advanced'

// ====== 模板元数据 ======
export interface TemplateMeta {
  /** 唯一标识 */
  id: string
  /** 显示名称 */
  name: string
  /** 描述 */
  description: string
  /** 图表类型 */
  diagramType: DiagramType
  /** 行业分类 */
  industry: Industry
  /** 复杂度 */
  complexity: Complexity
  /** 标签（用于搜索） */
  tags: string[]
  /** 作者 */
  author: string
  /** 版本 */
  version: string
  /** 创建时间 */
  createdAt: string
  /** 缩略图路径（可选） */
  thumbnail?: string
  /** 是否为系统预置 */
  isBuiltin: boolean
}

// ====== 模板内容 ======
export interface TemplateContent {
  /** 节点配置 */
  nodes: Node<DiagramNodeData>[]
  /** 边配置 */
  edges: Edge[]
}

// ====== 完整模板 ======
export interface Template {
  meta: TemplateMeta
  content: TemplateContent
}

// ====== 用户自定义模板 ======
export interface UserTemplate extends Template {
  /** 用户ID（本地存储用时间戳） */
  userId: string
  /** 是否公开分享 */
  isPublic: boolean
}

// ====== 模板筛选条件 ======
export interface TemplateFilter {
  diagramType?: DiagramType | 'all'
  industry?: Industry | 'all'
  complexity?: Complexity | 'all'
  keyword?: string
}

// ====== 模板存储结构 ======
export interface TemplateStore {
  /** 系统预置模板 */
  builtin: Template[]
  /** 用户自定义模板 */
  user: UserTemplate[]
}
```

### 3.2 与现有 ConfigMap 的关系

```typescript
// 现有结构（App.tsx）
export type ConfigMap = Record<DiagramType, { nodes: Node<DiagramNodeData>[]; edges: Edge[] }>

// 模板内容复用方式
function applyTemplate(template: Template, currentType: DiagramType): ConfigMap {
  // 将模板内容应用到对应的图表类型
  return {
    ...currentConfigs,
    [currentType]: template.content
  }
}

// 保存为模板
function saveAsTemplate(
  config: { nodes: Node<DiagramNodeData>[]; edges: Edge[] },
  meta: Omit<TemplateMeta, 'id' | 'createdAt' | 'isBuiltin'>
): UserTemplate {
  return {
    meta: {
      ...meta,
      id: `user_${Date.now()}`,
      createdAt: new Date().toISOString(),
      isBuiltin: false,
    },
    content: config,
    userId: 'local',
    isPublic: false,
  }
}
```

---

## 四、模板库 UI 设计

### 4.1 组件结构

```
src/
├── components/
│   └── template/
│       ├── TemplateLibrary.tsx      # 模板库主入口（模态框）
│       ├── TemplateBrowser.tsx      # 模板浏览区（卡片列表）
│       ├── TemplateCard.tsx         # 单个模板卡片
│       ├── TemplatePreview.tsx      # 模板预览（缩略图）
│       ├── TemplateFilter.tsx       # 筛选面板
│       ├── TemplateSearch.tsx       # 搜索框
│       ├── SaveTemplateModal.tsx    # 保存为模板弹窗
│       └── TemplateDetail.tsx       # 模板详情页
├── data/
│   └── templates/
│       ├── index.ts                 # 模板注册入口
│       ├── usecase/                 # 用例图模板
│       ├── structure/               # 功能结构图模板
│       ├── entity/                  # 实体属性图模板
│       ├── sequence/                # 时序图模板
│       ├── class/                   # 类图模板
│       ├── activity/                # 活动图模板
│       └── deployment/              # 部署图模板
└── hooks/
    └── useTemplate.ts               # 模板管理 Hook
```

### 4.2 UI 布局设计

```
┌─────────────────────────────────────────────────────────────┐
│  模板库                                    [搜索...] [×关闭] │
├─────────────────────────────────────────────────────────────┤
│  [图表类型: 全部 ▼] [行业: 全部 ▼] [复杂度: 全部 ▼]         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │  预览图  │  │  预览图  │  │  预览图  │  │  预览图  │        │
│  │         │  │         │  │         │  │         │        │
│  ├─────────┤  ├─────────┤  ├─────────┤  ├─────────┤        │
│  │ 模板名称 │  │ 模板名称 │  │ 模板名称 │  │ 模板名称 │        │
│  │ 用例图   │  │ 用例图   │  │ 结构图   │  │ 实体图   │        │
│  │ [基础]   │  │ [进阶]   │  │ [基础]   │  │ [完整]   │        │
│  │ [电商]   │  │ [教育]   │  │ [通用]   │  │ [医疗]   │        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
│                                                             │
│  ┌─────────┐  ┌─────────┐                                   │
│  │  预览图  │  │  + 保存  │                                   │
│  │         │  │  当前为  │                                   │
│  │         │  │   模板   │                                   │
│  ├─────────┤  ├─────────┤                                   │
│  │ 模板名称 │  │         │                                   │
│  │ 类图     │  │         │                                   │
│  │ [进阶]   │  │         │                                   │
│  │ [金融]   │  │         │                                   │
│  └─────────┘  └─────────┘                                   │
├─────────────────────────────────────────────────────────────┤
│  共 12 个模板  │  第 1/1 页  │  [← 上一页]  [下一页 →]       │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 关键交互流程

```
用户打开模板库
    ↓
浏览/搜索模板
    ↓
点击模板卡片 → 显示预览
    ↓
[应用模板] → 确认覆盖当前图表 → 应用成功
    ↓
[保存为模板] → 填写元数据 → 保存到本地
```

---

## 五、组件代码实现

### 5.1 TemplateLibrary.tsx - 模板库主组件

```tsx
// src/components/template/TemplateLibrary.tsx

import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X, Grid, List } from 'lucide-react'
import type { Template, TemplateFilter, DiagramType } from '../../types/template'
import { loadAllTemplates } from '../../data/templates'
import TemplateCard from './TemplateCard'
import TemplatePreview from './TemplatePreview'
import SaveTemplateModal from './SaveTemplateModal'

interface Props {
  currentDiagramType: DiagramType
  onApply: (template: Template) => void
  onClose: () => void
}

export default function TemplateLibrary({ currentDiagramType, onApply, onClose }: Props) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<TemplateFilter>({
    diagramType: currentDiagramType,
    industry: 'all',
    complexity: 'all',
    keyword: '',
  })
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const templates = useMemo(() => loadAllTemplates(), [])

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (filter.diagramType && filter.diagramType !== 'all' && t.meta.diagramType !== filter.diagramType) {
        return false
      }
      if (filter.industry && filter.industry !== 'all' && t.meta.industry !== filter.industry) {
        return false
      }
      if (filter.complexity && filter.complexity !== 'all' && t.meta.complexity !== filter.complexity) {
        return false
      }
      if (filter.keyword) {
        const kw = filter.keyword.toLowerCase()
        const matchName = t.meta.name.toLowerCase().includes(kw)
        const matchDesc = t.meta.description.toLowerCase().includes(kw)
        const matchTags = t.meta.tags.some(tag => tag.toLowerCase().includes(kw))
        if (!matchName && !matchDesc && !matchTags) return false
      }
      return true
    })
  }, [templates, filter])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div 
        className="bg-white rounded-xl shadow-2xl w-[900px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold">{t('template.library')}</h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t('template.searchPlaceholder')}
                value={filter.keyword || ''}
                onChange={(e) => setFilter(f => ({ ...f, keyword: e.target.value }))}
                className="pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black w-64"
              />
            </div>
            <button
              onClick={() => setShowSaveModal(true)}
              className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-800"
            >
              {t('template.saveCurrent')}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-black">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100 bg-gray-50">
          <FilterSelect
            label={t('template.diagramType')}
            value={filter.diagramType || 'all'}
            onChange={(v) => setFilter(f => ({ ...f, diagramType: v as any }))}
            options={[
              { value: 'all', label: t('template.all') },
              { value: 'usecase', label: t('app.usecase') },
              { value: 'structure', label: t('app.structure') },
              { value: 'entity', label: t('app.entity') },
              { value: 'sequence', label: t('app.sequence') },
              { value: 'class', label: t('app.class') },
              { value: 'activity', label: t('app.activity') },
              { value: 'deployment', label: t('app.deployment') },
            ]}
          />
          <FilterSelect
            label={t('template.industry')}
            value={filter.industry || 'all'}
            onChange={(v) => setFilter(f => ({ ...f, industry: v as any }))}
            options={[
              { value: 'all', label: t('template.all') },
              { value: 'ecommerce', label: t('industry.ecommerce') },
              { value: 'education', label: t('industry.education') },
              { value: 'healthcare', label: t('industry.healthcare') },
              { value: 'finance', label: t('industry.finance') },
              { value: 'general', label: t('industry.general') },
            ]}
          />
          <FilterSelect
            label={t('template.complexity')}
            value={filter.complexity || 'all'}
            onChange={(v) => setFilter(f => ({ ...f, complexity: v as any }))}
            options={[
              { value: 'all', label: t('template.all') },
              { value: 'basic', label: t('complexity.basic') },
              { value: 'intermediate', label: t('complexity.intermediate') },
              { value: 'advanced', label: t('complexity.advanced') },
            ]}
          />
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${viewMode === 'grid' ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-200'}`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${viewMode === 'list' ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-200'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Template Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <p className="text-lg mb-2">{t('template.noResults')}</p>
              <p className="text-sm">{t('template.tryDifferentFilter')}</p>
            </div>
          ) : (
            <div className={viewMode === 'grid' 
              ? 'grid grid-cols-4 gap-4' 
              : 'space-y-3'
            }>
              {filteredTemplates.map((template) => (
                <TemplateCard
                  key={template.meta.id}
                  template={template}
                  viewMode={viewMode}
                  onClick={() => setSelectedTemplate(template)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50">
          <span className="text-sm text-gray-500">
            {t('template.totalCount', { count: filteredTemplates.length })}
          </span>
        </div>
      </div>

      {/* Preview Modal */}
      {selectedTemplate && (
        <TemplatePreview
          template={selectedTemplate}
          onApply={() => {
            onApply(selectedTemplate)
            setSelectedTemplate(null)
            onClose()
          }}
          onClose={() => setSelectedTemplate(null)}
        />
      )}

      {/* Save Template Modal */}
      {showSaveModal && (
        <SaveTemplateModal
          currentDiagramType={currentDiagramType}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  )
}

// Helper component
function FilterSelect({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-black"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}
```

### 5.2 TemplateCard.tsx - 模板卡片

```tsx
// src/components/template/TemplateCard.tsx

import type { Template } from '../../types/template'
import { useTranslation } from 'react-i18next'

interface Props {
  template: Template
  viewMode: 'grid' | 'list'
  onClick: () => void
}

const complexityColors = {
  basic: 'bg-green-100 text-green-700',
  intermediate: 'bg-yellow-100 text-yellow-700',
  advanced: 'bg-red-100 text-red-700',
}

export default function TemplateCard({ template, viewMode, onClick }: Props) {
  const { t } = useTranslation()
  const { meta } = template

  if (viewMode === 'list') {
    return (
      <div
        onClick={onClick}
        className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-gray-400 cursor-pointer transition-colors"
      >
        <div className="w-24 h-16 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">
          {meta.thumbnail ? (
            <img src={meta.thumbnail} alt={meta.name} className="w-full h-full object-cover rounded" />
          ) : (
            t('template.noPreview')
          )}
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-sm">{meta.name}</h3>
          <p className="text-xs text-gray-500 mt-1">{meta.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded bg-gray-100">{t(`app.${meta.diagramType}`)}</span>
          <span className={`text-xs px-2 py-1 rounded ${complexityColors[meta.complexity]}`}>
            {t(`complexity.${meta.complexity}`)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      className="border border-gray-200 rounded-lg hover:border-gray-400 cursor-pointer transition-colors overflow-hidden"
    >
      {/* Thumbnail */}
      <div className="aspect-[4/3] bg-gray-100 flex items-center justify-center text-gray-400">
        {meta.thumbnail ? (
          <img src={meta.thumbnail} alt={meta.name} className="w-full h-full object-cover" />
        ) : (
          <div className="text-center">
            <div className="text-3xl mb-1">📊</div>
            <span className="text-xs">{t('template.noPreview')}</span>
          </div>
        )}
      </div>
      
      {/* Info */}
      <div className="p-3">
        <h3 className="font-medium text-sm truncate">{meta.name}</h3>
        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{meta.description}</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs px-2 py-0.5 rounded bg-gray-100">{t(`app.${meta.diagramType}`)}</span>
          <span className={`text-xs px-2 py-0.5 rounded ${complexityColors[meta.complexity]}`}>
            {t(`complexity.${meta.complexity}`)}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600">
            {t(`industry.${meta.industry}`)}
          </span>
        </div>
        {meta.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {meta.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-gray-50 text-gray-500 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

### 5.3 SaveTemplateModal.tsx - 保存模板弹窗

```tsx
// src/components/template/SaveTemplateModal.tsx

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DiagramType, Industry, Complexity, TemplateMeta } from '../../types/template'
import { useTemplateStore } from '../../hooks/useTemplate'

interface Props {
  currentDiagramType: DiagramType
  onClose: () => void
}

export default function SaveTemplateModal({ currentDiagramType, onClose }: Props) {
  const { t } = useTranslation()
  const { saveUserTemplate } = useTemplateStore()
  
  const [form, setForm] = useState({
    name: '',
    description: '',
    industry: 'general' as Industry,
    complexity: 'basic' as Complexity,
    tags: '',
  })

  const handleSave = () => {
    if (!form.name.trim()) return

    const meta: Omit<TemplateMeta, 'id' | 'createdAt' | 'isBuiltin'> = {
      name: form.name,
      description: form.description,
      diagramType: currentDiagramType,
      industry: form.industry,
      complexity: form.complexity,
      tags: form.tags.split(/[,，\s]+/).filter(Boolean),
      author: '用户',
      version: '1.0.0',
    }

    saveUserTemplate(meta)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[480px] p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-4">{t('template.saveAsTemplate')}</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('template.name')} *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
              placeholder={t('template.namePlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('template.description')}
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black h-20 resize-none"
              placeholder={t('template.descPlaceholder')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('template.industry')}
              </label>
              <select
                value={form.industry}
                onChange={(e) => setForm(f => ({ ...f, industry: e.target.value as Industry }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="ecommerce">{t('industry.ecommerce')}</option>
                <option value="education">{t('industry.education')}</option>
                <option value="healthcare">{t('industry.healthcare')}</option>
                <option value="finance">{t('industry.finance')}</option>
                <option value="general">{t('industry.general')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('template.complexity')}
              </label>
              <select
                value={form.complexity}
                onChange={(e) => setForm(f => ({ ...f, complexity: e.target.value as Complexity }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="basic">{t('complexity.basic')}</option>
                <option value="intermediate">{t('complexity.intermediate')}</option>
                <option value="advanced">{t('complexity.advanced')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('template.tags')}
            </label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
              placeholder={t('template.tagsPlaceholder')}
            />
            <p className="text-xs text-gray-400 mt-1">{t('template.tagsHint')}</p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={!form.name.trim()}
            className="flex-1 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('template.save')}
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {t('template.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
```

### 5.4 useTemplate.ts - 模板管理 Hook

```typescript
// src/hooks/useTemplate.ts

import { useState, useCallback, useEffect } from 'react'
import type { Template, UserTemplate, TemplateMeta, DiagramType } from '../types/template'
import { loadBuiltinTemplates } from '../data/templates'

const USER_TEMPLATES_KEY = 'user-templates'

export function useTemplateStore() {
  const [builtinTemplates, setBuiltinTemplates] = useState<Template[]>([])
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([])

  // 加载系统模板
  useEffect(() => {
    const templates = loadBuiltinTemplates()
    setBuiltinTemplates(templates)
  }, [])

  // 加载用户模板
  useEffect(() => {
    const stored = localStorage.getItem(USER_TEMPLATES_KEY)
    if (stored) {
      try {
        setUserTemplates(JSON.parse(stored))
      } catch (e) {
        console.warn('Failed to load user templates:', e)
      }
    }
  }, [])

  // 保存用户模板
  const saveUserTemplate = useCallback((
    meta: Omit<TemplateMeta, 'id' | 'createdAt' | 'isBuiltin'>,
    content?: { nodes: any[]; edges: any[] }
  ) => {
    const newTemplate: UserTemplate = {
      meta: {
        ...meta,
        id: `user_${Date.now()}`,
        createdAt: new Date().toISOString(),
        isBuiltin: false,
      },
      content: content || { nodes: [], edges: [] },
      userId: 'local',
      isPublic: false,
    }

    setUserTemplates(prev => {
      const updated = [...prev, newTemplate]
      localStorage.setItem(USER_TEMPLATES_KEY, JSON.stringify(updated))
      return updated
    })

    return newTemplate
  }, [])

  // 删除用户模板
  const deleteUserTemplate = useCallback((templateId: string) => {
    setUserTemplates(prev => {
      const updated = prev.filter(t => t.meta.id !== templateId)
      localStorage.setItem(USER_TEMPLATES_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  // 获取所有模板
  const getAllTemplates = useCallback(() => {
    return [...builtinTemplates, ...userTemplates]
  }, [builtinTemplates, userTemplates])

  // 按类型获取模板
  const getTemplatesByType = useCallback((type: DiagramType) => {
    return getAllTemplates().filter(t => t.meta.diagramType === type)
  }, [getAllTemplates])

  return {
    builtinTemplates,
    userTemplates,
    saveUserTemplate,
    deleteUserTemplate,
    getAllTemplates,
    getTemplatesByType,
  }
}
```

---

## 六、模板数据文件结构

### 6.1 目录结构

```
src/data/templates/
├── index.ts                    # 模板注册入口
├── usecase/
│   ├── index.ts               # 用例图模板导出
│   ├── ecommerce-basic.ts     # 电商基础用例图
│   ├── education-basic.ts     # 教育基础用例图
│   ├── healthcare-advanced.ts # 医疗完整用例图
│   ├── general-basic.ts       # 通用基础用例图
│   └── finance-intermediate.ts# 金融进阶用例图
├── structure/
│   ├── index.ts
│   ├── general-basic.ts       # 通用系统结构
│   ├── ecommerce-basic.ts     # 电商系统结构
│   └── education-advanced.ts  # 教育系统结构
├── entity/
│   ├── index.ts
│   ├── ecommerce-basic.ts     # 电商实体
│   ├── healthcare-basic.ts    # 医疗实体
│   └── general-basic.ts       # 通用实体
├── sequence/
│   ├── index.ts
│   ├── login-basic.ts         # 登录时序
│   ├── payment-basic.ts       # 支付时序
│   └── order-advanced.ts      # 订单完整时序
├── class/
│   ├── index.ts
│   ├── general-basic.ts       # 通用类图
│   └── ecommerce-intermediate.ts
├── activity/
│   ├── index.ts
│   ├── order-basic.ts         # 订单流程
│   └── approval-advanced.ts   # 审批流程
└── deployment/
    ├── index.ts
    ├── basic.ts               # 基础部署
    └── microservice-advanced.ts # 微服务部署
```

### 6.2 模板数据文件示例

```typescript
// src/data/templates/usecase/ecommerce-basic.ts

import type { Template } from '../../../types/template'

export const ecommerceBasicUsecase: Template = {
  meta: {
    id: 'usecase_ecommerce_basic',
    name: '电商系统基础用例图',
    description: '包含用户、管理员、商家三个角色的基础电商业务用例',
    diagramType: 'usecase',
    industry: 'ecommerce',
    complexity: 'basic',
    tags: ['电商', '购物', '订单', '用户管理'],
    author: '系统预置',
    version: '1.0.0',
    createdAt: '2026-01-01T00:00:00Z',
    isBuiltin: true,
  },
  content: {
    nodes: [
      // 用户角色
      { id: 'actor_user', type: 'actor', data: { label: '用户' }, position: { x: 0, y: 0 } },
      // 用户用例
      { id: 'uc_browse', type: 'usecase', data: { label: '浏览商品', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
      { id: 'uc_search', type: 'usecase', data: { label: '搜索商品', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
      { id: 'uc_cart', type: 'usecase', data: { label: '加入购物车', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
      { id: 'uc_order', type: 'usecase', data: { label: '下单支付', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
      { id: 'uc_comment', type: 'usecase', data: { label: '评价商品', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
      
      // 管理员角色
      { id: 'actor_admin', type: 'actor', data: { label: '管理员' }, position: { x: 0, y: 0 } },
      // 管理员用例
      { id: 'uc_goods_mgmt', type: 'usecase', data: { label: '商品管理', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
      { id: 'uc_order_mgmt', type: 'usecase', data: { label: '订单管理', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
      { id: 'uc_user_mgmt', type: 'usecase', data: { label: '用户管理', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
      { id: 'uc_stats', type: 'usecase', data: { label: '数据统计', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
      
      // 商家角色
      { id: 'actor_seller', type: 'actor', data: { label: '商家' }, position: { x: 0, y: 0 } },
      // 商家用例
      { id: 'uc_goods_publish', type: 'usecase', data: { label: '发布商品', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
      { id: 'uc_shop_mgmt', type: 'usecase', data: { label: '店铺管理', rx: 60, ry: 15 }, position: { x: 0, y: 0 } },
    ],
    edges: [
      // 用户连线
      { id: 'e_u1', source: 'actor_user', target: 'uc_browse' },
      { id: 'e_u2', source: 'actor_user', target: 'uc_search' },
      { id: 'e_u3', source: 'actor_user', target: 'uc_cart' },
      { id: 'e_u4', source: 'actor_user', target: 'uc_order' },
      { id: 'e_u5', source: 'actor_user', target: 'uc_comment' },
      // 管理员连线
      { id: 'e_a1', source: 'actor_admin', target: 'uc_goods_mgmt' },
      { id: 'e_a2', source: 'actor_admin', target: 'uc_order_mgmt' },
      { id: 'e_a3', source: 'actor_admin', target: 'uc_user_mgmt' },
      { id: 'e_a4', source: 'actor_admin', target: 'uc_stats' },
      // 商家连线
      { id: 'e_s1', source: 'actor_seller', target: 'uc_goods_publish' },
      { id: 'e_s2', source: 'actor_seller', target: 'uc_shop_mgmt' },
    ],
  },
}
```

### 6.3 模板注册入口

```typescript
// src/data/templates/index.ts

import type { Template, DiagramType } from '../../types/template'

// 用例图模板
import { ecommerceBasicUsecase } from './usecase/ecommerce-basic'
import { educationBasicUsecase } from './usecase/education-basic'
import { healthcareAdvancedUsecase } from './usecase/healthcare-advanced'
import { generalBasicUsecase } from './usecase/general-basic'
import { financeIntermediateUsecase } from './usecase/finance-intermediate'

// 功能结构图模板
import { generalBasicStructure } from './structure/general-basic'
import { ecommerceBasicStructure } from './structure/ecommerce-basic'
import { educationAdvancedStructure } from './structure/education-advanced'

// 实体属性图模板
import { ecommerceBasicEntity } from './entity/ecommerce-basic'
import { healthcareBasicEntity } from './entity/healthcare-basic'
import { generalBasicEntity } from './entity/general-basic'

// 时序图模板
import { loginBasicSequence } from './sequence/login-basic'
import { paymentBasicSequence } from './sequence/payment-basic'
import { orderAdvancedSequence } from './sequence/order-advanced'

// 类图模板
import { generalBasicClass } from './class/general-basic'
import { ecommerceIntermediateClass } from './class/ecommerce-intermediate'

// 活动图模板
import { orderBasicActivity } from './activity/order-basic'
import { approvalAdvancedActivity } from './activity/approval-advanced'

// 部署图模板
import { basicDeployment } from './deployment/basic'
import { microserviceAdvancedDeployment } from './deployment/microservice-advanced'

// 所有预置模板
const builtinTemplates: Template[] = [
  // 用例图
  ecommerceBasicUsecase,
  educationBasicUsecase,
  healthcareAdvancedUsecase,
  generalBasicUsecase,
  financeIntermediateUsecase,
  
  // 功能结构图
  generalBasicStructure,
  ecommerceBasicStructure,
  educationAdvancedStructure,
  
  // 实体属性图
  ecommerceBasicEntity,
  healthcareBasicEntity,
  generalBasicEntity,
  
  // 时序图
  loginBasicSequence,
  paymentBasicSequence,
  orderAdvancedSequence,
  
  // 类图
  generalBasicClass,
  ecommerceIntermediateClass,
  
  // 活动图
  orderBasicActivity,
  approvalAdvancedActivity,
  
  // 部署图
  basicDeployment,
  microserviceAdvancedDeployment,
]

export function loadBuiltinTemplates(): Template[] {
  return builtinTemplates
}

export function loadAllTemplates(): Template[] {
  // 合并系统模板和用户模板
  const userTemplatesJson = localStorage.getItem('user-templates')
  const userTemplates = userTemplatesJson ? JSON.parse(userTemplatesJson) : []
  return [...builtinTemplates, ...userTemplates]
}

export function getTemplatesByType(type: DiagramType): Template[] {
  return loadAllTemplates().filter(t => t.meta.diagramType === type)
}
```

---

## 七、预置模板内容清单

### 7.1 用例图模板（5个）

| ID | 名称 | 行业 | 复杂度 | 角色数 | 用例数 |
|----|------|------|--------|--------|--------|
| usecase_ecommerce_basic | 电商系统基础用例图 | 电商 | 基础 | 3 | 12 |
| usecase_education_basic | 在线教育平台用例图 | 教育 | 基础 | 3 | 10 |
| usecase_healthcare_advanced | 医院管理系统用例图 | 医疗 | 完整 | 4 | 18 |
| usecase_general_basic | 通用系统用例图模板 | 通用 | 基础 | 2 | 6 |
| usecase_finance_intermediate | 银行管理系统用例图 | 金融 | 进阶 | 3 | 14 |

### 7.2 功能结构图模板（3个）

| ID | 名称 | 行业 | 复杂度 | 模块数 | 功能数 |
|----|------|------|--------|--------|--------|
| structure_general_basic | 通用系统功能结构图 | 通用 | 基础 | 3 | 9 |
| structure_ecommerce_basic | 电商系统功能结构图 | 电商 | 基础 | 4 | 16 |
| structure_education_advanced | 教务管理系统功能结构图 | 教育 | 完整 | 5 | 25 |

### 7.3 实体属性图模板（3个）

| ID | 名称 | 行业 | 复杂度 | 实体数 | 属性数 |
|----|------|------|--------|--------|--------|
| entity_ecommerce_basic | 电商核心实体图 | 电商 | 基础 | 3 | 21 |
| entity_healthcare_basic | 医疗核心实体图 | 医疗 | 基础 | 3 | 18 |
| entity_general_basic | 通用实体属性图 | 通用 | 基础 | 2 | 14 |

### 7.4 时序图模板（3个）

| ID | 名称 | 行业 | 复杂度 | 对象数 | 消息数 |
|----|------|------|--------|--------|--------|
| sequence_login_basic | 用户登录时序图 | 通用 | 基础 | 4 | 8 |
| sequence_payment_basic | 支付流程时序图 | 电商 | 基础 | 5 | 12 |
| sequence_order_advanced | 订单完整处理时序图 | 电商 | 完整 | 6 | 20 |

### 7.5 类图模板（2个）

| ID | 名称 | 行业 | 复杂度 | 类数 | 关系数 |
|----|------|------|--------|------|--------|
| class_general_basic | 通用类图模板 | 通用 | 基础 | 4 | 5 |
| class_ecommerce_intermediate | 电商类图模板 | 电商 | 进阶 | 8 | 12 |

### 7.6 活动图模板（2个）

| ID | 名称 | 行业 | 复杂度 | 节点数 |
|----|------|------|--------|--------|
| activity_order_basic | 订单处理活动图 | 电商 | 基础 | 10 |
| activity_approval_advanced | 审批流程活动图 | 政务 | 完整 | 18 |

### 7.7 部署图模板（2个）

| ID | 名称 | 行业 | 复杂度 | 节点数 |
|----|------|------|--------|--------|
| deployment_basic | 基础部署架构图 | 通用 | 基础 | 6 |
| deployment_microservice_advanced | 微服务部署架构图 | 通用 | 完整 | 15 |

---

## 八、i18n 国际化扩展

### 8.1 中文翻译补充

```typescript
// src/i18n/zh.ts 新增内容

export default {
  // ... 现有翻译
  
  app: {
    // ... 现有
    sequence: '时序图',
    class: '类图',
    activity: '活动图',
    deployment: '部署图',
  },
  
  template: {
    library: '模板库',
    searchPlaceholder: '搜索模板...',
    saveCurrent: '保存为模板',
    diagramType: '图表类型',
    industry: '行业场景',
    complexity: '复杂度',
    all: '全部',
    noResults: '未找到匹配的模板',
    tryDifferentFilter: '请尝试其他筛选条件',
    totalCount: '共 {{count}} 个模板',
    noPreview: '暂无预览',
    saveAsTemplate: '保存为模板',
    name: '模板名称',
    namePlaceholder: '请输入模板名称',
    description: '模板描述',
    descPlaceholder: '请描述模板的用途和特点',
    tags: '标签',
    tagsPlaceholder: '用逗号分隔多个标签',
    tagsHint: '标签用于搜索，建议添加行业、场景等关键词',
    save: '保存',
    cancel: '取消',
    apply: '应用模板',
    applyConfirm: '应用模板将覆盖当前图表，确定继续吗？',
    deleteConfirm: '确定要删除这个自定义模板吗？',
    saved: '模板保存成功',
    deleted: '模板已删除',
  },
  
  industry: {
    ecommerce: '电商',
    education: '教育',
    healthcare: '医疗',
    finance: '金融',
    social: '社交',
    logistics: '物流',
    government: '政务',
    general: '通用',
  },
  
  complexity: {
    basic: '基础',
    intermediate: '进阶',
    advanced: '完整',
  },
}
```

### 8.2 英文翻译补充

```typescript
// src/i18n/en.ts 新增内容

export default {
  // ... 现有翻译
  
  app: {
    // ... 现有
    sequence: 'Sequence',
    class: 'Class',
    activity: 'Activity',
    deployment: 'Deployment',
  },
  
  template: {
    library: 'Template Library',
    searchPlaceholder: 'Search templates...',
    saveCurrent: 'Save as Template',
    diagramType: 'Diagram Type',
    industry: 'Industry',
    complexity: 'Complexity',
    all: 'All',
    noResults: 'No templates found',
    tryDifferentFilter: 'Try different filters',
    totalCount: '{{count}} templates',
    noPreview: 'No preview',
    saveAsTemplate: 'Save as Template',
    name: 'Template Name',
    namePlaceholder: 'Enter template name',
    description: 'Description',
    descPlaceholder: 'Describe the template',
    tags: 'Tags',
    tagsPlaceholder: 'Separate with commas',
    tagsHint: 'Tags for searching',
    save: 'Save',
    cancel: 'Cancel',
    apply: 'Apply Template',
    applyConfirm: 'Applying template will overwrite current diagram. Continue?',
    deleteConfirm: 'Delete this custom template?',
    saved: 'Template saved',
    deleted: 'Template deleted',
  },
  
  industry: {
    ecommerce: 'E-commerce',
    education: 'Education',
    healthcare: 'Healthcare',
    finance: 'Finance',
    social: 'Social',
    logistics: 'Logistics',
    government: 'Government',
    general: 'General',
  },
  
  complexity: {
    basic: 'Basic',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
  },
}
```

---

## 九、App.tsx 集成方案

### 9.1 添加模板库入口

```tsx
// App.tsx 修改建议

import TemplateLibrary from './components/template/TemplateLibrary'
import type { Template } from './types/template'

function App() {
  // ... 现有代码
  
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false)
  
  // 应用模板
  const handleApplyTemplate = useCallback((template: Template) => {
    const newConfigs = { ...configs }
    newConfigs[active] = template.content
    pushConfigs(newConfigs)
  }, [active, configs, pushConfigs])
  
  return (
    <div className="h-screen flex flex-col">
      {/* Top Navigation - 添加模板库按钮 */}
      <header className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        {/* ... 现有代码 ... */}
        
        <div className="ml-auto flex items-center gap-1">
          {/* 新增：模板库按钮 */}
          <button 
            onClick={() => setShowTemplateLibrary(true)} 
            className="px-3 py-1 text-xs bg-black text-white rounded hover:bg-gray-800"
          >
            {t('template.library')}
          </button>
          
          {/* ... 其他现有按钮 ... */}
        </div>
      </header>
      
      {/* ... 其他现有代码 ... */}
      
      {/* 模板库弹窗 */}
      {showTemplateLibrary && (
        <TemplateLibrary
          currentDiagramType={active}
          onApply={handleApplyTemplate}
          onClose={() => setShowTemplateLibrary(false)}
        />
      )}
    </div>
  )
}
```

---

## 十、实现优先级建议

### Phase 1 - 基础框架（1-2天）
1. 创建 `src/types/template.ts` 类型定义
2. 创建 `src/hooks/useTemplate.ts` Hook
3. 创建 `src/components/template/TemplateLibrary.tsx` 主组件
4. 创建 `src/components/template/TemplateCard.tsx` 卡片组件

### Phase 2 - 预置模板（2-3天）
1. 创建现有3种图表的预置模板（各3-5个）
2. 创建模板注册入口 `src/data/templates/index.ts`
3. 实现模板加载逻辑

### Phase 3 - UI完善（1-2天）
1. 实现 `TemplatePreview.tsx` 预览组件
2. 实现 `SaveTemplateModal.tsx` 保存功能
3. 完善筛选和搜索功能

### Phase 4 - 新增图表模板（3-5天）
1. 实现时序图、类图、活动图、部署图的数据结构
2. 为新增图表创建预置模板
3. 完善所有图表的模板库

---

## 十一、注意事项

### 11.1 论文规范要求
- 所有图表使用黑白配色，避免彩色
- 节点边框使用黑色实线
- 文字使用宋体或黑体
- 图表尺寸适配论文版面（宽度不超过15cm）

### 11.2 存储限制
- localStorage 单域名限制约 5-10MB
- 单个模板 JSON 约 2-5KB
- 预计可存储 1000+ 用户模板

### 11.3 性能优化
- 模板列表使用虚拟滚动（如 react-window）
- 预览图使用懒加载
- 模板数据按需导入（动态 import）

---

## 十二、总结

本模板库系统设计遵循以下原则：

1. **复用性**：完全复用现有 `ConfigMap` 数据结构
2. **可扩展性**：支持新增图表类型的模板
3. **易用性**：多维度筛选、搜索、一键应用
4. **本地化**：符合中国论文规范的黑白配色
5. **离线优先**：纯本地存储，无需后端支持

通过本系统，用户可以：
- 快速从预置模板开始创建图表
- 保存自己的常用配置为模板
- 按行业场景快速找到合适的模板
- 一键应用模板到当前图表
