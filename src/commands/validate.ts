import * as p from '@clack/prompts';
import { validate } from '../lib/schema.js';

export function cmdValidate(filePath: string): boolean {
  p.intro(`pmptwiki — validate: ${filePath}`);

  const result = validate(filePath);

  if (result.errors.length === 0 && result.warnings.length === 0) {
    p.outro('All validations passed');
    return true;
  }

  for (const err of result.errors) {
    p.log.error(err);
  }
  for (const warn of result.warnings) {
    p.log.warn(warn);
  }

  if (result.valid) {
    p.outro(`Validation passed (${result.warnings.length} warnings)`);
  } else {
    p.outro(`Validation failed (${result.errors.length} errors) — fix and retry`);
  }

  return result.valid;
}
