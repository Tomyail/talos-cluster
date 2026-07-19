---
type: Quickstart Guide
title: Talos Cluster Documentation
description: Quickstart entrypoint for the Talos Kubernetes homelab cluster GitOps repository, covering setup, architecture, applications, operations, storage, and Talos configuration.
tags: [talos, kubernetes, flux, quickstart, gitops, homelab]
---

# Talos Cluster Documentation

Welcome to the Talos Kubernetes cluster documentation. This repository contains the complete GitOps configuration for a personal homelab cluster running Talos Linux with ~30 applications across multiple namespaces.

## What This Is

A Talos Linux Kubernetes cluster managed via Flux GitOps. The cluster runs on bare-metal hardware with:

- **Operating System**: Talos Linux (secure-boot enabled)
- **Orchestration**: Flux for GitOps-based cluster management
- **Networking**: Cilium (CNI), Cloudflare Tunnel, Tailscale
- **Secrets**: SOPS + age encryption, External Secrets Operator with Bitwarden
- **Observability**: Prometheus, Grafana, Loki, Thanos, Gatus, Uptime Kuma
- **Storage**: TopoLVM, VolSync, snapshot-controller, NFS CSI, local-path-provisioner

## Quick Start

### Local Environment Setup

The repository uses [mise](https://mise.jdx.dev/) for toolchain management:

```bash
mise trust
mise install
```

This installs and configures: `task`, `talhelper`, `talosctl`, `kubectl`, `flux`, `helmfile`, `sops`, `age`, `yq`, `kubeconform`

mise also sets essential environment variables:
- `KUBECONFIG=./kubeconfig`
- `TALOSCONFIG=./talos/clusterconfig/talosconfig`
- `SOPS_AGE_KEY_FILE=./age.key`

### Common Tasks

```bash
task                          # list all available tasks
task reconcile                # force Flux to pull git changes
task talos:generate-config    # regenerate Talos machine configs
task talos:apply-node IP=<ip> # apply Talos config to one node
task talos:upgrade-node IP=<ip>  # upgrade Talos OS on one node
task talos:upgrade-k8s        # upgrade Kubernetes cluster-wide
task bootstrap:talos          # full Talos cluster bootstrap
task bootstrap:apps           # bootstrap apps (namespaces, secrets, CRDs, helmfile)
```

### Initial Cluster Bootstrap

For new cluster installations:

1. **Prepare Talos configuration**: Edit `talos/talconfig.yaml` and `talos/talenv.yaml`
2. **Bootstrap Talos**: `task bootstrap:talos` (applies machine configs, bootstraps cluster, exports kubeconfig)
3. **Bootstrap base apps**: `task bootstrap:apps` (installs Cilium, CoreDNS, cert-manager, Flux)

After bootstrap, Flux takes over and manages all applications under `kubernetes/apps/`.

## Repository Structure

```
.
├── bootstrap/              # Initial Helm charts installed during cluster bootstrap
├── kubernetes/
│   ├── apps/               # Flux-managed applications (one Kustomization per namespace)
│   ├── components/         # Reusable components and common configurations
│   └── flux/               # Flux cluster/meta Kustomizations
├── talos/
│   ├── talconfig.yaml      # Talhelper main configuration
│   ├── talenv.yaml         # Talos/Kubernetes version pins
│   ├── clusterconfig/      # Generated Talos machine configs (do not edit)
│   └── patches/            # Machine-level patches merged by talhelper
├── scripts/                # Bootstrap and utility scripts
├── .taskfiles/             # Task subcommand definitions
├── Taskfile.yaml           # Main task entrypoint
└── cluster.yaml            # Cluster-level variables (CIDRs, domains, tokens)
```

## Application Namespaces

Applications are organized by namespace under `kubernetes/apps/`:

- **`kube-system`**: Cilium, CoreDNS, metrics-server, node-feature-discovery, system-upgrade
- **`flux-system`**: Flux operator and instance
- **`network`**: Cloudflare Tunnel, AdGuard DNS, k8s-gateway, SMTP relay, Tailscale
- **`observability`**: Grafana, Prometheus, Loki, Thanos, Gatus, promtail
- **`storage`**: TopoLVM, VolSync, NFS CSI, snapshot-controller, Nextcloud
- **`default`**: ~30 personal applications (Gitea, Paperless, Navidrome, Jellyfin, qBittorrent, RSSHub, n8n, Ollama, etc.)
- **`cert-manager`**: cert-manager installation and cluster issuers
- **`database`**: PostgreSQL, Redis operators
- **`external-secrets`**: External Secrets Operator and Bitwarden integration
- **`external-server`**: External-facing applications behind Cloudflare Tunnel

## Key Concepts

### Flux GitOps Flow

Flux watches the `flux-system` GitRepository and reconciles everything in two stages:

1. **`cluster-meta`** → `kubernetes/flux/meta/` (GitRepository sources)
2. **`cluster-apps`** → `kubernetes/apps/` (all application Kustomizations)

Each namespace under `kubernetes/apps/` has its own Kustomization that Flux reconciles.

### Application Pattern

Each application follows this structure:

```
<namespace>/<app>/
  ks.yaml                # Flux Kustomization metadata
  app/
    helmrelease.yaml     # HelmRelease using shared app-template
    externalsecret.yaml  # ExternalSecret references (if needed)
    kustomization.yaml   # Resource aggregation
```

Most apps use the shared `app-template` OCI chart: `ghcr.io/bjw-s-labs/helm/app-template`

### Secret Management

Two encryption modes in `.sops.yaml`:

1. **Talos configs** (`talos/*.sops.yaml`): Whole-file encryption
2. **Kubernetes configs** (`bootstrap/`, `kubernetes/`): Only `data`/`stringData` fields encrypted

Flux decrypts SOPS secrets using the `sops-age` Secret in `flux-system`. The `age.key` file is local-only and never committed.

### Dependency Updates

Renovate (`.renovaterc.json5`) handles automated dependency updates for:
- Container images (Helm releases, deployments)
- Helm charts and OCI repositories
- GitHub releases and Actions
- mise toolchain versions

**Schedule**: Runs on weekends only
**Auto-merge**: Patch updates and minor mise/GHA updates
**Custom tracking**: Use `# renovate:` comments for custom datasource tracking

OpenWiki documentation is also updated automatically via GitHub Actions (`openwiki-update.yml`), running daily at 08:00 UTC with manual dispatch available.

## Documentation Sections

- **[Architecture](./architecture/overview.md)** - Detailed cluster architecture, GitOps patterns, and component relationships
- **[Operations](./operations/daily-tasks.md)** - Day-to-day operational procedures and troubleshooting
- **[Talos Configuration](./talos/configuration.md)** - Talhelper setup, machine config patches, and node management
- **[Storage & Backup](./storage/overview.md)** - VolSync, TopoLVM, NFS CSI, and snapshot strategies
- **[Networking](./networking/overview.md)** - Cilium, Cloudflare Tunnel, Gateway API routing, and Tailscale
- **[Applications](./applications/overview.md)** - Application patterns, app-template usage, and common configurations

## Project Origins

This cluster was originally initialized using the [onedr0p/cluster-template](https://github.com/onedr0p/cluster-template) and has been significantly customized for a personal homelab environment.

**Important**: The repository contains environment-specific configurations (domains, IPs, credentials). When reusing this setup, you must clean and reconfigure network settings, domains, secrets, and application manifests for your environment.

## Status and Monitoring

The cluster exposes status metrics at [kromgo.tomyail.com](https://kromgo.tomyail.com) showing:
- Cluster age and uptime
- Node count
- Running pods
- CPU/memory usage
- Network traffic

A status page is available at [status-dev.tomyail.com](https://status-dev.tomyail.com).
