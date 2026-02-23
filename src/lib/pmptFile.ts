/**
 * .pmpt File Format Schema (v1.0)
 *
 * Single JSON file format for sharing pmpt projects.
 */

import { z } from 'zod';

// Schema version
export const SCHEMA_VERSION = '1.0';
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Git info schema
const GitInfoSchema = z.object({
  commit: z.string(),
  commitFull: z.string().optional(),
  branch: z.string().optional(),
  dirty: z.boolean().optional(),
  tag: z.string().optional(),
}).optional();

// Single version/snapshot schema
const VersionSchema = z.object({
  version: z.number().min(1),
  timestamp: z.string(),
  files: z.record(z.string(), z.string()), // filename -> content
  git: GitInfoSchema,
});

// Plan answers schema
const PlanSchema = z.object({
  projectName: z.string(),
  productIdea: z.string().optional(),
  additionalContext: z.string().optional(),
  coreFeatures: z.string().optional(),
  techStack: z.string().optional(),
}).optional();

// Project metadata schema
const MetaSchema = z.object({
  projectName: z.string(),
  author: z.string().optional(),
  description: z.string().optional(),
  createdAt: z.string(),
  exportedAt: z.string(),
});

// Full .pmpt file schema
export const PmptFileSchema = z.object({
  schemaVersion: z.string(),
  cliMinVersion: z.string().optional(),
  guide: z.string().optional(),
  meta: MetaSchema,
  plan: PlanSchema,
  docs: z.record(z.string(), z.string()).optional(), // current docs
  history: z.array(VersionSchema),
});

// TypeScript types
export type GitInfo = z.infer<typeof GitInfoSchema>;
export type Version = z.infer<typeof VersionSchema>;
export type PlanAnswers = z.infer<typeof PlanSchema>;
export type ProjectMeta = z.infer<typeof MetaSchema>;
export type PmptFile = z.infer<typeof PmptFileSchema>;

// Validation result
export interface ValidationResult {
  success: boolean;
  data?: PmptFile;
  error?: string;
}

/**
 * Validate .pmpt file content
 */
export function validatePmptFile(content: string): ValidationResult {
  // Check size
  if (content.length > MAX_FILE_SIZE) {
    return {
      success: false,
      error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  // Parse JSON
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return {
      success: false,
      error: 'Invalid JSON format',
    };
  }

  // Validate schema
  const result = PmptFileSchema.safeParse(json);
  if (!result.success) {
    const firstError = result.error.errors[0];
    return {
      success: false,
      error: `Validation error: ${firstError.path.join('.')} - ${firstError.message}`,
    };
  }

  // Check schema version
  if (result.data.schemaVersion !== SCHEMA_VERSION) {
    return {
      success: false,
      error: `Unsupported schema version: ${result.data.schemaVersion}. Current: ${SCHEMA_VERSION}`,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

/**
 * AI guide text embedded in every .pmpt file.
 * Helps AI models understand the project's development journey.
 */
const AI_GUIDE = [
  'This is a .pmpt file — a complete record of a product built with AI.',
  '',
  'How to read this file:',
  '- "plan" contains the original intent: what the creator wanted to build, key features, and tech preferences.',
  '- "history" is an ordered array of snapshots (v1, v2, v3...). Each snapshot captures every tracked file at that point in time.',
  '- To understand the evolution, compare files across versions sequentially. Look for what was added, removed, or rewritten between each version.',
  '- "docs" contains the latest working documents (plan.md for the product plan, pmpt.md for the AI prompt used).',
  '- "git" fields in each version link snapshots to source code commits, showing when code changes happened alongside document changes.',
  '',
  'Key insight: The value of this file is not just the final result — it is the journey. The sequence of iterations reveals how decisions were made, what was tried, and how the product evolved through AI-assisted development.',
].join('\n');

/**
 * Create .pmpt file content from project data
 */
export function createPmptFile(
  meta: ProjectMeta,
  plan: PlanAnswers | undefined,
  docs: Record<string, string>,
  history: Version[]
): string {
  const pmptFile: PmptFile = {
    schemaVersion: SCHEMA_VERSION,
    cliMinVersion: '1.3.0',
    guide: AI_GUIDE,
    meta,
    plan,
    docs,
    history,
  };

  return JSON.stringify(pmptFile, null, 2);
}
