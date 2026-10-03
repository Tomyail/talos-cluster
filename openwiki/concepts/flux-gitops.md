---
type: concept
title: Flux GitOps Model
description: How Flux is bootstrapped via flux-operator/flux-instance, the cluster-meta → CRDs → cluster-apps Kustomization hierarchy in kubernetes/flux/cluster/ks.yaml, SOPS decryption through the sops-age secret, postBuild substitution from cluster-secrets, and prune/retry/wait semantics.
tags: [flux, gitops, bootstrap, kustomization, sops, postbuild]
verified:
  - by: openwiki/0.7.0
    at: 2026-10-03T22:17:28.945Z
sources:
  - id: openwiki-source-240e6406ed4b6841961679cb
    resource: repo://.sops.yaml
  - id: openwiki-source-559185c7613d95e269ebce5b
    resource: repo://kubernetes/apps/cert-manager/cert-manager/ks.yaml
  - id: openwiki-source-37b3f77c1ceb2e20b192e263
    resource: repo://kubernetes/apps/default/atuin/app/helmrelease.yaml
  - id: openwiki-source-649e5ed74d5376f95cff2b2a
    resource: repo://kubernetes/apps/default/gitea/ks.yaml
  - id: openwiki-source-7a6dfabba58a5bbfbd748db5
    resource: repo://kubernetes/apps/flux-system/flux-instance/app/helm/values.yaml
  - id: openwiki-source-835c06c538b784cf88be79f6
    resource: repo://kubernetes/apps/flux-system/flux-instance/app/helmrelease.yaml
  - id: openwiki-source-6eeb13e56aa73290cd22f9e7
    resource: repo://kubernetes/apps/flux-system/flux-instance/app/kustomization.yaml
  - id: openwiki-source-8373855430e72a000801fbaa
    resource: repo://kubernetes/apps/flux-system/flux-instance/app/receiver.yaml
  - id: openwiki-source-ced55ebf1f6465aff03786f3
    resource: repo://kubernetes/apps/flux-system/flux-instance/app/secret.sops.yaml
  - id: openwiki-source-4cd1f73914265d1886254720
    resource: repo://kubernetes/apps/flux-system/flux-instance/ks.yaml
  - id: openwiki-source-46f2dcf45323110e8875664e
    resource: repo://kubernetes/apps/flux-system/flux-operator/ks.yaml
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
  - id: openwiki-source-dff47ef9008ba7bce93e217b
    resource: repo://kubernetes/components/common/sops/kustomization.yaml
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
  - id: openwiki-source-97e4f584aefe24b958a6081d
    resource: repo://kubernetes/flux/meta/repos/external-dns-crds.yaml
  - id: openwiki-source-2b0d1261d82082fced240caa
    resource: repo://kubernetes/flux/meta/repos/gateway-api.yaml
  - id: openwiki-source-12a44dba301e86ea2cf62628
    resource: repo://kubernetes/flux/meta/repos/kustomization.yaml
  - id: openwiki-source-6f1d2c8de9160e178167b990
    resource: repo://scripts/bootstrap-apps.sh
generated: { by: "openwiki/0.7.0", at: "2026-10-03T22:17:28.945Z" }
---

# Flux GitOps Model

This cluster runs Flux as a managed "Flux instance": the `flux-operator` HelmRelease deploys the ControlPlane Flux operator, and a `flux-instance` HelmRelease asks the operator to install and configure all Flux controllers. Flux then reconciles the repository through a small tree of root Kustomizations in `kubernetes/flux/cluster/ks.yaml` — `cluster-meta` (sources), two upstream CRD Kustomizations (`gateway-api-crds`, `external-dns-crds`), and `cluster-apps` (every application).

## Dependency Chain Overview

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: a semicolon inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
    BR["bootstrap-apps.sh<br/>(sops-age + cluster-secrets Secrets,<br/>bootstrap CRDs, namespaces)"] --> FI["flux-operator<br/>(Kustomization → HelmRelease)"]
    FI --> INST["flux-instance<br/>(Kustomization → HelmRelease)<br/>installs all Flux controllers"]
    INST --> GIT["GitRepository: flux-system<br/>(this repo, main)"]
    INST --> GA["GitRepository: gateway-api<br/>(pinned v1.6.2)"]
    INST --> ED["GitRepository: external-dns-crds<br/>(pinned v0.23.0)"]
    GIT --> META["Kustomization: cluster-meta<br/>(kubernetes/flux/meta: source repos)"]
    GA --> GAC["Kustomization: gateway-api-crds<br/>(config/crd/experimental)"]
    ED --> EDC["Kustomization: external-dns-crds<br/>(config/crd/standard)"]
    META --> GAC
    META --> EDC
    META --> APPS["Kustomization: cluster-apps<br/>(kubernetes/apps)"]
    GAC --> APPS
    EDC --> APPS
    APPS --> NS["Per-namespace Kustomizations<br/>(kubernetes/apps/&lt;ns&gt;)"]
    NS --> APP["Per-app Kustomizations (ks.yaml)<br/>+ Kustomize components<br/>decryption: sops-age · postBuild: cluster-secrets"]
```

*Figure: from bootstrap secrets through the Flux instance to per-app Kustomizations*

## Bootstrap: flux-operator and flux-instance

Flux itself is not installed by `flux bootstrap`. Instead it is delivered through GitOps inside `kubernetes/apps/flux-system/`:

- **flux-operator** (`kubernetes/apps/flux-system/flux-operator/ks.yaml`): a Kustomization that installs the operator via HelmRelease and declares an explicit `healthChecks` entry on its own HelmRelease, so the Kustomization is only Ready once the operator deployment is healthy.
- **flux-instance** (`kubernetes/apps/flux-system/flux-instance/ks.yaml`): `dependsOn: flux-operator`, renders values via a `configMapGenerator` (`app/helm/values.yaml` → `flux-instance-values` ConfigMap), and deploys the `flux-instance` chart (`oci://ghcr.io/controlplaneio-fluxcd/charts/flux-instance`, pinned `0.60.0` with a Renovate tag comment) from `app/helmrelease.yaml` with install remediation `retries: -1` (infinite) and upgrade rollback with 3 retries.

The instance values (`kubernetes/apps/flux-system/flux-instance/app/helm/values.yaml`) are where Flux's behavior is configured:

- `distribution.version: 2.9.5` (Renovate-managed) selects the Flux distribution the operator installs.
- All six controllers are enabled: source-, kustomize-, helm-, notification-, image-reflector-, and image-automation-controller.
- `sync` points at `https://github.com/tomyail/talos-cluster.git`, `refs/heads/main`, `path: kubernetes/flux/cluster` — this is what creates the root Kustomizations from `kubernetes/flux/cluster/ks.yaml`.
- Kustomize patches tune the controllers: `--concurrent=10` and `--requeue-dependency=5s` on kustomize/helm/source controllers, in-memory kustomize builds (`emptyDir: medium: Memory`, `--concurrent=20`), Helm chart caching (`--helm-cache-*`), OOM-watch for Helm (95% threshold), and 512Mi memory limits.

The same Kustomization also ships a GitHub `Receiver` (`app/receiver.yaml`) and its SOPS-encrypted webhook token (`app/secret.sops.yaml`), so GitHub `push`/`ping` webhooks trigger immediate reconciliation of the `flux-system` GitRepository instead of waiting for polling.

## The Root Kustomization Hierarchy

`kubernetes/flux/cluster/ks.yaml` defines four root Kustomizations in `flux-system`:

| Kustomization | Source | Path | Depends on |
|---|---|---|---|
| `cluster-meta` | GitRepository `flux-system` | `./kubernetes/flux/meta` | — |
| `gateway-api-crds` | GitRepository `gateway-api` | `./config/crd/experimental` | `cluster-meta` |
| `external-dns-crds` | GitRepository `external-dns-crds` | `./config/crd/standard` | `cluster-meta` |
| `cluster-apps` | GitRepository `flux-system` | `./kubernetes/apps` | `cluster-meta`, `gateway-api-crds`, `external-dns-crds` |

### cluster-meta

`cluster-meta` reconciles `kubernetes/flux/meta`, which currently contains only `repos/` — roughly thirty `GitRepository` objects (`kubernetes/flux/meta/repos/kustomization.yaml`) registering upstream Helm repositories (cilium, cloudnative-pg, grafana, jetstack, etc.). These sources must exist before any application HelmRelease can resolve its chart, which is why `cluster-apps` depends on `cluster-meta`. `cluster-meta` also sets `targetNamespace: flux-system` (the Kustomizations here note this hardcoded namespace is needed for Renovate lookups).

### Upstream CRD Kustomizations

Two CRD sets are pulled straight from upstream release tags rather than vendored:

- **gateway-api** (`kubernetes/flux/meta/repos/gateway-api.yaml`): `https://github.com/kubernetes-sigs/gateway-api`, Renovate-pinned tag `v1.6.2`, 15m interval, `ignore` excluding everything (`/**`) except `/config/crd/experimental/`. The `gateway-api-crds` Kustomization applies that path with a 5m timeout.
- **external-dns-crds** (`kubernetes/flux/meta/repos/external-dns-crds.yaml`): `https://github.com/kubernetes-sigs/external-dns`, Renovate-pinned tag `v0.23.0`, `ignore` restricted to `/config/crd/standard/`. Applied by the `external-dns-crds` Kustomization with a 5m timeout.

The ignore scoping keeps the served manifest set stable across releases — bumping a CRD set only changes the pinned tag. `cluster-apps` `dependsOn` both, so no application (e.g. Cilium's Gateway API integration or external-dns) reconciles until the CRDs exist. As belt-and-braces, `scripts/bootstrap-apps.sh` also applies these CRDs directly during first-time bootstrap, before Flux is running.

### cluster-apps

`cluster-apps` reconciles `kubernetes/apps`, whose namespace-root Kustomizations fan out to per-app `ks.yaml` files. Each app Kustomization typically declares `dependsOn` on its infrastructure (e.g. Paperless on topolvm, external-secrets, and its database operators), `commonMetadata` labels, SOPS decryption, and postBuild substitution (see below).

## Secret Decryption via sops-age

Both `cluster-meta` and `cluster-apps` (and the flux-operator/flux-instance Kustomizations) configure:

```yaml
decryption:
  provider: sops
  secretRef:
    name: sops-age
```

The `sops-age` Secret is itself SOPS-encrypted in Git (`kubernetes/components/common/sops/sops-age.sops.yaml`, holding an `age.agekey` for recipient `age1shkd7…`), and is seeded out-of-band by `scripts/bootstrap-apps.sh` (`apply_sops_secrets` decrypts it with the local `age.key` and applies it into `flux-system` before Flux can reconcile anything). It is also bundled in the shared `common` Kustomize component (`kubernetes/components/common/sops/kustomization.yaml`) so it re-applies on every reconciliation once decryption works. During reconciliation, kustomize-controller uses this age private key to decrypt every `*.sops.yaml` file in a Kustomization's path; decryption failure fails the whole Kustomization, which is the first thing to check when `*.sops.yaml` content goes missing in-cluster (see `task reconcile` in `Taskfile.yaml` and the troubleshooting section of [Secrets Management](secrets-management.md)).

## postBuild Substitution from cluster-secrets

Application Kustomizations (and the flux-system Kustomizations) inject environment configuration via:

```yaml
postBuild:
  substituteFrom:
    - name: cluster-secrets
      kind: Secret
```

The `cluster-secrets` Secret is SOPS-encrypted at `kubernetes/components/common/sops/cluster-secrets.sops.yaml`, seeded by `bootstrap-apps.sh` alongside `sops-age`, and shipped in the `common` component. Its keys (`SECRET_DOMAIN`, `TIMEZONE`, etc.) replace `${VAR}` references in every manifest built by the Kustomization, so environment-specific values live in exactly one place. Apps add per-app variables with inline `postBuild.substitute` entries (e.g. `APP`, `VOLSYNC_CAPACITY`), and Kustomize components inherit the substitution because their resources are spliced into the referencing Kustomization.

## prune / retry / wait Semantics

Every root Kustomization — and virtually every app `ks.yaml` — uses the same triple:

- **`prune: true`** — garbage collection: resources deleted from Git are removed from the cluster (scoped to what the Kustomization created).
- **`retryInterval: 2m`** — a failed reconciliation is retried every 2 minutes (with backoff) instead of waiting for the full interval.
- **`wait: true`** — Flux health-waits all created resources before marking the Kustomization Ready; dependents stay in `DependenciesNotReady` until then. Since `--requeue-dependency=5s` is set on kustomize-controller, dependency readiness is re-checked quickly.

`interval: 1h` is the steady-state reconciliation cadence (reduced immediately by webhook pushes via the Receiver), and `timeout: 5m` bounds each reconcile attempt — used on the CRD and `cluster-apps` Kustomizations where API-server operations are slow. Some app Kustomizations add explicit `healthChecks`/`healthCheckExprs` (e.g. cert-manager's ClusterIssuer readiness) beyond the default wait behavior. For day-to-day effects of these semantics, see [Daily Operations](../operations/daily-operations.md).

## Automated Dependency Updates

Renovate keeps the pinned versions in this model current: the `flux-instance` chart tag, Flux `distribution.version`, and the gateway-api/external-dns tags all carry `# renovate: datasource=github-releases` markers, so upgrades arrive as PRs that only change a pinned tag. Self-built images are handled separately by Flux image automation (`kubernetes/apps/flux-system/image-automation/`), described in [Application Deployment Workflow](../workflows/app-deployment.md).

## Related Pages

- [Secrets Management](secrets-management.md) — SOPS encryption and External Secrets Operator integration
- [Daily Operations](../operations/daily-operations.md) — forcing reconciliation and watching Kustomization state
- [Application Deployment Workflow](../workflows/app-deployment.md) — app-template usage and image automation details
