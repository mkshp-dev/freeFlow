#!/usr/bin/env bash

# ==============================================================================
# freeFlow - Upload .env Secrets to GitHub Repository Secrets using gh CLI
# ==============================================================================

set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"
TARGET_REPO="${1:-}"

echo "=================================================================="
echo "  freeFlow — GitHub Secrets Uploader (gh CLI)"
echo "=================================================================="

# 1. Verify gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ Error: GitHub CLI ('gh') is not installed."
    echo "Please install it: https://cli.github.com"
    exit 1
fi

# 2. Check gh authentication
if ! gh auth status &> /dev/null; then
    echo "⚠️ You are not currently logged into GitHub CLI."
    echo "Please authenticate by running:"
    echo "    gh auth login"
    echo ""
    echo "Then re-run this script."
    exit 1
fi

# 3. Determine repository
if [ -z "$TARGET_REPO" ]; then
    if git rev-parse --is-inside-work-tree &> /dev/null; then
        TARGET_REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
    fi
fi

if [ -n "$TARGET_REPO" ]; then
    echo "📦 Target repository: $TARGET_REPO"
    REPO_ARG=(--repo "$TARGET_REPO")
else
    echo "⚠️ Could not auto-detect GitHub repository from current git remote."
    echo "You can pass it directly: $0 <owner>/<repo>"
    echo "Proceeding with current directory context..."
    REPO_ARG=()
fi

# 4. Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: $ENV_FILE not found."
    echo "Create one by copying .env.example: cp .env.example .env"
    exit 1
fi

echo "Reading secrets from $ENV_FILE..."
echo "------------------------------------------------------------------"

# Secrets we want to upload if present in .env
TARGET_KEYS=(
    "SUPABASE_URL"
    "SUPABASE_ANON_KEY"
    "SUPABASE_SERVICE_ROLE_KEY"
    "SUPABASE_PROJECT_ID"
    "SUPABASE_JWT_SECRET"
    "DATABASE_URL"
    "DIRECT_URL"
    "SUPABASE_DB_PASSWORD"
    "SUPABASE_ACCESS_TOKEN"
    "TODOIST_API_TOKEN"
    "TODOIST_CLIENT_SECRET"
)

COUNT=0

for key in "${TARGET_KEYS[@]}"; do
    # Extract line matching KEY=...
    line=$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n 1 || true)
    
    if [ -n "$line" ]; then
        # Extract value and strip quotes/whitespace
        val="${line#*=}"
        val="${val#\"}"
        val="${val%\"}"
        val="${val#\'}"
        val="${val%\'}"
        val=$(echo "$val" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

        if [ -n "$val" ]; then
            echo -n "Uploading $key ... "
            if [ ${#REPO_ARG[@]} -gt 0 ]; then
                echo "$val" | gh secret set "$key" "${REPO_ARG[@]}"
            else
                echo "$val" | gh secret set "$key"
            fi
            echo "✅ Set"
            COUNT=$((COUNT + 1))
        else
            echo "⚪ Skipping $key (empty in $ENV_FILE)"
        fi
    fi
done

echo "------------------------------------------------------------------"
echo "🎉 Successfully uploaded $COUNT secrets to GitHub repository!"

# Database URL reminder if empty
DB_LINE=$(grep -E "^[[:space:]]*DATABASE_URL=" "$ENV_FILE" | tail -n 1 || true)
DB_VAL="${DB_LINE#*=}"
DB_VAL="${DB_VAL#\"}"
DB_VAL="${DB_VAL%\"}"

if [ -z "$DB_VAL" ]; then
    echo ""
    echo "⚠️ NOTE on Database Migrations:"
    echo "DATABASE_URL is currently empty in your $ENV_FILE."
    echo "For the GitHub Action to execute SQL schema migrations against Supabase,"
    echo "make sure to fill in your DATABASE_URL in $ENV_FILE:"
    echo "  DATABASE_URL=\"postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true\""
    echo "and re-run this script so the migration runner has access to your database."
fi
echo "=================================================================="
