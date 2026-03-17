# VolSync Migration Tracker

Last updated: 2026-03-17

## Goal

Track application PVC migration to the shared `kubernetes/components/volsync` component.

Migration target:

- Stop using app-local `app/pvc.yaml`
- Stop using app-local `app/volsync.yaml`
- Keep the app data PVC managed through the shared VolSync component
- Standardize per-app settings in `ks.yaml` using `VOLSYNC_CAPACITY` and related substitutes

## Standard Migration Flow

Use this for homelab apps where downtime is acceptable.

1. Add a temporary `ReplicationSource` for the current PVC if the app is not already backed up by VolSync.
2. Wait until the first backup succeeds.
3. Scale the workload down or suspend the `HelmRelease`.
4. Delete the old live PVC.
5. Refactor the app to use `../../../../components/volsync`.
6. Remove app-local `pvc.yaml` and app-local `volsync.yaml` if they exist.
7. Reconcile Flux.
8. Wait for `ReplicationDestination` restore to complete.
9. Resume the app and verify the restored PVC and pod state.

## Status Legend

- `Done`: already migrated to shared VolSync and cleaned up
- `Partial`: shared VolSync is referenced, but old PVC manifest cleanup is incomplete
- `Pending`: still using old PVC pattern and should be migrated
- `Review`: needs manual review before migration
- `N/A`: not a VolSync migration target right now

## Done

| App | Namespace | Notes |
| --- | --- | --- |
| `openclaw` | `default` | Migrated on 2026-03-17. Shared VolSync enabled, old `pvc.yaml` and `volsync.yaml` removed, restore verified. |
| `cookiecloud` | `default` | Already on shared VolSync. |
| `gitea` | `default` | Already on shared VolSync. |
| `home-assistant` | `default` | Already on shared VolSync. |
| `jellyseerr` | `default` | Already on shared VolSync. |
| `lidarr` | `default` | Already on shared VolSync. |
| `linkwarden` | `default` | Already on shared VolSync. |
| `n8n` | `default` | Already on shared VolSync. |
| `navidrome` | `default` | Already on shared VolSync. |
| `openwebui` | `default` | Already on shared VolSync. |
| `paperless` | `default` | Already on shared VolSync. |
| `pgadmin` | `database` | Already on shared VolSync. |
| `playwright` | `default` | Already on shared VolSync. |
| `qbittorrent` | `default` | Already on shared VolSync. |
| `radarr` | `default` | Already on shared VolSync. |
| `recyclarr` | `default` | Already on shared VolSync. |
| `sonarr` | `default` | Already on shared VolSync. |
| `uptime-kuma` | `observability` | Already on shared VolSync. |
| `wallos` | `default` | Already on shared VolSync. |

## Partial

These apps already reference the shared VolSync component, but still keep an app-local `pvc.yaml`. They should be cleaned up next.

| Priority | App | Namespace | Current State | Notes |
| --- | --- | --- | --- | --- |
| P1 | `calibre-web-automated` | `default` | `components/volsync` + `app/pvc.yaml` | Primary data PVC looks migratable. Also uses `calibre-web-automated-nfs`, which is separate. |
| P1 | `jellyfin` | `default` | `components/volsync` + `app/pvc.yaml` | Has additional claims such as `jellyfin-cache` and `nas-media`; migrate only the app data PVC. |
| P1 | `nextcloud` | `storage` | `components/volsync` + `app/pvc.yaml` | Also mounts `nextcloud-nfs`; requires care to migrate only the app data PVC. |
| P2 | `ollama` | `default` | `components/volsync` + `app/pvc.yaml` | `ks.yaml` currently comments out `volsync-new` and only keeps `gatus`; treat as not fully standardized yet. |

## Pending

These apps still use old PVC patterns and are good candidates for direct migration.

| Priority | App | Namespace | Current State | Notes |
| --- | --- | --- | --- | --- |
| P1 | `opencode` | `default` | `existingClaim` + app-local `pvc.yaml` | Best next candidate. Shape is very close to Openclaw. |
| P1 | `webtop` | `default` | `existingClaim` + app-local `pvc.yaml` | Straightforward single-app PVC migration. |
| P1 | `x-likes` | `default` | `existingClaim` + app-local `pvc.yaml` | Straightforward single-app PVC migration. |
| P1 | `gatus` | `observability` | `existingClaim` + app-local `pvc.yaml` | Stateful app, but migration pattern is still simple. |
| P2 | `yt-audio` | `default` | `existingClaim` + multiple app-local PVCs | Uses both `yt-audio` and `yt-audio-media`; needs decision on which PVC should be backed up by VolSync. |
| P2 | `paper` | `default` | `existingClaim` + app-local `pvc.yaml` | Also uses `paper-cache` and NFS mounts; needs scope split before migration. |

## Review

These apps need a manual decision before standardizing.

| App | Namespace | Why Review Is Needed |
| --- | --- | --- |
| `prowlarr` | `default` | Uses `components/volsync-new` rather than the standard shared `components/volsync`. Decide whether to leave as-is or normalize. |
| `rsshub` | `default` | `existingClaim` appears only in commented config. Likely not using a PVC currently. |
| `atuin` | `default` | References shared VolSync in `ks.yaml`, but the main persistence in `helmrelease.yaml` is `emptyDir`. Verify whether VolSync is actually needed. |

## N/A

These scanned apps do not currently look like VolSync migration targets.

- `cert-manager`
- `cloudnative-pg`
- `dragonfly`
- `echo`
- `miniflux`
- `nas-media`
- `bitwarden-connect`
- `external-secrets`
- `external-server`
- `flux-instance`
- `flux-operator`
- `cilium`
- `coredns`
- `intel-device-plugin-operator`
- `metrics-server`
- `node-feature-discovery`
- `reloader`
- `system-upgrade`
- `adguard-dns`
- `cloudflare-dns`
- `cloudflare-tunnel`
- `k8s-gateway`
- `smtp-relay`
- `tailscale`
- `grafana`
- `kromgo`
- `kube-prometheus-stack`
- `loki`
- `prometheus-operator`
- `promtail`
- `smartctl-exporter`
- `thanos`
- `csi-driver-nfs`
- `local-path-provisioner`
- `snapshot-controller`
- `topolvm`
- `volsync`

## Recommended Next Order

1. `calibre-web-automated`
2. `jellyfin`
3. `nextcloud`
4. `opencode`
5. `webtop`
6. `x-likes`
7. `gatus`
8. `yt-audio`
9. `paper`
10. `prowlarr`

## Per-App Checklist Template

Copy this block when starting a migration.

```md
### APP_NAME

- [ ] Confirm current PVC name(s)
- [ ] Confirm which PVCs should be backed up by VolSync
- [ ] Add temporary backup path if no VolSync backup exists yet
- [ ] Wait for first successful backup
- [ ] Scale workload down or suspend HelmRelease
- [ ] Delete old PVC
- [ ] Add shared `components/volsync` in `ks.yaml`
- [ ] Set `VOLSYNC_CAPACITY`
- [ ] Remove app-local `pvc.yaml`
- [ ] Remove app-local `volsync.yaml` if present
- [ ] Reconcile `cluster-apps`
- [ ] Reconcile app `Kustomization`
- [ ] Wait for `ReplicationDestination` restore success
- [ ] Resume app
- [ ] Verify new PVC is `Bound`
- [ ] Verify pods are `Running`
- [ ] Verify restored data exists in-container
```
