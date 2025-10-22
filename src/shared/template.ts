import { promises as fs } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export type CopyStatus = 'copied' | 'skipped' | 'overwritten';

export type CopyResult = {
  path: string;
  status: CopyStatus;
  reason?: string;
};

export interface CopyTemplateOptions {
  force?: boolean;
  skipExisting?: boolean;
  filter?: (path: string) => boolean;
}

const ensureDirectory = async (path: string) => {
  await fs.mkdir(path, { recursive: true });
};

const defaultFilter = (path: string) => !path.includes('node_modules');

const copyFile = async (source: string, target: string) => {
  await ensureDirectory(dirname(target));
  await fs.copyFile(source, target);
};

const traverseDirectory = async (
  root: string,
  visitor: (source: string, relativePath: string, isDirectory: boolean) => Promise<void>
) => {
  const queue: Array<{ abs: string; rel: string }> = [{ abs: root, rel: '.' }];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) continue;
    const entries = await fs.readdir(current.abs, { withFileTypes: true });

    for (const entry of entries) {
      const abs = join(current.abs, entry.name);
      const rel =
        current.rel === '.' ? entry.name : join(current.rel, entry.name);

      if (entry.isDirectory()) {
        await visitor(abs, rel, true);
        queue.push({ abs, rel });
      } else if (entry.isFile()) {
        await visitor(abs, rel, false);
      }
    }
  }
};

export const copyTemplate = async (
  templateRoot: string,
  targetRoot: string,
  options: CopyTemplateOptions = {}
): Promise<CopyResult[]> => {
  const force = options.force ?? false;
  const skipExisting = options.skipExisting ?? !force;
  const filter = options.filter ?? defaultFilter;
  const results: CopyResult[] = [];

  await traverseDirectory(templateRoot, async (source, rel, isDirectory) => {
    if (!filter(rel)) return;

    const target = join(targetRoot, rel);
    if (isDirectory) {
      await ensureDirectory(target);
      return;
    }

    const exists = await fs
      .stat(target)
      .then(() => true)
      .catch(() => false);

    if (exists && skipExisting) {
      results.push({
        path: rel,
        status: 'skipped',
        reason: 'Already exists'
      });
      return;
    }

    await copyFile(source, target);

    results.push({
      path: rel,
      status: exists ? 'overwritten' : 'copied'
    });
  });

  return results.sort((a, b) => a.path.localeCompare(b.path));
};

export const getTemplateFiles = async (templateRoot: string): Promise<string[]> => {
  const files: string[] = [];

  await traverseDirectory(templateRoot, async (source, rel, isDirectory) => {
    if (isDirectory) return;
    files.push(relative(templateRoot, source) || rel);
  });

  return files.sort();
};
