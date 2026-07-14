# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Talos Linux Kubernetes cluster managed via GitOps (Flux). Personal homelab with ~30 apps across namespaces like `default`, `kube-system`, `network`, `observability`, `storage`, `cert-manager`, `database`, `external-secrets`. Based on [onedr0p/cluster-template](https://github.com/onedr0p/cluster-template).

## Local toolchain

Managed by [mise](https://mise.jdx.dev/) (`.mise.toml`). Run `mise trust && mise install` to set up.

Key tools: `task`, `talhelper`, `talosctl`, `kubectl`, `flux`, `helmfile`, `sops`, `age`, `yq`, `kubeconform`

Environment variables auto-configured by mise:
- `KUBECONFIG=./kubeconfig`
- `TALOSCONFIG=./talos/clusterconfig/talosconfig`
- `SOPS_AGE_KEY_FILE=./age.key`

## Common commands

```bash
task                          # list all tasks
task reconcile                # force Flux to pull git changes
task talos:generate-config    # regenerate Talos machine configs
task talos:apply-node IP=<ip> # apply Talos config to one node
task talos:upgrade-node IP=<ip> # upgrade Talos OS on one node
task talos:upgrade-k8s        # upgrade Kubernetes cluster-wide
task bootstrap:talos          # full Talos cluster bootstrap
task bootstrap:apps           # bootstrap apps (namespaces, secrets, CRDs, helmfile)
task volsync:snapshot APP=<name> NS=<ns>  # trigger VolSync backup
task volsync:restore APP=<name> NS=<ns>   # restore PVC from backup
task volsync:list APP=<name> NS=<ns>      # list snapshots
```

## Architecture

### Flux GitOps flow

```
kubernetes/flux/cluster/ks.yaml   (cluster-meta + cluster-apps Kustomizations)
  ├── cluster-meta → kubernetes/flux/meta/  (GitRepository sources)
  └── cluster-apps → kubernetes/apps/       (all app Kustomizations)
        ├── kube-system/kustomization.yaml
        ├── default/kustomization.yaml
        ├── network/kustomization.yaml
        └── ... (one per namespace)
```

Flux watches the `flux-system` GitRepository and reconciles everything under `kubernetes/apps/`. Secrets are decrypted via SOPS using the `sops-age` secret in `flux-system`.

### App structure pattern

Each app under `kubernetes/apps/<namespace>/<app-name>/` follows this convention:

```
<app>/
  ks.yaml            # Flux Kustomization (path, dependsOn, decryption, postBuild substitutes)
  app/               # Main resources
    helmrelease.yaml # HelmRelease (references OCIRepository app-template)
    externalsecret.yaml
    kustomization.yaml
  [sub-app/]         # Optional additional Kustomization (e.g., gitea/runner)
```

Apps use the `app-template` OCI chart (`ghcr.io/bjw-s-labs/helm/app-template`) shared from `kubernetes/components/common/repos/app-template/`.

### Reusable components (`kubernetes/components/`)

- `common/` — namespace, SOPS age secret, OCI repos (app-template). Auto-included via `components:` in namespace kustomizations.
- `gatus/external`, `gatus/external-tailscale`, `gatus/guarded` — monitoring checks.
- `volsync-new/` — VolSync backup claim + MinIO config.
- `image-automation/` — Flux image automation (ImageRepository + ImagePolicy).

### Talos config (`talos/`)

- `talconfig.yaml` — talhelper config: node definitions, IPs, patches, kernel modules, network interfaces.
- `talenv.yaml` — Talos and Kubernetes versions (tracked by Renovate).
- `patches/` — machine-level patches (global, controller) merged by talhelper.
- `clusterconfig/` — generated Talos machine configs (do not edit directly).

### Bootstrap flow (`bootstrap/`)

`bootstrap/helmfile.yaml` installs the initial foundation before Flux takes over: Cilium → CoreDNS → cert-manager → flux-operator → flux-instance. The `scripts/bootstrap-apps.sh` script handles namespaces, SOPS secrets, CRDs, then helmfile sync.

### Secrets

SOPS + age. Two encryption rules in `.sops.yaml`:
- `talos/*.sops.yaml` — whole-file encryption.
- `(bootstrap|kubernetes)/*.sops.yaml` — only `data`/`stringData` fields encrypted.

The `age.key` file is local-only and never committed.

### Dependency updates

Renovate (`.renovaterc.json5`) handles container images, Helm charts, GitHub releases, mise tools, and GitHub Actions. Auto-merges patch updates and minor mise/GHA updates. Runs on weekends. The `# renovate:` comment syntax in YAML/sh files enables custom datasource tracking.

## Key conventions

- YAML indent: 2 spaces (4 for shell). LF line endings. See `.editorconfig`.
- App HelmReleases use `chartRef.kind: OCIRepository` referencing the shared `app-template`.
- Flux Kustomizations set `decryption.provider: sops` with `secretRef: sops-age`.
- `postBuild.substitute` provides per-app vars (`APP`, `VOLSYNC_CAPACITY`); `substituteFrom` pulls cluster-secrets.
- Namespace kustomizations include `../../components/common` to get namespace, repos, and SOPS.
- Route resources use Gateway API (`parentRefs`) with `internal`/`external` listeners in `kube-system`.
- The `ExternalSecret` resources reference Bitwarden Connect (external-secrets operator).

<!-- OPENWIKI:START -->

## OpenWiki

This repository uses OpenWiki for recurring code documentation. Start with `openwiki/quickstart.md`, then follow its links to architecture, workflows, domain concepts, operations, integrations, testing guidance, and source maps.

The scheduled OpenWiki GitHub Actions workflow refreshes the repository wiki. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
