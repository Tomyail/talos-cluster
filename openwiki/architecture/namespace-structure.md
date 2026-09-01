---
type: architecture
title: Namespace and Application Organization
description: Organizational structure for Kubernetes applications by namespace/domain under kubernetes/apps/, the Flux reconciliation hierarchy, app-template OCI repository pattern, and the kustomization.yaml pattern including components/common for shared resources.
tags: [namespace, organization, kubernetes, flux, kustomize, app-template, oci]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-01T21:54:26.927Z
sources:
  - id: openwiki-source-54887d3506bd4aec59c1b5dd
    resource: repo://kubernetes/apps/cert-manager/kustomization.yaml
  - id: openwiki-source-951c2cc0849ba28408b9b784
    resource: repo://kubernetes/apps/database/cloudnative-pg/ks.yaml
  - id: openwiki-source-ee06019c49401bb5e952b0ff
    resource: repo://kubernetes/apps/database/kustomization.yaml
  - id: openwiki-source-a7a8866fbf43eeaf3c7e2b63
    resource: repo://kubernetes/apps/database/namespace.yaml
  - id: openwiki-source-b39dd7458c333c8d2cd9b103
    resource: repo://kubernetes/apps/default/echo/app/helmrelease.yaml
  - id: openwiki-source-7fd6f131bdc95ec52633f1da
    resource: repo://kubernetes/apps/default/echo/app/kustomization.yaml
  - id: openwiki-source-1385f4adf262cc0ec92b6d45
    resource: repo://kubernetes/apps/default/echo/ks.yaml
  - id: openwiki-source-83fcf5098607a9b2edbdd01e
    resource: repo://kubernetes/apps/default/kustomization.yaml
  - id: openwiki-source-9779b9f95c92fea599cac48c
    resource: repo://kubernetes/apps/default/prowlarr/app/helmrelease.yaml
  - id: openwiki-source-0a0d6ff2e6b1affc5f873f6e
    resource: repo://kubernetes/apps/default/prowlarr/ks.yaml
  - id: openwiki-source-9ca10a21b6a666906b6c355c
    resource: repo://kubernetes/apps/external-secrets/kustomization.yaml
  - id: openwiki-source-7c78b7d4f05c3f61bf56ba17
    resource: repo://kubernetes/apps/external-server/kustomization.yaml
  - id: openwiki-source-353d6337774b02ec530a43f6
    resource: repo://kubernetes/apps/flux-system/kustomization.yaml
  - id: openwiki-source-ad95146e587c2b5efe4f98d1
    resource: repo://kubernetes/apps/kube-system/cilium/app/helmrelease.yaml
  - id: openwiki-source-d6f15e9bcc98024fdcda7d87
    resource: repo://kubernetes/apps/kube-system/cilium/ks.yaml
  - id: openwiki-source-473a10228ca4b1e96867e493
    resource: repo://kubernetes/apps/kube-system/kustomization.yaml
  - id: openwiki-source-cfa24be7f3923928e4fe05dd
    resource: repo://kubernetes/apps/network/kustomization.yaml
  - id: openwiki-source-9f2f8a056bc4576db95d46f4
    resource: repo://kubernetes/apps/observability/grafana/ks.yaml
  - id: openwiki-source-3bb8db68d9e76fc96ebaa8a0
    resource: repo://kubernetes/apps/observability/kustomization.yaml
  - id: openwiki-source-f4981326e8ef2c12ac7b791b
    resource: repo://kubernetes/apps/storage/kustomization.yaml
  - id: openwiki-source-36b0dc45e5070034d8a08ed2
    resource: repo://kubernetes/apps/storage/namespace.yaml
  - id: openwiki-source-015490ec49e95d08d0ea6358
    resource: repo://kubernetes/apps/storage/topolvm/ks.yaml
  - id: openwiki-source-63c7de935f96b1aa0a5dc1a4
    resource: repo://kubernetes/components/common/kustomization.yaml
  - id: openwiki-source-fdbb4af8b5edac00a29199d6
    resource: repo://kubernetes/components/common/namespace.yaml
  - id: openwiki-source-0aa0479be229def909bbfa22
    resource: repo://kubernetes/components/common/repos/app-template/ocirepository.yaml
  - id: openwiki-source-d8126483419916725f75040b
    resource: repo://kubernetes/components/common/repos/kustomization.yaml
  - id: openwiki-source-dff47ef9008ba7bce93e217b
    resource: repo://kubernetes/components/common/sops/kustomization.yaml
  - id: openwiki-source-3ecfe771454a6bc6a446f83f
    resource: repo://kubernetes/components/gatus/external/kustomization.yaml
  - id: openwiki-source-cf127a322444d1f6306750c2
    resource: repo://kubernetes/components/volsync/kustomization.yaml
  - id: openwiki-source-0696023deccf378a358f7526
    resource: repo://kubernetes/flux/cluster/ks.yaml
  - id: openwiki-source-44d7f211de6805be7a9fe8e8
    resource: repo://kubernetes/flux/meta/repos/bjw-s.yaml
  - id: openwiki-source-12a44dba301e86ea2cf62628
    resource: repo://kubernetes/flux/meta/repos/kustomization.yaml
generated: { by: "openwiki/0.5.0", at: "2026-09-01T21:54:26.927Z" }
---

# Namespace and Application Organization

Applications are organized into domain-specific namespaces under `kubernetes/apps/`, with each namespace containing related applications and services. This structure enables logical grouping, shared resource management, and ordered deployment through Flux Kustomization dependencies.

## Namespace Organization

The cluster uses the following namespace strategy to segregate workloads by domain:

```mermaid
flowchart LR
    subgraph Infra["Infrastructure Layer"]
        KS["kube-system"]
        NET["network"]
        CERT["cert-manager"]
    end
    
    subgraph Data["Data Layer"]
        STG["storage"]
        DB["database"]
        ES["external-secrets"]
    end
    
    subgraph Ops["Operations Layer"]
        OBS["observability"]
        FLX["flux-system"]
    end
    
    subgraph Apps["Application Layer"]
        DFLT["default"]
        EXTS["external-server"]
    end
```

*Figure: Namespace organization by functional layer, showing dependency flow from infrastructure through applications*

### Namespace Definitions

Each namespace groups related functionality and enforces appropriate pod security standards:

- **kube-system** (`kubernetes/apps/kube-system/`) - Core cluster infrastructure including Cilium CNI, CoreDNS, node utilities, and system upgrade controllers
- **network** (`kubernetes/apps/network/`) - Networking services including Cloudflare DNS/tunnel, k8s-gateway, AdGuard DNS, SMTP relay, and Tailscale
- **storage** (`kubernetes/apps/storage/`) - Storage infrastructure including TopoLVM, snapshot-controller, local-path-provisioner, VolSync, and CSI drivers
- **database** (`kubernetes/apps/database/`) - Database operators and instances including CloudNative-PG and Dragonfly
- **external-secrets** (`kubernetes/apps/external-secrets/`) - External Secrets Operator and secret synchronization (Bitwarden Connect)
- **cert-manager** (`kubernetes/apps/cert-manager/`) - TLS certificate provisioning via cert-manager
- **observability** (`kubernetes/apps/observability/`) - Monitoring stack including Prometheus, Grafana, Loki, and alerting tools
- **flux-system** (`kubernetes/apps/flux-system/`) - Flux GitOps operator components (flux-instance, flux-operator, image-automation, notification)
- **default** (`kubernetes/apps/default/`) - User-facing applications and services (media, home automation, development tools)
- **external-server** (`kubernetes/apps/external-server/`) - External workloads and server applications

## Flux Reconciliation Flow

The `cluster-apps` Kustomization in `kubernetes/flux/cluster/ks.yaml` reconciles all namespace-level Kustomizations under `kubernetes/apps/`, creating a hierarchical deployment pattern:

```mermaid
flowchart TD
    A["cluster-apps"]
    B["kube-system"]
    C["network"]
    D["storage"]
    E["database"]
    F["external-secrets"]
    G["cert-manager"]
    H["observability"]
    I["flux-system"]
    J["default"]
    K["external-server"]
    
    A --> B
    A --> C
    A --> D
    A --> E
    A --> F
    A --> G
    A --> H
    A --> I
    A --> J
    A --> K
```

*Figure: Flux reconciliation flow from cluster-apps through namespace-level Kustomizations to individual applications*

The `cluster-apps` Kustomization specifies:
- **path**: `./kubernetes/apps` - Scans all namespace directories
- **decryption**: SOPS provider for encrypted secrets
- **dependsOn**: Waits for `cluster-meta`, `gateway-api-crds`, and `external-dns-crds` before reconciling applications

## Namespace Kustomization Pattern

Each namespace follows a consistent Kustomization pattern defined in its `kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: <namespace-name>
components:
  - ../../components/common
resources:
  - ./app1/ks.yaml
  - ./app2/ks.yaml
  - ./app3/ks.yaml
```

### Components

The `../../components/common` reference injects shared resources into every namespace:

- **namespace.yaml** - Namespace definition with pod security labels and prune-disabled annotation
- **repos/** - HelmRepository and OCIRepository sources for charts
- **sops/** - SOPS decryption secrets (sops-age, cluster-secrets)

From `kubernetes/components/common/kustomization.yaml`:
```yaml
kind: Component
resources:
  - ./namespace.yaml
  - ./repos
  - ./sops
```

The `namespace.yaml` component applies pod security policies:
- `pod-security.kubernetes.io/enforce: privileged` for storage, kube-system
- `pod-security.kubernetes.io/enforce: baseline` for database
- `kustomize.toolkit.fluxcd.io/prune: disabled` annotation prevents namespace deletion

### Resources

Each application under the namespace is referenced as a Flux Kustomization (`./<app>/ks.yaml`), not as raw Kustomize resources. This enables:
- Per-application reconciliation intervals
- Individual dependency management via `dependsOn`
- Component injection for cross-cutting concerns (monitoring, backup)

## Application Kustomization Pattern

Every application uses a Flux Kustomization (`ks.yaml`) with this standard structure:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: &app <app-name>
  namespace: &namespace <namespace>
spec:
  targetNamespace: *namespace
  commonMetadata:
    labels:
      app.kubernetes.io/name: *app
  path: ./kubernetes/apps/<namespace>/<app>/app
  sourceRef:
    kind: GitRepository
    name: flux-system
    namespace: flux-system
  interval: 1h
  retryInterval: 2m
  timeout: 5m
  prune: true
  wait: true
```

### Key Elements

- **path**: Points to the application's Kustomize directory (typically `./app/`)
- **targetNamespace**: Deploys resources to the namespace specified
- **commonMetadata**: Adds `app.kubernetes.io/name` label to all resources
- **sourceRef**: References the flux-system GitRepository
- **interval**: Reconciliation frequency (1 hour standard)
- **prune**: Enables garbage collection of removed resources
- **wait**: Waits for resources to be healthy before marking ready

### Optional Configuration

Applications may include:

**dependsOn** - Explicit dependency ordering:
```yaml
dependsOn:
  - name: topolvm
    namespace: storage
  - name: external-secrets
    namespace: external-secrets
```

**decryption** - SOPS for encrypted secrets:
```yaml
decryption:
  provider: sops
  secretRef:
    name: sops-age
```

**postBuild** - Variable substitution:
```yaml
postBuild:
  substituteFrom:
    - name: cluster-secrets
      kind: Secret
  substitute:
    APP: *app
    VOLSYNC_CAPACITY: 2Gi
```

**components** - Reusable component injection:
```yaml
components:
  - ../../../../components/volsync-new
  - ../../../../components/gatus/guarded
```

## App-Template OCI Pattern

Most applications use the bjw-s app-template Helm chart sourced via OCIRepository, enabling consistent deployment patterns across applications.

### OCIRepository Definition

From `kubernetes/components/common/repos/app-template/ocirepository.yaml`:
```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: OCIRepository
metadata:
  name: app-template
spec:
  interval: 1h
  url: oci://ghcr.io/bjw-s-labs/helm/app-template
  ref:
    tag: 5.0.1
```

### HelmRelease Pattern

Applications reference the OCIRepository in their HelmRelease:

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: <app-name>
spec:
  interval: 1h
  chartRef:
    kind: OCIRepository
    name: app-template
  values:
    controllers:
      <app-name>:
        containers:
          app:
            image:
              repository: ghcr.io/<image>
              tag: <version>
```

The app-template provides:
- Standardized controller, container, service, and persistence structures
- Built-in probes, security contexts, and resource management
- Gateway API (HTTPRoute) and Traefik IngressRoute support
- ServiceMonitor integration for Prometheus

### Application Directory Structure

Each application follows this structure:
```
kubernetes/apps/<namespace>/<app>/
├── ks.yaml                 # Flux Kustomization
└── app/
    ├── kustomization.yaml  # Kustomize resources
    ├── helmrelease.yaml    # HelmRelease using app-template
    └── values.yaml         # Optional: additional Helm values
```

Some apps may use additional subdirectories for multiple releases (e.g., `cilium/app/` and `cilium/gateway/`).

## Component Reuse

Shared functionality is provided through components in `kubernetes/components/`:

### Common Components

- **components/common** - Namespace, repositories, SOPS secrets (included in all namespace Kustomizations)
- **components/gatus** - Gatus monitoring endpoints (external, guarded, external-tailscale variants)
- **components/volsync** - VolSync backup configuration (claim, minio)
- **components/volsync-new** - Updated VolSync component for new deployments
- **components/image-automation** - ImageRepository and ImagePolicy for automated updates

### Component Injection

Applications include components via the Flux Kustomization `components` field:

```yaml
components:
  - ../../../../components/volsync-new
  - ../../../../components/gatus/guarded
```

Components are Kustomize components (`kind: Component`) that generate ConfigMaps, Secrets, or other resources merged into the application's Kustomize build.

## HelmRepository Management

Helm chart sources are defined in `kubernetes/flux/meta/repos/` and reconciled by the `cluster-meta` Kustomization:

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: <repo-name>
  namespace: flux-system
spec:
  interval: 1h
  url: https://<chart-repo>/
```

These repositories are available cluster-wide for HelmReleases to reference. The bjw-s repository is defined as OCI for the app-template:
```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: bjw-s
  namespace: flux-system
spec:
  type: oci
  interval: 1h
  url: oci://ghcr.io/bjw-s/helm
```

## Dependency Management

Applications declare dependencies via `dependsOn` in their Flux Kustomization to enforce ordering:

**Example: prowlarr depends on storage and database**
```yaml
dependsOn:
  - name: topolvm
    namespace: storage
  - name: external-secrets
    namespace: external-secrets
  - name: cloudnative-pg-cluster
    namespace: database
```

**Example: grafana depends on monitoring stack**
```yaml
dependsOn:
  - name: kube-prometheus-stack
    namespace: observability
  - name: thanos
    namespace: observability
```

Flux waits for dependencies to be ready before reconciling the dependent application, ensuring proper startup sequence.

## Namespace Resource Isolation

Each namespace may include additional resources beyond applications in its `namespace.yaml`:

**Storage namespace** (`kubernetes/apps/storage/namespace.yaml`):
- Namespace with `volsync.backube/privileged-movers: "true"` annotation
- AlertManager Provider for HelmRelease failure notifications
- Alert resource for error events

**Database namespace** (`kubernetes/apps/database/namespace.yaml`):
- Namespace with `pod-security.kubernetes.io/enforce: baseline`
- AlertManager Provider and Alert configuration

These namespace-level resources provide per-domain configuration for monitoring, security policies, and integration points.
