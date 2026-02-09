# GitHub Issue Creation Guide

Quick reference for creating GitHub issues from the improvements documented in [IMPROVEMENTS.md](../IMPROVEMENTS.md).

## Priority 1 Issues (Create First)

### Security: Node-Agent API Authentication
```
Title: Add optional API key authentication to node-agent API
Labels: security, enhancement, priority:high
Reference: IMPROVEMENTS.md §1.1
```

## How to Batch Create Issues

You can use the GitHub CLI (`gh`) to create issues in bulk:

```bash
# Example for security enhancement
gh issue create \
  --title "Add optional API key authentication to node-agent API" \
  --body "$(cat <<EOF
## Problem
The node-agent API (/hosts/*) has zero authentication. Anyone with network access can wake computers, add/delete hosts, trigger scans.

## Solution
Add optional API key authentication via NODE_API_KEY environment variable.

## Implementation Details
See IMPROVEMENTS.md §1.1 for complete implementation plan.

## Priority
HIGH - Security vulnerability

## References
- IMPROVEMENTS.md §1.1
- SECURITY_AUDIT.md §11
EOF
)" \
  --label "security,enhancement,priority:high"
```

## Issue Numbering

Once issues are created, update IMPROVEMENTS.md with issue numbers:

```markdown
### 1.1 Node-Agent API Authentication

| Priority | HIGH |
|----------|------|
| **Status** | Not Implemented |
| **Issue** | #123 |
```

## Labels to Create

Run these commands to create labels if they don't exist:

```bash
gh label create "priority:high" --color "d73a4a" --description "Must have"
gh label create "priority:medium" --color "fbca04" --description "Should have"
gh label create "priority:low" --color "0e8a16" --description "Nice to have"
gh label create "security" --color "d73a4a" --description "Security improvements"
gh label create "developer-experience" --color "1d76db" --description "DX improvements"
gh label create "operations" --color "5319e7" --description "Ops/monitoring improvements"
gh label create "good-first-issue" --color "7057ff" --description "Good for new contributors"
gh label create "breaking-change" --color "d93f0b" --description "Requires migration"
```

---

*See .github/IMPROVEMENT_TRACKING.md for status tracking*
