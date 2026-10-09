---
type: operations workflow
title: VolSync PVC Migration Workflow
description: In-flight migration of app PVCs from app-local pvc.yaml/volsync.yaml manifests to the shared kubernetes/components/volsync component, including the 9-step standard flow, status tracking, and per-app caveats.
tags: [volsync, pvc, migration, flux, kustomize-components, backup-restore]
sources:
  - id: openwiki-source-ab04cad2d509128f85736a9f
    resource: repo://.taskfiles/volsync/Taskfile.yaml
  - id: openwiki-source-0e996dcef7180d2fe4f95073
    resource: repo://docs/volsync-migration-tracker.md
  - id: openwiki-source-1aae7397c6e85667daa3d8fd
    resource: repo://kubernetes/apps/default/calibre-web-automated/app/pvc.yaml
  - id: openwiki-source-fdfdc0b9e118440e8a32e249
    resource: repo://kubernetes/apps/default/calibre-web-automated/ks.yaml
  - id: openwiki-source-9714f6817a565437eece9b5a
    resource: repo://kubernetes/apps/default/jellyfin/app/pvc.yaml
  - id: openwiki-source-dab2a819a5e570335c6a1129
    resource: repo://kubernetes/apps/default/jellyfin/ks.yaml
  - id: openwiki-source-4e01f8b41df6d89a26a09c3d
    resource: repo://kubernetes/apps/default/omnifocus-sync-server/ks.yaml
  - id: openwiki-source-e95595d2628cbf879f2ed03b
    resource: repo://kubernetes/apps/default/openclaw/ks.yaml
  - id: openwiki-source-65052e299a5ecfdd351ef1b1
    resource: repo://kubernetes/apps/default/paper/app/pvc.yaml
  - id: openwiki-source-4acde77a5f068b3a1578e66d
    resource: repo://kubernetes/apps/default/paper/ks.yaml
  - id: openwiki-source-0a0d6ff2e6b1affc5f873f6e
    resource: repo://kubernetes/apps/default/prowlarr/ks.yaml
  - id: openwiki-source-1f98b6496fda7ac68578cfce
    resource: repo://kubernetes/apps/default/webtop/app/pvc.yaml
  - id: openwiki-source-0a85d9fc2cfccac218382132
    resource: repo://kubernetes/apps/default/webtop/ks.yaml
  - id: openwiki-source-4789fcfab7de510861f96052
    resource: repo://kubernetes/apps/observability/gatus/ks.yaml
  - id: openwiki-source-2f52aa47c6ce5a20f6ed3a8d
    resource: repo://kubernetes/apps/storage/nextcloud/app/volsync-nfs.yaml
  - id: openwiki-source-bc7bb05cf9b54470152ecdca
    resource: repo://kubernetes/apps/storage/nextcloud/ks.yaml
  - id: openwiki-source-710f7608ef2681013d8705c7
    resource: repo://kubernetes/apps/storage/volsync/app/helmrelease.yaml
  - id: openwiki-source-e8e3b6391a058eac1aa3950b
    resource: repo://kubernetes/apps/storage/volsync/app/snapshot-cleanup-cronjob.yaml
  - id: openwiki-source-38c32ceedfcf925cff975177
    resource: repo://kubernetes/components/volsync-new/claim.yaml
  - id: openwiki-source-286accabe6659d8f9ce3fa94
    resource: repo://kubernetes/components/volsync-new/kustomization.yaml
  - id: openwiki-source-687f5a81f368e2f129b0b0d7
    resource: repo://kubernetes/components/volsync-new/minio.yaml
  - id: openwiki-source-a5d3d336aaacc62e6680c65d
    resource: repo://kubernetes/components/volsync/claim.yaml
  - id: openwiki-source-cf127a322444d1f6306750c2
    resource: repo://kubernetes/components/volsync/kustomization.yaml
  - id: openwiki-source-e77f449e947f9b25cfc86044
    resource: repo://kubernetes/components/volsync/minio.yaml
generated: { by: "openwiki/0.7.1", at: "2026-10-08T23:50:46.668Z" }
verified:
  - by: openwiki/0.7.1
    at: 2026-10-08T23:50:46.668Z
---

# VolSync PVC Migration Workflow

The cluster is migrating application data PVCs from per-app manifests (`app/pvc.yaml` plus optional app-local `app/volsync.yaml`) to the shared [Kustomize component](https://github.com/kubernetes-sigs/kustomize/blob/master/examples/components.md) at `kubernetes/components/volsync`. The shared component owns the whole VolSync lifecycle for an app: a restic-backed `ReplicationSource` (backup), a `ReplicationDestination` that restores into a freshly provisioned PVC, and an `ExternalSecret` supplying MinIO/S3 restic credentials.

Progress is tracked in `docs/volsync-migration-tracker.md` with status buckets `Done`, `Partial`, `Pending`, `Review`, and `N/A`.

## The shared VolSync component

`kubernetes/components/volsync/kustomization.yaml` declares a component with two resources:

- **`claim.yaml`** — creates a PVC named `${APP}` whose `dataSourceRef` points at the `ReplicationDestination` named `volsync-dst-${APP}`. Size, access mode, and storage class come from `VOLSYNC_CAPACITY` (default `1Gi`), `VOLSYNC_ACCESSMODES` (default `ReadWriteOnce`), and `VOLSYNC_STORAGECLASS` (default `topolvm-thin-provisioner`).
- **`minio.yaml`** — creates:
  - an `ExternalSecret` `${APP}-volsync` → `${APP}-volsync-secret`, pulling the restic password from the `volsync-minio-template` Bitwarden key and MinIO credentials from `cold-minio`; the templated `RESTIC_REPOSITORY` is `s3:http://192.168.50.220:9010/volsync/dev/${APP}` (MinIO-backed);
  - a `ReplicationSource` named `${APP}` backing up `sourcePVC: ${APP}` on a `0 */6 * * *` schedule, restic `copyMethod: Direct`, `pruneIntervalDays: 7`, cache via `VOLSYNC_CACHE_CAPACITY` (default `1Gi`) on `local-path`, retention `hourly: 24 / daily: 7 / weekly: 5`, and a mover security context defaulting to UID/GID 1000;
  - a `ReplicationDestination` `volsync-dst-${APP}` with `trigger: manual: restore-once`, `cleanupTempPVC`/`cleanupCachePVC`/`enableFileDeletion: true`, and defaults `VOLSYNC_COPYMETHOD: Snapshot`, `VOLSYNC_CACHE_CAPACITY: 1Gi`, `VOLSYNC_CACHE_SNAPSHOTCLASS: local-path`, `VOLSYNC_SNAPSHOTCLASS: topolvm-thin-provisioner`; its mover runs as `APP_UID`/`APP_GID` (default 1000, overridable per app).

Apps opt in by adding `../../../../components/volsync` to `components:` in their `ks.yaml` and setting substitutes such as `APP` and `VOLSYNC_CAPACITY` (see `kubernetes/apps/default/openclaw/ks.yaml` for a migrated reference: `VOLSYNC_CAPACITY: 20Gi`, `VOLSYNC_CACHE_CAPACITY: 10Gi`).

### The `volsync-new` variant is not a drop-in copy

A parallel component `kubernetes/components/volsync-new` exists (`claim.yaml`, `minio.yaml`, plus a commented-out `r2.yaml`) and is referenced by `gitea`, `linkwarden`, `playwright`, `pgadmin`, `epub-translator`, and `prowlarr`. It is **not** identical to `components/volsync`:

- its `claim.yaml` has **no** `dataSourceRef`, so a PVC it creates is **not** seeded from the `volsync-dst-${APP}` restore — an app migrated onto `volsync-new` with its old PVC deleted would come up with an empty volume;
- its `ReplicationSource` lacks the source-side `cacheCapacity`/`cacheStorageClassName` settings present in `components/volsync`.

The tracker's `Review` entry for `prowlarr` captures the open question of normalizing `volsync-new` back to the standard component; because of the missing `dataSourceRef`, any such normalization changes restore semantics, not just file layout.

## Standard migration flow (9 steps)

Use this for homelab apps where downtime is acceptable. The key safety property is that a restic backup must exist (step 2) before the live PVC is deleted (step 4); the new PVC is then hydrated from the `ReplicationDestination` restore — which is why apps must use `components/volsync` (with `dataSourceRef`), not `volsync-new`, for the migration cut-over.

```mermaid
sequenceDiagram
    participant Op as Operator
    participant Flux as Flux
    participant VS as VolSync
    participant MinIO as MinIO restic repo

    Op->>Flux: 1. Add temporary ReplicationSource for current PVC
    VS->>MinIO: 2. First restic backup succeeds
    Op->>Flux: 3. Scale workload down / suspend HelmRelease
    Op->>Flux: 4. Delete old live PVC
    Op->>Flux: 5. Refactor ks.yaml to use components/volsync
    Op->>Op: 6. Remove app-local pvc.yaml and volsync.yaml
    Flux->>VS: 7. Reconcile (component renders claim + RS + RD)
    VS->>MinIO: 8. ReplicationDestination restores into new PVC
    Op->>Op: 9. Resume app, verify PVC Bound and data intact
```

Caption: the standard low-risk migration: back up first, tear down, rebuild via the shared component, then restore and verify.

Concretely:

1. Add a temporary `ReplicationSource` for the current PVC if the app is not already backed up by VolSync.
2. Wait until the first backup succeeds.
3. Scale the workload down or suspend the `HelmRelease`.
4. Delete the old live PVC.
5. Refactor the app to use `../../../../components/volsync` in `ks.yaml`.
6. Remove app-local `pvc.yaml` and app-local `volsync.yaml` if they exist.
7. Reconcile Flux (`cluster-apps` Kustomization, then the app Kustomization).
8. Wait for the `ReplicationDestination` restore to complete (its trigger is manual `restore-once`).
9. Resume the app and verify the restored PVC is `Bound`, pods are `Running`, and data exists in-container.

The tracker's "Per-App Checklist Template" reproduces this as a per-app checkbox block; copy it when starting a migration.

## Status tracking and current inventory

`docs/volsync-migration-tracker.md` (last updated 2026-03-17) is the source of truth for progress. Summary of where work stands, cross-checked against the current repository:

### Done

Apps already on shared VolSync with old manifests removed: `openclaw` (migrated 2026-03-17, restore verified) plus `cookiecloud`, `home-assistant`, `jellyseerr`, `lidarr`, `n8n`, `navidrome`, `openwebui`, `paperless`, `qbittorrent`, `radarr`, `recyclarr`, `sonarr`, `uptime-kuma`, `wallos`, and `omnifocus-sync-server` (present in the repo but not yet listed in the tracker). Note that several "Done" apps reference `components/volsync-new` rather than `components/volsync` in current `ks.yaml` files (e.g. `gitea`, `linkwarden`, `playwright`, `pgadmin`, `epub-translator`) — a normalization question to resolve alongside `prowlarr`.

### Partial — shared component referenced, app-local pvc.yaml still present

| App | Namespace | Caveat |
| --- | --- | --- |
| `calibre-web-automated` | `default` | `ks.yaml` has `components/volsync` + `VOLSYNC_CAPACITY: 20Gi`, but `app/pvc.yaml` still defines the `calibre-web-automated-nfs` claim — that NFS-adjacent claim is separate and must not be deleted blindly. |
| `jellyfin` | `default` | `ks.yaml` uses `components/volsync` (`VOLSYNC_CAPACITY: 10Gi`) and `helmrelease.yaml` mounts `existingClaim: jellyfin` at `/config`, but `app/pvc.yaml` still defines `jellyfin-cache` (50Gi, mounted at `/config/metadata`), and `/media` mounts the shared `nas-media` claim read-only. Migrate only the `jellyfin` app-data PVC; leave `jellyfin-cache` and `nas-media` alone. |
| `nextcloud` | `storage` | `ks.yaml` references `components/volsync`, but `app/pvc.yaml` still exists and `app/volsync-nfs.yaml` keeps a standalone `ReplicationSource` backing up the separate `nextcloud-nfs` PVC to its own MinIO repository (`volsync/dev/nextcloud-nfs`, 6-hourly, 2Gi local-path cache, same retention). Only the app data PVC moves to the component; the NFS mount stays as-is. |

The tracker also lists `ollama` as Partial (with a note that its `ks.yaml` comments out `volsync-new`), but the `kubernetes/apps/default/ollama` directory no longer exists; the tracker has drifted and should be pruned on the next pass.

### Pending — still on the old pattern

- `webtop` (`default`) — `app/pvc.yaml` defines a 30Gi `webtop` claim; `ks.yaml` has **no** `components/volsync` yet. Straightforward single-PVC migration.
- `gatus` (`observability`) — `ks.yaml` has no VolSync component; `app/pvc.yaml` defines the data claim.
- `paper` (`default`) — `ks.yaml` already sets `VOLSYNC_CAPACITY: 10Gi` (as a leftover substitute) but does not include any VolSync component; `app/pvc.yaml` defines both `paper` (10Gi) and `paper-cache` (50Gi), so the scope must be split before migrating.

The tracker also lists `opencode` and `yt-audio` as Pending candidates, but those app directories no longer exist under `kubernetes/apps/default`; prune them on the next pass. Its "Recommended Next Order" starts with `calibre-web-automated`, `jellyfin`, `nextcloud`, then `opencode`/`webtop`/`gatus`.

### Review / N/A

- `prowlarr` uses `components/volsync-new`; decide whether to normalize (see the variant differences above).
- `rsshub` has `existingClaim` only in commented config — likely no PVC in use.
- `atuin` references shared VolSync in `ks.yaml` but main persistence is `emptyDir`; verify VolSync is actually needed.
- Non-stateful and infrastructure apps (cert-manager, cloudnative-pg, dragonfly, csi-driver-nfs, volsync itself, etc.) are marked N/A.

## Backup/restore semantics and operational notes

- **Backups**: the component's `ReplicationSource` restic-snapshots `${APP}` every 6 hours to `s3:http://192.168.50.220:9010/volsync/dev/${APP}` (MinIO) with credentials from External Secrets (Bitwarden `volsync-minio-template` + `cold-minio`). Restic pruning runs every 7 days; retention is 24 hourly / 7 daily / 5 weekly.
- **Restore-once lifecycle**: the new PVC from `claim.yaml` seeds itself via `dataSourceRef` → `volsync-dst-${APP}`, whose manual `restore-once` trigger means Flux applies it once per manifest change. The destination's mover runs as `APP_UID`/`APP_GID` (default 1000) — set these substitutes for apps with different UIDs.
- **Snapshot cleanup**: `kubernetes/apps/storage/volsync/app/snapshot-cleanup-cronjob.yaml` runs a weekly CronJob (Sundays 02:00, `storage` namespace) that deletes `VolumeSnapshots` across all namespaces whose names match `volsync-volsync-dst-` and whose age exceeds 7 days (`THRESHOLD_DAYS`), using kubectl as non-root with a locked-down security context. This garbage-collects destination snapshots VolSync leaves behind after copy-method snapshot restores.
- **Cluster prerequisites**: app `ks.yaml` files `dependsOn` the `topolvm` HelmRelease in `storage` because the component defaults to `topolvm-thin-provisioner` storage/snapshot classes; the VolSync operator itself is deployed in `storage` (`manageCRDs: true`, metrics auth disabled).
- **Imperative tooling**: `.taskfiles/volsync/Taskfile.yaml` provides day-2 tasks that assume the Fluxtomization, HelmRelease, PVC, `ReplicationSource`, and `ReplicationDestination` all share the app name and each app replicates exactly one PVC: `snapshot` triggers a manual `ReplicationSource` backup, `list` shows restic snapshots, `restore` suspends Flux/the workload (`flux suspend kustomization`/`helmrelease`, scale to 0), wipes the PVC via a `volsync-wipe-<app>` job, restores through a temporary `volsync-dst-<app>` `ReplicationDestination` (defaulting to the 2nd-previous snapshot), then resumes everything; `unlock`/`unlock-local` patch restic repos to clear stale locks. These complement the declarative migration flow but operate on the same CRs.

## Related pages

- `/openwiki/architecture/component-library.md` — how Flux Kustomize components are composed.
- `/openwiki/concepts/storage.md` — TopoLVM, NFS claims, storage classes.
- `/openwiki/operations/volsync-ops.md` — day-2 VolSync operations (snapshot, restore, unlock).
- `/openwiki/operations/daily-operations.md` — reconciling Flux.
- `/openwiki/workflows/app-deployment.md` — general app scaffolding.
