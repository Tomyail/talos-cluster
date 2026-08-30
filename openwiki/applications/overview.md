---
type: Applications overview
title: Applications Overview
description: How applications are structured and deployed in the cluster, including namespace layout, Flux Kustomizations, HelmRelease patterns, and reusable components.
tags: [applications, flux, helm, namespaces, gitops]
verified:
  - by: openwiki/0.4.3
    at: 2026-08-30T21:57:36.532Z
sources:
  - id: openwiki-source-3575fddf30ac39cfa744fb2f
    resource: repo://kubernetes/apps/cert-manager/cert-manager/app/helmrelease.yaml
  - id: openwiki-source-878c71c8660186a07262b148
    resource: repo://kubernetes/apps/database/cloudnative-pg/app/externalsecret.yaml
  - id: openwiki-source-b036f144da153ee24467316a
    resource: repo://kubernetes/apps/database/cloudnative-pg/app/helmrelease.yaml
  - id: openwiki-source-ce5428b32557cc11ea784146
    resource: repo://kubernetes/apps/database/cloudnative-pg/cluster/cluster16.yaml
  - id: openwiki-source-951c2cc0849ba28408b9b784
    resource: repo://kubernetes/apps/database/cloudnative-pg/ks.yaml
  - id: openwiki-source-6a7bc35744e35cf9c477e58f
    resource: repo://kubernetes/apps/database/dragonfly/app/helmrelease.yaml
  - id: openwiki-source-91a83fcea6f6c07669970325
    resource: repo://kubernetes/apps/database/dragonfly/cluster/cluster.yaml
  - id: openwiki-source-94bb4e23c21de8a42f981d2f
    resource: repo://kubernetes/apps/database/dragonfly/ks.yaml
  - id: openwiki-source-ee06019c49401bb5e952b0ff
    resource: repo://kubernetes/apps/database/kustomization.yaml
  - id: openwiki-source-dbd8b5c09621dda4424792fd
    resource: repo://kubernetes/apps/default/gitea/app/helmrelease.yaml
  - id: openwiki-source-649e5ed74d5376f95cff2b2a
    resource: repo://kubernetes/apps/default/gitea/ks.yaml
  - id: openwiki-source-b9d4da166d7fb6816b60fef7
    resource: repo://kubernetes/apps/default/jellyfin/app/helmrelease.yaml
  - id: openwiki-source-dab2a819a5e570335c6a1129
    resource: repo://kubernetes/apps/default/jellyfin/ks.yaml
  - id: openwiki-source-83fcf5098607a9b2edbdd01e
    resource: repo://kubernetes/apps/default/kustomization.yaml
  - id: openwiki-source-0c521bf9d00ed413e75ea3ac
    resource: repo://kubernetes/apps/default/paperless/app/helmrelease.yaml
  - id: openwiki-source-e77c6b8832294602885266c1
    resource: repo://kubernetes/apps/external-secrets/external-secrets/app/helmrelease.yaml
  - id: openwiki-source-ad95146e587c2b5efe4f98d1
    resource: repo://kubernetes/apps/kube-system/cilium/app/helmrelease.yaml
  - id: openwiki-source-473a10228ca4b1e96867e493
    resource: repo://kubernetes/apps/kube-system/kustomization.yaml
  - id: openwiki-source-f340d1876ec8cdef13a12327
    resource: repo://kubernetes/apps/network/cloudflare-tunnel/app/helmrelease.yaml
  - id: openwiki-source-1ff1d265d4864ecc58515b0a
    resource: repo://kubernetes/apps/network/k8s-gateway/app/helmrelease.yaml
  - id: openwiki-source-cfa24be7f3923928e4fe05dd
    resource: repo://kubernetes/apps/network/kustomization.yaml
  - id: openwiki-source-d4d025f39bde91bcff75daaa
    resource: repo://kubernetes/apps/network/tailscale/app/helmrelease.yaml
  - id: openwiki-source-713804fe0a8649683e2d52d6
    resource: repo://kubernetes/apps/observability/gatus/app/helmrelease.yaml
  - id: openwiki-source-b742f8057573a80a14049cc3
    resource: repo://kubernetes/apps/observability/grafana/app/helmrelease.yaml
  - id: openwiki-source-3bb8db68d9e76fc96ebaa8a0
    resource: repo://kubernetes/apps/observability/kustomization.yaml
  - id: openwiki-source-f4981326e8ef2c12ac7b791b
    resource: repo://kubernetes/apps/storage/kustomization.yaml
  - id: openwiki-source-9baccf3ae41f07f1fd5a1914
    resource: repo://kubernetes/apps/storage/topolvm/app/helmrelease.yaml
  - id: openwiki-source-015490ec49e95d08d0ea6358
    resource: repo://kubernetes/apps/storage/topolvm/ks.yaml
  - id: openwiki-source-710f7608ef2681013d8705c7
    resource: repo://kubernetes/apps/storage/volsync/app/helmrelease.yaml
  - id: openwiki-source-63c7de935f96b1aa0a5dc1a4
    resource: repo://kubernetes/components/common/kustomization.yaml
  - id: openwiki-source-0aa0479be229def909bbfa22
    resource: repo://kubernetes/components/common/repos/app-template/ocirepository.yaml
generated: { by: "openwiki/0.4.3", at: "2026-08-30T21:57:36.532Z" }
---

# Applications Overview

How applications are structured and deployed in the cluster.

## Application Organization

### Namespace Strategy

Applications are grouped by namespace under `kubernetes/apps/`:

- **`kube-system`** - Core cluster components (Cilium, CoreDNS, metrics-server, reloader, node-feature-discovery, intel-device-plugin-operator, system-upgrade)
- **`flux-system`** - GitOps operator and instance (flux-operator, flux-instance, image-automation, notification)
- **`cert-manager`** - Certificate management
- **`network`** - Networking services (Cloudflare Tunnel, Cloudflare DNS, AdGuard DNS, k8s-gateway, Tailscale, SMTP relay)
- **`observability`** - Monitoring stack (Grafana, Prometheus operator, kube-prometheus-stack, Loki, Promtail, Thanos, Gatus, Uptime Kuma, kromgo, smartctl-exporter)
- **`storage`** - Storage operators (TopoLVM, VolSync, snapshot-controller, local-path-provisioner, NFS CSI, Nextcloud)
- **`database`** - Database operators (PostgreSQL via CloudNative-PG, Redis-compatible via Dragonfly, pgAdmin)
- **`external-secrets`** - External Secrets Operator and Bitwarden integration
- **`default`** - Personal applications (~35 apps, including Gitea, Jellyfin, growth-tracker, Paperless, Navidrome, n8n, Home Assistant)
- **`external-server`** - Public-facing applications

### Namespace Kustomization Pattern

Each namespace has a `kustomization.yaml` that aggregates all applications:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: default
components:
  - ../../components/common
resources:
  - ./atuin/ks.yaml
  - ./gitea/ks.yaml
  - ./jellyfin/ks.yaml
  # ... more apps
```

**Key points**:
- Includes all app directories as Flux Kustomizations (`./app/ks.yaml`)
- Includes `common` component (namespace, repos, SOPS decryption)
- Flux reconciles this as one Kustomization per namespace

### Application Directory Structure

Each application follows this pattern:

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

**Example**: `kubernetes/apps/default/gitea/` contains the main app in `app/` and a runner in `runner/`.

## Application Template

### Shared OCI Chart

Most applications use the `app-template` OCI chart from `ghcr.io/bjw-s-labs/helm/app-template`:

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

**Chart definition** in `kubernetes/components/common/repos/app-template/ocirepository.yaml`:
- URL: `oci://ghcr.io/bjw-s-labs/helm/app-template`
- Version: 5.0.1
- Parsed as Helm chart content

**Why shared chart**:
- Consistent application structure across all apps
- Simplifies updates (update chart once, all apps benefit)
- Flexible values schema for common patterns (controllers, containers, services, routes, persistence)

### HelmRelease Values

The `app-template` chart supports these common patterns:

**Controllers and containers**:
```yaml
controllers:
  main:
    containers:
      app:
        image:
          repository: ghcr.io/example/my-app
          tag: 1.2.3
        env:
          TZ: America/New_York
          SOME_VAR: value
```

**Secrets from ExternalSecret**:
```yaml
envFrom:
  - secretRef:
      name: my-app-secret
```

**Service and ports**:
```yaml
service:
  main:
    ports:
      http:
        port: 8080
```

**Gateway API routes** (for ingress):
```yaml
route:
  main:
    hostnames:
      - "my-app.example.com"
    parentRefs:
      - name: internal
        namespace: kube-system
        sectionName: https
```

**Persistent volumes**:
```yaml
persistence:
  data:
    existingClaim: my-app-data
    globalMounts:
      - path: /data
```

## Database Applications

The `database` namespace runs database operators for both relational and in-memory data.

### CloudNative-PG (PostgreSQL)

**Location**: `kubernetes/apps/database/cloudnative-pg/`

PostgreSQL operator providing high-availability, backup, and replication for relational databases.

**Two-stage deployment**:
1. **Operator installation** (`./app/helmrelease.yaml`): Installs CloudNative-PG operator with CRDs
2. **Cluster instance** (`./cluster/cluster16.yaml`): Creates PostgreSQL 16 cluster

**Cluster configuration** (`cluster16.yaml`):
- Image: `ghcr.io/cloudnative-pg/postgresql:16.3-7`
- Storage: 10Gi, `topolvm-thin-provisioner` storage class
- Resources: 500m CPU, 1Gi request; 2Gi memory limit
- Backups: S3-compatible storage (MinIO) with 7-day retention
- Monitoring: PodMonitor enabled for Prometheus scraping

**ExternalSecret** (`./app/externalsecret.yaml`):
- Syncs credentials from Bitwarden (username, password, S3 credentials)
- Uses `ClusterSecretStore` for secret access

**Components**:
- `app/helmrelease.yaml` - CloudNative-PG operator
- `app/externalsecret.yaml` - S3 credentials for backups
- `cluster/cluster16.yaml` - PostgreSQL 16 cluster instance
- `cluster/externalsecret-n8n.yaml` - Database credentials for n8n
- `cluster/scheduledbackup.yaml` - Automated backups via CronJob
- `cluster/gatus.yaml` - Health checks for Gatus
- `cluster/prometheusrule.yaml` - Prometheus alerting rules

### Dragonfly (Redis-compatible)

**Dragonfly** is a Redis-compatible in-memory data store with improved performance and resource efficiency.

**Location**: `kubernetes/apps/database/dragonfly/`

**Two-stage Flux Kustomization pattern**:

```yaml
# Stage 1: Operator + CRD
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: dragonfly
spec:
  path: ./kubernetes/apps/database/dragonfly/app
  # Installs Dragonfly operator, CRDs, and RBAC

---
# Stage 2: Database instance (depends on operator)
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: dragonfly-cluster
spec:
  path: ./kubernetes/apps/database/dragonfly/cluster
  dependsOn:
    - name: dragonfly
  # Creates Dragonfly instance after CRDs are available
```

**Dragonfly instance configuration** (`cluster/cluster.yaml`):
```yaml
apiVersion: dragonflydb.io/v1alpha1
kind: Dragonfly
metadata:
  name: dragonfly
spec:
  image: ghcr.io/dragonflydb/dragonfly:v1.40.1
  replicas: 1
  env:
    - name: MAX_MEMORY
      valueFrom:
        resourceFieldRef:
          resource: limits.memory
          divisor: 1Mi
  args:
    - --maxmemory=$(MAX_MEMORY)Mi
    - --cluster_mode=emulated
  resources:
    requests:
      cpu: 100m
      memory: 128Mi
    limits:
      memory: 512Mi
```

**Key features**:
- **Memory-based limits**: Uses `MAX_MEMORY` env var from memory limit (512Mi)
- **Cluster mode**: `emulated` for single-replica setups
- **Monitoring**: Prometheus scraping via PodMonitor on port 9377
- **Network policy**: Allows only Prometheus metrics access

**When to use Dragonfly vs PostgreSQL**:
- Dragonfly: In-memory caching, session storage, rate limiting, queues
- PostgreSQL (CloudNative-PG): Relational data, transactions, complex queries

## Core Infrastructure Applications

### kube-system Components

**Cilium** (`./kube-system/cilium/`):
- CNI plugin for cluster networking
- Uses HelmRepository source (not OCI)
- ConfigMap-based values injection
- Installs with CRDs and comprehensive network policies

**CoreDNS** (`./kube-system/coredns/`):
- Cluster DNS service
- OCI chart from `ghcr.io/coredns/charts/coredns`
- ConfigMap-based values

**metrics-server** (`./kube-system/metrics-server/`):
- Metrics collection for resource usage
- HelmRepository source
- Enables horizontal pod autoscaling

**reloader** (`./kube-system/reloader/`):
- Auto-reload pods when ConfigMaps/Secrets change
- OCI chart from `ghcr.io/stakater/charts/reloader`
- PodMonitor enabled for metrics

### Storage Applications

**TopoLVM** (`./storage/topolvm/`):
- LVM-based dynamic provisioning
- Uses `topolvm-thin-provisioner` storage class
- Device classes: thin provisioning with 10GB spare
- Embedded lvmd per node
- Default storage class for the cluster

**VolSync** (`./storage/volsync/`):
- Data replication and backup for PVCs
- HelmRepository source from Backube
- CRDs managed by the chart

**snapshot-controller** (`./storage/snapshot-controller/`):
- Volume snapshot creation and restoration
- CRDs installed with CreateReplace strategy

### Networking Applications

**k8s-gateway** (`./network/k8s-gateway/`):
- Gateway API-based DNS routing
- OCI chart from `ghcr.io/k8s-gateway/charts/k8s-gateway`
- LoadBalancer service with IPAM annotation
- Watches HTTPRoute and Service resources

**Cloudflare Tunnel** (`./network/cloudflare-tunnel/`):
- Ingress tunnel to Cloudflare network
- Uses app-template
- Metrics on port 8080
- HTTP/2 transport protocol

**Tailscale** (`./network/tailscale/`):
- VPN overlay network
- HelmRepository source
- OAuth credentials from Secret

### Observability Applications

**Grafana** (`./observability/grafana/`):
- OCI chart from `ghcr.io/grafana/helm-charts/grafana`
- Data sources: Thanos (Prometheus-compatible), Loki, Alertmanager
- Anonymous access enabled (Viewer role)
- Dashboard providers configured

**Prometheus operator** (`./observability/prometheus-operator/`):
- CRDs for Prometheus resources
- Deploys before kube-prometheus-stack

**Thanos** (`./observability/thanos/`):
- Long-term metrics storage and querying
- Sidecar configuration for Prometheus

**Loki** (`./observability/loki/`):
- Log aggregation system
- Uses app-template

**Gatus** (`./observability/gatus/`):
- Health check and status page
- Uses app-template
- Init container with k8s-sidecar for config discovery
- Watches ConfigMaps/Secrets with `gatus.io/enabled` label

**Uptime Kuma** (`./observability/uptime-kuma/`):
- Uptime monitoring
- Uses app-template
- Route to both internal and external gateways

## Application Examples

### Gitea (Git Server)

**Location**: `kubernetes/apps/default/gitea/`

**Components**:
- Main app in `app/` with HelmRelease using app-template
- Runner in `runner/` for CI/CD actions
- Two Kustomizations in `ks.yaml`: `gitea` and `gitea-runner`

**Key features**:
- Init container for database initialization
- PostgreSQL backend via CloudNative-PG
- ExternalSecret for credentials
- Gateway API routes to internal and external gateways
- VolSync component for data replication
- PVC for persistent storage

**Dependencies** (via `dependsOn`):
- TopoLVM (storage)
- External Secrets operator
- CloudNative-PG cluster (database)

### Jellyfin (Media Server)

**Location**: `kubernetes/apps/default/jellyfin/`

**Key features**:
- Uses app-template
- Intel GPU acceleration (`gpu.intel.com/i915: 1`)
- LoadBalancer service with IPAM (192.168.50.127)
- Gateway API routes
- Three PVCs: config, cache, media
- Media PVC mounts NAS storage

### Paperless (Document Management)

**Location**: `kubernetes/apps/default/paperless/`

**Key features**:
- Uses app-template
- Dragonfly for Redis backend (task queue, caching)
- PostgreSQL database via CloudNative-PG
- OCR with Chinese and English language support
- ExternalSecret for credentials
- Gateway API route to internal gateway

## Common Patterns

### Security Context

Most applications use this security pattern:

```yaml
defaultPodOptions:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
    fsGroupChangePolicy: OnRootMismatch
```

Container-specific security:
```yaml
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop:
      - ALL
```

### Resource Management

Typical resource requests/limits:
- Small apps: 10m CPU, 64-128Mi memory (request); 256Mi memory (limit)
- Medium apps: 100m CPU, 512Mi memory (request); 1-2Gi memory (limit)
- Large apps (Jellyfin): 100m CPU, 1Gi memory (request); 8Gi memory + GPU

### Probes and Health Checks

Standard probe pattern:
```yaml
probes:
  liveness: &probes
    enabled: true
    custom: true
    spec:
      httpGet:
        path: /health
        port: &port 8080
      initialDelaySeconds: 0
      periodSeconds: 10
      timeoutSeconds: 1
      failureThreshold: 3
  readiness: *probes
```

### Reloader Integration

Many apps use Reloader for automatic pod restart on ConfigMap/Secret changes:

```yaml
annotations:
  reloader.stakater.com/auto: "true"
```

### Monitoring Integration

ServiceMonitor for Prometheus scraping:
```yaml
serviceMonitor:
  app:
    endpoints:
      - port: http
```

## Related Topics

<!-- openwiki: broken internal link [/concepts/flux-architecture.md] file "/concepts/flux-architecture.md" does not exist. Fix the href or restore the target, then delete this comment. -->
- **Flux Architecture**: See [Flux Architecture](/concepts/flux-architecture.md) for reconciliation and GitOps patterns
<!-- openwiki: broken internal link [/operations/daily-operations.md] file "/operations/daily-operations.md" does not exist. Fix the href or restore the target, then delete this comment. -->
- **Daily Operations**: See [Daily Operations](/operations/daily-operations.md) for application management
<!-- openwiki: broken internal link [/workflows/app-deployment.md] file "/workflows/app-deployment.md" does not exist. Fix the href or restore the target, then delete this comment. -->
- **App Deployment**: See [App Deployment](/workflows/app-deployment.md) for deploying new applications
