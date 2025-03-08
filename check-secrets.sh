#!/bin/bash

echo "Checking for potential secrets or credentials in tracked files..."

# List of common secret patterns to look for
PATTERNS=(
  "TESLA_CLIENT_ID="
  "TESLA_CLIENT_SECRET="
  "TESLA_REFRESH_TOKEN="
  "access_token"
  "refresh_token"
  "id_token"
  "client_secret"
  "client_id"
  "Bearer "
  "-----BEGIN PRIVATE KEY-----"
  "-----BEGIN RSA PRIVATE KEY-----"
  "-----BEGIN EC PRIVATE KEY-----"
  "auth_token="
  "Authorization: Bearer"
  "password:"
  "api_key"
  "apikey"
  "secret"
)

# Files to exclude from checking (adjust this as needed)
EXCLUDED_FILES=(
  ".git/"
  "node_modules/"
  "build/"
  ".env"
  ".env."
  "*.env"
  "check-secrets.sh"
  "*.pem"
  "keys/"
  ".gitignore"
)

# Construct the exclude pattern for grep
EXCLUDE_PATTERN=""
for exclude in "${EXCLUDED_FILES[@]}"; do
  EXCLUDE_PATTERN="$EXCLUDE_PATTERN --exclude-dir=$exclude --exclude=$exclude"
done

# Check each pattern
for pattern in "${PATTERNS[@]}"; do
  echo "Checking for pattern: $pattern"
  RESULTS=$(grep -r $EXCLUDE_PATTERN "$pattern" . --include="*.js" --include="*.ts" --include="*.json" --include="*.md" 2>/dev/null)
  
  if [ -n "$RESULTS" ]; then
    echo "⚠️ WARNING: Potential secret or credential found for pattern '$pattern':"
    echo "$RESULTS"
    echo ""
  fi
done

echo "Done checking for secrets."
echo "Run this script before committing to ensure no secrets are accidentally committed."
echo "Note: This is a basic check and may have false positives or miss some patterns."
echo "Always manually review your code before pushing to a repository." 