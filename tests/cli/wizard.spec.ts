import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchPreset } from '../../src/shared/presets.js';
import { runWizard } from '../../src/cli/wizard.js';

const createTempDir = async () => mkdtemp(join(tmpdir(), 'devflow-wizard-'));

describe('preset matching', () => {
  it('detects bugfix intent from natural language', () => {
    const intent = '需要修复支付接口的 bug，并验证不会影响库存';
    const result = matchPreset(intent);
    expect(result.preset.id).toBe('bugfix');
    expect(result.matchedKeywords.length).toBeGreaterThan(0);
  });

  it('falls back to general when keywords do not match', () => {
    const intent = '探索新的商业机会';
    const result = matchPreset(intent);
    expect(result.preset.id).toBe('general');
  });
});

describe('wizard runner', () => {
  it('writes preset file with detected scenario', async () => {
    const dir = await createTempDir();
    const output = join(dir, 'preset.json');

    await runWizard(['--output', output, '我想新增一个用户邀请功能，并补充集成测试']);

    const raw = await readFile(output, 'utf-8');
    const payload = JSON.parse(raw) as { preset: { id: string }; intent: string };
    expect(payload.preset.id).toBe('feature');
    expect(payload.intent).toContain('用户邀请功能');

    await rm(dir, { recursive: true, force: true });
  });
});
