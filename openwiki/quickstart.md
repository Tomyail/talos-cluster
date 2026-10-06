---
type: Quickstart Guide
title: Quickstart & Repository Map
description: Entry point for understanding the Talos + Flux GitOps cluster repository structure, mise-managed toolchain, common task commands, bootstrapping process, making and validating a change end-to-end, and routing into the rest of the wiki.
tags: [talos, kubernetes, flux, quickstart, gitops, homelab, mise, task]
verified:
  - by: openwiki/0.7.0
    at: 2026-10-06T00:54:23.845Z
sources:
  - id: openwiki-source-6378149bc01898a8718f6f2d
    resource: repo://.github/workflows/flux-local.yaml
  - id: openwiki-source-9c06bd9d7d25770709e07c7c
    resource: repo://.mise.toml
  - id: openwiki-source-aa55808be329b3f929ddf105
    resource: repo://.renovaterc.json5
  - id: openwiki-source-240e6406ed4b6841961679cb
    resource: repo://.sops.yaml
  - id: openwiki-source-f04021c19122a44288e9cea0
    resource: repo://.taskfiles/bootstrap/Taskfile.yaml
  - id: openwiki-source-4f5be6b4c7dcc699aca46164
    resource: repo://.taskfiles/talos/Taskfile.yaml
  - id: openwiki-source-ab04cad2d509128f85736a9f
    resource: repo://.taskfiles/volsync/Taskfile.yaml
  - id: openwiki-source-360da09d9920a02e1e719d90
    resource: repo://bootstrap/helmfile.yaml
  - id: openwiki-source-0e996dcef7180d2fe4f95073
    resource: repo://docs/volsync-migration-tracker.md
  - id: openwiki-source-dbd8b5c09621dda4424792fd
    resource: repo://kubernetes/apps/default/gitea/app/helmrelease.yaml
  - id: openwiki-source-649e5ed74d5376f95cff2b2a
    resource: repo://kubernetes/apps/default/gitea/ks.yaml
  - id: openwiki-source-63c7de935f96b1aa0a5dc1a4
    resource: repo://kubernetes/components/common/kustomization.yaml
  - id: openwiki-source-5b9de8faa6aefca68539d613
    resource: repo://kubernetes/components/image-automation/kustomization.yaml
  - id: openwiki-source-286accabe6659d8f9ce3fa94
    resource: repo://kubernetes/components/volsync-new/kustomization.yaml
  - id: openwiki-source-cf127a322444d1f6306750c2
    resource: repo://kubernetes/components/volsync/kustomization.yaml
  - id: openwiki-source-0696023deccf378a358f7526
    resource: repo://kubernetes/flux/cluster/ks.yaml
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-6f1d2c8de9160e178167b990
    resource: repo://scripts/bootstrap-apps.sh
  - id: openwiki-source-b65e4f1ccd91316116ad973a
    resource: repo://talos/talenv.yaml
  - id: openwiki-source-b9ff7ee0aa4953cc601052a4
    resource: repo://Taskfile.yaml
generated: { by: "openwiki/0.7.0", at: "2026-10-06T00:54:23.845Z" }
---

# Quickstart & Repository Map

Welcome to the Talos Kubernetes cluster documentation. This repository contains the complete GitOps configuration for a homelab cluster running Talos Linux with ~30 applications across multiple namespaces. This page is the entry point: it orients you on the repository, the mise-managed toolchain, common task commands, and routes you into the rest of the wiki.

## Architecture Overview

This cluster combines Talos Linux as the operating system with Flux for GitOps-based cluster management:

```mermaid
flowchart TD
    subgraph Infrastructure["Infrastructure Layer"]
        A["Talos Linux Nodes"]
        B["Bare-metal Hardware"]
    end

    subgraph Platform["Platform Layer"]
        C["Kubernetes v1.35.4"]
        D["Cilium CNI"]
        E["TopoLVM Storage"]
    end

    subgraph GitOps["GitOps Layer"]
        F["Flux Operator"]
        G["Git Repository"]
        H["Helm Releases"]
    end

    subgraph Services["Services Layer"]
        I["Networking"]
        J["Observability"]
        K["Applications"]
    end

    B --> A
    A --> C
    C --> D
    C --> E
    F --> G
    F --> H
    C --> F
    D --> I
    C --> J
    H --> K
```

*Figure: Four-layer cluster architecture from bare-metal infrastructure through GitOps-managed services*

### Key Components

- **Operating System**: Talos Linux v1.12.7 (secure-boot enabled, immutable, API-managed)
- **Orchestration**: Flux for GitOps-based cluster management
- **Networking**: Cilium (CNI with L2 announcements), Cloudflare Tunnel (ingress), Tailscale (VPN/mesh)
- **Secrets**: SOPS + age for Git encryption, External Secrets Operator with Bitwarden for runtime secrets
- **Observability**: Prometheus, Grafana, Loki, Thanos, Gatus, Uptime Kuma
- **Storage**: TopoLVM (LVM thin provisioning), VolSync (backup/replication), snapshot-controller, NFS CSI

## Local Environment Setup

The repository uses [mise](https://mise.jdx.dev/) for toolchain management and environment configuration.

### Initial Setup

```bash
mise trust
mise install
```

This installs and configures the required tools: `task`, `talhelper`, `talosctl`, `kubectl`, `flux`, `helmfile`, `sops`, `age`, `yq`, `kubeconform`, `cilium-cli`, `cloudflared`, `cue`, `helm`, `jq`, `kustomize`, `gh`, `python`, `makejinja`, `node`, and `pipx`. Versions are pinned in `.mise.toml` (e.g. talhelper 3.1.17, talos 1.14.2, kubectl 1.33.1, flux2 2.9.6, helm 4.3.0, sops 3.13.3, python 3.14.8); Renovate keeps them updated.

### Environment Variables

mise (`.mise.toml`) and the root `Taskfile.yaml` both set the same three essential environment variables:

- `KUBECONFIG=./kubeconfig` - Kubernetes client configuration
- `TALOSCONFIG=./talos/clusterconfig/talosconfig` - Talos client configuration
- `SOPS_AGE_KEY_FILE=./age.key` - Age private key for secret encryption/decryption

The `age.key` file is local-only and never committed; you must supply it before running bootstrap or editing secrets.

## Task Routing Map

Start from what you want to change, then go to the wiki page that covers it:

| I want to... | Go to |
| --- | --- |
| Add a new app or change an existing one | [Workflow: Adding / Changing an App](./workflows/app-deployment.md) |
| Change Talos node config (patches, talhelper) | [Talos Node & Machine Config](./architecture/talos-cluster.md) |
| Rotate or edit a secret (SOPS / External Secrets) | [Secrets Management](./concepts/secrets-management.md) |
| Upgrade Talos OS or Kubernetes | [Operations: Talos & Kubernetes Upgrades](./operations/upgrade-workflow.md) |
| Trigger a backup or restore a PVC | [Operations: VolSync Backup & Restore](./operations/volsync-ops.md) |
| Understand the cluster shape (nodes, Flux chain, namespaces) | [Cluster Architecture Overview](./architecture/overview.md) |
| Run day-to-day ops (reconcile, suspend, inspect) | [Daily Operations](./operations/daily-operations.md) |
| Do a first-boot cluster install | [Workflow: Cluster Bootstrap](./workflows/bootstrap.md) |
| Debug a failed sync, decryption, or Helm upgrade | [Troubleshooting](./operations/troubleshooting.md) |
| Understand Cilium, Gateway API, DNS, tunnels | [Networking & Ingress](./concepts/networking.md) |
| Understand metrics, logs, and uptime monitoring | [Observability Stack](./concepts/observability.md) |
| Understand storage classes, VolSync, MinIO backups | [Storage & Backup](./concepts/storage.md) |
| Understand CI validation and Renovate automation | [Integrations: CI & Renovate](./integrations/ci-cd-renovate.md) |
| Understand Cloudflare / Tailscale / Bitwarden dependencies | [Integrations: External Identity](./integrations/external-identity.md) |
| Reuse kustomize components (gatus, volsync-new) | [Reusable Kustomize Components](./concepts/components.md) |
| Understand Flux Kustomizations, dependencies, substitution | [Flux GitOps Model](./concepts/flux-gitops.md) |
| Check manifests before merge (flux-local, kubeconform) | [Validation & Local Checks](./testing/validation.md) |

## Make a Change (the core loop)

Most changes touch only `kubernetes/` manifests and flow through Flux. The minimal loop:

1. **Edit manifests** under `kubernetes/apps/<namespace>/<app>/` (e.g. `helmrelease.yaml`, `externalsecret.yaml`, or the app's `ks.yaml`).
2. **Verify the build locally** with kustomize before committing:

   ```bash
   kustomize build kubernetes/apps/default/gitea/app | kubeconform -strict -summary
   ```

3. **Commit and push to `main`**. Flux polls the `flux-system` GitRepository on a 1h interval.
4. **Reconcile immediately** (optional but recommended):

   ```bash
   task reconcile   # flux reconcile kustomization flux-system --with-source
   ```

5. **Verify reconciliation**:

   ```bash
   flux get kustomizations -A            # app-level Kustomization status
   kubectl get kustomization <app> -n <namespace> -o yaml | yq '.status.conditions'
   flux get helmreleases -n <namespace>  # if you changed a HelmRelease
   kubectl get pods -n <namespace>       # workload health
   ```

6. **Roll back** by reverting the commit — Flux prunes removed resources (`prune: true` is set on the root and app Kustomizations) and re-applies the previous state.

If a change introduces a new dependency (CRDs, another app), model it with `dependsOn` in the app's `ks.yaml` like `kubernetes/apps/default/gitea/ks.yaml` does for `topolvm`, `external-secrets`, and `cloudnative-pg-cluster`.

For pull requests, CI runs `flux-local test` and posts `flux-local diff` comments for `helmrelease` and `kustomization` resources (`.github/workflows/flux-local.yaml`), so the rendered impact is visible before merge.

## Quick Reference: Common Task Commands

The root `Taskfile.yaml` includes three task namespaces: `bootstrap` (`.taskfiles/bootstrap`), `talos` (`.taskfiles/talos`), and `volsync` (`.taskfiles/volsync`).

```bash
task                          # List all available tasks
task reconcile                # Force Flux to pull git changes
task talos:generate-config    # Regenerate Talos machine configs (talhelper genconfig)
task talos:apply-node IP=<ip> # Apply Talos config to one node (MODE=auto by default)
task talos:upgrade-node IP=<ip>  # Upgrade Talos OS on one node (reads talenv.yaml pin)
task talos:upgrade-k8s        # Upgrade Kubernetes cluster-wide (reads talenv.yaml pin)
task talos:reset              # Reset nodes to maintenance mode (DESTRUCTIVE, prompts)
task bootstrap:talos          # Full Talos cluster bootstrap
task bootstrap:apps           # Bootstrap apps (namespaces, secrets, CRDs, Helm releases)
task volsync:snapshot APP=<name> NS=<ns>  # Trigger VolSync restic backup
task volsync:restore APP=<name> NS=<ns>   # Restore PVC from backup
task volsync:list APP=<name> NS=<ns>      # List snapshots
task volsync:unlock CLUSTER=main         # Unlock all restic source repos
task volsync:suspend | resume             # Suspend/resume VolSync kustomization + HelmRelease
```

`talos:upgrade-node` resolves the node's image URL from `talconfig.yaml` and the version from `talenv.yaml`; `talos:upgrade-k8s` reads `kubernetesVersion` from `talenv.yaml`. These tasks have preconditions (e.g. reachable node, `talosctl config info`) that fail fast before running.

### Initial Cluster Bootstrap

For new cluster installations, the bootstrap process is split into two phases:

1. **Prepare Talos configuration**: Edit `talos/talconfig.yaml` and `talos/talenv.yaml`
2. **Bootstrap Talos**: `task bootstrap:talos` (generates secrets + machine configs, applies them insecurely, bootstraps the cluster, forces a kubeconfig export)
3. **Bootstrap base apps**: `task bootstrap:apps` (`scripts/bootstrap-apps.sh`) — checks prerequisites (`KUBECONFIG`/`TALOSCONFIG` env and the `helmfile kubectl kustomize sops talhelper yq` CLIs), waits for node readiness, server-side creates one namespace per `kubernetes/apps/` top-level directory, applies the SOPS secrets (`github-deploy-key`, `cluster-secrets`, `sops-age` into `flux-system`), applies CRDs, then helmfile-syncs `bootstrap/helmfile.yaml` in dependency order: cilium → coredns → cert-manager → flux-operator → flux-instance

After bootstrap, Flux takes over and manages all applications under `kubernetes/apps/`.

See [**Bootstrap Workflow**](./workflows/bootstrap.md) for detailed prerequisites, step-by-step instructions, and verification procedures.

## Repository Structure

```
.
├── bootstrap/              # Initial Helm charts installed during cluster bootstrap (helmfile)
├── kubernetes/
│   ├── apps/               # Flux-managed applications (one Kustomization per namespace)
│   ├── components/         # Reusable components and common configurations
│   └── flux/               # Flux cluster/meta Kustomizations
├── talos/
│   ├── talconfig.yaml      # Talhelper main configuration
│   ├── talenv.yaml         # Talos/Kubernetes version pins (Renovate-tracked)
│   ├── clusterconfig/      # Generated Talos machine configs (do not edit)
│   └── patches/            # Machine-level patches merged by talhelper
├── scripts/                # Bootstrap and utility scripts
├── .taskfiles/             # Task subcommand definitions (bootstrap, talos, volsync)
├── Taskfile.yaml           # Main task entrypoint
├── .mise.toml              # mise toolchain configuration
├── .sops.yaml              # SOPS encryption rules
└── .renovaterc.json5       # Renovate dependency automation configuration
```

## Application Organization

Applications are organized by namespace under `kubernetes/apps/`, with each namespace managed by its own Flux Kustomization:

- **`kube-system`**: Cilium, CoreDNS, metrics-server, node-feature-discovery, system-upgrade
- **`flux-system`**: Flux operator and instance, image automation
- **`network`**: Cloudflare Tunnel, AdGuard DNS, k8s-gateway, SMTP relay, Tailscale
- **`observability`**: Grafana, Prometheus, Loki, Thanos, Gatus, Uptime Kuma, promtail
- **`storage`**: TopoLVM, VolSync, NFS CSI, snapshot-controller, Nextcloud
- **`default`**: User applications (Gitea, growth-tracker, Paperless, Navidrome, Jellyfin, qBittorrent, RSSHub, n8n, Ollama, etc.)
- **`cert-manager`**: cert-manager installation and cluster issuers
- **`database`**: PostgreSQL, Redis operators
- **`external-secrets`**: External Secrets Operator and Bitwarden integration
- **`external-server`**: External-facing applications behind Cloudflare Tunnel

See [**Architecture Overview**](./architecture/overview.md) for details on namespace organization and the Flux reconciliation hierarchy.

## Key Architectural Patterns

### Flux GitOps Flow

Flux watches the Git repository and reconciles the cluster via root Kustomizations defined in `kubernetes/flux/cluster/ks.yaml`:

1. **`cluster-meta`** → Deploys source repositories (GitRepository, HelmRepository, OCIRepository) from `kubernetes/flux/meta/`
2. **`cluster-apps`** → Reconciles all application Kustomizations from `kubernetes/apps/`

Each namespace under `kubernetes/apps/` has its own Kustomization that Flux reconciles with SOPS decryption enabled (the `sops-age` secret in `flux-system`), `prune: true`, `wait: true`, and postBuild substitution from the `cluster-secrets` Secret.

See [**Flux GitOps Model**](./concepts/flux-gitops.md) for the complete reconciliation hierarchy and dependency ordering.

### Application Pattern

Most applications use the shared `app-template` OCI chart (`ghcr.io/bjw-s-labs/helm/app-template`) with this structure:

```
<namespace>/<app>/
  ks.yaml                # Flux Kustomization metadata
  app/
    helmrelease.yaml     # HelmRelease using shared app-template
    externalsecret.yaml  # ExternalSecret references (if needed)
    kustomization.yaml   # Resource aggregation
```

Common components like VolSync (backup), Gatus (uptime monitoring), and image automation are integrated through reusable components in `kubernetes/components/` (e.g. `components/volsync-new`, `components/gatus/external`), referenced via the `components:` field in each app's `ks.yaml`.

See [**App Deployment Workflow**](./workflows/app-deployment.md) for details, and [**Reusable Kustomize Components**](./concepts/components.md) for the component catalog.

### Secret Management

Two-layer encryption approach:

1. **Git Encryption** (`talos/*.sops.yaml`, `bootstrap/`, `kubernetes/`): SOPS + age encryption
   - Talos configs: Whole-file encryption
   - Kubernetes configs: Only `data`/`stringData` fields encrypted
   - Rules defined in `.sops.yaml`

2. **Runtime Secrets** (External Secrets Operator + Bitwarden): Application secrets injected at runtime
   - ClusterSecretStore connects to Bitwarden Connect
   - ExternalSecret CRs define which secrets to sync
   - Never stored in Git

Flux decrypts SOPS secrets using the `sops-age` Secret in `flux-system`. The local `age.key` file is required for editing secrets but never committed.

See [**Secrets Management**](./concepts/secrets-management.md) for the full model.

### Dependency Automation

Renovate handles automated dependency updates:

- **Container images**: Helm releases, Kubernetes deployments
- **Helm charts and OCI repositories**: Flux HelmRepository and OCIRepository resources
- **Talos/Kubernetes versions**: Version pins in `talos/talenv.yaml`
- **Toolchain versions**: mise packages in `.mise.toml`

**Schedule**: Runs on weekends only
**Auto-merge**: Patch updates and minor mise/GitHub Actions updates

See [**Integrations: CI (flux-local) & Renovate**](./integrations/ci-cd-renovate.md) for configuration details.

## Project Origins

This cluster was originally initialized using the [onedr0p/cluster-template](https://github.com/onedr0p/cluster-template) and has been significantly customized for a personal homelab environment.

**Important**: The repository contains environment-specific configurations (domains, IPs, credentials). When reusing this setup, you must clean and reconfigure network settings, domains, secrets, and application manifests for your environment.

## Status and Monitoring

The cluster exposes status metrics at [kromgo.tomyail.com](https://kromgo.tomyail.com) showing cluster age/uptime, node count, running pods, CPU/memory usage, and network traffic. A status page is available at [status-dev.tomyail.com](https://status-dev.tomyail.com). If something breaks during bootstrap or reconciliation, start with the verification commands above, then see [**Troubleshooting**](./operations/troubleshooting.md) and [**Validation**](./testing/validation.md).
