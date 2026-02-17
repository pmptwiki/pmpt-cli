export type Lang = 'ko' | 'en';
export type Purpose = 'guide' | 'rule' | 'template' | 'example' | 'reference';
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type Persona = 'general' | 'power-user' | 'developer' | 'organization';
export type Status = 'draft' | 'review' | 'stable' | 'recommended' | 'deprecated';

export interface DocFrontmatter {
  title: string;
  purpose: Purpose;
  level: Level;
  lang: Lang;
  persona?: Persona[];
  status?: Status;
  translationKey?: string;
  tags?: string[];
  created?: string;
  updated?: string;
  contributors?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
