import { promises as fs } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../shared/logger.js';

interface CleanupOptions {
  purge?: boolean;
  dryRun?: boolean;
  cwd?: string;
}

interface ParsedArgs {
  purge: boolean;
  dryRun: boolean;
}

const DEVFLOW_DIR = '.devflow';
const STEPS_DIR = '.devflow/steps';
const HISTORY_DIR = '.devflow/history';
const STATE_FILE = '.devflow/state.json';
const PRESET_FILE = '.devflow/preset.json';
const QUEUE_DIR = '.devflow/queue';

const INITIAL_STATE = {
  activeSession: null,
  currentStep: null,
  completed: [],
  suggestedNext: 'step-01.requirements',
  lastBuildStatus: null,
  metrics: {
    totalSteps: 7,
    passed: 0,
    failed: 0,
    warnings: 0
  },
  updatedAt: null
};

const INITIAL_PRESET = {
  intent: null,
  detectedAt: null,
  preset: null,
  matchedKeywords: [] as string[],
  recommendations: [] as string[],
  codexPrompt: '尚未运行 devflow-template wizard，请先执行该向导以匹配合适的场景。'
};

const ensureDirectory = async (path: string) => {
  await fs.mkdir(path, { recursive: true });
};

const listStepFiles = async (cwd: string) => {
  const dir = join(cwd, STEPS_DIR);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name !== '.keep')
    .map((entry) => join(dir, entry.name));
};

const removeQueueArtifacts = async (cwd: string) => {
  const queueDir = join(cwd, QUEUE_DIR);
  let entries: Array<{ name: string; path: string }> = [];
  try {
    const rawEntries = await fs.readdir(queueDir, { withFileTypes: true });
    entries = rawEntries
      .filter((entry) => entry.isFile() && entry.name !== '.gitkeep')
      .map((entry) => ({ name: entry.name, path: join(queueDir, entry.name) }));
  } catch {
    return;
  }

  await Promise.all(entries.map((entry) => fs.rm(entry.path)));
};

const writeJson = async (filePath: string, payload: unknown) => {
  await fs.mkdir(dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
};

const archiveSteps = async (paths: string[], cwd: string, dryRun: boolean) => {
  if (paths.length === 0) {
    logger.info('没有可归档的 step 文件。');
    return;
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-');
  const archiveDir = join(cwd, HISTORY_DIR, timestamp);

  if (dryRun) {
    logger.info(`DRY RUN: 将创建归档目录 ${relative(cwd, archiveDir)}`);
    paths.forEach((path) => {
      logger.info(`DRY RUN: 移动 ${relative(cwd, path)} -> ${relative(cwd, join(archiveDir, path.split('/').pop() ?? 'step.json'))}`);
    });
    return;
  }

  await ensureDirectory(archiveDir);

  await Promise.all(
    paths.map(async (source) => {
      const target = join(archiveDir, source.split('/').pop() ?? '');
      await fs.rename(source, target);
      logger.info(`已归档 ${relative(cwd, source)} -> ${relative(cwd, target)}`);
    })
  );
};

const purgeSteps = async (paths: string[], cwd: string, dryRun: boolean) => {
  if (paths.length === 0) {
    logger.info('没有可删除的 step 文件。');
    return;
  }

  await Promise.all(
    paths.map(async (path) => {
      if (dryRun) {
        logger.info(`DRY RUN: 删除 ${relative(cwd, path)}`);
        return;
      }
      await fs.rm(path);
      logger.info(`已删除 ${relative(cwd, path)}`);
    })
  );
};

const resetStateFiles = async (cwd: string, dryRun: boolean) => {
  const statePath = join(cwd, STATE_FILE);
  const presetPath = join(cwd, PRESET_FILE);

  if (dryRun) {
    logger.info(`DRY RUN: 重置 ${relative(cwd, statePath)} 和 ${relative(cwd, presetPath)}`);
    return;
  }

  await writeJson(statePath, INITIAL_STATE);
  await writeJson(presetPath, INITIAL_PRESET);
  logger.info(`已重置 ${STATE_FILE} 与 ${PRESET_FILE}`);
};

const parseArgs = (argv: string[]): ParsedArgs => {
  let purge = false;
  let dryRun = false;
  for (const arg of argv) {
    switch (arg) {
      case '--purge':
        purge = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '-h':
      case '--help':
        throw new Error('help');
      default:
        throw new Error(`未知参数: ${arg}`);
    }
  }
  return { purge, dryRun };
};

const printHelp = () => {
  logger.info('DevFlow 清理工具');
  logger.info('');
  logger.info('用法: devflow cleanup [--purge] [--dry-run]');
  logger.info('');
  logger.info('默认行为：将 `.devflow/steps/*.json` 归档到 `.devflow/history/<timestamp>/`，');
  logger.info('并重置 `.devflow/state.json` 与 `.devflow/preset.json`，清理 `.devflow/queue/` 中的临时文件。');
  logger.info('');
  logger.info('选项:');
  logger.info('  --purge     直接删除 steps 文件而不归档');
  logger.info('  --dry-run   仅打印将执行的操作，不进行实际修改');
};

export const cleanupProject = async (options: CleanupOptions = {}) => {
  const cwd = resolve(options.cwd ?? process.cwd());
  const purge = options.purge ?? false;
  const dryRun = options.dryRun ?? false;

  const stepsDir = join(cwd, STEPS_DIR);
  try {
    await fs.access(stepsDir);
  } catch {
    throw new Error(`未找到 ${relative(cwd, stepsDir)}，请确认已在 DevFlow 项目根目录。`);
  }

  const stepFiles = await listStepFiles(cwd);

  if (purge) {
    await purgeSteps(stepFiles, cwd, dryRun);
  } else {
    await archiveSteps(stepFiles, cwd, dryRun);
  }

  await resetStateFiles(cwd, dryRun);
  await removeQueueArtifacts(cwd);

  if (dryRun) {
    logger.info('DRY RUN: 清理过程已模拟完成，未做任何修改。');
  } else {
    logger.info('清理完成，可开始新的 DevFlow 会话。');
  }
};

export const runCleanup = async (argv: string[]) => {
  try {
    let parsed: ParsedArgs;
    try {
      parsed = parseArgs(argv);
    } catch (err) {
      if (err instanceof Error && err.message === 'help') {
        printHelp();
        return;
      }
      throw err;
    }

    await cleanupProject({ purge: parsed.purge, dryRun: parsed.dryRun });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    process.exitCode = 1;
  }
};
