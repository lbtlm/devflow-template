import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { resolve, dirname, relative } from 'node:path';
import { promises as fs } from 'node:fs';
import { logger } from '../shared/logger.js';
import { logPresetSummary, matchPreset } from '../shared/presets.js';

interface WizardOptions {
  output?: string;
  intent?: string;
}

const defaultOutput = '.devflow/preset.json';

const printWizardHelp = () => {
  logger.info('DevFlow 场景向导');
  logger.info('');
  logger.info('用法: devflow wizard [选项] <自然语言描述>');
  logger.info('');
  logger.info('示例: devflow wizard "修复登录接口的 bug 并补充测试"');
  logger.info('');
  logger.info('选项:');
  logger.info('  -o, --output <file>   指定输出文件 (默认 .devflow/preset.json)');
  logger.info('  -h, --help            显示帮助');
};

const parseWizardArgs = (argv: string[]): WizardOptions | 'help' => {
  let outputPath: string | undefined;
  const fragments: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '-h':
      case '--help':
        return 'help';
      case '-o':
      case '--output': {
        const next = argv[i + 1];
        if (!next) {
          throw new Error('缺少 --output 参数的文件路径');
        }
        outputPath = next;
        i += 1;
        break;
      }
      default:
        fragments.push(arg);
        break;
    }
  }

  return {
    output: outputPath,
    intent: fragments.join(' ').trim()
  };
};

const ensureIntent = async (inputText?: string): Promise<string> => {
  if (inputText && inputText.length > 0) {
    return inputText;
  }

  const rl = createInterface({ input, output });
  const answer = await rl.question('请描述你的目标或需求：');
  rl.close();
  const intent = answer.trim();
  if (!intent) {
    throw new Error('未提供任何描述，向导已终止。');
  }
  return intent;
};

const writePresetFile = async (path: string, payload: unknown) => {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, JSON.stringify(payload, null, 2), 'utf-8');
};

export const runWizard = async (argv: string[]) => {
  try {
    const parsed = parseWizardArgs(argv);
    if (parsed === 'help') {
      printWizardHelp();
      return;
    }

    const intent = await ensureIntent(parsed.intent);
    const match = matchPreset(intent);

    logger.info('');
    logPresetSummary(match.preset, match.matchedKeywords);
    logger.info('');
    logger.info('建议在与 Codex 的第一轮需求说明中追加以下提示：');
    logger.info(match.preset.codexPrompt);
    logger.info('');

    const presetPayload = {
      intent,
      detectedAt: new Date().toISOString(),
      preset: {
        id: match.preset.id,
        title: match.preset.title,
        summary: match.preset.summary
      },
      matchedKeywords: match.matchedKeywords,
      recommendations: match.preset.recommendations,
      codexPrompt: match.preset.codexPrompt
    };

    const outputPath = resolve(process.cwd(), parsed.output ?? defaultOutput);
    await writePresetFile(outputPath, presetPayload);

    logger.info(`已写入场景配置：${relative(process.cwd(), outputPath)}`);
    logger.info('请在 Codex 会话中引用上述提示，Codex 将按该场景推进 DevFlow。');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    process.exitCode = 1;
  }
};
