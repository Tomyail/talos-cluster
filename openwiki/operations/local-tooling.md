---
type: operational-concept
title: Local Tooling — mise, Taskfiles, and Bootstrap Scripts
description: How local operators run the cluster toolchain via mise-managed tools and environment variables, the root Taskfile and its bootstrap/talos/volsync task groups, and the scripts/bootstrap-apps.sh ordered cluster bootstrap flow.
tags: [tooling, mise, task, talos, volsync, bootstrap, sops, helmfile]
verified:
  - by: openwiki/0.6.0
    at: 2026-09-23T22:25:15.108Z
sources:
  - id: openwiki-source-9c06bd9d7d25770709e07c7c
    resource: repo://.mise.toml
  - id: openwiki-source-f04021c19122a44288e9cea0
    resource: repo://.taskfiles/bootstrap/Taskfile.yaml
  - id: openwiki-source-4f5be6b4c7dcc699aca46164
    resource: repo://.taskfiles/talos/Taskfile.yaml
  - id: openwiki-source-ab04cad2d509128f85736a9f
    resource: repo://.taskfiles/volsync/Taskfile.yaml
  - id: openwiki-source-5e2b5e1fe6a0de0579879c25
    resource: repo://.taskfiles/volsync/templates/replicationdestination.tmpl.yaml
  - id: openwiki-source-6f1d2c8de9160e178167b990
    resource: repo://scripts/bootstrap-apps.sh
  - id: openwiki-source-f732321d388a413da3d9f609
    resource: repo://scripts/lib/common.sh
  - id: openwiki-source-b9ff7ee0aa4953cc601052a4
    resource: repo://Taskfile.yaml
generated: { by: "openwiki/0.6.0", at: "2026-09-23T22:25:15.108Z" }
---

## Overview

Local operations are driven by three layers:

1. **mise** (`.mise.toml`) pins every CLI tool and exports the kube/Talos/SOPS environment variables so that any shell entered through mise uses the same toolchain.
2. **go-task** (`Taskfile.yaml` plus `.taskfiles/`) exposes operator workflows as `task <namespace>:<task>` commands, delegating complex flows to scripts under `scripts/`.
3. **Bootstrap scripts** (`scripts/bootstrap-apps.sh` with `scripts/lib/common.sh`) implement the ordered, idempotent cluster bring-up that the `task bootstrap:apps` entry point calls.

## mise: pinned tools and environment

`.mise.toml` defines two things:

**Environment variables** (via the `[env]` table, relative to the config root):

| Variable | Value | Purpose |
| --- | --- | --- |
| `KUBECONFIG` | `{{config_root}}/kubeconfig` | kubectl/helm/flux cluster access |
| `TALOSCONFIG` | `{{config_root}}/talos/clusterconfig/talosconfig` | talosctl node access |
| `SOPS_AGE_KEY_FILE` | `{{config_root}}/age.key` | age private key used by SOPS decryption |
| `_.python.venv` | `{{config_root}}/.venv` | auto-created Python virtualenv |

**Pinned tools**: python 3.14.7, makejinja, talhelper, cilium-cli, `gh`, cloudflared, cue, age, flux2, sops, go-task, helm, helmfile, jq, kustomize, kubectl, yq, talos, kubeconform, and node/pipx. Because `Taskfile.yaml` sets the same `KUBECONFIG`, `TALOSCONFIG`, and `SOPS_AGE_KEY_FILE` values in its own `env:` block, tasks behave identically whether or not the shell was entered through mise.

## Root Taskfile

`Taskfile.yaml` (Task schema v3, `set: [pipefail]`, `shopt: [globstar]`) defines directory vars (`BOOTSTRAP_DIR`, `KUBERNETES_DIR`, `SCRIPTS_DIR`, `TALOS_DIR`, `PRIVATE_DIR`) and includes three task namespaces:

- `bootstrap:` → `.taskfiles/bootstrap`
- `talos:` → `.taskfiles/talos`
- `volsync:` → `.taskfiles/volsync`

It also provides a root `task reconcile` that forces Flux to pull from Git (`flux --namespace flux-system reconcile kustomization flux-system --with-source`), with preconditions that the kubeconfig file exists and `flux` is on PATH.

## Bootstrap tasks (`.taskfiles/bootstrap/Taskfile.yaml`)

- **`task bootstrap:talos`** — full cluster bootstrap: generates and SOPS-encrypts `talsecret.sops.yaml` if absent (`talhelper gensecret | sops --encrypt`), runs `talhelper genconfig`, applies node configs insecurely via `talhelper gencommand apply --extra-flags="--insecure"`, then retries `talhelper gencommand bootstrap` and `gencommand kubeconfig` (writing kubeconfig to the repo root with `--force`) until they succeed. Preconditions: `.sops.yaml`, the age key file, `talos/talconfig.yaml`, and the `talhelper`/`talosctl`/`sops` binaries.
- **`task bootstrap:apps`** — runs `scripts/bootstrap-apps.sh`. Preconditions include a bash 4+ check on macOS (Homebrew bash path), the presence of the kubeconfig, `.sops.yaml`, the age key, and the script itself.

## Talos tasks (`.taskfiles/talos/Taskfile.yaml`)

Day-2 node management, all driven through `talhelper gencommand … | bash`:

- `generate-config` — regenerate Talos machine configs from `talconfig.yaml`.
- `apply-node [IP=…]` — apply config to one node (`MODE` defaults to `auto`).
- `upgrade-node [IP=…]` — upgrade a single node; the Talos image URL and version are read from `talconfig.yaml` / `talenv.yaml` via `yq`.
- `upgrade-k8s` — upgrade Kubernetes to the `.kubernetesVersion` in `talenv.yaml`.
- `reset` — destructive: resets nodes to maintenance mode (wiping STATE/EPHEMERAL labels unless `CLI_FORCE`), behind an interactive prompt.

Most tasks precondition on `talosctl` node reachability (`get machineconfig`), a valid `talosctl config info`, and the `TALOSCONFIG` file.

## Bootstrap script flow (`scripts/bootstrap-apps.sh`)

The script sources `scripts/lib/common.sh` (a colored, level-filtered `log` function where `error` writes to stderr and exits 1, plus `check_env` and `check_cli` guards), then runs five ordered steps in `main`:

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
    A[check_env KUBECONFIG TALOSCONFIG<br/>check_cli helmfile kubectl kustomize sops talhelper yq] --> B[wait_for_nodes<br/>all nodes Ready=False]
    B --> C[apply_namespaces<br/>one namespace per kubernetes/apps/* dir]
    C --> D[apply_sops_secrets<br/>github-deploy-key, cluster-secrets, sops-age]
    D --> E[apply_crds<br/>external-dns, gateway-api]
    E --> F[sync_helm_releases<br/>helmfile sync bootstrap/helmfile.yaml]
    F --> G[Flux syncs the Git repository]
```

1. **`wait_for_nodes`** — Talos requires nodes to be `Ready=False` before applying resources. If all nodes are already `Ready=True` the wait is skipped; otherwise the script polls `kubectl wait nodes --for=condition=Ready=False --all` every 10 seconds until it succeeds. This makes the script safe to re-run both before first boot and against a running cluster.
2. **`apply_namespaces`** — creates one namespace per directory under `kubernetes/apps/`, using `kubectl create --dry-run=client | kubectl apply --server-side` and skipping namespaces that already exist. These namespaces must exist before the SOPS secrets land.
3. **`apply_sops_secrets`** — decrypts and applies (server-side, into `flux-system`) three SOPS-encrypted files: `bootstrap/github-deploy-key.sops.yaml`, `kubernetes/components/common/sops/cluster-secrets.sops.yaml`, and `kubernetes/components/common/sops/sops-age.sops.yaml`. The SOPS age secret is what lets Flux decrypt everything else. Missing files are warned about and skipped; `sops exec-file … kubectl diff` short-circuits already-up-to-date secrets.
4. **`apply_crds`** — applies External DNS (`dnsendpoints.externaldns.k8s.io` v0.22.0) and Gateway API (experimental v1.6.2) CRDs server-side. Although Flux also manages these CRDs from GitRepositories, they are applied here for bootstrap safety: Cilium (installed next by helmfile) enables `gatewayAPI` and needs the CRDs to exist before it starts.
5. **`sync_helm_releases`** — `helmfile --file bootstrap/helmfile.yaml sync --hide-notes` installs the minimal set of releases (networking, cert-manager, SOPS, Flux prerequisites) that let Flux take over and sync the full `kubernetes/` tree from Git. Any failure aborts the script (the `log error` helper exits 1).

Because each step checks current state (`kubectl get`, `kubectl diff`) before applying, the whole script is idempotent and can be re-run to repair a partial bootstrap.

## VolSync tasks (`.taskfiles/volsync/Taskfile.yaml`)

Operational helpers for backup, restore, and wiping of application PVCs via VolSync Restic replication. They assume naming conventions documented at the top of the Taskfile: the Kustomization, HelmRelease, PVC, and ReplicationSource all share the app name; each ReplicationSource/Destination is a Restic repository; and each app replicates exactly one PVC.

- **`state-*`** (`suspend`/`resume`) — suspends or resumes the `volsync` Flux kustomization, HelmRelease, and deployment.
- **`unlock`** — patches every ReplicationSource cluster-wide with a `restic.unlock` field to clear stale Restic locks.
- **`snapshot [APP=…]`** — triggers a manual snapshot by patching `replicationsources/<app>` and waits for the `volsync-src-<app>` job to complete.
- **`list [APP=…]`** — renders `templates/list.tmpl.yaml` with `envsubst`, waits for the job, prints its logs, and deletes it.
- **`restore [APP=…]`** — full restore pipeline of internal tasks: `.suspend` (suspend Flux ks/hr, scale the controller to 0, wait for pod deletion) → `.wipe` (apply `templates/wipe.tmpl.yaml`, job `volsync-wipe-<app>`) → `.restore` (apply the ReplicationDestination template as `volsync-dst-<app>`, wait via `scripts/wait-for-rd.sh`) → `.resume` (resume Flux, scale back to 1, wait for pod readiness). App metadata (controller kind, claim name, mover PUID/PGID) is derived live from the existing ReplicationSource via `kubectl`/`scripts/which-controller.sh`.
- **`restore-alert`** — a specialized, Alertmanager-focused restore path for `kube-prometheus-stack` in `observability`.
- **`unlock-local`** — renders `resources/unlock.yaml.j2` with `minijinja-cli` to run an unlock job from the local machine, streaming logs with `stern`.

The restore template `.taskfiles/volsync/templates/replicationdestination.tmpl.yaml` creates a one-shot (`trigger.manual: restore-once`) Restic ReplicationDestination writing into `${claim}` on the `topolvm-thin-provisioner` storage class, restoring `${previous}` snapshots back (default 2), with `${restoreAsOf}` available (commented) to pin restoration to just before the old cluster was destroyed — important during full-cluster bootstrap so VolSync does not restore fresh default data over the backup.

Helper scripts live in `.taskfiles/volsync/scripts/`: `wait-for-job.sh`, `wait-for-rd.sh`, and `which-controller.sh`.

## Related pages

- `/openwiki/workflows/bootstrap.md` — the end-to-end bootstrap workflow these tasks implement.
- `/openwiki/concepts/talos-config.md` — Talos configuration and talhelper.
- `/openwiki/operations/daily-operations.md` — routine operations built on these tools.
- `/openwiki/quickstart.md` — first-time setup instructions.
