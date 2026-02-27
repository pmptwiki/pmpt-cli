import * as p from '@clack/prompts';
import open from 'open';

const EXPLORE_URL = 'https://pmptwiki.com/explore';

export async function cmdExplore(): Promise<void> {
  p.intro('pmpt explore');

  p.log.info(`Opening ${EXPLORE_URL}`);
  await open(EXPLORE_URL);

  p.log.message('  Search, filter, and clone projects from the web.');
  p.log.message('  Found something you like? →  pmpt clone <slug>');
  p.outro('');
}
