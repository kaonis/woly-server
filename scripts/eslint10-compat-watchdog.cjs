#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

function parseArgs(argv) {
  const options = {
    outputPath: null,
    githubOutputPath: null,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--output') {
      options.outputPath = argv[i + 1] || null;
      i += 1;
      continue;
    }

    if (arg === '--github-output') {
      options.githubOutputPath = argv[i + 1] || null;
      i += 1;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.outputPath === '') {
    throw new Error('Missing value for --output');
  }

  if (options.githubOutputPath === '') {
    throw new Error('Missing value for --github-output');
  }

  return options;
}

function runNpmView(args) {
  const output = execFileSync('npm', ['view', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return output.trim();
}

function readLatestEslint10Compatibility() {
  const pluginRaw = runNpmView([
    '@typescript-eslint/eslint-plugin@latest',
    'version',
    'peerDependencies',
    '--json',
  ]);
  const parserRaw = runNpmView([
    '@typescript-eslint/parser@latest',
    'version',
    'peerDependencies',
    '--json',
  ]);
  const eslintRaw = runNpmView(['eslint@latest', 'version']);

  const plugin = JSON.parse(pluginRaw);
  const parser = JSON.parse(parserRaw);
  const eslintVersion = eslintRaw.replace(/^['"]|['"]$/g, '');
  const peerRange = plugin.peerDependencies?.eslint || 'unknown';
  const supportsEslint10 = /(^|[^0-9])10(\.|$)/.test(peerRange);

  return {
    checkedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    eslintVersion,
    pluginVersion: plugin.version || 'unknown',
    parserVersion: parser.version || 'unknown',
    peerRange,
    supportsEslint10,
  };
}

function buildComment(payload) {
  const statusLine = payload.supportsEslint10
    ? 'UNBLOCKED: latest @typescript-eslint peer range includes ESLint 10.'
    : 'BLOCKED: latest @typescript-eslint peer range does not include ESLint 10 yet.';

  return [
    '<!-- eslint10-compat-watchdog -->',
    '## ESLint 10 Compatibility Watchdog',
    '',
    `Checked at: \`${payload.checkedAt}\``,
    '',
    `- Latest \`eslint\`: \`${payload.eslintVersion}\``,
    `- Latest \`@typescript-eslint/eslint-plugin\`: \`${payload.pluginVersion}\``,
    `- Latest \`@typescript-eslint/parser\`: \`${payload.parserVersion}\``,
    `- Reported \`eslint\` peer range: \`${payload.peerRange}\``,
    `- Status: **${statusLine}**`,
    '',
    'Tracking issue: #150',
  ].join('\n');
}

function appendGithubOutput(outputPath, supportsEslint10, commentBody) {
  const delimiter = `WATCHDOG_COMMENT_${Date.now()}`;
  const buffer = [
    `supports_eslint_10=${supportsEslint10 ? 'true' : 'false'}`,
    `comment_body<<${delimiter}`,
    commentBody,
    delimiter,
    '',
  ].join('\n');
  fs.appendFileSync(outputPath, buffer, 'utf8');
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: node scripts/eslint10-compat-watchdog.cjs [options]',
      '',
      'Options:',
      '  --output <path>         Write markdown comment body to file',
      '  --github-output <path>  Append supports_eslint_10 and comment_body outputs',
      '  --json                  Print compatibility payload as JSON',
      '  -h, --help              Show this help text',
      '',
    ].join('\n')
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const payload = readLatestEslint10Compatibility();
  const comment = buildComment(payload);

  if (options.outputPath) {
    fs.writeFileSync(options.outputPath, `${comment}\n`, 'utf8');
  }

  if (options.githubOutputPath) {
    appendGithubOutput(
      options.githubOutputPath,
      payload.supportsEslint10,
      comment
    );
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${comment}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `eslint10-compat-watchdog failed: ${error.message || String(error)}\n`
    );
    process.exit(1);
  }
}

module.exports = {
  buildComment,
  parseArgs,
  readLatestEslint10Compatibility,
};
