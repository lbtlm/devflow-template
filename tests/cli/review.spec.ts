import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TEMPLATE_ROOT } from '../../src/cli/init.js';
import { copyTemplate } from '../../src/shared/template.js';
import { gatherReviewData, runReview } from '../../src/cli/review.js';

const createWorkspace = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'devflow-review-'));
  await copyTemplate(TEMPLATE_ROOT, dir, { force: true });
  return dir;
};

describe('review command', () => {
  it('summarises progress and recommends tests', async () => {
    const cwd = await createWorkspace();

    await writeFile(
      join(cwd, '.devflow/steps/step-01.requirements.json'),
      JSON.stringify(
        {
          id: 'step-01',
          type: 'requirements',
          status: 'approved',
          summary: '初始需求'
        },
        null,
        2
      )
    );

    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify(
        {
          name: 'demo',
          version: '0.0.1',
          scripts: {
            test: 'vitest run'
          }
        },
        null,
        2
      )
    );

    const data = await gatherReviewData(cwd);
    expect(data.completedSteps.length).toBeGreaterThan(0);
    expect(data.missingSteps.some((step) => step.template.id === 'step-02')).toBe(true);
    expect(
      data.recommendedTests.some((item) => item.command.includes('run test'))
    ).toBe(true);
    expect(data.suggestions.length).toBeGreaterThan(0);

    const output = join(cwd, '.devflow/reports/test-review.md');
    await runReview(['--output', output, '--cwd', cwd]);
    const content = await readFile(output, 'utf-8');
    expect(content).toContain('DevFlow Review');

    await rm(cwd, { recursive: true, force: true });
  });
});
