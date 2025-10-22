#!/usr/bin/env node

import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { logger } from '../shared/logger.js';
import { copyTemplate, getTemplateFiles } from '../shared/template.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const templateRoot = resolve(__dirname, '../../assets/template');
export const TEMPLATE_ROOT = templateRoot;

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version?: string };
const version: string = typeof pkg.version === 'string' ? pkg.version : '0.0.0';

type CLIOptions = {
  destination: string;
  force: boolean;
  dryRun: boolean;
  list: boolean;
};

const printHelp = () => {
  logger.info('DevFlow Template CLI');
  logger.info('');
  logger.info('Usage: devflow-template [options] [target-directory]');
  logger.info('');
  logger.info('Options:');
  logger.info('  -f, --force       Overwrite existing files');
  logger.info('  --dry-run         Preview actions without writing files');
  logger.info('  --list            List template files and exit');
  logger.info('  -h, --help        Show help');
  logger.info('  -v, --version     Show CLI version');
};

const COMMAND_ALIASES = new Set(['init', 'create']);

export const parseArgs = (argv: string[]): CLIOptions | 'help' | 'version' => {
  const args = [...argv];

  if (args[0] && COMMAND_ALIASES.has(args[0])) {
    args.shift();
  }

  let destination: string | undefined;
  let force = false;
  let dryRun = false;
  let list = false;

  for (const arg of args) {
    switch (arg) {
      case '-f':
      case '--force':
        force = true;
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
    list
  };
};

export const run = async () => {
  try {
    const parsed = parseArgs(process.argv.slice(2));

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

    const results = await copyTemplate(templateRoot, targetDir, {
      force: parsed.force,
      skipExisting: !parsed.force
    });

    if (results.length === 0) {
      logger.warn('No files were processed. Check template contents.');
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
    logger.info(`Copied ${copied} file(s).`);

    if (overwritten > 0) {
      logger.warn(`Overwritten ${overwritten} file(s) due to --force.`);
    }

    if (skipped > 0) {
      logger.warn(
        `Skipped ${skipped} file(s). Use --force to overwrite or remove them manually.`
      );
    }

    logger.info('');
    logger.info('DevFlow scaffolding complete. Next steps:');
    logger.info('  1. corepack enable pnpm');
    logger.info('  2. pnpm install (if package.json exists)');
    logger.info('  3. 在 Codex 会话中粘贴 .devflow/bootstrap/codex-start.md 并输入需求');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    process.exitCode = 1;
  }
};

const isDirectExecution = () => {
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  return import.meta.url === pathToFileURL(invokedPath).href;
};

if (isDirectExecution()) {
  void run();
}
