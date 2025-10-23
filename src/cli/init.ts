#!/usr/bin/env node

import { createRequire } from 'node:module';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { promises as fs } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { logger } from '../shared/logger.js';
import { copyTemplate, getTemplateFiles } from '../shared/template.js';
import { runWizard } from './wizard.js';
import { runCleanup } from './cleanup.js';
import { runReview } from './review.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const templateRoot = resolve(__dirname, '../../assets/template');
export const TEMPLATE_ROOT = templateRoot;

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version?: string };
const version: string = typeof pkg.version === 'string' ? pkg.version : '0.0.0';

type SetupOptions = {
  destination: string;
  force: boolean;
  dryRun: boolean;
  yes: boolean;
  list: boolean;
};

const printHelp = () => {
  logger.info('DevFlow CLI');
  logger.info('');
  logger.info('Usage: devflow [options] [target-directory]');
  logger.info('');
  logger.info('Options:');
  logger.info('  -f, --force       覆盖现有文件（不提示）');
  logger.info('  -y, --yes         对提示自动回答「是」');
  logger.info('  --dry-run         仅预览将要写入的文件');
  logger.info('  --list            列出模板包含的全部文件');
  logger.info('  -h, --help        查看帮助');
  logger.info('  -v, --version     查看版本信息');
};

const COMMAND_ALIASES = new Set(['init', 'create', 'setup', 'install']);

export const parseSetupArgs = (argv: string[]): SetupOptions | 'help' | 'version' => {
  const args = [...argv];

  if (args[0] === 'devflow') {
    args.shift();
  }

  if (args[0] && COMMAND_ALIASES.has(args[0])) {
    args.shift();
  }

  let destination: string | undefined;
  let force = false;
  let dryRun = false;
  let yes = false;
  let list = false;

  for (const arg of args) {
    switch (arg) {
      case '-f':
      case '--force':
        force = true;
        break;
      case '-y':
      case '--yes':
        yes = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--list':
        list = true;
        break;
      case '-h':
      case '--help':
        return 'help';
      case '-v':
      case '--version':
        return 'version';
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        if (!destination) {
          destination = arg;
        } else {
          throw new Error(`Unexpected argument: ${arg}`);
        }
    }
  }

  return {
    destination: destination ?? '.',
    force,
    dryRun,
    yes,
    list
  };
};

const confirm = async (message: string, autoYes: boolean) => {
  if (autoYes) return true;
  const rl = createInterface({ input, output });
  const answer = (await rl.question(`${message} (y/N): `)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
};

const ensureDevflowReady = async (targetDir: string, options: SetupOptions) => {
  const target = resolve(process.cwd(), targetDir);
  const devflowDir = join(target, '.devflow');
  const exists = await fs
    .stat(devflowDir)
    .then(() => true)
    .catch(() => false);

  if (exists && !options.force) {
    const proceed = await confirm(
      '检测到已有 .devflow 目录，是否继续覆盖？',
      options.yes
    );
    if (!proceed) {
      logger.warn('已取消操作。');
      return { proceed: false, target };
    }
  }

  return { proceed: true, target };
};

const logCopyResults = (results: Awaited<ReturnType<typeof copyTemplate>>) => {
  if (results.length === 0) {
    logger.warn('没有写入任何文件（可能全部已存在且未指定 --force）。');
    return;
  }

  const copied = results.filter((res) => res.status === 'copied').length;
  const overwritten = results.filter((res) => res.status === 'overwritten').length;
  const skipped = results.filter((res) => res.status === 'skipped').length;

  results.forEach((res) => {
    const status = res.status.padEnd(11, ' ');
    const reason = res.reason ? ` (${res.reason})` : '';
    logger.info(`${status} ${res.path}${reason}`);
  });

  logger.info('');
  logger.info(`复制文件: ${copied}`);
  if (overwritten > 0) logger.warn(`覆盖文件: ${overwritten}`);
  if (skipped > 0) logger.warn(`跳过文件: ${skipped}`);
};

const printNextSteps = () => {
  logger.info('');
  logger.info('DevFlow 脚手架已准备就绪，下一步建议：');
  logger.info('  1. devflow wizard "描述你的需求"    # 场景识别并写入提示');
  logger.info('  2. 在 Codex 对话中粘贴 .devflow/bootstrap/codex-start.md');
  logger.info('  3. 跟随提示推进 steps，并按需使用 devflow review / devflow cleanup');
};

export const runSetup = async (argv: string[]) => {
  try {
    const parsed = parseSetupArgs(argv);

    if (parsed === 'help') {
      printHelp();
      return;
    }

    if (parsed === 'version') {
      logger.info(`v${version}`);
      return;
    }

    const targetDir = resolve(process.cwd(), parsed.destination);

    if (parsed.list || parsed.dryRun) {
      const files = await getTemplateFiles(templateRoot);
      logger.info(`Template files (${files.length}):`);
      files.forEach((file) => logger.info(`  ${file}`));

      if (parsed.dryRun) {
        logger.info('Dry run complete. No files were written.');
        return;
      }

      if (parsed.list) {
        return;
      }
    }

    const { proceed, target } = await ensureDevflowReady(targetDir, parsed);
    if (!proceed) return;

    const results = await copyTemplate(templateRoot, target, {
      force: parsed.force,
      skipExisting: !parsed.force
    });

    logCopyResults(results);
    printNextSteps();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    process.exitCode = 1;
  }
};

const dispatch = (argv: string[]) => {
  if (argv.length === 0) {
    void runSetup([]);
    return;
  }

  const [command, ...rest] = argv;

  if (command === 'devflow') {
    dispatch(rest);
    return;
  }

  switch (command) {
    case 'wizard':
      void runWizard(rest);
      return;
    case 'cleanup':
      void runCleanup(rest);
      return;
    case 'review':
      void runReview(rest);
      return;
    default:
      void runSetup(argv);
  }
};

const isDirectExecution = () => {
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  return import.meta.url === pathToFileURL(invokedPath).href;
};

if (isDirectExecution()) {
  dispatch(process.argv.slice(2));
}
