---
type: Quickstart Guide
title: Quick Start Guide
description: Entry point for understanding the Talos + Flux GitOps cluster repository structure, bootstrapping process, and daily operations.
tags: [talos, kubernetes, flux, quickstart, gitops, homelab]
sources:
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
  - id: openwiki-source-dbd8b5c09621dda4424792fd
    resource: repo://kubernetes/apps/default/gitea/app/helmrelease.yaml
  - id: openwiki-source-649e5ed74d5376f95cff2b2a
    resource: repo://kubernetes/apps/default/gitea/ks.yaml
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
generated: { by: "openwiki/0.4.3", at: "2026-08-29T21:52:21.026Z" }
verified:
  - by: openwiki/0.4.3
    at: 2026-08-30T21:57:36.532Z
---

# Quick Start Guide

Welcome to the Talos Kubernetes cluster documentation. This repository contains the complete GitOps configuration for a homelab cluster running Talos Linux with ~30 applications across multiple namespaces.

## Architecture Overview

This cluster combines Talos Linux as the operating system with Flux for GitOps-based cluster management:

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
    subgraph Infrastructure["Infrastructure Layer"]
        A[Talos Linux Nodes<br/>Secure-boot enabled]
        B[Bare-metal Hardware]
    end
    
    subgraph Platform["Platform Layer"]
        C[Kubernetes v1.35.4<br/>Single-node control plane with VIP]
        D[Cilium CNI<br/>L2 announcements, Gateway API]
        E[TopoLVM Storage<br/>LVM thin provisioning]
    end
    
    subgraph GitOps["GitOps Layer"]
        F[Flux Operator<br/>Reconciliation engine]
        G[Git Repository<br/>Source of truth]
        H[Helm Releases<br/>Package management]
    end
    
    subgraph Services["Services Layer"]
        I[Networking<br/>Cloudflare Tunnel, Tailscale]
        J[Observability<br/>Prometheus, Grafana, Loki]
        K[Applications<br/>30+ apps across namespaces]
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

This installs and configures the required tools: `task`, `talhelper`, `talosctl`, `kubectl`, `flux`, `helmfile`, `sops`, `age`, `yq`, `kubeconform`, `cilium-cli`, `cloudflared`, `cue`, `helm`, `jq`, `kustomize`, `python`, `makejinja`, `node`, and `pipx`.

### Environment Variables

mise automatically sets these essential environment variables:

- `KUBECONFIG=./kubeconfig` - Kubernetes client configuration
- `TALOSCONFIG=./talos/clusterconfig/talosconfig` - Talos client configuration
- `SOPS_AGE_KEY_FILE=./age.key` - Age private key for secret encryption/decryption

## Quick Reference

### Common Tasks

```bash
task                          # List all available tasks
task reconcile                # Force Flux to pull git changes
task talos:generate-config    # Regenerate Talos machine configs
task talos:apply-node IP=<ip> # Apply Talos config to one node
task talos:upgrade-node IP=<ip>  # Upgrade Talos OS on one node
task talos:upgrade-k8s        # Upgrade Kubernetes cluster-wide
task bootstrap:talos          # Full Talos cluster bootstrap
task bootstrap:apps           # Bootstrap apps (namespaces, secrets, CRDs, Helm releases)
```

### Initial Cluster Bootstrap

For new cluster installations, the bootstrap process is split into two phases:

1. **Prepare Talos configuration**: Edit `talos/talconfig.yaml` and `talos/talenv.yaml`
2. **Bootstrap Talos**: `task bootstrap:talos` (applies machine configs, bootstraps cluster, exports kubeconfig)
3. **Bootstrap base apps**: `task bootstrap:apps` (installs Cilium, CoreDNS, cert-manager, Flux)

After bootstrap, Flux takes over and manages all applications under `kubernetes/apps/`.

See [**Cluster Bootstrap Workflow**](./workflows/bootstrap.md) for detailed prerequisites, step-by-step instructions, and verification procedures.

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

See [**Application Deployment Workflow**](./workflows/app-deployment.md) for details on the app-template pattern, namespace organization, and common components.

## Documentation Map

### Core Concepts

- **[Cluster Architecture Overview](./concepts/cluster-architecture.md)** - Control plane setup, networking stack, storage layers, observability infrastructure, and security mechanisms
- **[Flux GitOps Architecture](./concepts/flux-architecture.md)** - Reconciliation hierarchy, Kustomization structure, source management, and image automation system
- **[Network Architecture](./concepts/networking.md)** - Layered networking stack: Cilium CNI, Cloudflare Tunnel, DNS management, and Tailscale mesh VPN
- **[Secrets Management](./concepts/secrets-management.md)** - Dual-layer secrets: SOPS + age for Git encryption and External Secrets with Bitwarden for runtime injection
- **[Storage Architecture](./concepts/storage.md)** - TopoLVM with LVM thin provisioning, VolSync for backup/replication, and storage class configurations

### Workflows

- **[Cluster Bootstrap Workflow](./workflows/bootstrap.md)** - Complete bootstrap sequence from Talos configuration generation through cluster initialization
- **[Application Deployment Workflow](./workflows/app-deployment.md)** - How to deploy and manage applications through Flux, including the app-template pattern
- **[Cluster Upgrade Workflow](./workflows/upgrade.md)** - Upgrade processes for Talos OS, Kubernetes, and applications

### Operations

- **[Daily Operations](./operations/daily-operations.md)** - Common operational tasks: Flux reconciliation, Talos config application, node operations, backup procedures
- **[Troubleshooting Guide](./operations/troubleshooting.md)** - Common issues and solutions: TopoLVM issues, Flux reconciliation failures, secret decryption problems

### Integrations

- **[Bitwarden Secrets Integration](./integrations/bitwarden.md)** - Bitwarden Connect for runtime secret management via External Secrets Operator
- **[CI/CD Integration](./integrations/ci-cd.md)** - GitHub Actions workflows for validation, flux-local testing, and OpenWiki automation
- **[Cloudflare Integration](./integrations/cloudflare.md)** - Cloudflare Tunnel for ingress, DNS management via external-dns, and DNSEndpoint resources
- **[Renovate Integration](./integrations/renovate.md)** - Automated dependency updates for Flux Helm releases, OCI repositories, Kubernetes manifests, and Talos/Kubernetes versions
- **[Tailscale Integration](./integrations/tailscale.md)** - Tailscale operator deployment for mesh VPN networking, subnet router configuration, and egress proxy setup

## Key Architectural Patterns

### Flux GitOps Flow

Flux watches the Git repository and reconciles the cluster in two stages:

1. **`cluster-meta`** → Deploys source repositories (GitRepository, HelmRepository, OCIRepository) from `kubernetes/flux/meta/`
2. **`cluster-apps`** → Reconciles all application Kustomizations from `kubernetes/apps/`

Each namespace under `kubernetes/apps/` has its own Kustomization that Flux reconciles with SOPS decryption enabled.

See [**Flux GitOps Architecture**](./concepts/flux-architecture.md) for the complete reconciliation hierarchy and dependency ordering.

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

Common components like VolSync (backup), Gatus (uptime monitoring), and image automation are integrated through reusable components in `kubernetes/components/`.

See [**Application Deployment Workflow**](./workflows/app-deployment.md) for detailed application patterns and component usage.

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

See [**Secrets Management**](./concepts/secrets-management.md) for the complete architecture and workflows.

### Dependency Automation

Renovate handles automated dependency updates:

- **Container images**: Helm releases, Kubernetes deployments
- **Helm charts and OCI repositories**: Flux HelmRepository and OCIRepository resources
- **Talos/Kubernetes versions**: Version pins in `talos/talenv.yaml`
- **Toolchain versions**: mise packages in `.mise.toml`

**Schedule**: Runs on weekends only  
**Auto-merge**: Patch updates and minor mise/GitHub Actions updates

See [**Renovate Integration**](./integrations/renovate.md) for configuration details and custom datasource tracking.

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
