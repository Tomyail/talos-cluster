---
type: concept
title: Flux GitOps Workflow
description: Concept-level explanation of Flux Kustomizations, HelmRelease, the app-template OCIRepository chart source, dependsOn ordering, and Flux image automation as used in this repo.
tags: [flux, gitops, workflow, reconciliation, renovate, dependencies]
verified:
  - by: openwiki/0.5.2
    at: 2026-09-19T21:35:52.044Z
sources:
  - id: openwiki-source-240e6406ed4b6841961679cb
    resource: repo://.sops.yaml
  - id: openwiki-source-559185c7613d95e269ebce5b
    resource: repo://kubernetes/apps/cert-manager/cert-manager/ks.yaml
  - id: openwiki-source-37b3f77c1ceb2e20b192e263
    resource: repo://kubernetes/apps/default/atuin/app/helmrelease.yaml
  - id: openwiki-source-649e5ed74d5376f95cff2b2a
    resource: repo://kubernetes/apps/default/gitea/ks.yaml
  - id: openwiki-source-0c7ec057591fa8f2c504b0a2
    resource: repo://kubernetes/apps/flux-system/image-automation/automation.yaml
  - id: openwiki-source-d6f15e9bcc98024fdcda7d87
    resource: repo://kubernetes/apps/kube-system/cilium/ks.yaml
  - id: openwiki-source-63c7de935f96b1aa0a5dc1a4
    resource: repo://kubernetes/components/common/kustomization.yaml
  - id: openwiki-source-0aa0479be229def909bbfa22
    resource: repo://kubernetes/components/common/repos/app-template/ocirepository.yaml
  - id: openwiki-source-47282df10449a6bce110950c
    resource: repo://kubernetes/components/common/sops/cluster-secrets.sops.yaml
  - id: openwiki-source-244e2919bbe6d12c6c8c9757
    resource: repo://kubernetes/components/common/sops/sops-age.sops.yaml
  - id: openwiki-source-98651905762c8e5a9b4da8ba
    resource: repo://kubernetes/components/image-automation/imagepolicy.yaml
  - id: openwiki-source-7d50b3fa30e8bcbde0dc183c
    resource: repo://kubernetes/components/image-automation/imagerepository.yaml
  - id: openwiki-source-5b9de8faa6aefca68539d613
    resource: repo://kubernetes/components/image-automation/kustomization.yaml
  - id: openwiki-source-967d9e45efe8409177c04aa4
    resource: repo://kubernetes/components/image-automation/README.md
  - id: openwiki-source-0696023deccf378a358f7526
    resource: repo://kubernetes/flux/cluster/ks.yaml
generated: { by: "openwiki/0.5.2", at: "2026-09-19T21:35:52.044Z" }
---

# Flux GitOps Workflow

The Flux GitOps workflow defines how cluster configuration changes move from development to production. This document explains the day-to-day workflow for making changes, how reconciliation works, automated dependency management via Renovate, and how Flux ensures correct deployment ordering through dependencies.

## Workflow Overview

```mermaid
flowchart LR
    A["Developer makes change"] --> B["Commit to Git"]
    B --> C["Push to main branch"]
    C --> D["Flux detects change"]
    D --> E["Reconciliation starts"]
    E --> F["cluster-meta reconciles"]
    F --> G["CRD Kustomizations reconcile"]
    G --> H["cluster-apps reconciles"]
    H --> I["Namespace Kustomizations reconcile"]
    I --> J["Application Kustomizations reconcile"]
    J --> K["Resources applied to cluster"]
    K --> L["Health checks pass"]
    L --> M["Kustomization ready"]
    
    N["Renovate scans dependencies"] --> O["Creates PR with updates"]
    O --> P["Merge after approval"]
    P --> B
    
    Q["ImageUpdateAutomation runs"] --> R["Scans container registry"]
    R --> S["Updates image tags in Git"]
    S --> B
```

*Figure: Flux GitOps workflow showing manual changes, automated Renovate updates, and image automation flowing through reconciliation*

## Making Application Changes

### Change Flow

When you modify application configuration in the `kubernetes/apps/` directory, the following sequence occurs:

1. **Commit and Push**: Changes are committed to Git and pushed to the main branch
2. **Flux Detection**: The Flux GitRepository source (defined during bootstrap) detects the new commit via its polling interval
3. **Reconciliation Trigger**: Flux evaluates which Kustomizations are affected by the commit
4. **Dependency Chain**: Changes flow through the dependency hierarchy, respecting `dependsOn` constraints
5. **Application**: Resources are applied to the cluster, health checks run, and the Kustomization marks ready

### Manual Change Example

To update an application's Helm values:

```bash
# Edit the values file
vim kubernetes/apps/default/myapp/app/helm/values.yaml

# Commit and push
git add kubernetes/apps/default/myapp/app/helm/values.yaml
git commit -m "feat(myapp): increase replica count"
git push
```

Flux automatically detects the push and begins reconciliation within its configured interval.

## Reconciliation Loop

### Reconciliation Intervals

Each Kustomization defines how frequently it checks for changes:

**Standard Interval**: 1 hour (`kubernetes/flux/cluster/ks.yaml#L13`, `kubernetes/apps/default/paperless/ks.yaml#L36`)
- Cluster-meta, cluster-apps, and most applications reconcile hourly
- On-demand reconciliation occurs immediately when Git changes are detected

**Retry Interval**: 2 minutes (`kubernetes/flux/cluster/ks.yaml#L16`, `kubernetes/apps/default/paperless/ks.yaml#L37`)
- Failed reconciliations retry every 2 minutes with exponential backoff

**Timeout**: 5 minutes (`kubernetes/flux/cluster/ks.yaml#L93`, `kubernetes/apps/default/paperless/ks.yaml#L38`)
- Reconciliation operations timeout after 5 minutes
- CRD installations use extended timeouts (5 minutes) to accommodate slow API server operations

### Health Assurance

Flux waits for resources to become healthy before marking Kustomizations ready:

**Wait Behavior** (`kubernetes/flux/cluster/ks.yaml#L23`, `kubernetes/apps/default/paperless/ks.yaml#L35`)
- `wait: true` ensures Flux waits for all resources to be ready
- Only applies to resources created by the Kustomization
- Prevents cascading failures from incomplete deployments

**Prune Behavior** (`kubernetes/flux/cluster/ks.yaml#L15`, `kubernetes/apps/default/paperless/ks.yaml#L34`)
- `prune: true` enables garbage collection
- Resources deleted from Git are removed from the cluster
- Applies only to resources managed by the Kustomization

**Explicit Health Checks** (`kubernetes/apps/cert-manager/cert-manager/ks.yaml#L16-L28`)
Complex applications may define explicit health checks:

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

This ensures not only that resources exist, but that they're actually ready to serve traffic.

## Automated Dependency Updates

### Renovate Integration

Renovate automatically updates dependencies across the cluster configuration. It scans the repository for:

- **Container images** in Helm values and YAML files (`.renovaterc.json5#L25-L27`)
- **Helm charts** referenced in HelmRepository and HelmRelease resources (`.renovaterc.json5#L19-L21`)
- **Kubernetes manifests** with inline image references (`.renovaterc.json5#L25-L27`)
- **GitHub Actions** in workflow files (`.renovaterc.json5#L70-L76`)
- **Custom annotations** in any YAML file (`.renovaterc.json5#L206-L228`)

**Schedule**: Runs every weekend (`.renovaterc.json5#L14`)

**Exclusions**: Core infrastructure components are excluded from auto-merge to prevent destabilizing the cluster (`.renovaterc.json5#L163-L199`)

### Auto-Merge Rules

Certain updates are automatically merged after a stabilization period:

**GitHub Actions** (`.renovaterc.json5#L69-L76`)
- Minor, patch, and digest updates auto-merge after 3 days
- Tests are ignored for GitHub Actions updates

**Mise Tools** (`.renovaterc.json5#L77-L84`)
- Minor and patch updates auto-merge
- Tests are ignored

**Application Updates** (`.renovaterc.json5#L161-L204`)
- Non-major updates auto-merge for most applications
- Core infrastructure (Cilium, cert-manager, storage, databases) requires manual approval

### Semantic Commit Convention

Renovate uses semantic commits to indicate update severity (`.renovaterc.json5#L86-L131`):

- **Major updates**: `feat(helm)!: cert-manager (v1.12.0 → v2.0.0)`
- **Minor updates**: `feat(helm): cert-manager (v1.12.0 → v1.13.0)`
- **Patch updates**: `fix(container): redis (7.0.0 → 7.0.1)`
- **Digest updates**: `chore(container): redis (abc123 → def456)`

Labels are applied automatically for filtering:
- `type/major`, `type/minor`, `type/patch` for update severity
- `renovate/container`, `renovate/helm`, `renovate/github-action` for dependency type

### Image Automation

Flux provides built-in image update automation that scans container registries and updates image tags in Git. In this repo it has two layers: a reusable Kustomize component that declares per-app image metadata objects, and one cluster-wide ImageUpdateAutomation that commits the resulting tag updates back to Git.

**Per-app `image-automation` component** (`kubernetes/components/image-automation/kustomization.yaml#L1-L7`)
Applications opt in by adding `../../../../components/image-automation` to the `components:` list of their `ks.yaml` (e.g. `kubernetes/apps/default/gitea/ks.yaml`). The component adds three resources, all parameterized via postBuild substitution variables (`APP`, `NAMESPACE`, `REGISTRY_URL`):

- **ExternalSecret** (`registry-externalsecret.yaml`): pulls registry pull credentials from Bitwarden via External Secrets Operator.
- **ImageRepository** (`imagerepository.yaml#L1-L11`): points at `${REGISTRY_URL}` and scans the registry every 1 minute using the `${APP}-registry-secret` credentials.
- **ImagePolicy** (`imagepolicy.yaml#L1-L17`): labeled `image-automation: enabled`, selects the highest timestamp from tags matching the pattern `^.+-[a-f0-9]+-(?P<ts>[0-9]+)$` (i.e. `sha-<digest>-<timestamp>` tags), ascending numerical order.

The application's HelmRelease consumes the policy result through an in-line setter marker:

```yaml
image:
  repository: gitea.tomyail.com/tomyail/myapp
  tag: "sha-xxx" # {"$imagepolicy": "NAMESPACE:APP:tag"}
```

**Cluster-wide ImageUpdateAutomation** (`kubernetes/apps/flux-system/image-automation/automation.yaml#L1-L28`)
- Runs every 5 minutes with the `Setters` strategy, scoped to `./kubernetes/apps/default`
- Checks out `main` of the `flux-system-https` GitRepository and pushes tag-bump commits back to `main` as `flux-bot`
- `policySelector: matchLabels: image-automation: enabled` restricts it to ImagePolicies created by the component — apps without the label are never touched

This works alongside Renovate: Renovate updates chart versions and pinned upstream images, while ImageUpdateAutomation handles commit-tag policies for self-built images.

## Common Components and the app-template Chart Source

### Kustomize Components

Several cross-cutting concerns are packaged as Kustomize **components** (`kind: Component`) under `kubernetes/components/` and attached from `ks.yaml` files via relative `components:` entries (e.g. `../../../../components/volsync-new`, `../../../../components/gatus/external` in `kubernetes/apps/default/gitea/ks.yaml#L13-L15`). Unlike a base overlay, a component's resources are spliced into the referencing Kustomization, so variables substituted by that Kustomization's `postBuild` are visible inside the component's manifests.

### The `common` Component

Every app namespace root (`kubernetes/apps/<namespace>/kustomization.yaml`) includes `../../components/common`. That component (`kubernetes/components/common/kustomization.yaml#L1-L7`) bundles:

- A placeholder `not-used` Namespace annotated `kustomize.toolkit.fluxcd.io/prune: disabled` so Flux garbage collection has a namespace anchor without managing a real one (`namespace.yaml`)
- The `repos` set, which currently ships a single shared chart source (below)
- The `sops` set: the `sops-age` decryption key Secret and `cluster-secrets` Secret, both SOPS-encrypted (`sops/sops-age.sops.yaml`, `sops/cluster-secrets.sops.yaml`), which back the `decryption.secretRef` and `postBuild.substituteFrom` references used by application Kustomizations

### OCIRepository: the app-template Chart

Instead of per-app HelmRepository definitions, the `bjw-s-labs` `app-template` chart — the generic Helm chart wrapping nearly every application in this repo — is vendored once as an **OCIRepository** (`kubernetes/components/common/repos/app-template/ocirepository.yaml#L1-L14`):

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: OCIRepository
metadata:
  name: app-template
spec:
  interval: 1h
  layerSelector:
    mediaType: application/vnd.cncf.helm.chart.content.v1.tar+gzip
    operation: copy
  ref:
    tag: 5.1.0
  url: oci://ghcr.io/bjw-s-labs/helm/app-template
```

- Because it lives in the `common` component, every application namespace inherits the same pinned chart artifact; upgrading app-template is a single `ref.tag` bump
- `layerSelector` copies the Helm chart tarball layer out of the OCI artifact so HelmRelease can consume it directly
- Renovate tracks the `ref.tag` digest so chart upgrades arrive as normal pull requests

### HelmRelease Consumption

Application HelmReleases reference the shared OCI chart via `chartRef` rather than a `chart`/`sourceRef` pair (`kubernetes/apps/default/atuin/app/helmrelease.yaml#L7-L20`):

```yaml
spec:
  interval: 1h
  chartRef:
    kind: OCIRepository
    name: app-template
  upgrade:
    cleanupOnFail: true
    remediation:
      strategy: rollback
      retries: 3
```

All application-specific behavior (controllers, images, persistence, probes) is expressed as inline `values` against app-template's generic schema, and install/upgrade remediation (retries, rollback) is declared per HelmRelease.

## Dependency Management

### Dependency Ordering

Flux uses the `dependsOn` field to enforce correct deployment order across Kustomizations.

### Cluster-Level Dependencies

The `cluster-apps` Kustomization depends on infrastructure prerequisites (`kubernetes/flux/cluster/ks.yaml#L78-L84`):

```yaml
dependsOn:
  - name: cluster-meta
    namespace: flux-system
  - name: gateway-api-crds
    namespace: flux-system
  - name: external-dns-crds
    namespace: flux-system
```

This ensures:
1. Sources and decryption infrastructure are ready (cluster-meta)
2. CRDs are installed before applications use them (gateway-api-crds, external-dns-crds)
3. Application reconciliation only begins after prerequisites are satisfied

### Application-Level Dependencies

Individual applications declare dependencies on other namespaces or applications.

**Example: Paperless** (`kubernetes/apps/default/paperless/ks.yaml#L16-L24`)

```yaml
dependsOn:
  - name: topolvm
    namespace: storage
  - name: external-secrets
    namespace: external-secrets
  - name: cloudnative-pg-cluster
    namespace: database
  - name: dragonfly-cluster
    namespace: database
```

This dependency chain ensures:
- Storage provisioner (topolvm) is available before creating PVCs
- External Secrets Operator can create secrets before application starts
- Databases are ready before application attempts connections

**Example: Cilium Gateway** (`kubernetes/apps/kube-system/cilium/ks.yaml#L46-L48`)

```yaml
dependsOn:
  - name: cert-manager
    namespace: cert-manager
```

Cilium Gateway depends on cert-manager for TLS certificate management.

### Dependency Resolution

Flux evaluates dependencies in the following order:

1. **Namespace Resolution**: All Kustomizations in the same namespace are considered
2. **Cross-Namespace Dependencies**: Kustomizations can depend on resources in other namespaces by specifying the namespace field
3. **Transitive Dependencies**: Flux automatically handles transitive dependencies through the dependency graph
4. **Parallel Execution**: Kustomizations without dependencies on each other run in parallel
5. **Failed Dependencies**: If a dependency fails to become ready, dependent Kustomizations wait indefinitely

### Debugging Dependency Issues

When a Kustomization is stuck waiting for dependencies:

1. Check the dependency Kustomization's status: `kubectl get kustomization <dependency-name> -n <namespace> -o yaml`
2. Inspect the dependent Kustomization's conditions: `kubectl get kustomization <app-name> -n <namespace> -o yaml`
3. Look for `DependenciesNotReady` conditions in the status
4. Verify all dependencies are reporting `Ready: true` in their status

## Reconciliation Behavior

### Common Metadata

All application Kustomizations apply common labels for consistent resource identification (`kubernetes/apps/kube-system/cilium/ks.yaml#L9-L11`):

```yaml
commonMetadata:
  labels:
    app.kubernetes.io/name: cilium
```

This labels all resources managed by the Kustomization, making it easy to query and filter.

### Secret Decryption

Flux decrypts SOPS-encrypted secrets in-cluster during reconciliation (`kubernetes/apps/default/paperless/ks.yaml#L25-L28`):

```yaml
decryption:
  provider: sops
  secretRef:
    name: sops-age
```

The decryption process:
1. Flux reads the `sops-age` Secret from the cluster (deployed during bootstrap)
2. Uses the age private key to decrypt any `*.sops.yaml` files in the Kustomization path
3. Applies the decrypted manifests to the cluster

### Variable Substitution

The `postBuild.substituteFrom` mechanism injects cluster-wide configuration (`kubernetes/apps/default/paperless/ks.yaml#L39-L42`):

```yaml
postBuild:
  substituteFrom:
    - name: cluster-secrets
      kind: Secret
```

During reconciliation:
1. Flux reads the `cluster-secrets` Secret from the cluster
2. Replaces variables like `${SECRET_DOMAIN}` and `${TIMEZONE}` in manifests
3. Applies the substituted manifests to the cluster

This enables environment-specific configuration without duplicating secrets across applications.

### Additional Substitutions

Applications can define additional substitutions for app-specific values (`kubernetes/apps/default/paperless/ks.yaml#L43-L44`):

```yaml
postBuild:
  substitute:
    APP: paperless
    VOLSYNC_CAPACITY: 5Gi
```

These variables are replaced alongside cluster-secrets during the postBuild phase.

## Troubleshooting

### Common Issues

**Kustomization Not Reconciling**

Check the GitRepository source is syncing:
```bash
kubectl get gitrepository flux-system -n flux-system
```

Look for `Ready: True` in conditions.

**Dependency Stuck Waiting**

Check the dependency Kustomization status:
```bash
kubectl get kustomization <dependency-name> -n <namespace>
```

Look for `DependenciesNotReady` or failed conditions.

**Secret Decryption Failure**

Verify the sops-age secret exists and is valid:
```bash
kubectl get secret sops-age -n flux-system
```

Check that the age key in the secret matches the recipient in `.sops.yaml`.

**Health Check Timeout**

For complex applications with slow startup (like databases), consider:
- Increasing the `timeout` value
- Adding explicit `healthChecks` for critical resources
- Checking application logs for startup issues

### Monitoring Reconciliation

Watch reconciliation in real-time:
```bash
# Watch all Kustomizations
kubectl get kustomizations -A -w

# Watch specific namespace
kubectl get kustomizations -n flux-system -w

# Check reconciliation events
kubectl get events -n <namespace> --field-selector reason=ReconciliationFailed
```

## Related Pages

- [Flux GitOps Architecture](/openwiki/concepts/flux-architecture.md) - Detailed reconciliation hierarchy and Kustomization structure
- [Image Automation](/openwiki/integrations/image-automation.md) - Deep dive into the image automation component and ImageUpdateAutomation
- [Application Deployment Workflow](/openwiki/workflows/app-deployment.md) - Application deployment patterns and app-template usage
- [Secrets Management](/openwiki/concepts/secrets-management.md) - SOPS encryption and External Secrets Operator integration
ecture.md) - Detailed reconciliation hierarchy and Kustomization structure
- [Application Deployment Workflow](/openwiki/workflows/app-deployment.md) - Application deployment patterns and app-template usage
- [Secrets Management](/openwiki/concepts/secrets-management.md) - SOPS encryption and External Secrets Operator integration
