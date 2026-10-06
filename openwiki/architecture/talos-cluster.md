---
type: architecture
title: Talos Node & Machine Config
description: How talhelper generates the Talos machine configuration for the single-node kubernetes cluster from talconfig.yaml, talenv.yaml version pins, and Kustomize-style patches, including the VIP, Cilium-with-no-CNI networking, secure boot, GPU kernel modules, and the local-path uservolume.
tags: [talos, talhelper, machine-config, secure-boot, cilium, gpu, storage]
verified:
  - by: openwiki/0.7.0
    at: 2026-10-06T00:54:23.845Z
sources:
  - id: openwiki-source-240e6406ed4b6841961679cb
    resource: repo://.sops.yaml
  - id: openwiki-source-4f5be6b4c7dcc699aca46164
    resource: repo://.taskfiles/talos/Taskfile.yaml
  - id: openwiki-source-360da09d9920a02e1e719d90
    resource: repo://bootstrap/helmfile.yaml
  - id: openwiki-source-67d09412df5e9b5263585304
    resource: repo://lvm-format-manual.yaml
  - id: openwiki-source-31a570d1ad51b4e45ea181ab
    resource: repo://talos/clusterconfig/.gitignore
  - id: openwiki-source-d2a09e6daa777d44de395a25
    resource: repo://talos/patches/controller/cluster.yaml
  - id: openwiki-source-db46d9c72142328b7930ee40
    resource: repo://talos/patches/global/machine-files.yaml
  - id: openwiki-source-c665b51a497196ebe6988995
    resource: repo://talos/patches/global/machine-network.yaml
  - id: openwiki-source-3d83fad84bedab7bcf047491
    resource: repo://talos/patches/global/machine-sysctls.yaml
  - id: openwiki-source-f71bfa4d3aa4c0e3a47407e2
    resource: repo://talos/patches/global/machine-time.yaml
  - id: openwiki-source-456ed6bb68f86e098d0036e2
    resource: repo://talos/patches/global/machine-udev.yaml
  - id: openwiki-source-fa722a4fd56cf74de886d778
    resource: repo://talos/patches/README.md
  - id: openwiki-source-1fd71dc29915917549048436
    resource: repo://talos/talconfig.yaml
  - id: openwiki-source-b65e4f1ccd91316116ad973a
    resource: repo://talos/talenv.yaml
  - id: openwiki-source-8ebb66a039d2620270b0a36c
    resource: repo://talos/talsecret.sops.yaml
  - id: openwiki-source-4d7c266d0d7adae77539048e
    resource: repo://talos/uservolume.yaml
generated: { by: "openwiki/0.7.0", at: "2026-10-06T00:54:23.845Z" }
---

# Talos Node & Machine Config

## Source of truth vs generated config

The authoritative inputs live in `talos/`:

- `talconfig.yaml` — the talhelper cluster/node definition (nodes, networking, patches, image factory URLs).
- `talenv.yaml` — version pins interpolated into `talconfig.yaml` via `${talosVersion}` / `${kubernetesVersion}`.
- `patches/` — Kustomize-style patches applied on top (see [talos/patches/README.md](../../talos/patches/README.md)).
- `talsecret.sops.yaml` — the SOPS-encrypted Talos cluster secrets.

`task talos:generate-config` runs `talhelper genconfig` in `talos/` and writes the per-node machine configs plus `talosconfig` into `talos/clusterconfig/`, which is gitignored. **Never edit `clusterconfig/` directly** — it is regenerated and any manual change is lost. Taskfile preconditions require `talconfig.yaml`, the root `.sops.yaml`, and the SOPS age key file (`age.key`) to exist before generating.

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart LR
    A[talenv.yaml<br/>version pins] --> B[talconfig.yaml]
    B --> C[talhelper genconfig]
    D[patches/global/*.yaml] --> C
    E[patches/controller/*.yaml] --> C
    F[talsecret.sops.yaml<br/>+ age.key] --> C
    C --> G[talos/clusterconfig/<br/>generated, gitignored]
    G --> H[talos:apply-node /<br/>upgrade-node / upgrade-k8s]
```

## Cluster & network layout

- Cluster name `kubernetes`; API endpoint `https://192.168.50.10:6443`, with `127.0.0.1` and `192.168.50.10` as both API and machine cert SANs.
- Pod CIDR `10.42.0.0/16`, service CIDR `10.43.0.0/16` (Flannel-style defaults consumed by Cilium).
- `cniConfig.name: none` disables Talos's built-in CNI because Cilium is deployed separately via the bootstrap Helmfile; the kubelet is also patched (`machine-kubelet.yaml`) with `192.168.50.0/24` in node-related allowlists, and the kube-proxy is disabled (`proxy.disabled: true` in the controller patch).
- The VIP `192.168.50.10` is configured as a Layer-2 `vip` on each node's NIC (selected by MAC `48:21:0b:58:14:f9`), giving the API server a stable address independent of which control-plane node holds it.

## Node inventory

There is currently a single node, `master0-nuc12` (`192.168.50.145`), a control-plane node:

- Install disk selected by `size: "<= 256GB"` and `type: ssd`.
- **Secure boot** enabled (`machineSpec.secureboot: true`), using the secure-boot installer schematic from `factory.talos.dev/installer-secureboot/<schematic-id>`. This image URL is what `talos:upgrade-node` resolves via `yq` when picking the `--image` for upgrades, so it must always be the secureboot variant or the node will no longer boot.
- **Intel GPU**: labeled `intel.feature.node.kubernetes.io/gpu: "true"` for node-feature-discovery style scheduling, with kernel modules `i915`, `drm`, and `drm_kms_helper` loaded (plus `dm_thin_pool`/`dm_mod` for LVM thin pooling), and the `siderolabs/i915` and `siderolabs/intel-ucode` system extensions baked into the image via the `controlPlane.schematic`. A global udev patch (`patches/global/machine-udev.yaml`) grants the video group (GID 44) `0660` access to `renderD*` devices so containers can use the GPU.
- Networking is static (`dhcp: false`): `192.168.50.145/24`, default gateway `192.168.50.1`, MTU 1500.

## uservolume for local-path storage

Each node declares an inline `UserVolumeConfig` manifest (mirrored standalone in `talos/uservolume.yaml`): a volume named `local-path-provisioner` provisioned from `system_disk` with `minSize: 2GB` and `grow: true`. This gives the local-path provisioner a dedicated, auto-growing spot on the system disk — see [Storage](../concepts/storage.md). Separately, `lvm-format-manual.yaml` at the repo root is a one-shot privileged Alpine pod (mounting `/var` and `/dev`) with commented-out commands to wipe/NVMe-format a disk and create an LVM thin pool (`lvm_vg`/`lvm_thin`) — a manual escape hatch for re-purposing a data disk.

## Patches

Patches follow the talhelper patching conventions: `patches/global/` applies to all configs, `patches/controller/` to control planes only, and `patches/worker/` or `patches/<hostname>/` are optional. Currently wired in `talconfig.yaml`:

| Patch | Purpose |
| --- | --- |
| `global/machine-files.yaml` | Drops a custom containerd CRI config fragment at `/etc/cri/conf.d/20-customization.part` |
| `global/machine-kubelet.yaml` | Kubelet tweaks incl. `192.168.50.0/24` |
| `global/machine-network.yaml` | DNS servers (1.1.1.1/1.0.0.1) and a static hosts entry `192.168.50.12` for `gitea.tomyail.com` / `cold-minio-api.tomyail.com` |
| `global/machine-sysctls.yaml` | inotify limits (watchers), 7.5 MB socket buffers for Cloudflared QUIC, `user.max_user_namespaces` for rootless Docker (Gitea runner) |
| `global/machine-time.yaml` | Cloudflare NTP servers `162.159.200.1` / `162.159.200.123` |
| `global/machine-udev.yaml` | GPU render device permissions |
| `global/machine-api-access.yaml` | API access rules |
| `controller/cluster.yaml` | Scheduling on control planes allowed; aggregator routing; metrics binds on `0.0.0.0`; CoreDNS and kube-proxy disabled; etcd metrics on `:2381`, etcd advertised subnet `192.168.50.0/24` |

## Version pins & secrets

`talenv.yaml` carries two Renovate-managed pins (annotated with `# renovate: datasource=docker` comments so Renovate bumps them):

- `talosVersion: v1.12.7` (from `ghcr.io/siderolabs/installer`) — substituted into `talconfig.yaml` as `${talosVersion}`.
- `kubernetesVersion: v1.35.4` (from `ghcr.io/siderolabs/kubelet`) — used by `talos:upgrade-k8s`.

`talos/talsecret.sops.yaml` holds the cluster secrets (Talos PKI, kubeconfig material) encrypted with SOPS/age. The root `.sops.yaml` gives `talos/.*\.sops\.ya?ml` files their own creation rule (MAC-only-encrypted, dedicated age key) distinct from the `data|stringData` regex used for Kubernetes manifests. The age private key lives outside git at `age.key` (`SOPS_AGE_KEY_FILE`).

## Operations

All node operations are task wrappers around `talhelper gencommand` (see [Upgrade Workflow](../operations/upgrade-workflow.md)):

- `task talos:generate-config` — regenerate `clusterconfig/`.
- `task talos:apply-node IP=...` — apply config (mode defaults to `auto`).
- `task talos:upgrade-node IP=...` — upgrade Talos using the node's `talosImageURL` and `talenv.yaml`'s `talosVersion`.
- `task talos:upgrade-k8s` — upgrade Kubernetes to `kubernetesVersion`.
- `task talos:reset` — destructive reset back to maintenance mode (wipes STATE/EPHEMERAL labels unless `CLI_FORCE`).

Related: [Architecture Overview](overview.md), [Storage](../concepts/storage.md).
