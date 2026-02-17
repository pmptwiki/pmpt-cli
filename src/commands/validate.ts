import * as p from '@clack/prompts';
import { validate } from '../lib/schema.js';

export function cmdValidate(filePath: string): boolean {
  p.intro(`PromptWiki — 검증: ${filePath}`);

  const result = validate(filePath);

  if (result.errors.length === 0 && result.warnings.length === 0) {
    p.outro('모든 검증 통과');
    return true;
  }

  for (const err of result.errors) {
    p.log.error(err);
  }
  for (const warn of result.warnings) {
    p.log.warn(warn);
  }

  if (result.valid) {
    p.outro(`검증 통과 (경고 ${result.warnings.length}개)`);
  } else {
    p.outro(`검증 실패 (오류 ${result.errors.length}개) — 수정 후 다시 시도하세요`);
  }

  return result.valid;
}
