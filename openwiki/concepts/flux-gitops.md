---
type: concept
title: Flux GitOps Architecture
description: Three-tier Flux reconciliation hierarchy from cluster-meta through cluster-apps to namespace-level Kustomizations, including SOPS decryption, postBuild substitution, and dependency ordering via dependsOn.
tags: [flux, gitops, kustomization, reconciliation, sops, dependencies]
verified:
  - by: openwiki/0.4.3
    at: 2026-08-31T23:16:37.333Z
sources:
  - id: openwiki-source-240e6406ed4b6841961679cb
    resource: repo://.sops.yaml
  - id: openwiki-source-559185c7613d95e269ebce5b
    resource: repo://kubernetes/apps/cert-manager/cert-manager/ks.yaml
  - id: openwiki-source-54887d3506bd4aec59c1b5dd
    resource: repo://kubernetes/apps/cert-manager/kustomization.yaml
  - id: openwiki-source-d6f15e9bcc98024fdcda7d87
    resource: repo://kubernetes/apps/kube-system/cilium/ks.yaml
  - id: openwiki-source-47282df10449a6bce110950c
    resource: repo://kubernetes/components/common/sops/cluster-secrets.sops.yaml
  - id: openwiki-source-244e2919bbe6d12c6c8c9757
    resource: repo://kubernetes/components/common/sops/sops-age.sops.yaml
  - id: openwiki-source-0696023deccf378a358f7526
    resource: repo://kubernetes/flux/cluster/ks.yaml
  - id: openwiki-source-fa7f31fb6ce67b322c8fb954
    resource: repo://kubernetes/flux/meta/kustomization.yaml
  - id: openwiki-source-f18a66278555579001f4dec6
    resource: repo://kubernetes/flux/meta/repos/bitnami.yaml
  - id: openwiki-source-77a1886377e2049c2c5b7b3a
    resource: repo://kubernetes/flux/meta/repos/external-dns.yaml
  - id: openwiki-source-2b0d1261d82082fced240caa
    resource: repo://kubernetes/flux/meta/repos/gateway-api.yaml
  - id: openwiki-source-12a44dba301e86ea2cf62628
    resource: repo://kubernetes/flux/meta/repos/kustomization.yaml
generated: { by: "openwiki/0.4.3", at: "2026-08-31T23:16:37.333Z" }
---

# Flux GitOps Architecture

The Flux GitOps architecture implements a three-tier reconciliation hierarchy that manages cluster infrastructure sources, application namespaces, and individual workloads. This design enables ordered deployment, secret decryption, and environment-specific configuration across the entire cluster.

## Reconciliation Hierarchy

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
    subgraph Tier1["Tier 1: Cluster Sources"]
        A[cluster-meta<br/>kubernetes/flux/cluster/ks.yaml]
        B[HelmRepository sources]
        C[GitRepository sources]
        D[sops-age secret]
    end
    
    subgraph Tier2["Tier 2: CRD Prerequisites"]
        E[gateway-api-crds]
        F[external-dns-crds]
    end
    
    subgraph Tier3["Tier 3: Applications"]
        G[cluster-apps<br/>kubernetes/flux/cluster/ks.yaml]
        H[kube-system/ks.yaml]
        I[network/ks.yaml]
        J[storage/ks.yaml]
        K[database/ks.yaml]
        L[cert-manager/ks.yaml]
        M[observability/ks.yaml]
        N[default/ks.yaml]
    end
    
    subgraph Tier4["Tier 4: App Kustomizations"]
        O[cilium/ks.yaml]
        P[coredns/ks.yaml]
        Q[cloudflare-tunnel/ks.yaml]
        R[external-dns/ks.yaml]
    end
    
    A --> B
    A --> C
    A --> D
    A --> E
    A --> F
    A --> G
    E --> G
    F --> G
    G --> H
    G --> I
    G --> J
    G --> K
    G --> L
    G --> M
    G --> N
    H --> O
    H --> P
    I --> Q
    I --> R
    
    style Tier1 fill:#e3f2fd
    style Tier2 fill:#fff3e0
    style Tier3 fill:#e8f5e9
    style Tier4 fill:#fce4ec
```

*Figure: Four-tier Flux reconciliation hierarchy showing dependency flow from cluster sources through namespace Kustomizations to individual applications*

## Tier 1: Cluster Meta (Sources)

The `cluster-meta` Kustomization deploys all source definitions and decryption infrastructure required by applications.

**Kustomization Definition** (`kubernetes/flux/cluster/ks.yaml#L1-L24`)
- **name**: `cluster-meta`
- **namespace**: `flux-system`
- **path**: `./kubernetes/flux/meta`
- **decryption**: SOPS provider with `sops-age` secret
- **interval**: 1 hour
- **wait**: true (ensures sources are ready before proceeding)

### Source Resources

The cluster-meta tier includes HelmRepository and GitRepository sources defined in `kubernetes/flux/meta/repos/`:

**HelmRepository Examples**:
- **bitnami** (`kubernetes/flux/meta/repos/bitnami.yaml#L1-L11`) - OCI chart repository at `registry-1.docker.io/bitnamicharts`
- **external-dns** (`kubernetes/flux/meta/repos/external-dns.yaml#L1-L10`) - HTTPS repository at `https://kubernetes-sigs.github.io/external-dns`
- **bitwarden-eso-provider** (`kubernetes/flux/meta/repos/bitwarden-eso.yaml#L1-L12`) - Raw GitHub pages repository for Bitwarden External Secrets Operator

**GitRepository Example**:
- **gateway-api** (`kubernetes/flux/meta/repos/gateway-api.yaml#L1-L18`) - Kubernetes Gateway API CRDs from GitHub, tag v1.6.1, experimental CRD directory only

All sources are deployed to the `flux-system` namespace with hardcoded namespace references to support Renovate lookups (noted in `kubernetes/flux/cluster/ks.yaml#L21`).

## Tier 2: CRD Prerequisites

Before applications can deploy, Custom Resource Definitions must be installed. These are managed as separate Kustomizations that depend on cluster-meta.

### Gateway API CRDs

**Kustomization** (`kubernetes/flux/cluster/ks.yaml#L25-L44`)
- **name**: `gateway-api-crds`
- **sourceRef**: GitRepository `gateway-api` (from cluster-meta)
- **path**: `./config/crd/experimental`
- **dependsOn**: `cluster-meta`
- **timeout**: 5 minutes (CRD installation can be slow)

### External DNS CRDs

**Kustomization** (`kubernetes/flux/cluster/ks.yaml#L46-L65`)
- **name**: `external-dns-crds`
- **sourceRef**: GitRepository `external-dns-crds` (from cluster-meta)
- **path**: `./config/crd/standard`
- **dependsOn**: `cluster-meta`
- **timeout**: 5 minutes

These CRD Kustomizations ensure that custom resources are available before applications attempt to use them.

## Tier 3: Cluster Apps (Namespaces)

The `cluster-apps` Kustomization reconciles all namespace-level Kustomizations under `kubernetes/apps/`.

**Kustomization Definition** (`kubernetes/flux/cluster/ks.yaml#L67-L94`)
- **name**: `cluster-apps`
- **path**: `./kubernetes/apps`
- **decryption**: SOPS provider with `sops-age` secret
- **dependsOn**: 
  - `cluster-meta`
  - `gateway-api-crds`
  - `external-dns-crds`
- **interval**: 1 hour
- **timeout**: 5 minutes
- **wait**: true

### Namespace Structure

Each namespace directory under `kubernetes/apps/` contains a `kustomization.yaml` that references application Kustomizations:

**Example Pattern** (`kubernetes/apps/cert-manager/kustomization.yaml#L1-L9`)
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: cert-manager
components:
  - ../../components/common
resources:
  - ./cert-manager/ks.yaml
```

**Common Components**:
- `../../components/common` injects shared resources including namespace definitions, HelmRepository sources, and SOPS secrets

The cluster-apps Kustomization scans all namespace directories and creates child Kustomizations for each application.

## Tier 4: Application Kustomizations

Individual applications are defined as Flux Kustomizations with standardized configuration.

### Application Kustomization Pattern

**Example: Cilium** (`kubernetes/apps/kube-system/cilium/ks.yaml#L1-L31`)
```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: &app cilium
  namespace: &namespace kube-system
spec:
  commonMetadata:
    labels:
      app.kubernetes.io/name: *app
  decryption:
    provider: sops
    secretRef:
      name: sops-age
  interval: 1h
  path: ./kubernetes/apps/kube-system/cilium/app
  postBuild:
    substituteFrom:
      - name: cluster-secrets
        kind: Secret
  prune: true
  retryInterval: 2m
  sourceRef:
    kind: GitRepository
    name: flux-system
    namespace: flux-system
  targetNamespace: *namespace
  timeout: 5m
  wait: true
```

### Key Configuration Elements

**Common Metadata** (`kubernetes/apps/kube-system/cilium/ks.yaml#L9-L11`)
- Adds `app.kubernetes.io/name` label to all resources for consistent identification

**Decryption** (`kubernetes/apps/kube-system/cilium/ks.yaml#L12-L15`)
- SOPS provider references `sops-age` secret for in-cluster decryption of encrypted manifests

**postBuild Substitution** (`kubernetes/apps/kube-system/cilium/ks.yaml#L18-L21`)
- Injects cluster-wide configuration from `cluster-secrets` Secret into manifests after Kustomize builds

**Prune** (`kubernetes/apps/kube-system/cilium/ks.yaml#L22`)
- Enabled garbage collection removes resources when deleted from Git

**Wait** (`kubernetes/apps/kube-system/cilium/ks.yaml#L30`)
- Ensures resources are healthy before marking the Kustomization ready

## Dependency Ordering

Flux uses the `dependsOn` field to create installation order across Kustomizations.

### Namespace-Level Dependencies

**Example: Cilium Gateway** (`kubernetes/apps/kube-system/cilium/ks.yaml#L46-L48`)
```yaml
dependsOn:
  - name: cert-manager
    namespace: cert-manager
```

This ensures cert-manager is available before Cilium Gateway (which uses cert-manager for TLS certificate management).

### Cluster-Level Dependencies

The `cluster-apps` Kustomization depends on CRD installation completing (`kubernetes/flux/cluster/ks.yaml#L78-L84`):
```yaml
dependsOn:
  - name: cluster-meta
    namespace: flux-system
  - name: gateway-api-crds
    namespace: flux-system
  - name: external-dns-crds
    namespace: flux-system
```

This dependency chain ensures:
1. Sources and decryption infrastructure are ready (cluster-meta)
2. CRDs are installed (gateway-api-crds, external-dns-crds)
3. Applications can deploy successfully (cluster-apps)

## SOPS Decryption

Flux decrypts SOPS-encrypted secrets in-cluster using the `sops-age` Secret.

### sops-age Secret

**Secret Definition** (`kubernetes/components/common/sops/sops-age.sops.yaml#L1-L22`)
- **name**: `sops-age`
- **field**: `age.agekey` contains the age private key
- **encryption**: Encrypted in Git using the cluster's age public key
- **decryption**: Flux decrypts this secret during cluster-meta reconciliation

### Decryption Flow

1. **Bootstrap**: `sops-age.sops.yaml` is decrypted and applied during `task bootstrap:apps` (`scripts/bootstrap-apps.sh#L60-L64`)
2. **Runtime**: Flux Kustomizations reference the decrypted secret via `decryption.provider.sops` and `secretRef.name.sops-age`
3. **Manifest Decryption**: When reconciling, Flux decrypts any `*.sops.yaml` files in the Kustomization path using the age key

**Example Usage** (`kubernetes/apps/kube-system/cilium/ks.yaml#L12-L15`):
```yaml
decryption:
  provider: sops
  secretRef:
    name: sops-age
```

### Encryption Rules

SOPS configuration (`.sops.yaml#L6-L9`) defines encryption for Kubernetes secrets:
- **Pattern**: `(bootstrap|kubernetes)/.*\.sops\.ya?ml`
- **Fields**: Only `data` and `stringData` are encrypted (`encrypted_regex`)
- **Recipient**: `age1shkd7fsr66cnpkutpmpf7ffylcc2x4c9tlsdkapv6nmu5ceu0dzqdjtqc5`
- **mac_only_encrypted**: Preserves YAML structure for Git readability

## postBuild Variable Substitution

The `postBuild.substituteFrom` mechanism injects cluster-wide configuration into application manifests without requiring per-application secrets.

### cluster-secrets Secret

**Secret Definition** (`kubernetes/components/common/sops/cluster-secrets.sops.yaml#L1-L23`)
- **name**: `cluster-secrets`
- **fields**: Environment values like `SECRET_DOMAIN`, `TIMEZONE`
- **encryption**: SOPS-encrypted `stringData` fields
- **usage**: Referenced by application Kustomizations for substitution

### Substitution Pattern

**Example** (`kubernetes/apps/kube-system/cilium/ks.yaml#L18-L21`):
```yaml
postBuild:
  substituteFrom:
    - name: cluster-secrets
      kind: Secret
```

During reconciliation:
1. Flux reads the `cluster-secrets` Secret
2. Replaces variables in manifests (e.g., `${SECRET_DOMAIN}`)
3. Applies substituted manifests to the cluster

This pattern enables environment-specific configuration without duplicating secrets across applications.

## Reconciliation Behavior

Each Kustomization tier has defined reconciliation intervals and retry behavior.

### Standard Configuration

**interval**: 1 hour
- Cluster-meta, cluster-apps, and most applications reconcile hourly

**retryInterval**: 2 minutes
- Failed reconciliations retry every 2 minutes

**timeout**: 5 minutes
- Most applications timeout after 5 minutes

**wait**: true
- Kustomizations wait for resources to be healthy before marking ready

**prune**: true
- Resources deleted from Git are garbage collected from the cluster

### Health Checks

Some applications define explicit health checks beyond waiting for resource readiness:

**Example: cert-manager** (`kubernetes/apps/cert-manager/cert-manager/ks.yaml#L16-L28`)
```yaml
healthChecks:
  - apiVersion: helm.toolkit.fluxcd.io/v2
    kind: HelmRelease
    name: cert-manager
    namespace: cert-manager
  - apiVersion: cert-manager.io/v1
    kind: ClusterIssuer
    name: letsencrypt-production
healthCheckExprs:
  - apiVersion: cert-manager.io/v1
    kind: ClusterIssuer
    failed: status.conditions.filter(e, e.type == 'Ready').all(e, e.status == 'False')
    current: status.conditions.filter(e, e.type == 'Ready').all(e, e.status == 'True')
```

This ensures the ClusterIssuer is ready before marking the Kustomization healthy.

## Related Pages

- [Bootstrap Flow](/openwiki/architecture/bootstrap-flow.md) - Initial cluster setup and Flux handoff
- [Namespace and Application Organization](/openwiki/architecture/namespace-structure.md) - Application structure under `kubernetes/apps/`
- [Secrets Management](/openwiki/concepts/secrets-management.md) - SOPS encryption and External Secrets Operator integration
