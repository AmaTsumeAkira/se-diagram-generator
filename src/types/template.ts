import type { DiagramType, ConfigMap } from './diagram'

// ====== 模板分类 ======
export type TemplateCategory = 
  | 'general'      // 通用
  | 'ecommerce'    // 电商
  | 'education'    // 教育
  | 'medical'      // 医疗
  | 'finance'      // 金融
  | 'social'       // 社交
  | 'iot'          // 物联网
  | 'enterprise'   // 企业

export type TemplateComplexity = 'basic' | 'intermediate' | 'advanced'

// ====== 模板接口 ======
export interface Template {
  id: string
  name: string
  description: string
  diagramType: DiagramType
  category: TemplateCategory
  complexity: TemplateComplexity
  tags: string[]
  config: ConfigMap[DiagramType]
  author?: string
  version?: string
  createdAt?: string
  updatedAt?: string
}

// ====== 模板库接口 ======
export interface TemplateLibrary {
  builtin: Template[]
  user: Template[]
}

// ====== 模板筛选选项 ======
export interface TemplateFilter {
  diagramType?: DiagramType
  category?: TemplateCategory
  complexity?: TemplateComplexity
  keyword?: string
}
