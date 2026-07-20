---
type: Operations runbook
title: Daily Operations & Procedures
description: Common operational tasks for cluster maintenance, troubleshooting, OpenWiki updates, and day-to-day procedures.
tags: [operations, runbook, maintenance, troubleshooting]
---

# Daily Operations & Procedures

Common operational tasks for cluster maintenance and troubleshooting.

## Automation Workflows

### OpenWiki Documentation Updates

The repository uses an automated GitHub Actions workflow (`openwiki-update.yml`) to keep documentation current:

- **Schedule**: Runs daily at 19:30 UTC (cron: `30 19 * * *`)
- **Trigger**: Also available via manual workflow_dispatch
- **Provider**: Anthropic-compatible API (BigModel) with `glm-4.7` model
- **Behavior**: Commits and pushes changes directly to the repository
- **Permissions**: Requires `contents: write` for direct commits

The workflow automatically updates:
- `openwiki/` directory (generated documentation)
- `AGENTS.md` and `CLAUDE.md` (agent instructions, if they exist)
- `.github/workflows/openwiki-update.yml` (self-updates if workflow changes affect docs)

To run manually:
1. Navigate to Actions → OpenWiki Update
2. Click "Run workflow"
3. Check the commit history for documentation changes

### Renovate Dependency Updates

Renovate handles automated dependency updates for:
- Container images (Helm releases, deployments)
- Helm charts and OCI repositories
- GitHub releases and Actions
- mise toolchain versions

Configuration: `.renovaterc.json5`
- **Schedule**: Weekends only
- **Auto-merge**: Patch updates and mise/GHA minor updates
- **Custom tracking**: Use `# renovate:` comments for custom datasources

Review Renovate PRs regularly to ensure updates are compatible with your cluster configuration.

## Flux Operations

### Force Reconciliation

When you need Flux to immediately pull changes from git:

```bash
task reconcile
```

This forces the `flux-system` Kustomization to reconcile, which cascades to all downstream Kustomizations.

**Equivalent command**:
```bash
flux --namespace flux-system reconcile kustomization flux-system --with-source
```

### Check Flux Status

```bash
flux get sources all
flux get kustomizations --all-namespaces
```

### Check Reconciliation Errors

```bash
flux --namespace flux-system logs kustomization flux-system --tail 50
```

Or check specific namespace Kustomizations:
```bash
flux --namespace default logs kustomization default --tail 50
```

### Suspended Resources

To temporarily stop reconciliation for a resource:

```bash
flux suspend kustomization cluster-apps
flux resume kustomization cluster-apps
```

Use this during maintenance to prevent automatic reconciliation.

## Talos Operations

### Generate Configuration

When you modify `talos/talconfig.yaml` or `talos/talenv.yaml`:

```bash
task talos:generate-config
```

This runs `talhelper genconfig` and regenerates machine configs in `talos/clusterconfig/`.

**Do not edit files in `talos/clusterconfig/` directly** - they will be overwritten.

### Apply Configuration to a Node

To apply updated Talos configuration to a specific node:

```bash
task talos:apply-node IP=192.168.50.145
```

This applies the machine config without rebooting (most changes).

### Upgrade Talos OS

To upgrade Talos on a single node:

```bash
task talos:upgrade-node IP=192.168.50.145
```

This performs a rolling upgrade with minimal disruption.

### Upgrade Kubernetes

To upgrade Kubernetes to the version in `talos/talenv.yaml`:

```bash
task talos:upgrade-k8s
```

This upgrades Kubernetes cluster-wide by applying updated kubelet configs to all nodes.

### Reset the Cluster

**DANGER**: This destroys all cluster state and requires full bootstrap.

```bash
task talos:reset
```

Only use this for complete cluster rebuilds.

### View Talos Logs

```bash
talosctl --nodes 192.168.50.145 logs
```

For specific services:
```bash
talosctl --nodes 192.168.50.145 services kubelet
```

## Application Operations

### Add a New Application

1. Create the directory structure:
   ```bash
   mkdir -p kubernetes/apps/default/my-app/app
   ```

2. Create `ks.yaml` (Flux Kustomization):
   ```yaml
   apiVersion: kustomize.toolkit.fluxcd.io/v1
   kind: Kustomization
   metadata:
     name: my-app
     namespace: flux-system
   spec:
     interval: 30m
     path: ./kubernetes/apps/default/my-app
     prune: true
     sourceRef:
       kind: GitRepository
       name: flux-system
     dependsOn:
       - name: default
       namespace: flux-system
   ```

3. Create `app/helmrelease.yaml`:
   ```yaml
   apiVersion: helm.toolkit.fluxcd.io/v2
   kind: HelmRelease
   metadata:
     name: my-app
     namespace: default
   spec:
     chartRef:
       kind: OCIRepository
       name: app-template
     values:
       # Your app values here
   ```

4. Create `app/kustomization.yaml`:
   ```yaml
   apiVersion: kustomize.config.k8s.io/v1beta1
   kind: Kustomization
   resources:
     - ./helmrelease.yaml
   ```

5. Add to namespace Kustomization (`kubernetes/apps/default/kustomization.yaml`):
   ```yaml
   - ./my-app
   ```

6. Commit and push. Flux will reconcile within 1 hour (or use `task reconcile`).

### Update Application Values

Edit the `helmrelease.yaml` or values files and commit. Flux will detect the change and update the Helm release.

For immediate reconciliation:
```bash
task reconcile
```

### Debug HelmRelease Failures

```bash
flux --namespace default get helmreleases
flux --namespace default logs helmrelease my-app --tail 50
```

Check Helm revision history:
```bash
helm --namespace default history my-app
```

### Rollback an Application

```bash
helm --namespace default rollback my-app <revision>
```

Or edit `helmrelease.yaml` to revert values and commit.

## Storage Operations

### VolSync Backups

Trigger a manual backup:

```bash
task volsync:snapshot APP=my-app NS=default
```

Restore from backup:

```bash
task volsync:restore APP=my-app NS=default
```

List available snapshots:

```bash
task volsync:list APP=my-app NS=default
```

### Check PVC Status

```bash
kubectl get pvc -A
kubectl describe pvc my-pvc -n my-namespace
```

### Resize PVC

1. Update `pvc.yaml` with new `spec.resources.requests.storage`
2. Commit and push
3. Flux updates the PVC
4. TopoLVM automatically expands the underlying LVM volume

**Note**: Most filesystems (ext4, xfs) support online expansion.

### Restore from Snapshot

1. Create a new PVC from the snapshot:
   ```yaml
   apiVersion: v1
   kind: PersistentVolumeClaim
   metadata:
     name: my-app-restored
   spec:
     dataSource:
       kind: VolumeSnapshot
       name: my-app-snapshot
     storageClassName: topolvm-provisioner
     accessModes:
       - ReadWriteOnce
     resources:
       requests:
         storage: 10Gi
   ```

2. Create a temporary pod to mount and verify data

## Secret Operations

### Encrypt a Secret with SOPS

For Kubernetes secrets (data/stringData only):

```bash
sops --encrypt --kms 'arn:aws:kms:...' --encrypted-regex '^(data|stringData)$' secret.yaml > secret.sops.yaml
```

For this cluster using age:

```bash
sops --encrypt --age $(cat age.pubkey) --encrypted-regex '^(data|stringData)$' secret.yaml > secret.sops.yaml
```

For Talos secrets (whole file):

```bash
sops --encrypt --age $(cat age.pubkey) talos/secret.yaml
```

### Decrypt a Secret

```bash
sops --decrypt secret.sops.yaml > secret.yaml
```

Or edit in place:
```bash
sops secret.sops.yaml
```

### Rotate Age Key

1. Generate new key:
   ```bash
   age-keygen -o age-new.key
   ```

2. Update `.sops.yaml` with new public key

3. Re-encrypt all secrets:
   ```bash
   find . -name '*.sops.yaml' -exec sops --encrypt --age $(cat age-new.pubkey) {} \;
   ```

4. Update `flux-system/sops-age` Secret with new private key

5. Update local `age.key`

## Troubleshooting

### Pod Not Starting

1. Check pod status:
   ```bash
   kubectl describe pod my-app -n default
   ```

2. Check logs:
   ```bash
   kubectl logs my-app -n default
   kubectl logs my-app -n default --previous  # If crashed
   ```

3. Check events:
   ```bash
   kubectl get events -n default --sort-by='.lastTimestamp'
   ```

### Image Pull Errors

If you see `ImagePullBackOff` or `ErrImagePull`:

1. Check if image exists:
   ```bash
   crane tag ghcr.io/example/my-app
   ```

2. Check if registry is accessible from cluster:
   ```bash
   kubectl run debug --image=curlimages/curl --rm -it --restart=Never -- curl -v https://ghcr.io/v2/
   ```

3. Check imagePullSecrets if using private registry

### DNS Resolution Issues

1. Check CoreDNS pods:
   ```bash
   kubectl get pods -n kube-system -l k8s-app=kube-dns
   kubectl logs -n kube-system -l k8s-app=kube-dns
   ```

2. Test from a pod:
   ```bash
   kubectl run debug --image=busybox --rm -it --restart=Never -- nslookup kubernetes.default.svc.cluster.local
   ```

3. Check Cilium DNS forwarding:
   ```bash
   cilium status
   ```

### Network Connectivity

1. Check Cilium status:
   ```bash
   cilium status
   ```

2. Check Cilium network policies:
   ```bash
   kubectl get cnp --all-namespaces
   ```

3. Check Gateway API routes:
   ```bash
   kubectl get httproute -A
   kubectl get gateway -n kube-system
   ```

4. Test connectivity:
   ```bash
   kubectl run debug --image=busybox --rm -it --restart=Never -- wget -O- http://service-name:port
   ```

### Resource Exhaustion

Check node resources:
```bash
kubectl top nodes
kubectl top pods -A
```

Check resource quotas/limits:
```bash
kubectl describe node master0-nuc12 | grep -A 5 "Allocated resources"
```

### High Memory/Pressure

Check kubelet eviction thresholds:
```bash
kubectl describe node master0-nuc12 | grep -A 10 "Memory Pressure"
```

Review TopoLVM metrics:
```bash
kubectl get topolvmnode -A
```

## Maintenance Mode

### Before Maintenance

1. Suspend Flux:
   ```bash
   flux suspend kustomization cluster-apps
   ```

2. Scale down non-critical apps:
   ```bash
   kubectl scale deployment my-app --replicas=0 -n default
   ```

### After Maintenance

1. Resume Flux:
   ```bash
   flux resume kustomization cluster-apps
   ```

2. Scale up apps:
   ```bash
   kubectl scale deployment my-app --replicas=1 -n default
   ```

3. Verify health:
   ```bash
   flux get kustomizations --all-namespaces
   kubectl get pods -A
   ```

## Emergency Procedures

### Cluster Not Recovering

If the cluster is completely unresponsive:

1. Check Talos API access:
   ```bash
   talosctl --nodes 192.168.50.145 version
   ```

2. Check machine config health:
   ```bash
   talosctl --nodes 192.168.50.145 get mc
   ```

3. Check control plane components:
   ```bash
   talosctl --nodes 192.168.50.145 services
   ```

4. If necessary, re-apply machine config:
   ```bash
   task talos:apply-node IP=192.168.50.145
   ```

### Recover from Backup

If critical data is lost:

1. Identify VolSync snapshots:
   ```bash
   task volsync:list APP=my-app NS=default
   ```

2. Restore from snapshot:
   ```bash
   task volsync:restore APP=my-app NS=default
   ```

3. Verify restored data

### Worst Case: Rebootstrap

If the cluster needs complete rebuild:

1. **Backup VolSync snapshots** (they're in MinIO, outside the cluster)
2. **Backup git repository**
3. **Reset cluster**: `task talos:reset`
4. **Rebootstrap**:
   ```bash
   task bootstrap:talos
   task bootstrap:apps
   ```
5. **Restore applications** from VolSync snapshots

This is a destructive process. Ensure all important data has backups before proceeding.
