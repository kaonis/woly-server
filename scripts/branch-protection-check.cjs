#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');

function parseArgs(argv) {
  const options = {
    branch: 'master',
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--branch') {
      const value = argv[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('Missing value for --branch');
      }
      options.branch = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function resolveRepoFromOrigin() {
  const origin = run('git', ['config', '--get', 'remote.origin.url']);
  const normalized = origin.replace(/\.git$/, '');

  const httpsMatch = normalized.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  const sshMatch = normalized.match(/^git@github\.com:([^/]+)\/([^/]+)$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  throw new Error(`Unable to parse GitHub owner/repo from remote.origin.url: ${origin}`);
}

function fetchBranchProtection(owner, repo, branch) {
  try {
    const endpoint = `repos/${owner}/${repo}/branches/${branch}/protection`;
    const output = run('gh', ['api', endpoint]);
    return JSON.parse(output);
  } catch (error) {
    const message = error?.message || String(error);
    if (/Branch not protected/.test(message) || /HTTP 404/.test(message)) {
      return null;
    }
    throw error;
  }
}

function evaluateProtection(protection) {
  const violations = [];
  const contexts = protection?.required_status_checks?.contexts || [];

  if (!protection) {
    violations.push('branch protection is not enabled');
  }

  if (!protection?.required_status_checks) {
    violations.push('required_status_checks is not configured');
  }

  const hasCncPolicyCheck = contexts.some((context) => /policy-check\b/.test(context));
  if (!hasCncPolicyCheck) {
    violations.push(
      'required status checks do not include CNC Sync Policy policy-check context'
    );
  }

  return {
    contexts,
    strict: Boolean(protection?.required_status_checks?.strict),
    violations,
    passed: violations.length === 0,
  };
}

function renderReport(summary) {
  const lines = [
    '## Branch Protection Check',
    '',
    `Checked at: \`${summary.checkedAt}\``,
    `Repository: \`${summary.owner}/${summary.repo}\``,
    `Branch: \`${summary.branch}\``,
    `Required contexts: ${
      summary.contexts.length > 0 ? summary.contexts.map((value) => `\`${value}\``).join(', ') : '(none)'
    }`,
    '',
  ];

  if (summary.passed) {
    lines.push('Status: **PASS** (branch protection includes CNC Sync Policy check).');
    return lines.join('\n');
  }

  lines.push('Status: **FAIL**');
  for (const violation of summary.violations) {
    lines.push(`- ${violation}`);
  }
  lines.push(
    '',
    'Action: configure branch protection required status checks to include `CNC Sync Policy / policy-check`.'
  );
  return lines.join('\n');
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: node scripts/branch-protection-check.cjs [options]',
      '',
      'Options:',
      '  --branch <name>  Branch to check (default: master)',
      '  --json           Print machine-readable JSON output',
      '  -h, --help       Show this help text',
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

  const { owner, repo } = resolveRepoFromOrigin();
  const protection = fetchBranchProtection(owner, repo, options.branch);
  const evaluation = evaluateProtection(protection);
  const summary = {
    checkedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    owner,
    repo,
    branch: options.branch,
    contexts: evaluation.contexts,
    strict: evaluation.strict,
    violations: evaluation.violations,
    passed: evaluation.passed,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderReport(summary)}\n`);
  }

  if (!summary.passed) {
    process.exit(1);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `branch-protection-check failed: ${error.message || String(error)}\n`
    );
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  evaluateProtection,
  resolveRepoFromOrigin,
};
