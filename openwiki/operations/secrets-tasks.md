---
type: operations
title: Secrets Operations
description: Operational procedures for managing encrypted secrets including SOPS editing workflows, age key rotation, cluster-secrets variable substitution, and Flux decryption troubleshooting.
tags: [secrets, sops, age, operations, encryption, troubleshooting]
verified:
  - by: openwiki/0.4.3
    at: 2026-08-31T23:16:37.333Z
sources:
  - id: openwiki-source-240e6406ed4b6841961679cb
    resource: repo://.sops.yaml
  - id: openwiki-source-f04021c19122a44288e9cea0
    resource: repo://.taskfiles/bootstrap/Taskfile.yaml
  - id: openwiki-source-ad97b5aa2f87dd6b0dbca5e3
    resource: repo://kubernetes/apps/external-secrets/bitwarden-connect/app/secret.sops.yaml
  - id: openwiki-source-4cd1f73914265d1886254720
    resource: repo://kubernetes/apps/flux-system/flux-instance/ks.yaml
  - id: openwiki-source-46f2dcf45323110e8875664e
    resource: repo://kubernetes/apps/flux-system/flux-operator/ks.yaml
  - id: openwiki-source-47282df10449a6bce110950c
    resource: repo://kubernetes/components/common/sops/cluster-secrets.sops.yaml
  - id: openwiki-source-dff47ef9008ba7bce93e217b
    resource: repo://kubernetes/components/common/sops/kustomization.yaml
  - id: openwiki-source-244e2919bbe6d12c6c8c9757
    resource: repo://kubernetes/components/common/sops/sops-age.sops.yaml
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-6f1d2c8de9160e178167b990
    resource: repo://scripts/bootstrap-apps.sh
  - id: openwiki-source-8ebb66a039d2620270b0a36c
    resource: repo://talos/talsecret.sops.yaml
generated: { by: "openwiki/0.4.3", at: "2026-08-31T23:16:37.333Z" }
---

# Secrets Operations

Operational procedures for managing encrypted secrets in the repository and cluster, covering SOPS editing workflows, age key rotation, variable substitution patterns, and Flux decryption troubleshooting.

## Editing Encrypted Secrets

SOPS provides transparent encryption/decryption during editing. The `sops` command automatically decrypts files on open and re-encrypts them on save, ensuring secrets never remain in plaintext on disk.

### Edit Workflow

**Basic Editing**
```bash
# Edit any SOPS-encrypted file
sops kubernetes/components/common/sops/cluster-secrets.sops.yaml

# Edit with explicit encrypted regex (for safety)
sops --encrypt --encrypted-regex '^(data|stringData)$' \
  kubernetes/apps/external-secrets/bitwarden-connect/app/secret.sops.yaml
```

The `sops edit` command:
1. Decrypts the file to a temporary location
2. Opens your default editor (from `$EDITOR`)
3. Re-encrypts on save using rules from `.sops.yaml`
4. Writes back to the original file

**Editor Configuration**
Set your preferred editor:
```bash
export EDITOR=vim      # or nano, code, etc.
sops path/to/file.sops.yaml
```

**Verification After Editing**
```bash
# Verify file is still encrypted (should show ENC[...] blocks)
grep -c "ENC\[AES256_GCM" path/to/file.sops.yaml

# Test decryption works
sops --decrypt --encrypted-regex '^(data|stringData)$' path/to/file.sops.yaml

# Check git diff shows only encrypted changes
git diff path/to/file.sops.yaml
```

### Editing Different Secret Types

**Cluster Secrets (field-level encryption)**
```bash
sops kubernetes/components/common/sops/cluster-secrets.sops.yaml
```
- Only `stringData` fields are encrypted
- YAML structure and metadata remain readable
- Used for environment-wide variables like `SECRET_DOMAIN`, `TIMEZONE`

**Talos Secrets (whole-file encryption)**
```bash
sops talos/talsecret.sops.yaml
```
- Entire file content is encrypted
- `mac_only_encrypted: true` applies
- Contains cluster ID, tokens, certificates

**Application Secrets**
```bash
# Bitwarden CLI credentials
sops kubernetes/apps/external-secrets/bitwarden-connect/app/secret.sops.yaml

# Cloudflare credentials
sops kubernetes/apps/network/cloudflare-dns/app/secret.sops.yaml
```

### Encryption Rules Reference

The `.sops.yaml` file defines which files get encrypted and how:

**Talos Secrets** (`.sops.yaml#L3-L5`)
- Pattern: `talos/.*\.sops\.ya?ml`
- Encrypts entire file
- Age recipient: `age1shkd7fsr66cnpkutpmpf7ffylcc2x4c9tlsdkapv6nmu5ceu0dzqdjtqc5`

**Kubernetes/Bootstrap Secrets** (`.sops.yaml#L6-L9`)
- Pattern: `(bootstrap|kubernetes)/.*\.sops\.ya?ml`
- Encrypts only `data` and `stringData` fields
- Same age recipient
- `encrypted_regex: "^(data|stringData)$"` ensures field-level encryption

## Cluster Secrets and Variable Substitution

The `cluster-secrets` Secret provides environment-wide configuration that applications consume via Flux `postBuild.substituteFrom`.

### cluster-secrets Structure

**Secret Contents** (`kubernetes/components/common/sops/cluster-secrets.sops.yaml#L5-L7`)
```yaml
stringData:
  SECRET_DOMAIN: ENC[AES256_GCM,data:...]
  TIMEZONE: ENC[AES256_GCM,data:...]
```

**Current Variables**
- `SECRET_DOMAIN`: Base domain for cluster applications
- `TIMEZONE`: Timezone for application configurations

### Variable Substitution Flow

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart LR
    A["cluster-secrets.sops.yaml<br/>Git encrypted"] --> B["Flux Kustomization<br/>decryption"]
    B --> C["cluster-secrets Secret<br/>Kubernetes decrypted"]
    C --> D["postBuild.substituteFrom<br/>Kustomization resources"]
    D --> E["Application manifests<br/>with substituted values"]
```

*Figure: cluster-secrets variable substitution flow from Git to application manifests*

**Application Usage Example**
```yaml
# In kustomization.yaml
postBuild:
  substituteFrom:
    - name: cluster-secrets
      kind: Secret

# In application manifests, variables are replaced
# ${SECRET_DOMAIN} → actual domain value
# ${TIMEZONE} → actual timezone value
```

### Adding New Cluster Variables

**1. Edit cluster-secrets**
```bash
sops kubernetes/components/common/sops/cluster-secrets.sops.yaml
```

**2. Add variable to stringData**
```yaml
stringData:
  SECRET_DOMAIN: ENC[...]
  TIMEZONE: ENC[...]
  NEW_VARIABLE: "plaintext-value"  # SOPS will encrypt on save
```

**3. Save and verify**
```bash
# Verify encryption worked
grep "NEW_VARIABLE" kubernetes/components/common/sops/cluster-secrets.sops.yaml
# Should show: NEW_VARIABLE: ENC[AES256_GCM,data:...]
```

**4. Update application manifests**
```yaml
# In application deployment or configmap
env:
  - name: APP_CONFIG
    value: "${NEW_VARIABLE}"
```

**5. Commit and reconcile**
```bash
git add kubernetes/components/common/sops/cluster-secrets.sops.yaml
git commit -m "Add NEW_VARIABLE to cluster-secrets"
git push
task reconcile
```

## Age Key Rotation

Age key rotation requires updating `.sops.yaml` and re-encrypting all SOPS files to maintain decryption access.

### Rotation Procedure

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
    A["Generate new age keypair<br/>age-keygen -o age-new.txt"] --> B["Backup current age.key"]
    B --> C["Update .sops.yaml<br/>replace recipient"]
    C --> D["Re-encrypt all SOPS files<br/>iterate *.sops.yaml"]
    D --> E["Update sops-age secret<br/>encrypt new private key"]
    E --> F["Update local age.key<br/>replace with new key"]
    F --> G["Commit and push<br/>Flux reconciles"]
    G --> H["Verify decryption<br/>test with sops --decrypt"]
```

*Figure: Age key rotation workflow from key generation through verification*

**Step 1: Generate New Age Keypair**
```bash
age-keygen -o age-new.txt
```

Output shows both public and private keys. Save both securely.

**Step 2: Backup Current Key**
```bash
cp age.key age-backup-$(date +%Y%m%d).key
chmod 600 age-backup-*.key
```

**Step 3: Update .sops.yaml**
```bash
sops .sops.yaml
```

Replace the age recipient in both creation rules:
```yaml
creation_rules:
  - path_regex: talos/.*\.sops\.ya?ml
    age: "NEW_AGE_PUBLIC_KEY"  # Replace here
  - path_regex: (bootstrap|kubernetes)/.*\.sops\.ya?ml
    age: "NEW_AGE_PUBLIC_KEY"  # And here
```

**Step 4: Re-encrypt All SOPS Files**
```bash
# Find all SOPS files
find . -name "*.sops.yaml" -type f | while read -r file; do
  echo "Re-encrypting $file"
  sops --encrypt --encrypted-regex '^(data|stringData)$' "$file" > "$file.tmp"
  mv "$file.tmp" "$file"
done
```

**Step 5: Update sops-age Secret**
```bash
# Encrypt new private key into sops-age.sops.yaml
sops kubernetes/components/common/sops/sops-age.sops.yaml
```

Replace the `age.agekey` field content with the new private key from `age-new.txt`.

**Step 6: Update Local age.key**
```bash
# Extract private key from age-new.txt and save to age.key
grep "^AGE_SECRET_KEY=" age-new.txt | cut -d= -f2 > age.key
chmod 600 age.key
```

**Step 7: Verify Decryption**
```bash
# Test decryption of several files
sops --decrypt kubernetes/components/common/sops/cluster-secrets.sops.yaml
sops --decrypt talos/talsecret.sops.yaml
sops --decrypt kubernetes/apps/external-secrets/bitwarden-connect/app/secret.sops.yaml
```

**Step 8: Commit and Push**
```bash
git add .
git commit -m "Rotate age encryption key"
git push
```

**Step 9: Verify Flux Reconciliation**
```bash
flux get kustomizations --all-namespaces
kubectl get secret sops-age -n flux-system
```

### Important Considerations

- **No automated key rotation exists** - this is a manual process
- **All SOPS files must be re-encrypted** - old key cannot decrypt after `.sops.yaml` update
- **Backup both old and new keys** until verification is complete
- **Coordinate with team** - anyone with local `age.key` must update
- **Test on non-critical files first** - verify process works before applying to production secrets

## Flux Decryption Troubleshooting

Flux decrypts SOPS files during reconciliation using the `sops-age` Secret in the `flux-system` namespace.

### Verify sops-age Secret

**Check Secret Exists**
```bash
kubectl get secret sops-age -n flux-system
```

**Verify Secret Contents**
```bash
# Extract and decode the age key
kubectl get secret sops-age -n flux-system \
  -o jsonpath='{.data\.age\.agekey}' | base64 -d
```

The output should match your local `age.key` file content.

**Compare Local and Cluster Keys**
```bash
# Local key
cat age.key

# Cluster key
kubectl get secret sops-age -n flux-system \
  -o jsonpath='{.data\.age\.agekey}' | base64 -d
```

Both should show identical `AGE_SECRET_KEY-...` values.

### Recreate sops-age Secret

If the secret is missing or corrupted:

```bash
# Delete existing secret
kubectl delete secret sops-age -n flux-system

# Create from local age.key
kubectl create secret generic sops-age \
  --from-file=age.agekey=age.key \
  -n flux-system

# Verify
kubectl get secret sops-age -n flux-system -o yaml
```

### Check Flux Kustomization Decryption

**Identify Kustomizations Using SOPS**
```bash
kubectl get kustomizations --all-namespaces -o json | \
  jq -r '.items[] | select(.spec.decryption.provider == "sops") | \
  "\(.metadata.namespace)/\(.metadata.name)"'
```

**View Decryption Configuration**
```bash
kubectl get kustomization <name> -n <namespace> -o yaml | \
  yq '.spec.decryption'
```

Expected output:
```yaml
decryption:
  provider: sops
  secretRef:
    name: sops-age
```

**Check Reconciliation Status**
```bash
flux get kustomizations --all-namespaces

# View specific Kustomization status
kubectl get kustomization flux-system -n flux-system -o yaml | \
  yq '.status.conditions[-1]'
```

### Common Decryption Errors

**Error: "failed to decrypt file"**
- Cause: `sops-age` secret missing or contains wrong key
- Solution: Recreate secret from correct `age.key`

**Error: "no key found"**
- Cause: Age recipient mismatch between `.sops.yaml` and encryption key
- Solution: Verify age recipient in `.sops.yaml` matches encryption

**Error: "MAC checksum failed"**
- Cause: File corruption or tampering
- Solution: Re-encrypt from backup or restore from Git history

### Verification Workflow

**1. Test Local Decryption**
```bash
# Test each SOPS file type
sops --decrypt talos/talsecret.sops.yaml > /dev/null
sops --decrypt --encrypted-regex '^(data|stringData)$' \
  kubernetes/components/common/sops/cluster-secrets.sops.yaml > /dev/null
sops --decrypt --encrypted-regex '^(data|stringData)$' \
  kubernetes/apps/external-secrets/bitwarden-connect/app/secret.sops.yaml > /dev/null
```

**2. Verify Git Diff Shows Only Encrypted Changes**
```bash
git diff
# Should show ENC[AES256_GCM,data:...] blocks
# Never show plaintext secrets
```

**3. Check Flux Reconciliation**
```bash
flux reconcile kustomization flux-system --with-source
flux get kustomizations --all-namespaces
```

**4. Verify Decrypted Secrets in Cluster**
```bash
# cluster-secrets should be decrypted (not ENC blocks)
kubectl get secret cluster-secrets -n flux-system -o yaml

# Application secrets should be present
kubectl get secret bitwarden-cli -n external-secrets -o yaml
```

## Bootstrap Secret Application

During cluster bootstrap, SOPS secrets are applied before Helm charts using the `apply_sops_secrets` function in `bootstrap-apps.sh`.

**Bootstrap Process** (`/scripts/bootstrap-apps.sh#L57-L85`)
1. Applies `github-deploy-key.sops.yaml`
2. Applies `cluster-secrets.sops.yaml`
3. Applies `sops-age.sops.yaml`
4. Uses `sops exec-file` to decrypt and apply in one step

**Manual Bootstrap Secret Application**
```bash
# Apply a specific secret
sops exec-file kubernetes/components/common/sops/cluster-secrets.sops.yaml \
  "kubectl --namespace flux-system apply --server-side --filename {}"

# Apply all bootstrap secrets
task bootstrap:apps
```

## Security Best Practices

### During Editing

- **Never commit decrypted secrets** - always verify files remain encrypted
- **Set `SOPS_AGE_KEY_FILE` explicitly** - avoid relying on default paths
- **Use `git diff` before committing** - ensure only ENC blocks appear
- **Minimize secret exposure time** - close editor immediately after saving

### During Rotation

- **Backup keys before rotation** - keep old key until verification complete
- **Test on non-production files first** - verify process works
- **Coordinate with team** - all operators need updated `age.key`
- **Document rotation date** - track key lifecycle

### For Key Storage

- **Protect `age.key` file permissions** - `chmod 600 age.key`
- **Backup `age.key` independently** - never rely solely on Git copy
- **Consider key separation** - different keys for different environments
- **Never commit `age.key`** - ensure it's in `.gitignore`

### Operational Safety

- **Verify decryption after editing** - test with `sops --decrypt`
- **Check Flux reconciliation after commits** - ensure no decryption errors
- **Monitor `sops-age` secret** - alert on unexpected changes
- **Audit secret access** - review Bitwarden logs for External Secrets Operator
