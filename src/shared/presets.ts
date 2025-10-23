import { logger } from './logger.js';

export interface Preset {
  id: string;
  title: string;
  keywords: string[];
  summary: string;
  recommendations: string[];
  codexPrompt: string;
}

export interface MatchResult {
  preset: Preset;
  matchedKeywords: string[];
  scores: Array<{
    preset: Preset;
    score: number;
    matchedKeywords: string[];
  }>;
}

const PRESETS: Preset[] = [
  {
    id: 'feature',
    title: '新功能开发',
    keywords: ['新增', '新功能', 'feature', '实现', '开发', '添加', '构建', '需求'],
    summary: '聚焦于新增能力，强调用户故事、验收标准与上线路径。',
    recommendations: [
      '在 requirements 阶段梳理用户故事、验收标准与影响范围。',
      '在 plan 阶段列出数据流、接口、依赖与风险；必要时产出原型或草图。',
      '在 impl 阶段按 todo 顺序实现，每完成一项就更新说明与提交记录。',
      '在 build-check 前运行自测，确保关键路径与监控准备齐全。'
    ],
    codexPrompt:
      '本次任务属于新增功能，请在 requirements 中明确用户故事与验收标准，plan 阶段拆解技术实现，impl 阶段按 todos 推进并记录关键提交。'
  },
  {
    id: 'bugfix',
    title: '缺陷修复',
    keywords: ['修复', 'bug', '缺陷', '问题', '异常', '故障', '报错', '崩溃', 'fix'],
    summary: '定位与修正现有系统中的问题，强调复现、根因分析与回归测试。',
    recommendations: [
      '在 requirements 阶段记录复现步骤、期望与实际结果，以及影响范围。',
      '在 plan 阶段梳理可能的根因、排查路径与需要修改的模块。',
      '在 impl 阶段跟踪每次实验的结果，确认根因后再编写最终修复方案。',
      '在 build-check 或自定义测试中重点关注回归用例与边界条件。'
    ],
    codexPrompt:
      '本次任务是修复缺陷，请在 requirements 中说明复现步骤及影响，plan 阶段规划排查方案，impl 阶段记录根因验证与修复细节，并补充回归测试。'
  },
  {
    id: 'architecture',
    title: '架构设计 / 拓展规划',
    keywords: ['架构', '设计', '重构', '扩展', '规划', '演进', '方案', '抽象', 'refactor'],
    summary: '围绕系统抽象与演进进行规划，强调权衡、风险及路线图。',
    recommendations: [
      '在 requirements 阶段明确业务目标、约束、成功指标与非目标。',
      '在 plan 阶段输出架构方案对比、权衡分析、迁移或演进策略。',
      '在 todos 中列出 spike、PoC、拆分里程碑等任务，说明依赖关系。',
      '在 summary 中沉淀决策记录、后续行动与风险缓解措施。'
    ],
    codexPrompt:
      '本次任务以架构/设计为主，请聚焦方案制定与权衡，输出对比、风险及迁移计划，如需代码实现可产出 PoC 或脚手架佐证。'
  },
  {
    id: 'testing',
    title: '测试与质量保障',
    keywords: ['测试', 'test', '覆盖率', '验证', '质量', '回归', '自动化', '用例', 'checks'],
    summary: '构建和强化测试体系，关注验证策略、用例设计与质量指标。',
    recommendations: [
      '在 requirements 中声明验证目标、风险领域与衡量标准（覆盖率、缺陷率等）。',
      '在 plan 阶段列出测试金字塔层级、工具、数据准备和环境依赖。',
      '在 todos 中细化测试用例、脚本实现、CI 集成与报告输出任务。',
      '在 summary 中总结测试结果、缺陷分布、后续改进项。'
    ],
    codexPrompt:
      '本次任务聚焦测试与质量，请输出验证范围、用例设计、自动化脚本与指标收敛情况，并在 impl 阶段补充测试代码与报告。'
  }
];

const DEFAULT_PRESET: Preset = {
  id: 'general',
  title: '通用开发流程',
  keywords: [],
  summary: '无法匹配特定场景时的默认流程，仍需遵循 DevFlow 七步法。',
  recommendations: [
    '在 requirements 阶段澄清目标、约束、依赖与验收标准。',
    '在 plan 阶段拆解任务、识别风险并制定验证策略。',
    '在 impl 阶段持续同步进度、提交记录与测试结果。',
    '保持 steps 与 state.json 更新，使 Codex 能够准确接力。'
  ],
  codexPrompt:
    '请按照通用 DevFlow 流程推进，确保每个阶段的产出齐全，并在实现阶段同步提交记录与验证结果。'
};

export const matchPreset = (intent: string): MatchResult => {
  const normalized = intent.toLowerCase();

  const scores = PRESETS.map((preset) => {
    const matchedKeywords = preset.keywords.filter((keyword) =>
      normalized.includes(keyword.toLowerCase())
    );
    return {
      preset,
      matchedKeywords,
      score: matchedKeywords.length
    };
  });

  const sorted = scores
    .slice()
    .sort((a, b) => b.score - a.score || a.preset.id.localeCompare(b.preset.id));

  const top = sorted.find((item) => item.score > 0);
  if (!top) {
    return {
      preset: DEFAULT_PRESET,
      matchedKeywords: [],
      scores: sorted
    };
  }

  return {
    preset: top.preset,
    matchedKeywords: top.matchedKeywords,
    scores: sorted
  };
};

export const logPresetSummary = (preset: Preset, matchedKeywords: string[]) => {
  logger.info(`检测到场景：${preset.title} (${preset.id})`);
  if (matchedKeywords.length > 0) {
    logger.info(`触发关键词：${matchedKeywords.join(', ')}`);
  }
  logger.info('');
  logger.info(preset.summary);
  logger.info('');
  logger.info('推荐行动：');
  preset.recommendations.forEach((item, index) => {
    logger.info(`  ${index + 1}. ${item}`);
  });
};

export const getPresets = () => [...PRESETS, DEFAULT_PRESET];
