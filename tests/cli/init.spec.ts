import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TEMPLATE_ROOT, parseArgs } from '../../src/cli/init.js';
import { copyTemplate } from '../../src/shared/template.js';

const createdDirs: string[] = [];

const createTempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'devflow-template-'));
  createdDirs.push(dir);
  return dir;
};

afterEach(async () => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (!dir) continue;
    await rm(dir, { recursive: true, force: true });
  }
});

describe('CLI argument parsing', () => {
  it('returns defaults with no arguments', () => {
    const parsed = parseArgs([]);
    expect(parsed).toEqual({
      destination: '.',
      force: false,
      dryRun: false,
      list: false
    });
  });

  it('parses destination and flags', () => {
    const parsed = parseArgs(['example', '--force', '--dry-run', '--list']);
    expect(parsed).toEqual({
      destination: 'example',
      force: true,
      dryRun: true,
      list: true
    });
  });

  it('supports optional init command alias', () => {
    const parsed = parseArgs(['init', 'demo-app']);
    expect(parsed).toEqual({
      destination: 'demo-app',
      force: false,
      dryRun: false,
      list: false
    });
  });
});

describe('Template copy', () => {
  it('copies template files into destination', async () => {
    const destination = await createTempDir();
    const results = await copyTemplate(TEMPLATE_ROOT, destination, { skipExisting: true });

    expect(results.some((item) => item.path === '.devflow/state.json')).toBe(true);
    expect(
      results.some((item) => item.path === '.devflow/steps/.keep')
    ).toBe(true);

    const stateStat = await stat(join(destination, '.devflow', 'state.json'));
    expect(stateStat.isFile()).toBe(true);

    const state = await readFile(join(destination, '.devflow', 'state.json'), 'utf-8');
    const parsed = JSON.parse(state) as Record<string, unknown>;
    expect(parsed).toHaveProperty('suggestedNext', 'step-01.requirements');
  });

  it('skips existing files when not forced', async () => {
    const destination = await createTempDir();
    await copyTemplate(TEMPLATE_ROOT, destination, { skipExisting: true });
    const secondRun = await copyTemplate(TEMPLATE_ROOT, destination, { skipExisting: true });

    const skipped = secondRun.filter((item) => item.status === 'skipped');
    expect(skipped.length).toBeGreaterThan(0);
  });
});
