import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TEMPLATE_ROOT } from '../../src/cli/init.js';
import { cleanupProject } from '../../src/cli/cleanup.js';
import { copyTemplate } from '../../src/shared/template.js';

const createTempWorkspace = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'devflow-cleanup-'));
  await copyTemplate(TEMPLATE_ROOT, dir, { force: true });
  return dir;
};

const readJSON = async (path: string) =>
  JSON.parse(await readFile(path, 'utf-8')) as Record<string, unknown>;

describe('cleanupProject', () => {
  it('archives step files and resets state', async () => {
    const cwd = await createTempWorkspace();
    const stepPath = join(cwd, '.devflow/steps/step-01.requirements.json');
    await writeFile(stepPath, '{"id":"step-01","type":"requirements"}', 'utf-8');
    const queueFile = join(cwd, '.devflow/queue/build-check.json');
    await writeFile(queueFile, '{"status":"pending"}', 'utf-8');

    await cleanupProject({ cwd });

    const steps = await readdir(join(cwd, '.devflow/steps'));
    expect(steps).toContain('.keep');
    expect(steps.includes('step-01.requirements.json')).toBe(false);

    const histories = await readdir(join(cwd, '.devflow/history'));
    expect(histories.length).toBeGreaterThan(0);

    const state = await readJSON(join(cwd, '.devflow/state.json'));
    expect(state.activeSession).toBeNull();
    expect(state.completed).toEqual([]);

    const preset = await readJSON(join(cwd, '.devflow/preset.json'));
    expect(preset.preset).toBeNull();
    expect(typeof preset.codexPrompt).toBe('string');

    await expect(
      readFile(queueFile, 'utf-8')
    ).rejects.toThrow();

    await rm(cwd, { recursive: true, force: true });
  });

  it('supports purge mode without history entry', async () => {
    const cwd = await createTempWorkspace();
    const stepPath = join(cwd, '.devflow/steps/step-02.plan.json');
    await writeFile(stepPath, '{"id":"step-02","type":"plan"}', 'utf-8');

    await cleanupProject({ cwd, purge: true });

    const histories = await readdir(join(cwd, '.devflow/history'));
    // 仍然保留 .gitkeep
    expect(histories.includes('.gitkeep')).toBe(true);

    const steps = await readdir(join(cwd, '.devflow/steps'));
    expect(steps.includes('step-02.plan.json')).toBe(false);

    await rm(cwd, { recursive: true, force: true });
  });
});
