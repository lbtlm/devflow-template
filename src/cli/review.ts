import { promises as fs } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { logger } from '../shared/logger.js';

const STEP_TEMPLATES = [
  { id: 'step-01', type: 'requirements', title: '需求澄清' },
  { id: 'step-02', type: 'api-contract', title: '接口契约' },
  { id: 'step-03', type: 'plan', title: '开发计划' },
  { id: 'step-04', type: 'todos', title: '任务清单' },
  { id: 'step-05', type: 'impl', title: '实现' },
  { id: 'step-06', type: 'build-check', title: '构建校验' },
  { id: 'step-07', type: 'summary', title: '总结复盘' }
];

const DEFAULT_STATE = {
  activeSession: null,
  currentStep: null,
  completed: [],
  suggestedNext: 'step-01.requirements',
  lastBuildStatus: null,
  metrics: {
    totalSteps: STEP_TEMPLATES.length,
    passed: 0,
    failed: 0,
    warnings: 0
  },
  updatedAt: null
};

type StepStatus = {
  template: (typeof STEP_TEMPLATES)[number];
  path: string;
  exists: boolean;
  summary?: string;
  status?: string;
};

type TestRecommendation = {
  command: string;
  reason: string;
};

type CommitInfo = {
  hash: string;
  date: string;
  message: string;
};

export type ReviewData = {
  generatedAt: string;
  state: typeof DEFAULT_STATE;
  steps: StepStatus[];
  completedSteps: StepStatus[];
  missingSteps: StepStatus[];
  recommendedNext: string | null;
  recommendedTests: TestRecommendation[];
  recentCommits: CommitInfo[];
  suggestions: string[];
};

const readJSON = async <T>(path: string): Promise<T | null> => {
  try {
    const content = await fs.readFile(path, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
};

const detectPackageManager = async (cwd: string) => {
  const pnpm = await fileExists(join(cwd, 'pnpm-lock.yaml'));
  if (pnpm) return 'pnpm';
  const yarn = await fileExists(join(cwd, 'yarn.lock'));
  if (yarn) return 'yarn';
  return 'npm';
};

const fileExists = async (path: string) => {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
};

const detectTests = async (cwd: string): Promise<TestRecommendation[]> => {
  const recommendations: TestRecommendation[] = [];
  const packagePath = join(cwd, 'package.json');

  if (await fileExists(packagePath)) {
    const pkg = await readJSON<{ scripts?: Record<string, string> }>(packagePath);
    const pm = await detectPackageManager(cwd);
    const run = (script: string) =>
      pm === 'pnpm'
        ? `pnpm run ${script}`
        : pm === 'yarn'
          ? `yarn ${script}`
          : `npm run ${script}`;

    const scripts = pkg?.scripts ?? {};
    if (scripts.test) {
      recommendations.push({
        command: run('test'),
        reason: 'package.json 定义了 test 脚本'
      });
    }
    if (scripts.lint) {
      recommendations.push({
        command: run('lint'),
        reason: 'package.json 定义了 lint 脚本'
      });
    }
    if (scripts.typecheck) {
      recommendations.push({
        command: run('typecheck'),
        reason: 'package.json 定义了 typecheck 脚本'
      });
    }
  }

  if (await fileExists(join(cwd, 'go.mod'))) {
    recommendations.push({
      command: 'go test ./...',
      reason: '检测到 go.mod，可运行 Go 单元测试'
    });
  }

  if (await fileExists(join(cwd, 'Cargo.toml'))) {
    recommendations.push({
      command: 'cargo test',
      reason: '检测到 Cargo.toml，可运行 Rust 测试'
    });
  }

  if (await fileExists(join(cwd, 'pytest.ini')) || (await fileExists(join(cwd, 'pyproject.toml')))) {
    recommendations.push({
      command: 'pytest',
      reason: '检测到 Python 测试配置，可运行 pytest'
    });
  }

  if (await fileExists(join(cwd, 'Makefile'))) {
    recommendations.push({
      command: 'make test',
      reason: '检测到 Makefile，可尝试 `make test`'
    });
  }

  return recommendations;
};

const getRecentCommits = (cwd: string, limit = 5): CommitInfo[] => {
  const result = spawnSync('git', ['log', `-${limit}`, '--pretty=format:%h|%ad|%s', '--date=short'], {
    cwd,
    encoding: 'utf-8'
  });

  if (result.status !== 0 || !result.stdout) {
    return [];
  }

  return result.stdout
    .trim()
    .split('\n')
    .map((line) => {
      const [hash, date, message] = line.split('|');
      return {
        hash,
        date,
        message
      };
    });
};

const loadSteps = async (cwd: string): Promise<StepStatus[]> => {
  return Promise.all(
    STEP_TEMPLATES.map(async (template) => {
      const filename = `${template.id}.${template.type}.json`;
      const path = join(cwd, '.devflow/steps', filename);
      const exists = await fileExists(path);
      if (!exists) {
        return {
          template,
          path,
          exists
        };
      }

      const data = await readJSON<{
        summary?: string;
        status?: string;
      }>(path);

      return {
        template,
        path,
        exists: true,
        summary: data?.summary,
        status: data?.status
      };
    })
  );
};

const loadState = async (cwd: string) => {
  const state = await readJSON<typeof DEFAULT_STATE>(join(cwd, '.devflow/state.json'));
  return state ?? { ...DEFAULT_STATE };
};

const buildSuggestions = (data: {
  missingSteps: StepStatus[];
  state: typeof DEFAULT_STATE;
  recommendedTests: TestRecommendation[];
  recentCommits: CommitInfo[];
}) => {
  const suggestions: string[] = [];

  if (data.missingSteps.length > 0) {
    const next = data.missingSteps[0];
    suggestions.push(
      `生成 ${next.template.id}.${next.template.type}.json（${next.template.title}）以保持流程完整。`
    );
  } else {
    suggestions.push('所有步骤文件已存在，确保它们的 `status` 为 approved 并更新最新总结。');
  }

  if (data.recommendedTests.length > 0) {
    suggestions.push(`执行推荐测试命令，例如：${data.recommendedTests[0].command}`);
  }

  if (data.state.lastBuildStatus && data.state.lastBuildStatus !== 'ok') {
    suggestions.push('上一次构建校验未通过，建议先修复构建或测试问题。');
  }

  return suggestions;
};

export const gatherReviewData = async (cwdInput?: string): Promise<ReviewData> => {
  const cwd = resolve(cwdInput ?? process.cwd());
  const steps = await loadSteps(cwd);
  const state = await loadState(cwd);
  const completedSteps = steps.filter((step) => step.exists);
  const missingSteps = steps.filter((step) => !step.exists);
  const recommendedTests = await detectTests(cwd);
  const recentCommits = getRecentCommits(cwd);
  const suggestions = buildSuggestions({
    missingSteps,
    state,
    recommendedTests,
    recentCommits
  });

  const recommendedNext =
    state.suggestedNext ??
    (missingSteps.length > 0
      ? `${missingSteps[0].template.id}.${missingSteps[0].template.type}`
      : null);

  return {
    generatedAt: new Date().toISOString(),
    state,
    steps,
    completedSteps,
    missingSteps,
    recommendedNext,
    recommendedTests,
    recentCommits,
    suggestions
  };
};

const formatMarkdown = (data: ReviewData, cwd: string) => {
  const lines: string[] = [];
  lines.push(`# DevFlow Review (${data.generatedAt})`);
  lines.push('');
  const completedCount = data.completedSteps.length;
  const total = data.steps.length;
  lines.push(`## 状态总览`);
  lines.push(`- 当前步骤：${data.state.currentStep ?? '未开始'}`);
  lines.push(`- 推荐下一步：${data.recommendedNext ?? '已完成所有阶段'}`);
  lines.push(`- 完成进度：${completedCount}/${total}`);
  lines.push('');

  if (data.missingSteps.length > 0) {
    lines.push('## 缺失的步骤产物');
    data.missingSteps.forEach((step) => {
      lines.push(
        `- ${step.template.id}.${step.template.type} — ${step.template.title}（缺少文件 ${relative(cwd, step.path)}）`
      );
    });
    lines.push('');
  }

  lines.push('## 推荐测试命令');
  if (data.recommendedTests.length === 0) {
    lines.push('- 未检测到可推荐的命令，请根据技术栈自行选择测试方式。');
  } else {
    data.recommendedTests.forEach((item) => {
      lines.push(`- \`${item.command}\` — ${item.reason}`);
    });
  }
  lines.push('');

  lines.push('## 最近提交');
  if (data.recentCommits.length === 0) {
    lines.push('- 当前目录不是 Git 仓库，或无法读取提交历史。');
  } else {
    data.recentCommits.forEach((commit) => {
      lines.push(`- ${commit.hash} (${commit.date}) ${commit.message}`);
    });
  }
  lines.push('');

  lines.push('## 下一步建议');
  data.suggestions.forEach((suggestion) => {
    lines.push(`- ${suggestion}`);
  });
  lines.push('');

  return lines.join('\n');
};

const writeReport = async (cwd: string, markdown: string, output?: string) => {
  const target =
    output ??
    join(cwd, '.devflow/reports', `review-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
  await fs.mkdir(dirname(target), { recursive: true });
  await fs.writeFile(target, markdown, 'utf-8');
  return target;
};

const parseArgs = (argv: string[]) => {
  let output: string | undefined;
  let cwd: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '-o':
      case '--output': {
        const next = argv[i + 1];
        if (!next) {
          throw new Error('缺少 --output 参数的值');
        }
        output = next;
        i += 1;
        break;
      }
      case '--cwd': {
        const next = argv[i + 1];
        if (!next) {
          throw new Error('缺少 --cwd 参数的值');
        }
        cwd = next;
        i += 1;
        break;
      }
      case '-h':
      case '--help':
        throw new Error('help');
      default:
        throw new Error(`未知参数: ${arg}`);
    }
  }
  return { output, cwd };
};

const printHelp = () => {
  logger.info('DevFlow 回顾报告');
  logger.info('');
  logger.info('用法: devflow review [--output <path>] [--cwd <path>]');
  logger.info('');
  logger.info('报告包含当前步骤、缺失产物、推荐测试命令、最近提交与下一步建议。');
};

export const runReview = async (argv: string[]) => {
  try {
    let parsed;
    try {
      parsed = parseArgs(argv);
    } catch (err) {
      if (err instanceof Error && err.message === 'help') {
        printHelp();
        return;
      }
      throw err;
    }

    const cwd = parsed.cwd ? resolve(parsed.cwd) : process.cwd();
    const data = await gatherReviewData(cwd);
    const markdown = formatMarkdown(data, cwd);
    const reportPath = await writeReport(cwd, markdown, parsed.output);

    logger.info(markdown);
    logger.info(`报告已写入：${relative(cwd, reportPath)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    process.exitCode = 1;
  }
};
