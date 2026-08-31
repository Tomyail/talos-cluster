---
type: operations
title: Upgrade Workflow
description: Complete upgrade process for Talos OS, Kubernetes, and cluster applications with proper ordering, rollback procedures, and verification steps.
tags: [upgrade, talos, kubernetes, workflow, maintenance, tuppr, talhelper]
verified:
  - by: openwiki/0.4.3
    at: 2026-08-31T23:16:37.333Z
sources:
  - id: openwiki-source-aa55808be329b3f929ddf105
    resource: repo://.renovaterc.json5
  - id: openwiki-source-4f5be6b4c7dcc699aca46164
    resource: repo://.taskfiles/talos/Taskfile.yaml
  - id: openwiki-source-c11ca658ed53520e32ea3a00
    resource: repo://kubernetes/apps/kube-system/system-upgrade/ks.yaml
  - id: openwiki-source-93b81da2e188c756c1b475ce
    resource: repo://kubernetes/apps/kube-system/system-upgrade/tuppr/helmrelease.yaml
  - id: openwiki-source-63d00fe06cf7a359ecb33f8f
    resource: repo://kubernetes/apps/kube-system/system-upgrade/upgrades/kubernetes.yaml
  - id: openwiki-source-ededdde4ddcb07a3ee796444
    resource: repo://kubernetes/apps/kube-system/system-upgrade/upgrades/talos.yaml
  - id: openwiki-source-b65e4f1ccd91316116ad973a
    resource: repo://talos/talenv.yaml
generated: { by: "openwiki/0.4.3", at: "2026-08-31T23:16:37.333Z" }
---

# Upgrade Workflow

The cluster upgrade process follows a strict ordering to maintain high availability and data safety: Talos nodes one-by-one, then Kubernetes cluster-wide, then applications. This workflow minimizes disruption by ensuring control plane quorum throughout upgrades and provides rollback procedures at each stage.

## Upgrade Order

The upgrade sequence is designed to maintain cluster health and minimize downtime:

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart LR
    A[Upgrade Start] --> B[Talos Node 1<br/>Control Plane]
    B --> C[Talos Node 2<br/>Control Plane]
    C --> D[Talos Node 3<br/>Control Plane]
    D --> E[Remaining Talos Nodes<br/>Workers]
    E --> F[Kubernetes Upgrade<br/>Cluster-wide]
    F --> G[Application Upgrades<br/>Flux Reconciliation]
    G --> H[Verify Cluster Health]
    
    style B fill:#f9f,stroke:#333,stroke-width:2px
    style C fill:#f9f,stroke:#333,stroke-width:2px
    style D fill:#f9f,stroke:#333,stroke-width:2px
    style F fill:#ff9,stroke:#333,stroke-width:2px
```

**Critical ordering rules:**

1. **Talos nodes one-by-one**: Upgrade each Talos node individually to maintain control plane quorum
2. **Control plane first**: Upgrade all control plane nodes before worker nodes
3. **Kubernetes after Talos**: Only upgrade Kubernetes after all Talos nodes are on the same version
4. **Applications last**: Upgrade applications after Kubernetes is stable

## Talos Node Upgrades

Talos OS upgrades are performed one node at a time using talhelper tasks. Each node upgrade drains pods (if worker), applies the new Talos image, reboots, and verifies success before proceeding.

### Manual Talos Upgrade

Upgrade a single Talos node using the talhelper task:

```bash
task talos:upgrade-node IP=<node-ip>
```

**Example:**
```bash
task talos:upgrade-node IP=192.168.50.145
```

**Upgrade process** (`.taskfiles/talos/Taskfile.yaml#L31-L46`):

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
    A[Start upgrade-node] --> B[Get Talos image URL<br/>from talconfig.yaml]
    B --> C[Get Talos version<br/>from talenv.yaml]
    C --> D[Generate talhelper<br/>upgrade command]
    D --> E[Execute talosctl upgrade<br/>with --image and --timeout=10m]
    E --> F[Drain node if worker]
    F --> G[Apply new Talos image]
    G --> H[Reboot node]
    H --> I[Uncordon node]
    I --> J[Verify upgrade success]
```

**Task details:**
- Retrieves node-specific Talos image URL from `talconfig.yaml` via `yq`
- Retrieves target Talos version from `talenv.yaml`
- Runs `talhelper gencommand upgrade` with `--image` and `--timeout=10m` flags
- Performs a rolling upgrade (drains, applies, reboots, uncordons)

**Prerequisites:**
- Node must be accessible via `talosctl --nodes <ip> get machineconfig`
- `talosconfig` must be configured and valid
- `talhelper`, `talosctl`, `kubectl`, and `yq` must be available

**Recommended upgrade order:**

1. Upgrade control plane nodes one-by-one, waiting for each to fully recover
2. Upgrade worker nodes one-by-one, waiting for each to fully recover
3. Verify all nodes are running the same Talos version

### Automated Talos Upgrades with tuppr

The cluster uses tuppr (system-upgrade-controller) for automated Talos node upgrades. tuppr coordinates upgrades based on custom resources that define target versions and upgrade policies.

**tuppr deployment** (`kubernetes/apps/kube-system/system-upgrade/ks.yaml`):

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
    A[Flux Kustomization] --> B[tuppr<br/>Controller Deployment]
    A --> C[tuppr-upgrades<br/>Upgrade CRs]
    
    B --> D[OCIRepository<br/>tuppr Helm Chart]
    B --> E[HelmRelease<br/>tuppr Controller]
    
    C --> F[TalosUpgrade CR<br/>talos.yaml]
    C --> G[KubernetesUpgrade CR<br/>kubernetes.yaml]
    
    style B fill:#bbf,stroke:#333,stroke-width:2px
    style C fill:#bfb,stroke:#333,stroke-width:2px
```

**TalosUpgrade CR** (`kubernetes/apps/kube-system/system-upgrade/upgrades/talos.yaml`):

```yaml
apiVersion: tuppr.home-operations.com/v1alpha1
kind: TalosUpgrade
metadata:
  name: talos
spec:
  talos:
    version: v1.12.7  # tracks talenv.yaml
  policy:
    rebootMode: powercycle
```

**tuppr behavior:**
- Monitors the `TalosUpgrade` CR for the target version
- Upgrades nodes one-by-one automatically
- Uses `powercycle` reboot mode for clean reboots
- Respects control plane quorum by upgrading sequentially
- Provides status updates via Kubernetes resources

**Version tracking** (`talos/talenv.yaml#L1-L2`):

```yaml
# renovate: datasource=docker depName=ghcr.io/siderolabs/installer
talosVersion: v1.12.7
```

The `# renovate:` comment allows Renovate to track Talos versions and create PRs for updates.

## Kubernetes Upgrades

Kubernetes upgrades are performed cluster-wide after all Talos nodes are upgraded. Kubernetes upgrades are more disruptive than Talos upgrades and require careful planning.

### Manual Kubernetes Upgrade

Upgrade Kubernetes across the entire cluster:

```bash
task talos:upgrade-k8s
```

**Upgrade process** (`.taskfiles/talos/Taskfile.yaml#L48-L58`):

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
    A[Start upgrade-k8s] --> B[Get Kubernetes version<br/>from talenv.yaml]
    B --> C[Generate talhelper<br/>upgrade-k8s command]
    C --> D[Execute talosctl upgrade-k8s<br/>with --to flag]
    D --> E[Upgrade control plane]
    E --> F[Upgrade worker nodes]
    F --> G[Verify cluster health]
```

**Task details:**
- Retrieves target Kubernetes version from `talenv.yaml`
- Runs `talhelper gencommand upgrade-k8s` with `--to` flag
- Performs a cluster-wide Kubernetes upgrade
- Upgrades control plane first, then workers

**Prerequisites:**
- All Talos nodes must be on the same version
- `talosconfig` must be configured and valid
- `talhelper`, `talosctl`, and `yq` must be available

### Automated Kubernetes Upgrades with tuppr

tuppr can also automate Kubernetes upgrades using the `KubernetesUpgrade` CR.

**KubernetesUpgrade CR** (`kubernetes/apps/kube-system/system-upgrade/upgrades/kubernetes.yaml`):

```yaml
apiVersion: tuppr.home-operations.com/v1alpha1
kind: KubernetesUpgrade
metadata:
  name: kubernetes
spec:
  kubernetes:
    version: v1.35.4  # tracks talenv.yaml
```

**Version tracking** (`talos/talenv.yaml#L3-L4`):

```yaml
# renovate: datasource=docker depName=ghcr.io/siderolabs/kubelet
kubernetesVersion: v1.35.4
```

## Application Upgrades

Application upgrades are automated through Flux HelmRelease reconciliation. After Talos and Kubernetes are stable, applications are upgraded automatically based on their HelmRelease configurations.

**Application upgrade flow:**

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
    A[Flux GitRepository<br/>Sync] --> B[HelmRelease<br/>Reconciliation]
    B --> C[Check Chart Version]
    C --> D{Version Changed?}
    D -->|Yes| E[Plan Upgrade]
    D -->|No| F[Skip]
    E --> G[Pre-upgrade Hooks]
    G --> H[Upgrade Helm Release]
    H --> I[Post-upgrade Hooks]
    I --> J[Verify Health]
    J --> K{Healthy?}
    K -->|Yes| L[Complete]
    K -->|No| M[Rollback]
    
    style M fill:#f99,stroke:#333,stroke-width:2px
    style L fill:#9f9,stroke:#333,stroke-width:2px
```

**Rollback behavior:**
- Most applications use `rollback` remediation strategy
- Automatic rollback on failure with retries
- Manual rollback available via `helm rollback`

## Rollback Procedures

Rollback procedures vary by upgrade layer and complexity.

### Talos Rollback

If a Talos upgrade fails, use `talosctl rollback` to revert to the previous version:

```bash
talosctl --nodes <ip> rollback
```

**Talos rollback characteristics:**
- Quick rollback to previous Talos version
- Minimal disruption (single node)
- Safe to retry after rollback

### Kubernetes Rollback

Kubernetes upgrades are difficult to rollback and may require cluster re-bootstrap.

**Rollback challenges:**
- etcd schema changes may not be backward compatible
- API changes may break older clients
- May require full cluster recreation

**Recommendation:**
- Test Kubernetes upgrades in a non-production environment first
- Take etcd backups before upgrading
- Plan for potential cluster re-bootstrap

### Application Rollback

Application rollbacks are straightforward using Helm:

```bash
helm --namespace <namespace> rollback <app-name> <revision>
```

**Example:**
```bash
helm --namespace monitoring rollback kube-prometheus-stack 5
```

## Verification Steps

After each upgrade stage, verify cluster health before proceeding.

### Talos Upgrade Verification

After each Talos node upgrade:

```bash
# Check node is ready
talosctl --nodes <ip> get machineconfig

# Verify Talos version
talosctl --nodes <ip> version

# Check node is Ready in Kubernetes
kubectl get nodes -o wide
```

### Kubernetes Upgrade Verification

After Kubernetes upgrade:

```bash
# Verify all nodes are Ready
kubectl get nodes

# Check Kubernetes version
kubectl version --short

# Verify control plane is healthy
kubectl get componentstatuses

# Check system pods are running
kubectl get pods -n kube-system
```

### Application Upgrade Verification

After application upgrades:

```bash
# Check HelmRelease status
kubectl get helmreleases -A

# Verify application pods are running
kubectl get pods -n <namespace>

# Check application logs if needed
kubectl logs -n <namespace> <pod-name>
```

## Renovate Integration

Renovate automatically tracks Talos and Kubernetes versions through `# renovate:` comments in `talenv.yaml`.

**Version tracking** (`talos/talenv.yaml`):

```yaml
# renovate: datasource=docker depName=ghcr.io/siderolabs/installer
talosVersion: v1.12.7

# renovate: datasource=docker depName=ghcr.io/siderolabs/kubelet
kubernetesVersion: v1.35.4
```

**Renovate behavior** (`.renovaterc.json5#L1-L30`):
- Scans Kubernetes manifests for version references
- Creates PRs for Talos and Kubernetes updates
- Groups related updates together
- Auto-merges minor and patch updates for GitHub Actions

**tuppr CR synchronization:**
- The `TalosUpgrade` and `KubernetesUpgrade` CRs must be updated to match `talenv.yaml`
- Renovate tracks both `talenv.yaml` and the upgrade CRs
- Manual coordination may be needed to keep versions in sync

## Complete Upgrade Example

A complete upgrade workflow from Talos v1.12.7 to v1.13.0 and Kubernetes v1.35.4 to v1.36.0:

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
    A[Start Upgrade] --> B[Update talenv.yaml<br/>New versions]
    B --> C[Run task talos:generate-config]
    C --> D[Upgrade Talos Node 1<br/>Control Plane]
    D --> E[Verify Node 1 Ready]
    E --> F[Upgrade Talos Node 2<br/>Control Plane]
    F --> G[Verify Node 2 Ready]
    G --> H[Upgrade Talos Node 3<br/>Control Plane]
    H --> I[Verify Node 3 Ready]
    I --> J[Upgrade Remaining<br/>Talos Nodes]
    J --> K[Verify All Nodes<br/>Same Talos Version]
    K --> L[Run task talos:upgrade-k8s]
    L --> M[Verify Kubernetes<br/>Upgrade Complete]
    M --> N[Monitor Application<br/>Upgrades via Flux]
    N --> O[Verify All Apps<br/>Healthy]
    O --> P[Upgrade Complete]
    
    style D fill:#f9f,stroke:#333,stroke-width:2px
    style F fill:#f9f,stroke:#333,stroke-width:2px
    style H fill:#f9f,stroke:#333,stroke-width:2px
    style L fill:#ff9,stroke:#333,stroke-width:2px
    style N fill:#9f9,stroke:#333,stroke-width:2px
```

**Step-by-step:**

1. Update `talos/talenv.yaml` with new versions
2. Run `task talos:generate-config` to regenerate machine configs
3. Commit and push changes
4. Upgrade Talos nodes one-by-one using `task talos:upgrade-node IP=<ip>`
5. Wait for each node to fully recover before proceeding
6. After all Talos nodes are upgraded, run `task talos:upgrade-k8s`
7. Monitor Kubernetes upgrade progress
8. Verify all nodes are Ready and running new versions
9. Monitor Flux reconciliation for application upgrades
10. Verify all applications are healthy

**Estimated downtime:**
- Talos node upgrade: ~5-10 minutes per node (one node at a time)
- Kubernetes upgrade: ~10-15 minutes cluster-wide
- Application upgrades: varies by application, typically rolling with no downtime
