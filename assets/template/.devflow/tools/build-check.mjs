#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const startedAt = new Date().toISOString();

const commandExists = (cmd) => {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(finder, [cmd], {
    stdio: 'ignore',
    encoding: 'utf-8'
  });
  return result.status === 0;
};

const run = ({ label, command, args = [], optional = false }) => {
  if (optional && !commandExists(command)) {
    return {
      label,
      command: [command, ...args].join(' '),
      status: 'skipped',
      exitCode: null,
      stdout: '',
      stderr: `${command} not found, skipped.`
    };
  }

  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
    env: {
      ...process.env,
      FORCE_COLOR: '0'
    }
  });

  const output = {
    label,
    command: [command, ...args].join(' '),
    status: result.status === 0 ? 'ok' : 'failed',
    exitCode: result.status,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? ''
  };

  return output;
};

const tasks = [];

if (existsSync(resolve('package.json'))) {
  tasks.push(
    run({ label: 'pnpm typecheck', command: 'pnpm', args: ['typecheck', '--if-present'] })
  );
  if (tasks.at(-1).status === 'ok') {
    tasks.push(run({ label: 'pnpm build', command: 'pnpm', args: ['build'] }));
  }
  if (tasks.at(-1).status === 'ok') {
    tasks.push(run({ label: 'pnpm lint', command: 'pnpm', args: ['lint', '--if-present'] }));
  }
}

if (existsSync(resolve('go.mod'))) {
  tasks.push(run({ label: 'go mod tidy', command: 'go', args: ['mod', 'tidy'] }));
  if (tasks.at(-1).status === 'ok') {
    tasks.push(run({ label: 'go build ./...', command: 'go', args: ['build', './...'] }));
  }
  if (tasks.at(-1).status === 'ok') {
    tasks.push(
      run({
        label: 'golangci-lint run',
        command: 'golangci-lint',
        args: ['run'],
        optional: true
      })
    );
  }
}

if (existsSync(resolve('Cargo.toml'))) {
  tasks.push(run({ label: 'cargo check', command: 'cargo', args: ['check'] }));
  if (tasks.at(-1).status === 'ok') {
    tasks.push(run({ label: 'cargo clippy', command: 'cargo', args: ['clippy', '--all-targets'] }));
  }
}

if (existsSync(resolve('pyproject.toml')) || existsSync(resolve('requirements.txt'))) {
  tasks.push(run({ label: 'pip check', command: 'pip', args: ['check'] }));
  if (tasks.at(-1).status === 'ok') {
    tasks.push(
      run({
        label: 'flake8 .',
        command: 'flake8',
        args: ['.'],
        optional: true
      })
    );
  }
}

const finishedAt = new Date().toISOString();

const report = {
  startedAt,
  finishedAt,
  status: tasks.some((task) => task.status === 'failed') ? 'failed' : 'ok',
  tasks
};

const outputPathArg = process.argv.find((arg) => arg.startsWith('--output='));
if (outputPathArg) {
  const outputPath = outputPathArg.split('=')[1];
  writeFileSync(resolve(outputPath), JSON.stringify(report, null, 2));
}

console.log(JSON.stringify(report, null, 2));

process.exit(report.status === 'ok' ? 0 : 1);
