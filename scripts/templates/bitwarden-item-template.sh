#!/usr/bin/env bash
# ==============================================================================
# Bitwarden CLI Item Creation Template for External Secrets Operator (ESO)
# ==============================================================================
# This template demonstrates how to create items in Bitwarden via `bw` CLI that
# match the cluster's ClusterSecretStore providers:
#   1. bitwarden-login  -> extracts $.data.data[0].login.<property> (username/password)
#   2. bitwarden-fields -> extracts $.data.data[0].fields[?(@.name=="<property>")].value
#
# SAFETY RULES:
# - NEVER commit files containing plain-text secrets into Git!
# - Use this template as a reference to generate temporary uncommitted scripts,
#   or fill in environment variables interactively.
# - Clean up any temporary files (e.g. *.bw_session or tmp-*.sh) after sync.
# ==============================================================================

set -euo pipefail

# 1. Ensure Bitwarden CLI is installed and logged in
if ! command -v bw >/dev/null 2>&1; then
    echo "Error: Bitwarden CLI (bw) is not installed." >&2
    exit 1
fi

if ! bw login --check >/dev/null 2>&1; then
    echo "Error: Bitwarden CLI is not logged in. Please run 'bw login' first." >&2
    exit 1
fi

# 2. Unlock Bitwarden vault (requires interactive master password input)
echo "Unlocking Bitwarden CLI..."
BW_SESSION=$(bw unlock --raw)
export BW_SESSION

if [ -z "${BW_SESSION:-}" ]; then
    echo "Error: Failed to obtain BW_SESSION token." >&2
    exit 1
fi
echo "✔ Bitwarden unlocked successfully."

# 3. Template: Create a Login Item (for ClusterSecretStore/bitwarden-login)
# Replace placeholder values with actual variables or values:
ITEM_LOGIN_NAME="${ITEM_LOGIN_NAME:-<app-name>-db}"
LOGIN_USER="${LOGIN_USER:-<username>}"
LOGIN_PASS="${LOGIN_PASS:-<password>}"

echo "Creating Login item: ${ITEM_LOGIN_NAME}..."
cat << EOF | bw encode | bw create item --session "$BW_SESSION" > /dev/null
{
  "type": 1,
  "name": "${ITEM_LOGIN_NAME}",
  "notes": "Managed by External Secrets Operator (bitwarden-login)",
  "login": {
    "username": "${LOGIN_USER}",
    "password": "${LOGIN_PASS}"
  }
}
EOF
echo "✔ Created item '${ITEM_LOGIN_NAME}'"

# 4. Template: Create a Custom Fields Item (for ClusterSecretStore/bitwarden-fields)
# Replace placeholder values with actual variables or values:
ITEM_FIELDS_NAME="${ITEM_FIELDS_NAME:-<app-name>}"

echo "Creating Custom Fields item: ${ITEM_FIELDS_NAME}..."
cat << EOF | bw encode | bw create item --session "$BW_SESSION" > /dev/null
{
  "type": 1,
  "name": "${ITEM_FIELDS_NAME}",
  "notes": "Managed by External Secrets Operator (bitwarden-fields)",
  "login": {
    "username": "${ITEM_FIELDS_NAME}"
  },
  "fields": [
    {
      "name": "SECRET_KEY_1",
      "value": "VALUE_1",
      "type": 0
    },
    {
      "name": "SECRET_KEY_2",
      "value": "VALUE_2",
      "type": 0
    }
  ]
}
EOF
echo "✔ Created item '${ITEM_FIELDS_NAME}'"

# 5. Sync vault changes to Bitwarden server
echo "Syncing vault to server..."
bw sync --session "$BW_SESSION"
echo "✔ Vault synchronized."

# 6. Trigger in-cluster ESO provider refresh
echo "=============================================================================="
echo "To force immediate in-cluster sync, run:"
echo "  kubectl rollout restart deployment bitwarden-cli-bitwarden-eso-provider -n external-secrets"
echo "  kubectl annotate externalsecret <app-name> -n <namespace> force-sync=\$(date +%s) --overwrite"
echo "=============================================================================="
