# Applications Overview

How applications are structured and deployed in the cluster.

## Application Organization

### Namespace Strategy

Applications are grouped by namespace under `kubernetes/apps/`:

- **`kube-system`** - Core cluster components (Cilium, CoreDNS, metrics-server)
- **`flux-system`** - GitOps operator and instance
- **`cert-manager`** - Certificate management
- **`network`** - Networking services (Cloudflare Tunnel, AdGuard, k8s-gateway, Tailscale)
- **`observability`** - Monitoring stack (Grafana, Prometheus, Loki, Thanos, Gatus)
- **`storage`** - Storage operators (TopoLVM, VolSync, NFS CSI)
- **`database`** - Database operators (PostgreSQL, Redis)
- **`external-secrets`** - External Secrets Operator and Bitwarden integration
- **`default`** - Personal applications (~30 apps)
- **`external-server`** - Public-facing applications

### Namespace Kustomization Pattern

Each namespace has a `kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: default
resources:
  - ./atuin
  - ./calibre-web-automated
  - ./gitea
  # ... more apps
components:
  - ../../components/common
```

**Key points**:
- Includes all app directories
- Includes `common` component (namespace, repos, SOPS)
- Flux reconciles this as one Kustomization

### Application Directory Structure

```
kubernetes/apps/<namespace>/<app>/
  ks.yaml                  # Flux Kustomization metadata
  app/
    helmrelease.yaml       # HelmRelease definition
    externalsecret.yaml    # ExternalSecret (if needed)
    kustomization.yaml     # Kustomize aggregation
    pvc.yaml               # PVC definition (if needed)
    [sub-app/]             # Additional components (optional)
```

**Example**: `kubernetes/apps/default/gitea/`

## Application Template

### Shared OCI Chart

Most apps use the `app-template` OCI chart:

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: my-app
spec:
  chartRef:
    kind: OCIRepository
    name: app-template
```

**Chart location**: `ghcr.io/bjw-s-labs/helm/app-template`

**Why shared chart**:
- Consistent app structure
- Simplifies updates (update chart once, all apps benefit)
- Flexible values schema for common patterns

**Chart is defined** in `kubernetes/components/common/repos/app-template/`.

### HelmRelease Values

The `app-template` chart supports these common patterns:

**Container image**:
```yaml
image:
  repository: ghcr.io/example/my-app
  tag: 1.2.3
  pullPolicy: IfNotPresent
```

**Environment variables**:
```yaml
env:
  TZ: America/New_York
  SOME_VAR: value
```

**Secrets from ExternalSecret**:
```yaml
env:
  PASSWORD:
    secretKeyRef:
      name: my-app-secret
      key: password
```

**Service and ports**:
```yaml
service:
  main:
    ports:
      http:
        port: 8080
```

**Ingress via Gateway API**:
```yaml
ingress:
  main:
    hosts:
      - host: my-app.tomyail.com
        paths:
          - path: /
            service: main
            port: http
```

**Persistent volumes**:
```yaml
persistence:
  data:
    enabled: true
    storageClass: topolvm-provisioner
    size: 10Gi
    accessMode: ReadWriteOnce
```

## Application Examples

### Simple Web App

**`helmrelease.yaml`**:
```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: my-web-app
  namespace: default
spec:
  chartRef:
    kind: OCIRepository
    name: app-template
  values:
    image:
      repository: ghcr.io/example/my-web-app
      tag: 1.0.0
    service:
      main:
        ports:
          http:
            port: 8080
    ingress:
      main:
        hosts:
          - host: my-app.tomyail.com
            paths:
              - path: /
                service: main
                port: http
    env:
      TZ: America/New_York
```

### Database-Backed App

**`pvc.yaml`**:
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-app-data
spec:
  storageClassName: topolvm-provisioner
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

**`externalsecret.yaml`**:
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: my-app-secret
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: bitwarden-connect
  target:
    name: my-app-secret
  data:
    - secretKey: DATABASE_URL
      remoteRef:
        key: "my-app-database-url"
```

**`helmrelease.yaml`**:
```yaml
values:
  persistence:
    data:
      enabled: true
      existingClaim: my-app-data
  env:
    DATABASE_URL:
      secretKeyRef:
        name: my-app-secret
        key: DATABASE_URL
```

### VolSync-Enabled App

**In `app/volsync.yaml`** (included in kustomization):
```yaml
apiVersion: volsync.backube/v1alpha1
kind: ReplicationSource
metadata:
  name: my-app
spec:
  sourcePVC: my-app-data
  trigger:
    schedule: "0 2 * * *"
  restic:
    copyMethod: Snapshot
    repository: my-app-minio
    storageClassName: topolvm-provisioner
    mover:
      image: ghcr.io/backube/volsync:latest
```

**MinIO secret** (in `app/volsync-secret.sops.yaml`):
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: my-app-minio
stringData:
  RESTIC_REPOSITORY: s3:http://minio.default.svc.cluster.local:9000/volsync-default
  RESTIC_PASSWORD: <encrypted>
  AWS_ACCESS_KEY_ID: <encrypted>
  AWS_SECRET_ACCESS_KEY: <encrypted>
```

## Flux Kustomization

### App-Level Kustomization

**`kubernetes/apps/default/my-app/ks.yaml`**:
```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: my-app
  namespace: flux-system
spec:
  interval: 30m
  path: ./kubernetes/apps/default/my-app
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
  dependsOn:
    - name: default
      namespace: flux-system
```

**Key fields**:
- `interval`: How often Flux checks for changes
- `path`: Where the app resources are
- `prune`: Enable resource deletion when removed from git
- `dependsOn`: Wait for namespace kustomization first

### Post-Build Substitution

**For app-specific variables**:
```yaml
spec:
  postBuild:
    substitute:
      APP: my-app
      VOLSYNC_CAPACITY: 10Gi
    substituteFrom:
      - name: cluster-secrets
        kind: ConfigMap
```

**Common variables**:
- `APP`: App name for labeling
- `VOLSYNC_CAPACITY`: Backup capacity
- Custom values from `cluster-secrets` ConfigMap

## Application Dependencies

### Namespace Dependencies

In `kubernetes/apps/<namespace>/kustomization.yaml`:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: default
spec:
  dependsOn:
    - name: database
      namespace: flux-system
    - name: external-secrets
      namespace: flux-system
```

**Why**: Ensure database and secret operators are ready before app reconciliation.

### App Dependencies

In app `ks.yaml`:

```yaml
spec:
  dependsOn:
    - name: postgres-operator
      namespace: database
    - name: bitwarden-connect
      namespace: external-secrets
```

**Why**: App needs specific operators/infrastructure first.

## Image Updates

### Image Automation

**From `kubernetes/components/image-automation/`**:

**ImageRepository**:
```yaml
apiVersion: image.toolkit.fluxcd.io/v1beta1
kind: ImageRepository
metadata:
  name: my-app
spec:
  image: ghcr.io/example/my-app
  interval: 1h
```

**ImagePolicy**:
```yaml
apiVersion: image.toolkit.fluxcd.io/v1beta2
kind: ImagePolicy
metadata:
  name: my-app
spec:
  imageRepositoryRef:
    name: my-app
  policy:
    semver:
      range: 1.x.x
```

**ImageUpdateAutomation**:
```yaml
apiVersion: image.toolkit.fluxcd.io/v1beta1
kind: ImageUpdateAutomation
metadata:
  name: my-app
spec:
  gitRepositoryRef:
    name: flux-system
  update:
    path: ./kubernetes/apps/default/my-app/app
    strategy: Setters
```

**In `helmrelease.yaml`**:
```yaml
values:
  image:
    tag: 1.2.3 # {"$imagepolicy": "flux-system:my-app:tag"}
```

Flux updates the tag when new images are available.

### Manual Image Update

Edit `helmrelease.yaml`:
```yaml
image:
  tag: 1.2.4
```

Commit and push. Flux updates within 30 minutes (or use `task reconcile`).

## Application Removal

To remove an application:

1. **Remove from namespace kustomization**:
   ```yaml
   # Remove this line from kubernetes/apps/default/kustomization.yaml
   - ./my-app
   ```

2. **Commit and push**

3. **Flux prunes resources**:
   - HelmRelease deleted
   - Deployment deleted
   - PVC deleted (if not in use)
   - Route deleted

**Backup first**:
- Take VolSync snapshot
- Export PVC data if important
- Save config before deletion

## Application Monitoring

### Health Checks

**From `kubernetes/components/gatus/guarded`**:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: gatus-my-app
data:
  my-app.yaml: |
    endpoints:
      - name: my-app
        url: http://my-app.default.svc.cluster.local:8080/health
        interval: 5m
        conditions:
          - "[STATUS] == 200"
```

Gatus checks health and sends alerts on failure.

### Gatus External Monitoring

**From `kubernetes/components/gatus/external`**:

```yaml
endpoints:
  - name: my-app-public
    url: https://my-app.tomyail.com
    conditions:
      - "[STATUS] == 200"
```

Monitors public-facing apps via Cloudflare Tunnel.

## Application Troubleshooting

### HelmRelease Not Ready

```bash
flux --namespace default get helmreleases
flux --namespace default logs helmrelease my-app --tail 50
```

**Common issues**:
- Chart version doesn't exist
- Values schema error
- Missing dependency (namespace not ready)

### Pod Not Starting

```bash
kubectl describe pod my-app -n default
kubectl logs my-app -n default
```

**Common issues**:
- Image pull error
- ConfigMap/Secret missing
- PVC not bound
- Resource quota exceeded

### PVC Not Bound

```bash
kubectl get pvc -n default
kubectl describe pvc my-data -n default
```

**Common issues**:
- StorageClass doesn't exist
- No node capacity
- Wrong access mode

### Route Not Working

```bash
kubectl get httproute -A
kubectl describe httproute my-app -n default
```

**Common issues**:
- Gateway doesn't exist
- TLS certificate issue
- Wrong backend port

## Best Practices

1. **Use shared components**:
   - Reuse `volsync-new` for backups
   - Use `gatus` components for monitoring
   - Include `common` in every namespace

2. **Label everything**:
   - Add labels to resources for easy filtering
   - Use consistent label naming

3. **Document dependencies**:
   - List app dependencies in `ks.yaml` dependsOn
   - Document external services (databases, APIs)

4. **Test in dev first**:
   - Try new apps in development
   - Verify values schema
   - Test backup/restore

5. **Monitor resource usage**:
   - Set resource limits/requests
   - Check PVC usage
   - Monitor CPU/memory

6. **Backup before deletion**:
   - VolSync snapshots
   - Export configs
   - Document app settings

7. **Use post-build substitution**:
   - Define app-specific variables
   - Pull cluster-wide configs
   - Keep values template-friendly
