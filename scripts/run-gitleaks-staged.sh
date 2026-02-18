#!/usr/bin/env sh
set -eu

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks is required for pre-commit secret scanning."
  echo "Install gitleaks (example on macOS): brew install gitleaks"
  exit 1
fi

if gitleaks protect --help >/dev/null 2>&1; then
  exec gitleaks protect --staged --redact
fi

if gitleaks git --help >/dev/null 2>&1; then
  exec gitleaks git --staged --redact .
fi

echo "Unable to run gitleaks: supported subcommand not found (expected 'protect' or 'git')."
exit 1
