---
type: Operations runbook
title: Daily Operations
description: Common operational tasks for the Talos cluster including Flux reconciliation, Talos configuration application, node operations, VolSync backup procedures, and monitoring access.
tags: [operations, runbook, flux, talos, volsync, monitoring, maintenance]
sources:
  - id: openwiki-source-4f5be6b4c7dcc699aca46164
    resource: repo://.taskfiles/talos/Taskfile.yaml
  - id: openwiki-source-667048e2381456fb8cb0e49b
    resource: repo://.taskfiles/volsync/scripts/wait-for-rd.sh
  - id: openwiki-source-9eb40fd76830d0fb035978cc
    resource: repo://.taskfiles/volsync/scripts/which-controller.sh
  - id: openwiki-source-ab04cad2d509128f85736a9f
    resource: repo://.taskfiles/volsync/Taskfile.yaml
  - id: openwiki-source-00d62e6756b9e93fad101f84
    resource: repo://.taskfiles/volsync/templates/list.tmpl.yaml
  - id: openwiki-source-5e2b5e1fe6a0de0579879c25
    resource: repo://.taskfiles/volsync/templates/replicationdestination.tmpl.yaml
  - id: openwiki-source-14ff6f4c89c89fa371282549
    resource: repo://.taskfiles/volsync/templates/wipe.tmpl.yaml
  - id: openwiki-source-3bb8db68d9e76fc96ebaa8a0
    resource: repo://kubernetes/apps/observability/kustomization.yaml
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-b9ff7ee0aa4953cc601052a4
    resource: repo://Taskfile.yaml
generated: { by: "openwiki/0.4.3", at: "2026-08-29T21:52:21.026Z" }
verified:
  - by: openwiki/0.5.0
    at: 2026-09-01T21:54:26.927Z
---

# Daily Operations

Common operational tasks for maintaining the Talos Kubernetes cluster, covering Flux GitOps operations, Talos node management, VolSync backup/restore workflows, and monitoring access.

## Flux Reconciliation

### Force Reconciliation

Force Flux to immediately pull changes from the Git repository:

```bash
task reconcile
```

This executes `flux --namespace flux-system reconcile kustomization flux-system --with-source`, which cascades to all downstream Kustomizations.

**Use cases:**
- After committing configuration changes
- When manual synchronization is needed before the automatic interval
- Verifying GitOps changes are propagating correctly

### Check Flux Status

View reconciliation status across all Flux resources:

```bash
flux get sources all
flux get kustomizations --all-namespaces
flux get helmreleases --all-namespaces
```

### Check Reconciliation Errors

View logs for debugging reconciliation failures:

```bash
flux --namespace flux-system logs kustomization flux-system --tail 50
flux --namespace <namespace> logs kustomization <name> --tail 50
flux --namespace <namespace> logs helmrelease <name> --tail 50
```

### Suspend/Resume Resources

Temporarily prevent reconciliation during maintenance:

```bash
flux suspend kustomization <name>
flux resume kustomization <name>
flux suspend helmrelease <name> -n <namespace>
flux resume helmrelease <name> -n <namespace>
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

**Prerequisites:**
- Node must be accessible via `talosctl`
- `talosconfig` must be configured
- Talos helper tools available

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

The restore workflow performs these steps:

```mermaid
flowchart TD
  A[Start volsync:restore] --> B[Suspend Flux Kustomization]
  B --> C[Suspend HelmRelease]
  C --> D[Scale controller to 0]
  D --> E[Wait for pod deletion]
  E --> F[Wipe PVC data]
  F --> G[Wait for wipe job completion]
  G --> H[Create ReplicationDestination]
  H --> I[Wait for restore completion]
  I --> J[Delete ReplicationDestination]
  J --> K[Resume HelmRelease]
  K --> L[Resume Flux Kustomization]
  L --> M[Scale controller to 1]
  M --> N[Wait for pod ready]
  N --> O[End - Application restored]
```

**Workflow details:**

1. **Suspend** (`task .suspend`):
   - Suspends Flux Kustomization for the app
   - Suspends the HelmRelease
   - Scales the controller (Deployment or StatefulSet) to 0 replicas
   - Waits for pods to terminate

2. **Wipe** (`task .wipe`):
   - Creates a Job that mounts the PVC and deletes all data using Alpine image
   - Waits for job completion with a 120-minute timeout
   - Displays job logs for verification

3. **Restore** (`task .restore`):
   - Creates a ReplicationDestination with `trigger.manual: restore-once`
   - Uses Restic to restore from the repository
   - Waits for the ReplicationDestination to complete with a 2-hour timeout
   - Deletes the ReplicationDestination after completion

4. **Resume** (`task .resume`):
   - Resumes the HelmRelease
   - Resumes the Flux Kustomization
   - Scales the controller back to 1 replica
   - Waits for pods to become ready

**Prerequisites:**
- ReplicationSource must exist for the application
- PVC must be configured as the source
- Restic repository secret must be available

### List Available Snapshots

View available Restic snapshots for an application:

```bash
task volsync:list APP=<app-name> NS=<namespace>
```

The task:
- Creates a temporary Job using the Restic container
- Runs `restic snapshots` using the app's repository credentials
- Displays the snapshot list
- Cleans up the Job after completion

### Unlock Restic Repositories

Unlock all Restic source repositories cluster-wide:

```bash
task volsync:unlock CLUSTER=main
```

This is useful when Restic has left stale locks from interrupted operations. The task:
- Lists all ReplicationSources across all namespaces
- Patches each with an unlock timestamp using the current Unix epoch

### Suspend/Resume VolSync

Temporarily disable VolSync operations:

```bash
task volsync:state-suspend  # Suspend VolSync
task volsync:state-resume   # Resume VolSync
```

The tasks:
- Suspend/resume the VolSync Flux Kustomization
- Suspend/resume the VolSync HelmRelease
- Scale the VolSync deployment to 0/1 replicas

## Cluster Access

### Access via Kubeconfig

The cluster uses a kubeconfig file for Kubernetes access. The root Taskfile sets `KUBECONFIG` environment variable to `{{.ROOT_DIR}}/kubeconfig`.

```bash
# The kubeconfig path is automatically set when running tasks
kubectl get nodes
kubectl get pods -A
```

### Access via Talosctl

Talos nodes are managed using `talosctl` with the `TALOSCONFIG` environment variable pointing to `talos/clusterconfig/talosconfig`.

```bash
# TALOSCONFIG is automatically set when running talos tasks
talosctl --nodes <node-ip> get machineconfig
talosctl --nodes <node-ip> services
```

## Node Operations

### Check Node Status

View node health and status:

```bash
kubectl get nodes -o wide
kubectl describe node <node-name>
talosctl --nodes <ip> get machineconfig
```

### Restart Node

Restart a Talos node:

```bash
talosctl --nodes <ip> reboot
```

### View Resource Usage

Check node resource consumption:

```bash
kubectl top nodes
kubectl describe node <node-name>
```

## Monitoring and Observability

The cluster runs comprehensive observability tools in the `observability` namespace.

### Available Tools

The observability stack includes:

- **Grafana**: Dashboards and visualization
- **Prometheus**: Metrics collection and alerting (via kube-prometheus-stack)
- **Loki**: Log aggregation
- **Promtail**: Log agent for shipping logs to Loki
- **Thanos**: Long-term metrics storage
- **Gatus**: Endpoint health monitoring
- **Uptime Kuma**: Status page and uptime tracking
- **smartctl-exporter**: Storage device health metrics

### Access Monitoring

Access monitoring interfaces through the cluster's Ingress or Tailscale network:

```bash
# Get Grafana credentials
kubectl --namespace observability get secret grafana-admin -o jsonpath='{.data.admin-user}' | base64 -d
kubectl --namespace observability get secret grafana-admin -o jsonpath='{.data.admin-password}' | base64 -d

# Port-forward for local access
kubectl --namespace observability port-forward svc/grafana 3000:80
```

### View Application Logs

View logs for applications:

```bash
kubectl logs <deployment-name> -n <namespace>
kubectl logs <deployment-name> -n <namespace> --previous  # Crash logs
kubectl logs -n <namespace> -l app.kubernetes.io/name=<app-name>  # All pods
kubectl logs -n <namespace> -l app.kubernetes.io/name=<app-name> --tail 100 --follow  # Stream logs
```

### Check Application Status

```bash
kubectl get pods -n <namespace>
kubectl get deployments -n <namespace>
kubectl get statefulsets -n <namespace>
kubectl get helmreleases -n <namespace>
kubectl get pvc -n <namespace>
```

### Debug Application Failures

1. Check pod status: `kubectl describe pod <pod-name> -n <namespace>`
2. View logs: `kubectl logs <pod-name> -n <namespace>`
3. Check events: `kubectl get events -n <namespace> --sort-by='.lastTimestamp'`
4. Check HelmRelease status: `flux -n <namespace> logs helmrelease <app-name> --tail 50`

## Common Workflows

### Update Application Configuration

1. Edit the HelmRelease or values files in `kubernetes/apps/<namespace>/<app>/`
2. Commit and push changes
3. Flux detects the change and updates the Helm release
4. For immediate reconciliation: `task reconcile`

### Emergency Application Restore

If an application's data becomes corrupted:

```bash
# 1. Trigger a backup first (to preserve current state)
task volsync:snapshot APP=<app> NS=<namespace>

# 2. Restore from a known-good snapshot
task volsync:restore APP=<app> NS=<namespace> PREVIOUS=3
```

The restore workflow handles suspending the application, wiping corrupted data, restoring from backup, and resuming with correct data.

### Maintenance Mode

Before performing cluster maintenance:

1. **Suspend critical applications**:
   ```bash
   flux suspend kustomization <app>
   ```

2. **Suspend VolSync** (if backup operations should pause):
   ```bash
   task volsync:state-suspend
   ```

3. **Perform maintenance tasks** (node upgrades, network changes, etc.)

4. **Resume operations**:
   ```bash
   flux resume kustomization <app>
   task volsync:state-resume
   ```

## Task Reference

The repository uses Task (taskfile) for operational commands. View all available tasks:

```bash
task                          # List all tasks
task --list <namespace>       # List tasks in a namespace (e.g., task --list talos)
task <namespace>:<task>       # Run a specific task
```

**Key task namespaces:**
- `reconcile`: Force Flux reconciliation
- `talos:*`: Talos cluster operations (generate-config, apply-node, upgrade-node, upgrade-k8s, reset)
- `volsync:*`: Backup and restore operations (snapshot, restore, list, unlock, state-suspend, state-resume)
- `bootstrap:*`: Cluster bootstrap operations (talos, apps)
