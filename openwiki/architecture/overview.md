# Architecture Overview

This page describes the cluster architecture, GitOps patterns, and how major components interact.

## Cluster Foundation

### Talos Linux

The cluster runs on Talos Linux, an immutable OS designed for Kubernetes:

- **Secure boot**: Enabled on all nodes via custom factory image (`talosImageURL` in `talos/talconfig.yaml`)
- **Node configuration**: Managed through `talhelper` which generates machine configs
- **Control plane**: Single-node control plane (master0-nuc12 at 192.168.50.145) with VIP at 192.168.50.10
- **Disk management**: Uses install disk selectors (≤256GB SSD) and custom volume provisioning

### Networking Stack

```
┌─────────────────────────────────────────────────────────┐
│                    External Traffic                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  Cloudflare Tunnel    │
         │  (Ingress for public) │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │   k8s-gateway (LB)    │
         │   Internal DNS GW     │
         │   (192.168.50.11)     │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │      Cilium CNI       │
         │   (BGP/LB, Network)   │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │   Kubernetes Pods      │
         │   (Gateway API)        │
         └───────────────────────┘
```

**Key components**:
- **Cilium**: Replaces default kube-proxy, provides BGP, network policies, and load balancing
- **Cloudflare Tunnel**: Exposes selected services publicly without open ports
- **k8s-gateway**: Internal Gateway API controller for DNS-based routing
- **AdGuard DNS**: Local DNS resolver with ad blocking
- **Tailscale**: VPN for secure remote access to cluster services

### Storage Architecture

```
┌─────────────────────────────────────────────┐
│          Storage Layer                      │
├─────────────────────────────────────────────┤
│  Applications (PVCs)                        │
│     │                                       │
│     ├─► TopoLVM (LVM on /dev/disk/by-id)    │
│     │   └─► Logical volumes per PVC         │
│     │                                       │
│     ├─► NFS CSI (NFS shares)                │
│     │   └─► External NFS server             │
│     │                                       │
│     └─► local-path (hostPath)              │
│         └─► Small/ephemeral data            │
├─────────────────────────────────────────────┤
│  Backup & Replication                       │
│     │                                       │
│     └─► VolSync (Rclone/Restic)             │
│         ├─► MinIO (local backups)           │
│         └─► B2/Cloud (remote backups)       │
├─────────────────────────────────────────────┤
│  Snapshots                                   │
│     │                                       │
│     └─► snapshot-controller                │
│         └─► CSI Volume snapshots            │
└─────────────────────────────────────────────┘
```

## GitOps Architecture

### Flux Reconciliation Flow

```
Git Repository (tomyail/talos-cluster)
    │
    │ Flux watches main branch
    ▼
flux-system GitRepository
    │
    ├─► cluster-meta Kustomization
    │   └─► kubernetes/flux/meta/
    │       ├─► OCIRepository definitions
    │       └─► HelmRepository definitions
    │
    └─► cluster-apps Kustomization
        └─► kubernetes/apps/
            ├─► kube-system/       (networking, DNS)
            ├─► cert-manager/      (TLS certificates)
            ├─► flux-system/       (GitOps operator)
            ├─► network/           (connectivity services)
            ├─► observability/     (monitoring stack)
            ├─► storage/           (storage operators)
            ├─► database/          (database operators)
            ├─► external-secrets/  (secret sync)
            ├─► default/           (~30 apps)
            └─► external-server/   (public-facing apps)
```

### Kustomization Dependencies

Flux respects the dependency chain:

1. **cluster-meta**: Installs all OCI/Helm repositories
2. **cluster-apps**: Depends on cluster-meta, installs all namespace Kustomizations
3. **Namespace-level**: Each namespace can depend on others (e.g., `default` depends on `database`, `external-secrets`)

### Application Resource Pattern

```
kubernetes/apps/<namespace>/<app>/
  ks.yaml                # Flux Kustomization
  app/
    helmrelease.yaml     # HelmRelease (app-template)
    externalsecret.yaml  # ExternalSecret (optional)
    kustomization.yaml   # Kustomize resources
    [pvc.yaml]           # PVC definition (optional)
  [sub-app/]             # Additional components (optional)
```

**HelmRelease pattern**:
```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: my-app
spec:
  chartRef:
    kind: OCIRepository
    name: app-template
  values:
    # App-specific values
```

All apps share the same `app-template` chart defined in `kubernetes/components/common/repos/app-template/`.

### Reusable Components

Located in `kubernetes/components/`:

**`common/`** - Included in every namespace:
- Namespace definition
- SOPS age secret (for Flux decryption)
- OCIRepository for app-template
- HelmRepository for common charts

**`gatus/`** - Monitoring components:
- `external` - External endpoint monitoring
- `external-tailscale` - Tailscale endpoint checks
- `guarded` - Internal service health checks

**`volsync-new/`** - VolSync backup templates:
- ReplicationDestination/Source with MinIO target
- Configurable capacity and retention

**`image-automation/`** - Flux image automation:
- ImageRepository (OCI registries)
- ImagePolicy (semver filtering)
- ImageUpdateAutomation (auto-update HelmReleases)

## Secret Management

### SOPS + age

```
┌─────────────────────────────────────────┐
│         Encryption Strategy              │
├─────────────────────────────────────────┤
│  talos/*.sops.yaml                       │
│  └─► Whole-file encryption               │
│                                          │
│  (bootstrap|kubernetes)/*.sops.yaml     │
│  └─► data/stringData fields only         │
└─────────────────────────────────────────┘
```

**Key locations**:
- `age.key` - Local-only decryption key (never committed)
- `flux-system/sops-age` Secret - Flux decryption key in cluster
- `.sops.yaml` - Encryption rules and recipient age public key

### External Secrets Operator

Bitwarden Connect integration:

```
Bitwarden Vault
    │
    │ External Secrets Operator
    ▼
ExternalSecret resources
    │
    ▼
Kubernetes Secrets
```

**Pattern**:
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: my-app-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: bitwarden-connect
  target:
    name: my-app-secret
  data:
    - secretKey: PASSWORD
      remoteRef:
        key: "my-app-password"
```

## Observability Stack

### Monitoring Pipeline

```
┌─────────────────────────────────────────┐
│  Prometheus Operator                     │
│  (Scrapes metrics from pods/nodes)      │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  Thanos                                 │
│  (Long-term storage, deduplication)    │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  Grafana                                │
│  (Visualization, dashboards)           │
└─────────────────────────────────────────┘
```

### Logging Pipeline

```
┌─────────────────────────────────────────┐
│  Promtail (on each node)                │
│  (Reads journal logs)                    │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  Loki                                    │
│  (Log aggregation, labeling)            │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│  Grafana                                │
│  (Log queries, inspection)              │
└─────────────────────────────────────────┘
```

### Uptime Monitoring

- **Gatus**: Active endpoint monitoring with alerts
- **Uptime Kuma**: Status page for external monitoring
- **Kubernetes endpoint**: [status-dev.tomyail.com](https://status-dev.tomyail.com)

## Ingress & Routing

### Gateway API Hierarchy

```
Gateway (kube-system)
    │
    ├─► internal listener (192.168.50.12)
    │   └─► Internal routes
    │
    └─► external listener (Cloudflare Tunnel)
        └─► Public routes
```

**Route configuration pattern**:
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: my-app
spec:
  parentRefs:
    - name: internal
      namespace: kube-system
  hostnames:
    - "my-app.tomyail.com"
  rules:
    - backendRefs:
        - name: my-app
          port: 80
```

## Dependency Updates

### Renovate Bot

Auto-updates tracked dependencies:

- **Container images**: From `image:` tags in YAML
- **Helm charts**: From OCI repositories
- **GitHub releases**: Tracked via `# renovate: datasource=github-tags`
- **mise tools**: From `.mise.toml`
- **GitHub Actions**: From workflow files

**Schedule**: Runs every weekend
**Auto-merge**: Patch updates for GHA and mise tools
**Grouping**: Major components grouped (cert-manager, CoreDNS, Flux, Spegel)

## Key Architecture Decisions

1. **Talos over standard Linux**: Immutable OS reduces configuration drift and attack surface
2. **Flux over Helm directly**: GitOps provides change history and rollback capability
3. **Cilium over default CNI**: Advanced networking features (BGP, L7 awareness)
4. **SOPS + age over SealedSecrets**: Git-friendly secrets with simple key management
5. **TopoLVM over hostPath/emptyDir**: Dynamic volume management with LVM flexibility
6. **VolSync over Velero**: Application-level backup with remote sync support
7. **Gateway API over Ingress**: Modern routing standard with better CRD support
