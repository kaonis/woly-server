#!/bin/bash
# Script to create GitHub issues from IMPROVEMENTS.md sections
# Usage: ./create-improvement-issues.sh [section-number]
# Example: ./create-improvement-issues.sh 1.1
#
# Prerequisites:
# - Install GitHub CLI: https://cli.github.com/
# - Authenticate: gh auth login

set -e

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed"
    echo "Install from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "Error: Not authenticated with GitHub CLI"
    echo "Run: gh auth login"
    exit 1
fi

# Section definitions (section_id, title, labels, priority)
declare -A SECTIONS=(
    ["1.1"]="Add optional API key authentication to node-agent API|security,enhancement|HIGH"
    ["1.2"]="Add JWT authentication to CnC node listing endpoints|security,enhancement|MEDIUM"
    ["1.3"]="Add rate limiting to CnC backend|security,enhancement|MEDIUM"
    ["1.4"]="Implement WebSocket message rate limiting|security,enhancement|LOW"
    ["1.5"]="Add WebSocket connection limits per IP|security,enhancement|LOW"
    ["1.6"]="Tighten production CORS configuration|security,enhancement|LOW"
    ["1.7"]="Use separate WebSocket session token secret|security,enhancement|LOW"
    ["2.1"]="Get node-agent version from package.json|enhancement|LOW"
    ["2.2"]="Detect actual subnet and gateway information|enhancement|MEDIUM"
    ["3.1"]="Add persistent host notes/metadata|enhancement,feature|MEDIUM"
    ["3.2"]="Add host grouping/tagging functionality|enhancement,feature|MEDIUM"
    ["3.3"]="Add host wake scheduling|enhancement,feature|LOW"
    ["3.4"]="Add Wake-on-LAN success verification|enhancement,feature|MEDIUM"
    ["3.5"]="Add historical status tracking|enhancement,feature|LOW"
    ["3.6"]="Add multi-MAC support per host|enhancement,feature|LOW"
    ["3.7"]="Add custom Wake-on-LAN ports|enhancement,feature|LOW"
    ["4.1"]="Enhance health check endpoints|operations,enhancement|MEDIUM"
    ["4.2"]="Add Prometheus metrics export|operations,enhancement|MEDIUM"
    ["4.3"]="Improve structured logging|operations,enhancement|LOW"
    ["4.4"]="Add database backup/restore tools|operations,enhancement|LOW"
    ["5.1"]="Add end-to-end tests|developer-experience,testing|MEDIUM"
    ["5.2"]="Generate API client libraries|developer-experience,enhancement|LOW"
    ["5.3"]="Add development docker-compose setup|developer-experience,enhancement|LOW"
    ["5.4"]="Add pre-commit hooks|developer-experience,enhancement|LOW"
    ["6.1"]="Add GraphQL API option|architecture,enhancement|LOW"
    ["6.2"]="Add Redis cache layer|architecture,enhancement|LOW"
    ["6.3"]="Add message queue for commands|architecture,enhancement|LOW"
    ["7.1"]="Add API integration examples|documentation|LOW"
    ["7.2"]="Add deployment guides|documentation|MEDIUM"
    ["7.3"]="Consolidate architecture decision records|documentation|LOW"
    ["8.1"]="Add push notifications support|mobile,enhancement|MEDIUM"
    ["8.2"]="Add QR code pairing|mobile,enhancement|LOW"
)

create_issue() {
    local section_id=$1
    local info="${SECTIONS[$section_id]}"
    
    if [ -z "$info" ]; then
        echo "Error: Unknown section $section_id"
        exit 1
    fi
    
    IFS='|' read -r title labels priority <<< "$info"
    
    # Add priority label
    priority_label=$(echo "$priority" | tr '[:upper:]' '[:lower:]')
    labels="$labels,priority:$priority_label"
    
    echo "Creating issue: $title"
    echo "Labels: $labels"
    echo "Priority: $priority"
    echo ""
    
    gh issue create \
        --title "$title" \
        --body "## Description
See IMPROVEMENTS.md §$section_id for detailed implementation plan.

## Priority
$priority

## Checklist
- [ ] Review implementation plan in IMPROVEMENTS.md §$section_id
- [ ] Create implementation branch
- [ ] Write tests
- [ ] Implement changes
- [ ] Update documentation
- [ ] Run full test suite
- [ ] Update IMPROVEMENTS.md with issue number

## References
- IMPROVEMENTS.md §$section_id" \
        --label "$labels"
    
    echo "✓ Issue created successfully"
    echo ""
}

create_all_high_priority() {
    echo "Creating all HIGH priority issues..."
    echo ""
    
    for section_id in "${!SECTIONS[@]}"; do
        local info="${SECTIONS[$section_id]}"
        IFS='|' read -r title labels priority <<< "$info"
        
        if [ "$priority" = "HIGH" ]; then
            create_issue "$section_id"
            sleep 1  # Rate limiting
        fi
    done
}

create_all_medium_priority() {
    echo "Creating all MEDIUM priority issues..."
    echo ""
    
    for section_id in "${!SECTIONS[@]}"; do
        local info="${SECTIONS[$section_id]}"
        IFS='|' read -r title labels priority <<< "$info"
        
        if [ "$priority" = "MEDIUM" ]; then
            create_issue "$section_id"
            sleep 1  # Rate limiting
        fi
    done
}

create_all_low_priority() {
    echo "Creating all LOW priority issues..."
    echo ""
    
    for section_id in "${!SECTIONS[@]}"; do
        local info="${SECTIONS[$section_id]}"
        IFS='|' read -r title labels priority <<< "$info"
        
        if [ "$priority" = "LOW" ]; then
            create_issue "$section_id"
            sleep 1  # Rate limiting
        fi
    done
}

# Main script
if [ $# -eq 0 ]; then
    echo "Usage: $0 [section-number|high|medium|low|all]"
    echo ""
    echo "Examples:"
    echo "  $0 1.1          # Create issue for section 1.1"
    echo "  $0 high         # Create all HIGH priority issues"
    echo "  $0 medium       # Create all MEDIUM priority issues"
    echo "  $0 low          # Create all LOW priority issues"
    echo "  $0 all          # Create all issues (use with caution!)"
    echo ""
    echo "Available sections:"
    for section_id in $(echo "${!SECTIONS[@]}" | tr ' ' '\n' | sort -V); do
        local info="${SECTIONS[$section_id]}"
        IFS='|' read -r title labels priority <<< "$info"
        printf "  %-6s [%-6s] %s\n" "$section_id" "$priority" "$title"
    done
    exit 1
fi

case "$1" in
    high)
        create_all_high_priority
        ;;
    medium)
        create_all_medium_priority
        ;;
    low)
        create_all_low_priority
        ;;
    all)
        read -p "This will create 32 GitHub issues. Are you sure? (yes/no): " confirm
        if [ "$confirm" = "yes" ]; then
            create_all_high_priority
            create_all_medium_priority
            create_all_low_priority
        else
            echo "Cancelled"
            exit 0
        fi
        ;;
    *)
        create_issue "$1"
        ;;
esac

echo "Done!"
