/**
 * Project quality score calculation.
 * Pure functions — no I/O, reusable in CLI and API.
 */

export interface QualityItem {
  label: string;
  score: number;
  maxScore: number;
  tip?: string;
}

export interface QualityBreakdown {
  score: number;
  details: QualityItem[];
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  passesMinimum: boolean;
}

const MIN_PUBLISH_SCORE = 40;

export interface QualityInput {
  pmptMd: string | null;
  planAnswers: { productIdea?: string; coreFeatures?: string; techStack?: string } | null;
  versionCount: number;
  docFiles: string[];
  hasGit: boolean;
}

export function computeQuality(data: QualityInput): QualityBreakdown {
  const details: QualityItem[] = [];

  // 1. pmpt.md content (30 points)
  {
    let score = 0;
    let tip: string | undefined;
    const len = data.pmptMd?.trim().length ?? 0;
    if (len > 0) score += 10;
    if (len >= 200) score += 10;
    if (len >= 500) score += 10;
    if (score < 30) {
      tip = len === 0
        ? 'Run `pmpt plan` to generate pmpt.md'
        : `pmpt.md is ${len} chars — expand to 500+ for full score`;
    }
    details.push({ label: 'pmpt.md content', score, maxScore: 30, tip });
  }

  // 2. Plan completeness (25 points)
  {
    let score = 0;
    let tip: string | undefined;
    if (data.planAnswers?.productIdea?.trim()) score += 10;
    if (data.planAnswers?.coreFeatures?.trim()) score += 10;
    if (data.planAnswers?.techStack?.trim()) score += 5;
    if (score < 25) {
      const missing: string[] = [];
      if (!data.planAnswers?.productIdea?.trim()) missing.push('product idea');
      if (!data.planAnswers?.coreFeatures?.trim()) missing.push('core features');
      if (!data.planAnswers?.techStack?.trim()) missing.push('tech stack');
      tip = `Complete plan: add ${missing.join(', ')}`;
    }
    details.push({ label: 'Plan completeness', score, maxScore: 25, tip });
  }

  // 3. Version history (20 points)
  {
    let score = 0;
    let tip: string | undefined;
    if (data.versionCount >= 2) score += 10;
    if (data.versionCount >= 3) score += 10;
    if (score < 20) {
      tip = data.versionCount < 2
        ? 'Save more versions with `pmpt save`'
        : 'One more version for full score';
    }
    details.push({ label: 'Version history', score, maxScore: 20, tip });
  }

  // 4. Documentation files (15 points)
  {
    let score = 0;
    let tip: string | undefined;
    if (data.docFiles.includes('plan.md')) score += 5;
    if (data.docFiles.includes('pmpt.md')) score += 5;
    if (data.docFiles.length > 2) score += 5;
    if (score < 15) {
      const missing: string[] = [];
      if (!data.docFiles.includes('plan.md')) missing.push('plan.md');
      if (!data.docFiles.includes('pmpt.md')) missing.push('pmpt.md');
      if (data.docFiles.length <= 2) missing.push('additional docs');
      tip = `Add: ${missing.join(', ')}`;
    }
    details.push({ label: 'Documentation', score, maxScore: 15, tip });
  }

  // 5. Git integration (10 points)
  {
    let score = 0;
    let tip: string | undefined;
    if (data.hasGit) score = 10;
    else tip = 'Initialize git repo for commit tracking';
    details.push({ label: 'Git integration', score, maxScore: 10, tip });
  }

  const total = details.reduce((sum, d) => sum + d.score, 0);
  const grade = total >= 80 ? 'A' : total >= 60 ? 'B' : total >= 40 ? 'C' : total >= 20 ? 'D' : 'F';

  return {
    score: total,
    details,
    grade,
    passesMinimum: total >= MIN_PUBLISH_SCORE,
  };
}
