---
type: Operations runbook
title: Daily Tasks Reference
description: Quick reference for routine operational tasks including checking cluster status, reconciling Flux resources, applying Talos configs, managing nodes, working with VolSync backups, and accessing logs.
tags: [operations, runbook, maintenance, troubleshooting]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-01T21:54:26.927Z
sources:
  - id: openwiki-source-6d4b4e707b8d60b6ccfa3425
    resource: repo://.github/workflows/openwiki-update.yml
  - id: openwiki-source-aa55808be329b3f929ddf105
    resource: repo://.renovaterc.json5
  - id: openwiki-source-f04021c19122a44288e9cea0
    resource: repo://.taskfiles/bootstrap/Taskfile.yaml
  - id: openwiki-source-4f5be6b4c7dcc699aca46164
    resource: repo://.taskfiles/talos/Taskfile.yaml
  - id: openwiki-source-57a6ec7c4080984e4168b45b
    resource: repo://.taskfiles/volsync/scripts/wait-for-job.sh
  - id: openwiki-source-667048e2381456fb8cb0e49b
    resource: repo://.taskfiles/volsync/scripts/wait-for-rd.sh
  - id: openwiki-source-ab04cad2d509128f85736a9f
    resource: repo://.taskfiles/volsync/Taskfile.yaml
  - id: openwiki-source-b9ff7ee0aa4953cc601052a4
    resource: repo://Taskfile.yaml
generated: { by: "openwiki/0.4.3", at: "2026-08-31T23:16:37.333Z" }
---

# Daily Tasks Reference

Quick reference for common operational tasks performed on the Talos Kubernetes cluster.

## Cluster Status Checks

### Flux Reconciliation Status

Check if Flux is reconciling properly:

```bash
flux get sources all
flux get kustomizations --all-namespaces
flux get helmreleases --all-namespaces
```

### Force Flux Reconciliation

Force Flux to immediately pull changes from the Git repository:

```bash
task reconcile
```

This executes `flux --namespace flux-system reconcile kustomization flux-system --with-source`, which cascades to all downstream Kustomizations.

**Use cases:**
- After committing configuration changes
- When manual synchronization is needed before the automatic interval
- Verifying GitOps changes are propagating correctly

### Check Node Health

View node status and resource usage:

```bash
kubectl get nodes -o wide
kubectl top nodes
kubectl top pods -A
```

### View Application Logs

```bash
kubectl logs <deployment-name> -n <namespace>
kubectl logs <deployment-name> -n <namespace> --previous  # Crash logs
kubectl logs -n <namespace> -l app.kubernetes.io/name=<app-name>  # All pods
kubectl logs -n <namespace> -l app.kubernetes.io/name=<app-name> --tail 100 --follow  # Stream logs
```

## Talos Operations

### Generate Configuration

Regenerate Talos machine configurations after modifying `talos/talconfig.yaml` or `talos/talenv.yaml`:

```bash
task talos:generate-config
```

This runs `talhelper genconfig` and regenerates machine configs in `talos/clusterconfig/`.

**Important**: Never edit files in `talos/clusterconfig/` directly—they are auto-generated and will be overwritten.

### Apply Configuration to a Node

Apply updated Talos configuration to a specific node:

```bash
task talos:apply-node IP=<node-ip>
```

**Example:**
```bash
task talos:apply-node IP=192.168.50.145
```

The task applies machine config using `talhelper gencommand apply` with `--mode=auto` by default. Most configuration changes apply without rebooting.

### Upgrade Talos OS

Upgrade Talos on a single node with minimal disruption:

```bash
task talos:upgrade-node IP=<node-ip>
```

The task:
- Retrieves the Talos image URL and version from `talconfig.yaml` and `talenv.yaml`
- Runs `talhelper gencommand upgrade` with the target image
- Performs a rolling upgrade with a 10-minute timeout

### Upgrade Kubernetes

Upgrade Kubernetes cluster-wide to the version specified in `talos/talenv.yaml`:

```bash
task talos:upgrade-k8s
```

This upgrades Kubernetes by applying updated kubelet configurations to all nodes via `talhelper gencommand upgrade-k8s`.

### Reset the Cluster

**DANGER**: This destroys all cluster state and returns nodes to maintenance mode.

```bash
task talos:reset
```

Only use for complete cluster rebuilds. The task:
- Prompts for confirmation
- Wipes STATE and EPHEMERAL system labels
- Performs a non-graceful reset without waiting

### View Talos Logs

View logs from Talos nodes:

```bash
talosctl --nodes <node-ip> logs
talosctl --nodes <node-ip> services <service-name>
```

## VolSync Backup and Restore

VolSync provides PVC backup and restore using Restic. The cluster organizes VolSync tasks under `.taskfiles/volsync/Taskfile.yaml`.

### Trigger Manual Backup

Create an on-demand snapshot of an application's PVC:

```bash
task volsync:snapshot APP=<app-name> NS=<namespace>
```

**Example:**
```bash
task volsync:snapshot APP=plex NS=default
```

The task:
1. Patches the ReplicationSource with a manual trigger timestamp
2. Waits for the sync job to start
3. Waits for job completion with a 120-minute timeout

### Restore from Backup

Restore an application's PVC from VolSync snapshots:

```bash
task volsync:restore APP=<app-name> NS=<namespace> PREVIOUS=<N>
```

**Parameters:**
- `APP`: Application name (required)
- `NS`: Namespace (default: `default`)
- `PREVIOUS`: Number of recent snapshots to restore (default: `2`)

**Example:**
```bash
task volsync:restore APP=plex NS=default PREVIOUS=2
```

The restore process:
1. Suspends the Flux Kustomization and HelmRelease
2. Scales down the application deployment to zero
3. Wipes the existing PVC data
4. Creates a ReplicationDestination to trigger restore
5. Waits for the restore job to complete (up to 2 hours)
6. Resumes the application and scales back up

### List Available Snapshots

View available snapshots for an application:

```bash
task volsync:list APP=<app-name> NS=<namespace>
```

This creates a temporary job that lists all snapshots in the Restic repository, waits for job completion, outputs the logs, and then deletes the job.

### Unlock Restic Repository

If a Restic repository becomes locked (e.g., after a failed backup), unlock it from a local machine:

```bash
task volsync:unlock-local APP=<app-name> NS=<namespace>
```

This creates a job to unlock the Restic repository, waits for completion with a 5-minute timeout, displays logs using stern, and then deletes the job.

## Flux Operations

### Suspend/Resume Resources

Temporarily prevent reconciliation during maintenance:

```bash
flux suspend kustomization <name>
flux resume kustomization <name>
flux suspend helmrelease <name> -n <namespace>
flux resume helmrelease <name> -n <namespace>
```

**Use during maintenance** to prevent automatic reconciliation while performing node operations or upgrades.

### Check Reconciliation Errors

View logs for debugging reconciliation failures:

```bash
flux --namespace flux-system logs kustomization flux-system --tail 50
flux --namespace <namespace> logs kustomization <name> --tail 50
flux --namespace <namespace> logs helmrelease <name> --tail 50
```

### Troubleshoot Kustomization Status

Check detailed status of Kustomizations:

```bash
flux get kustomizations --all-namespaces
flux describe kustomization <name> -n <namespace>
```

**Common issues:**
- **Not Ready**: Check if all dependencies are satisfied
- **Validation Failed**: Verify YAML syntax and Kubernetes API compatibility
- **Decryption Failed**: Check SOPS configuration and age key

### Troubleshoot HelmRelease Status

Check detailed status of HelmReleases:

```bash
flux get helmreleases --all-namespaces
flux describe helmrelease <name> -n <namespace>
```

**Common issues:**
- **Reconciliation Failed**: Check Helm chart values and dependencies
- **Chart Not Found**: Verify HelmRepository sources are configured
- **Image Pull Errors**: Check registry credentials and image availability

### Reconcile Specific Resources

Force reconciliation of a specific Kustomization or HelmRelease:

```bash
flux reconcile kustomization <name> -n <namespace> --with-source
flux reconcile helmrelease <name> -n <namespace>
```

## Application Operations

### Update Application Values

Edit the `helmrelease.yaml` or values files and commit. Flux will detect the change and update the Helm release.

For immediate reconciliation:
```bash
task reconcile
```

### Debug HelmRelease Failures

```bash
flux --namespace <namespace> get helmreleases
flux --namespace <namespace> logs helmrelease <app-name> --tail 50
```

Check Helm revision history:
```bash
helm --namespace <namespace> history <app-name>
```

### Rollback an Application

```bash
helm --namespace <namespace> rollback <app-name> <revision>
```

Or edit `helmrelease.yaml` to revert values and commit.

## Storage Operations

### Check PVC Status

```bash
kubectl get pvc -A
kubectl describe pvc <pvc-name> -n <namespace>
```

### Resize PVC

1. Update `pvc.yaml` with new `spec.resources.requests.storage`
2. Commit and push
3. Flux updates the PVC
4. TopoLVM automatically expands the underlying LVM volume

**Note**: Most filesystems (ext4, xfs) support online expansion.

## Observability Access

### Access Grafana

Retrieve Grafana admin credentials:

```bash
kubectl --namespace observability get secret grafana-admin -o jsonpath='{.data.admin-user}' | base64 -d
kubectl --namespace observability get secret grafana-admin -o jsonpath='{.data.admin-password}' | base64 -d
```

Port-forward to access Grafana locally:

```bash
kubectl --namespace observability port-forward svc/grafana 3000:80
```

Then open http://localhost:3000 in your browser.

### Check Cluster Metrics

The cluster exposes metrics through Prometheus. Access the Prometheus UI:

```bash
kubectl --namespace observability port-forward svc/prometheus-operated 9090:9090
```

## Automation Workflows

### OpenWiki Documentation Updates

The repository uses an automated GitHub Actions workflow to keep documentation current:

- **Schedule**: Runs daily at 19:30 UTC (cron: `30 19 * * *`)
- **Trigger**: Also available via manual `workflow_dispatch`
- **Provider**: Anthropic-compatible API with `glm-4.7` model
- **Behavior**: Commits and pushes documentation changes directly to the default branch

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

## Maintenance Mode

### Before Maintenance

1. Suspend Flux:
   ```bash
   flux suspend kustomization cluster-apps
   ```

2. Scale down non-critical apps:
   ```bash
   kubectl scale deployment <app-name> --replicas=0 -n <namespace>
   ```

### After Maintenance

1. Resume Flux:
   ```bash
   flux resume kustomization cluster-apps
   ```

2. Scale up apps:
   ```bash
   kubectl scale deployment <app-name> --replicas=1 -n <namespace>
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
   talosctl --nodes <node-ip> version
   ```

2. Check machine config health:
   ```bash
   talosctl --nodes <node-ip> get mc
   ```

3. Check control plane components:
   ```bash
   talosctl --nodes <node-ip> services
   ```

4. If necessary, re-apply machine config:
   ```bash
   task talos:apply-node IP=<node-ip>
   ```

### Recover from Backup

If critical data is lost:

1. Identify VolSync snapshots:
   ```bash
   task volsync:list APP=<app-name> NS=<namespace>
   ```

2. Restore from snapshot:
   ```bash
   task volsync:restore APP=<app-name> NS=<namespace>
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

## Common Troubleshooting

### Pod Not Starting

1. Check pod status:
   ```bash
   kubectl describe pod <pod-name> -n <namespace>
   ```

2. Check logs:
   ```bash
   kubectl logs <pod-name> -n <namespace>
   kubectl logs <pod-name> -n <namespace> --previous  # If crashed
   ```

3. Check events:
   ```bash
   kubectl get events -n <namespace> --sort-by='.lastTimestamp'
   ```

### Image Pull Errors

If you see `ImagePullBackOff` or `ErrImagePull`:

1. Check if image exists:
   ```bash
   crane tag ghcr.io/example/<app-name>
   ```

2. Check if registry is accessible from cluster:
   ```bash
   kubectl run debug --image=curlimages/curl --rm -it --restart=Never -- curl -v https://ghcr.io/v2/
   ```

3. Check `imagePullSecrets` if using private registry

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
kubectl describe node <node-name> | grep -A 5 "Allocated resources"
```

### High Memory/Pressure

Check kubelet eviction thresholds:
```bash
kubectl describe node <node-name> | grep -A 10 "Memory Pressure"
```

Review TopoLVM metrics:
```bash
kubectl get topolvmnode -A
```

## Bootstrap Process

The cluster bootstrap consists of two phases:

### Phase 1: Talos Bootstrap (`task bootstrap:talos`)

Establishes the Kubernetes control plane:

1. Generates encrypted secrets (`talsecret.sops.yaml`) if not present
2. Runs `talhelper genconfig` to generate machine configurations
3. Applies Talos configuration to nodes
4. Bootstraps the Kubernetes cluster
5. Generates kubeconfig

### Phase 2: Apps Bootstrap (`task bootstrap:apps`)

Installs essential infrastructure components:

1. Creates namespaces
2. Deploys SOPS secrets for decryption
3. Installs CRDs
4. Runs helmfile to install:
   - Cilium (CNI)
   - CoreDNS
   - cert-manager
   - flux-operator
   - flux-instance

After bootstrap completes, Flux takes over management of all applications declared in `kubernetes/apps/`.

## SOPS Decryption Issues

SOPS decrypts secrets using age encryption. Common issues:

### Check SOPS Configuration

```bash
cat .sops.yaml
```

Verify the decryption rules match your file paths:
- `talos/*.sops.yaml` — whole-file encryption
- `(bootstrap|kubernetes)/*.sops.yaml` — only `data`/`stringData` fields encrypted

### Verify Age Key

```bash
ls -la age.key
```

The `age.key` file must exist and be readable. Check mise environment:

```bash
mise exec -- env | grep SOPS_AGE_KEY_FILE
```

### Test Decryption

```bash
sops --decrypt kubernetes/components/common/sops/sops-age.sops.yaml
```

If decryption fails, verify:
1. The `age.key` matches the encrypted files
2. The file is not corrupted
3. SOPS age plugin is installed

### Flux Decryption Failures

If Flux cannot decrypt secrets:

1. Check Flux logs:
   ```bash
   flux --namespace flux-system logs kustomization flux-system --tail 100 | grep -i decrypt
   ```

2. Verify the sops-age secret exists:
   ```bash
   kubectl --namespace flux-system get secret sops-age
   ```

3. Check the secret contains the age key:
   ```bash
   kubectl --namespace flux-system get secret sops-age -o jsonpath='{.data.age\.key}' | base64 -d
   ```

The secret should match your local `age.key` file (or the key used during encryption).
