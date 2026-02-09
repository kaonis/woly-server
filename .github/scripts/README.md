# GitHub Scripts

Helper scripts for managing the WoLy Server repository.

## create-improvement-issues.sh

Batch create GitHub issues from the improvements documented in [IMPROVEMENTS.md](../../IMPROVEMENTS.md).

### Prerequisites

- [GitHub CLI](https://cli.github.com/) installed and authenticated
- Repository write access

### Usage

```bash
# Create a single issue by section number
./create-improvement-issues.sh 1.1

# Create all HIGH priority issues
./create-improvement-issues.sh high

# Create all MEDIUM priority issues
./create-improvement-issues.sh medium

# Create all LOW priority issues
./create-improvement-issues.sh low

# Create ALL issues (32 total - use with caution!)
./create-improvement-issues.sh all
```

### What it does

The script:
1. Validates GitHub CLI is installed and authenticated
2. Creates issues with appropriate titles, labels, and priority
3. Links each issue back to the IMPROVEMENTS.md section
4. Adds a checklist for implementation tracking
5. Rate limits to avoid hitting GitHub API limits

### Labels Used

The script assigns these labels automatically:
- `security` - Security improvements
- `enhancement` - General improvements
- `feature` - New features
- `operations` - Ops/monitoring improvements
- `developer-experience` - DX improvements
- `testing` - Test improvements
- `architecture` - Architectural changes
- `documentation` - Documentation updates
- `mobile` - Mobile app integration
- `priority:high` - Must have
- `priority:medium` - Should have
- `priority:low` - Nice to have

**Note:** Create these labels in your repository before running the script, or remove the `--label` flag and add labels manually.

### After Creating Issues

Once issues are created, update IMPROVEMENTS.md with the issue numbers:

```markdown
### 1.1 Node-Agent API Authentication

| Priority | HIGH |
|----------|------|
| **Status** | Not Implemented |
| **Issue** | #123 |
```

---

See [ISSUE_CREATION_GUIDE.md](../ISSUE_CREATION_GUIDE.md) for manual issue creation instructions.
