---
type: concept
title: App Conventions & Reusable Kustomize Components
description: Cross-cutting conventions for every app — the ks.yaml Kustomization pattern (commonMetadata, dependsOn, postBuild substitutes), the app-template HelmRelease layout — plus the catalog of kubernetes/components/ building blocks (common, gatus, volsync-new, image-automation) that apps attach via the components field.
tags: [kubernetes, flux, kustomize, components, helmrelease, app-template, volsync, gatus, image-automation, conventions]
sources:
  - id: openwiki-source-a2371d6362e5db4bc834ad03
    resource: repo://CLAUDE.md
  - id: openwiki-source-dbd8b5c09621dda4424792fd
    resource: repo://kubernetes/apps/default/gitea/app/helmrelease.yaml
  - id: openwiki-source-649e5ed74d5376f95cff2b2a
    resource: repo://kubernetes/apps/default/gitea/ks.yaml
  - id: openwiki-source-63c7de935f96b1aa0a5dc1a4
    resource: repo://kubernetes/components/common/kustomization.yaml
  - id: openwiki-source-fdbb4af8b5edac00a29199d6
    resource: repo://kubernetes/components/common/namespace.yaml
  - id: openwiki-source-0aa0479be229def909bbfa22
    resource: repo://kubernetes/components/common/repos/app-template/ocirepository.yaml
  - id: openwiki-source-d8126483419916725f75040b
    resource: repo://kubernetes/components/common/repos/kustomization.yaml
  - id: openwiki-source-dff47ef9008ba7bce93e217b
    resource: repo://kubernetes/components/common/sops/kustomization.yaml
  - id: openwiki-source-368438c04d5ff133eb1dfb71
    resource: repo://kubernetes/components/gatus/external-tailscale/config.yaml
  - id: openwiki-source-19cc4d5883bfca3fab22bd67
    resource: repo://kubernetes/components/gatus/external/config.yaml
  - id: openwiki-source-3ecfe771454a6bc6a446f83f
    resource: repo://kubernetes/components/gatus/external/kustomization.yaml
  - id: openwiki-source-a2a10e12c05dc77e43573bc3
    resource: repo://kubernetes/components/gatus/guarded/config.yaml
  - id: openwiki-source-98651905762c8e5a9b4da8ba
    resource: repo://kubernetes/components/image-automation/imagepolicy.yaml
  - id: openwiki-source-7d50b3fa30e8bcbde0dc183c
    resource: repo://kubernetes/components/image-automation/imagerepository.yaml
  - id: openwiki-source-967d9e45efe8409177c04aa4
    resource: repo://kubernetes/components/image-automation/README.md
  - id: openwiki-source-3f02d6aaa16b90ed2eba88ec
    resource: repo://kubernetes/components/image-automation/registry-externalsecret.yaml
  - id: openwiki-source-38c32ceedfcf925cff975177
    resource: repo://kubernetes/components/volsync-new/claim.yaml
  - id: openwiki-source-286accabe6659d8f9ce3fa94
    resource: repo://kubernetes/components/volsync-new/kustomization.yaml
  - id: openwiki-source-687f5a81f368e2f129b0b0d7
    resource: repo://kubernetes/components/volsync-new/minio.yaml
  - id: openwiki-source-cf127a322444d1f6306750c2
    resource: repo://kubernetes/components/volsync/kustomization.yaml
generated: { by: "openwiki/0.7.2", at: "2026-10-10T22:48:28.004Z" }
verified:
  - by: openwiki/0.7.2
    at: 2026-10-10T22:48:28.004Z
---

# App Conventions & Reusable Kustomize Components

This page documents two interlocking layers of the repo's app conventions:

1. **App conventions** — the uniform `ks.yaml` (Flux `Kustomization`) and `helmrelease.yaml` (`app-template` HelmRelease) pattern every app under `kubernetes/apps/<namespace>/<app>/` follows.
2. **Reusable Kustomize Components** — the optional `kind: Component` bundles under `kubernetes/components/` that apps attach for storage backups, uptime checks, image automation, or cluster-wide prerequisites.

## App conventions: the ks.yaml pattern

Every app is defined by a Flux `Kustomization` in `ks.yaml`. See `kubernetes/apps/default/gitea/ks.yaml` for a canonical example:

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: &app gitea
  namespace: &namespace default
spec:
  targetNamespace: *namespace
  commonMetadata:
    labels:
      app.kubernetes.io/name: *app
  components:
    - ../../../../components/volsync-new
    - ../../../../components/gatus/external
  dependsOn:
    - name: topolvm
      namespace: storage
    - name: external-secrets
      namespace: external-secrets
    - name: cloudnative-pg-cluster
      namespace: database
  decryption:
    provider: sops
    secretRef:
      name: sops-age
  path: ./kubernetes/apps/default/gitea/app
  sourceRef:
    kind: GitRepository
    name: flux-system
    namespace: flux-system
  prune: true
  wait: true
  interval: 1h
  retryInterval: 2m
  timeout: 5m
  postBuild:
    substituteFrom:
      - name: cluster-secrets
        kind: Secret
    substitute:
      APP: *app
      VOLSYNC_CAPACITY: 10Gi
```

Key conventions:

- **YAML anchors** (`&app`, `&namespace`) keep the app name and namespace defined once and reused (Kustomization name, `targetNamespace`, `commonMetadata` label, postBuild `APP` substitute).
- **`commonMetadata`** stamps `app.kubernetes.io/name: <app>` onto every resource the Kustomization builds, so label selectors and tooling work without repeating the label in each manifest.
- **`dependsOn`** declares ordering contracts on the cluster infra apps the app requires: `topolvm` (storage) before attaching `volsync-new`, `external-secrets` before any ExternalSecret syncs, and the database operator (e.g. `cloudnative-pg-cluster`) when the app uses it. Sub-apps (e.g. `gitea-runner`, defined in the same `ks.yaml` as a second Kustomization) repeat `dependsOn` independently and omit substitutes they don't need.
- **`decryption.provider: sops` with `secretRef: sops-age`** lets the Kustomization decrypt SOPS-encrypted manifests in the app directory.
- **`postBuild.substituteFrom`** always pulls the `cluster-secrets` Secret (providing `${SECRET_DOMAIN}`, `${TIMEZONE}`, etc.); **`postBuild.substitute`** adds per-app vars such as `APP` and `VOLSYNC_CAPACITY` that both the HelmRelease values and the attached components' templates consume.
- **Reconcile policy**: `prune: true`, `wait: true`, `interval: 1h`, `retryInterval: 2m`, `timeout: 5m` are used consistently.

## App conventions: the app-template HelmRelease

Inside the app directory (`app/helmrelease.yaml`) each workload is a Flux `HelmRelease` sourcing the shared [app-template](https://github.com/bjw-s-labs/helm-charts) chart via `chartRef.kind: OCIRepository, name: app-template` — the OCIRepository itself is declared once in `kubernetes/components/common/repos/app-template/` rather than per app. Typical install/upgrade policy: `install.remediation.retries: 3`, `upgrade.cleanupOnFail: true` with rollback strategy and 3 retries. Values follow app-template's controller/service/route/persistence schema; notable idioms seen in `gitea`:

- `reloader.stakater.com/auto: "true"` annotation to restart pods on ConfigMap/Secret change.
- Locked-down `securityContext` (non-root UID/GID 1000, dropped capabilities, read-only rootfs), `fsGroupChangePolicy: OnRootMismatch`, and a `supplementalGroups: [65536]` entry so the pod can read group-owned files (e.g. media).
- Gateway API `route` with `parentRefs` to the shared `internal`/`external` listeners in `kube-system`, hostnames templated as `"{{ .Release.Name }}.${SECRET_DOMAIN}"`.
- `persistence` mounted with `existingClaim: <app>` — the claim created by the `volsync-new` component — split into subPaths.
- Secrets referenced via `envFrom` (an anchor shared with init containers) and `${SECRET_DOMAIN}`-style placeholders resolved by postBuild substitution.
- Non-HTTP ingress is exposed with plain Services rather than routes: gitea defines an `ssh` LoadBalancer Service annotated `external-dns.alpha.kubernetes.io/hostname: "ssh.${SECRET_DOMAIN}"`, mapping port 22 to the container's SSH listen port 2222.

# Reusable Kustomize Components

Kustomize [Components](https://github.com/kubernetes-sigs/kustomize/blob/master/examples/components.md) (`kind: Component`, `apiVersion: kustomize.config.k8s.io/v1alpha1`) are optional resource bundles that a Flux `Kustomization` can opt into with a `spec.components:` list of relative paths. In this repo they live under `kubernetes/components/` and act as the shared "attachment points" that give an app storage backups, uptime checks, image automation, or cluster-wide prerequisites without duplicating manifests per app.

```mermaid
flowchart LR
    KS["App ks.yaml\n(Flux Kustomization)"] -->|components:| C["components/volsync-new"]
    KS -->|components:| G["components/gatus/external"]
    KS -->|components:| IA["components/image-automation"]
    KS -->|components:| CM["components/common"]
    C --> PVC["PVC ${APP}"]
    C --> RS["ReplicationSource + ReplicationDestination + ExternalSecret (MinIO restic)"]
    G --> EM["ConfigMap ${APP}-gatus-ep (label gatus.io/enabled=true)"]
    IA --> IR["ImageRepository / ImagePolicy / registry ExternalSecret"]
    CM --> NS["privileged Namespace + app-template OCIRepository"]
    CM --> SOPS["sops-age + cluster-secrets Secrets"]
```

## How components are referenced

An app's `ks.yaml` lists component paths relative to the app directory, e.g. in `kubernetes/apps/default/gitea/ks.yaml`:

```yaml
components:
  - ../../../../components/volsync-new
  - ../../../../components/gatus/external
```

The same Kustomization also sets `postBuild.substitute` variables (such as `APP: *app` and `VOLSYNC_CAPACITY: 10Gi`) which the component templates consume via `${APP}`, `${VOLSYNC_CAPACITY:-1Gi}`-style placeholders. Apps using image-automation (e.g. `epub-translator`, `fava`, `growth-tracker`) supply additional substitutes like `REGISTRY_URL`, `REGISTRY_HOST`, `NAMESPACE`, and `BW_ID`.

## common/ — cluster prerequisites

`kubernetes/components/common/kustomization.yaml` bundles three pieces:

- **namespace.yaml** — a `not-used` Namespace labeled `pod-security.kubernetes.io/enforce: privileged` and annotated `kustomize.toolkit.fluxcd.io/prune: disabled`. It exists only to establish cluster-wide privileged pod security enforcement early; Flux never prunes it.
- **repos/** — the [app-template](https://github.com/bjw-s-labs/helm-charts) OCIRepository (`oci://ghcr.io/bjw-s-labs/helm/app-template`, tag `5.2.1`, 1h interval, helm-chart layer selector), which most app HelmReleases source their chart from.
- **sops/** — SOPS-encrypted Secrets applied by the bootstrap: `sops-age` (the age private key Flux uses for `decryption.provider: sops`, `secretRef: sops-age` in every app Kustomization) and `cluster-secrets` (the Secret substituted via `substituteFrom` in ks.yaml, providing `${SECRET_DOMAIN}` and friends).

Because these resources are cluster-level prerequisites rather than per-app, `common/` is typically applied by the bootstrap/cluster Kustomization rather than attached per app.

## volsync-new/ — PVC + restic backup

`kubernetes/components/volsync-new/kustomization.yaml` (and its predecessor `volsync/`, same resource list) injects two files:

- **claim.yaml** — a PersistentVolumeClaim named `${APP}` with substitutable `VOLSYNC_ACCESSMODES` (default `ReadWriteOnce`), `VOLSYNC_CAPACITY` (default `1Gi`), and `VOLSYNC_STORAGECLASS` (default `topolvm-thin-provisioner`).
- **minio.yaml** — three objects that together implement backup and restore against MinIO over S3:
  - an **ExternalSecret** `${APP}-volsync` (ClusterSecretStore `bitwarden-login`) synthesizing a `${APP}-volsync-secret` containing `RESTIC_REPOSITORY` (`s3:http://192.168.50.220:9010/volsync/dev/${APP}`), `RESTIC_PASSWORD`, and MinIO credentials pulled from the `cold-minio` Bitwarden item;
  - a **ReplicationSource** running restic backups of `sourcePVC: ${APP}` every 6 hours (`0 */6 * * *`) with `copyMethod: Direct`, 7-day prune interval, retention of 24 hourly / 7 daily / 5 weekly snapshots, and mover UID/GID 1000;
  - a **ReplicationDestination** `volsync-dst-${APP}` with `trigger: manual: restore-once` for one-shot restores, with cache/capacity/snapshotclass all overridable via `VOLSYNC_*` variables.

Apps must therefore define `APP` (and usually `VOLSYNC_CAPACITY`) in `postBuild.substitute` before attaching this component.

## gatus/ — health-check injection

Each gatus variant is a Component whose `kustomization.yaml` uses a **configMapGenerator** named `${APP}-gatus-ep`, loading its `config.yaml` into a ConfigMap labeled `gatus.io/enabled: "true"` (name hash disabled). A cluster-scoped [Gatus deployment](observability.md) discovers and hot-reloads these ConfigMaps, so attaching the component to an app is all that is needed to get a check. Variants:

- **gatus/external** — HTTP endpoint check against `https://${GATUS_SUBDOMAIN:=${APP}}.${SECRET_DOMAIN}${GATUS_PATH:=/}` every 1m via DNS resolver `tcp://223.5.5.5:53`, expecting `${GATUS_STATUS:=200}`; group `external`.
- **gatus/external-tailscale** — same HTTP shape but group `tailscale` and a separate `GATUS_SUBDOMAIN_TAILSCALE` override for hostnames that only resolve inside the tailnet.
- **gatus/guarded** — a DNS A-record check of `${GATUS_SUBDOMAIN:=${APP}}.${SECRET_DOMAIN}` against `223.5.5.5` with UI hostname/URL hidden, useful behind auth guards where direct HTTP probes would hit a login page.

## image-automation/ — Flux Image Automation

`kubernetes/components/image-automation` (documented in its own README) injects three templated objects, all namespaced to `${NAMESPACE}`:

- **registry-externalsecret.yaml** — an ExternalSecret (`bitwarden-login` store, item key `${BW_ID}`) producing a `kubernetes.io/dockerconfigjson` Secret `${APP}-registry-secret` for `${REGISTRY_HOST}`.
- **imagerepository.yaml** — an ImageRepository scanning `${REGISTRY_URL}` every minute using that pull secret.
- **imagepolicy.yaml** — an ImagePolicy labeled `image-automation: enabled` that filters tags matching `^.+-[a-f0-9]+-(?P<ts>[0-9]+)$`, extracts the timestamp, and picks the numerically greatest — i.e. the newest `sha-<digest>-<timestamp>` tag. The label lets a single repo-wide ImageUpdateAutomation discover and update every app's policy.

Apps consume the result in their HelmRelease values via the marker `tag: "sha-xxx" # {"$imagepolicy": "NAMESPACE:APP:tag"}`.

## Usage summary

| Component | Attach when you need | Required substitutes |
| --- | --- | --- |
| `components/common` | Cluster bootstrap (namespace, app-template repo, SOPS keys) | — (applied centrally) |
| `components/volsync-new` | A PersistentVolumeClaim + scheduled restic backups/restores to MinIO | `APP` (plus optional `VOLSYNC_*`) |
| `components/gatus/external` | Public HTTPS uptime check | `APP`, `SECRET_DOMAIN` (via cluster-secrets) |
| `components/gatus/external-tailscale` | Tailnet-only HTTPS check | `APP` / `GATUS_SUBDOMAIN_TAILSCALE` |
| `components/gatus/guarded` | DNS reachability check behind an auth guard | `APP` |
| `components/image-automation` | Auto-deploy on new image pushes to your registry | `APP`, `NAMESPACE`, `REGISTRY_URL`, `REGISTRY_HOST`, `BW_ID` |

## Related pages

- [Flux GitOps](flux-gitops.md) — how Kustomizations, dependencies, and SOPS decryption fit the reconcile loop.
- [Observability](observability.md) — the Gatus instance consuming the generated ConfigMaps.
- [Storage](storage.md) — TopoLVM storage classes and VolSync backup/restore lifecycle.
