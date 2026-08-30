---
type: Storage overview
title: Storage & Backup Overview
description: How the cluster manages persistent storage and data backup with TopoLVM, VolSync, snapshots, and related operators.
tags: [storage, backup, volsync, topolvm, pvc]
verified:
  - by: openwiki/0.4.3
    at: 2026-08-30T21:57:36.532Z
sources:
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
  - id: openwiki-source-d3d80f124bb7f98ce2094ebc
    resource: repo://kubernetes/apps/default/calibre-web-automated/app/volsync-nfs.yaml
  - id: openwiki-source-193460b9ee15eb184a70e006
    resource: repo://kubernetes/apps/storage/csi-driver-nfs/app/helmrelease.yaml
  - id: openwiki-source-f4981326e8ef2c12ac7b791b
    resource: repo://kubernetes/apps/storage/kustomization.yaml
  - id: openwiki-source-3f4695f29abb7b8703c0c7d0
    resource: repo://kubernetes/apps/storage/local-path-provisioner/app/helmrelease.yaml
  - id: openwiki-source-36b0dc45e5070034d8a08ed2
    resource: repo://kubernetes/apps/storage/namespace.yaml
  - id: openwiki-source-c121a86abebb73e95ad75f6e
    resource: repo://kubernetes/apps/storage/snapshot-controller/app/helmrelease.yaml
  - id: openwiki-source-9baccf3ae41f07f1fd5a1914
    resource: repo://kubernetes/apps/storage/topolvm/app/helmrelease.yaml
  - id: openwiki-source-015490ec49e95d08d0ea6358
    resource: repo://kubernetes/apps/storage/topolvm/ks.yaml
  - id: openwiki-source-9a91d01bb54fc0b7d652e6d3
    resource: repo://kubernetes/apps/storage/topolvm/README.md
  - id: openwiki-source-e77f449e947f9b25cfc86044
    resource: repo://kubernetes/components/volsync/minio.yaml
  - id: openwiki-source-67d09412df5e9b5263585304
    resource: repo://lvm-format-manual.yaml
generated: { by: "openwiki/0.4.3", at: "2026-08-30T21:57:36.532Z" }
---

# Storage & Backup Overview

How the cluster manages persistent storage and data backup.

## Storage Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Applications                          │
│  (PVCs bound to StorageClasses)                         │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│                   StorageClasses                        │
├──────────────┬──────────────────┬───────────────────────┤
│  topolvm-     │  nfs-csi         │  local-path           │
│  thin-        │  (NFS)           │  (hostPath)            │
│  provisioner │                  │                       │
└──────┬───────┴──────────┬───────┴───────────┬───────────┘
       │                  │                   │
       ▼                  ▼                   ▼
┌─────────────────────────────────────────────────────────┐
│                Physical Storage                           │
│  ┌─────────────────┐  ┌──────────┐  ┌────────────────┐ │
│  │ LVM on Node     │  │ NFS      │  │ Node Disk      │ │
│  │ /dev/nvme0n1    │  │ Server   │  │ /var/mnt/...   │ │
│  │ VG: lvm_vg      │  │ 192.168. │  │                │ │
│  │ Pool: lvm_thin  │  │ 50.220   │  │                │ │
│  └─────────────────┘  └──────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Storage Providers

### TopoLVM

**Primary storage provider** for the cluster, providing high-performance local block storage through LVM thin provisioning.

**What it does**:
- Creates LVM logical volumes for each PVC
- Provides dynamic provisioning with thin snapshots
- Supports volume expansion with automatic filesystem resizing
- Better performance than hostPath/emptyDir

**StorageClass**: `topolvm-thin-provisioner` (default class)

**When to use**:
- High-performance storage requirements
- Databases (PostgreSQL, MySQL)
- Applications with heavy I/O
- When volume expansion is needed

**Configuration**:
- Located in `kubernetes/apps/storage/topolvm/`
- Uses LVM volume group `lvm_vg` and thin pool `lvm_thin`
- Device class `thin` with 10 GB spare capacity
- Overprovision ratio: 10.0 (allows provisioning up to 10x physical capacity)
- Filesystem: XFS (supports online resizing)
- Single-node compatible: `replicaCount: 1`, anti-affinity disabled, Recreate update strategy

**LVM Setup Requirements**:

Before TopoLVM can provision volumes, the node's disk must be formatted with LVM:

```bash
# Create physical volume
pvcreate /dev/nvme0n1

# Create volume group
vgcreate lvm_vg /dev/nvme0n1
vgchange -a y lvm_vg

# Create thin pool using all available space
lvcreate --thinpool -l 100%FREE -n lvm_thin lvm_vg
```

See `lvm-format-manual.yaml` for a privileged pod that can perform these operations.

**Example PVC**:
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-data
spec:
  storageClassName: topolvm-thin-provisioner
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

**Single-Node Cluster Configuration**:

The TopoLVM HelmRelease includes specific overrides for single-node compatibility to prevent upgrade failures caused by default anti-affinity rules:

```yaml
controller:
  replicaCount: 1
  affinity: ""
  updateStrategy:
    type: Recreate
```

This configuration prevents the common issue where rolling upgrades fail because the new replica cannot schedule due to pod anti-affinity rules.

### NFS CSI

**Network-attached storage** via NFS.

**What it does**:
- Mounts NFS shares as PVCs
- Allows multiple pods to access same data (ReadWriteMany)
- Persistent storage independent of cluster nodes

**StorageClass**: `nfs-csi`

**When to use**:
- Shared storage between multiple pods
- Media libraries (Jellyfin, Navidrome)
- Documents requiring multi-writer access
- Large datasets that don't need high IOPS

**Configuration**:
- Located in `kubernetes/apps/storage/csi-driver-nfs/`
- Points to external NFS server at `192.168.50.220`
- Controller replicas: 1
- External snapshotter: disabled

**Example PVC**:
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-media
spec:
  storageClassName: nfs-csi
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 500Gi
```

**Alternative: Direct NFS Mounting**

Some applications use direct NFS mounts in HelmRelease values instead of PVC-based NFS CSI:

```yaml
persistence:
  paper:
    type: nfs
    server: 192.168.50.220
    path: /volume4/paper
    globalMounts:
      - path: /paper
```

This pattern is useful for:
- Read-only access to NFS exports
- Temporary or optional NFS mounts
- When PVC overhead is unnecessary

### local-path

**Simple hostPath-based storage** for small, ephemeral data.

**What it does**:
- Uses hostPath on each node
- No provisioning overhead
- Best for small, temporary data

**StorageClass**: `local-path`

**When to use**:
- Small configuration files
- Temporary caches
- Non-critical data that can be recreated
- Development/testing environments

**When NOT to use**:
- Important persistent data
- Large datasets
- Production databases

**Configuration**:
- Located in `kubernetes/apps/storage/local-path-provisioner/`
- Path: `/var/mnt/local-path-provisioner`
- Chart version: 0.0.37

## VolSync Backups

### Backup Architecture

```
┌───────────────────────────────────────────────┐
│  Application PVC                              │
└──────────────┬────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────┐
│  VolSync ReplicationSource                    │
│  (Monitors PVC, triggers sync)                │
└──────────────┬────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────┐
│  Restic                                       │
│  (Uploads to MinIO)                           │
└──────────────┬────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────┐
│  MinIO (external backup store)                │
│  192.168.50.220:9010                          │
│  ┌─────────────────────────────────────────┐ │
│  │  Buckets:                               │ │
│  │  - volsync/dev/<app-name>               │ │
│  └─────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

### VolSync Configuration

VolSync provides asynchronous backup and replication for Kubernetes persistent volumes using Restic format for efficient, deduplicated backups.

**Backup Configuration (ReplicationSource)**:

```yaml
apiVersion: volsync.backube/v1alpha1
kind: ReplicationSource
metadata:
  name: my-app
spec:
  sourcePVC: my-app-data
  trigger:
    schedule: "0 */6 * * *"  # Every 6 hours
  restic:
    copyMethod: Direct
    storageClassName: topolvm-thin-provisioner
    accessModes: [ReadWriteOnce]
    pruneIntervalDays: 7
    repository: my-app-volsync-secret
    moverSecurityContext:
      runAsUser: 1000
      runAsGroup: 1000
      fsGroup: 1000
    cacheCapacity: 1Gi
    cacheStorageClassName: local-path
    retain:
      hourly: 24
      daily: 7
      weekly: 5
```

Key configuration elements:
- **Schedule**: Runs every 6 hours (configurable per application)
- **Copy Method**: Direct (copies data directly without intermediate snapshot)
- **Cache Storage**: Uses local-path provisioner for temporary scratch space
- **Repository**: S3-compatible storage (MinIO) via external secret
- **Retention**: Keeps 24 hourly, 7 daily, and 5 weekly backups

**Secret for MinIO credentials** (ExternalSecret):

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: my-app-volsync
spec:
  secretStoreRef:
    kind: ClusterSecretStore
    name: bitwarden-login
  target:
    name: my-app-volsync-secret
    template:
      engineVersion: v2
      data:
        RESTIC_REPOSITORY: "s3:http://192.168.50.220:9010/volsync/dev/${APP}"
        RESTIC_PASSWORD: "{{ .RESTIC_PASSWORD }}"
        AWS_ACCESS_KEY_ID: "{{ .MINIO_ROOT_USER }}"
        AWS_SECRET_ACCESS_KEY: "{{ .MINIO_ROOT_PASSWORD }}"
```

### Manual Backup Operations

**Trigger immediate backup**:
```bash
task volsync:snapshot APP=my-app NS=default
```

This patches the ReplicationSource with a manual trigger timestamp and waits for the job to complete (timeout: 120 minutes).

**List available snapshots**:
```bash
task volsync:list APP=my-app NS=default
```

This creates a temporary Job that runs Restic to list snapshots in MinIO and displays the output.

**Restore from snapshot**:
```bash
task volsync:restore APP=my-app NS=default PREVIOUS=2
```

This performs a complete restore workflow:
1. Suspends the application (Flux ks/hr, scales controller to 0)
2. Wipes the existing PVC
3. Creates a `ReplicationDestination` pointing to the Restic repository
4. Waits for restore to complete (2-hour timeout)
5. Resumes the application

The restore process automatically:
- Detects whether the app uses a Deployment or StatefulSet
- Extracts PVC name, UID/GID from ReplicationSource
- Uses the last X snapshots (default: 2)

**Unlock Restic repository** (if locked):
```bash
task volsync:unlock
```

Unlocks all Restic repositories across all namespaces by patching each ReplicationSource with the current Unix timestamp.

### VolSync Suspend/Resume

**Suspend VolSync operations**:
```bash
task volsync:state-suspend
```

**Resume VolSync operations**:
```bash
task volsync:state-resume
```

These tasks suspend/resume:
- Flux Kustomization for VolSync
- VolSync HelmRelease
- VolSync deployment (scale to 0/1)

## Snapshot Controller

The snapshot-controller provides CSI volume snapshot capabilities for instant backups.

### Volume Snapshots

```yaml
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: my-app-snapshot
spec:
  volumeSnapshotClassName: topolvm-snapshot
  source:
    persistentVolumeClaimName: my-app-data
```

**SnapshotClasses**:
- `topolvm-snapshot` - For TopoLVM PVCs (default)
- Driver: `topolvm.io`
- DeletionPolicy: Delete

**Configuration**:
- Located in `kubernetes/apps/storage/snapshot-controller/`
- Chart version: 5.2.0
- ServiceMonitor enabled for Prometheus metrics
- Webhook disabled
- Force upgrade enabled

**When to use snapshots**:
- Pre-upgrade backups
- Quick rollback capability
- Testing/dev environment cloning
- Complement to VolSync (snapshots are fast, VolSync is for off-cluster)

**Limitations**:
- Snapshots are in the same storage system
- Not a replacement for off-cluster backup
- Need VolSync for true disaster recovery

## Storage Operations

### Resizing a PVC

**Update the PVC** (new `storage` request):
```yaml
resources:
  requests:
    storage: 20Gi  # Increased from 10Gi
```

**Flux applies the change**, then:

1. **TopoLVM**: Automatically expands the LVM volume
2. **Filesystem**: Automatically expands (XFS supports online resize)
3. **Pod**: May need restart to recognize new size (depending on app)

**For NFS**:
- PVC size is just a quota
- Actual space depends on NFS server

### Monitoring Storage Usage

**Check node-level TopoLVM metrics**:
```bash
kubectl get topolvmnode -A
kubectl describe topolvmnode <node-name>
```

**Check PVC usage**:
```bash
kubectl get pvc -A
kubectl exec -n default my-app -- df -h /data
```

**Check MinIO backup storage**:
```bash
# Using mc client
mc ls local/volsync-dev/

# Or via task
task volsync:list APP=my-app NS=default
```

### Moving Data Between StorageClasses

**Use VolSync restore**:
1. Ensure backup exists from source PVC
2. Create `ReplicationDestination` with new `storageClassName`
3. VolSync restores to new PVC in different storage class
4. Update app to use new PVC

**Or manual migration**:
1. Create PVC with new storage class
2. Spin up migration pod with both PVCs mounted
3. Copy data (rsync, rclone)
4. Update app to use new PVC
5. Delete old PVC

## Storage Best Practices

1. **Choose the right storage class**:
   - TopoLVM for databases and high I/O
   - NFS for shared media and documents
   - local-path for temporary/small data

2. **Always use VolSync** for important data:
   - PVCs are not backups
   - VolSync provides off-cluster copies
   - Can restore from MinIO

3. **Set appropriate PVC sizes**:
   - Don't oversize (wastes space)
   - Don't undersize (performance issues)
   - You can expand, but shrinking is hard

4. **Monitor storage capacity**:
   - Check node disk space
   - Monitor TopoLVM thin pool usage
   - Watch MinIO backup size

5. **Test restores**:
   - Regularly verify VolSync snapshots are valid
   - Test restore process before disaster
   - Verify backup retention schedules

6. **Use snapshots for upgrades**:
   - Take snapshot before major app upgrade
   - Quick rollback if upgrade fails
   - Delete snapshot after successful upgrade

7. **Document backup locations**:
   - Which apps have VolSync enabled?
   - Where are backups stored? (MinIO bucket path)
   - What's the retention policy?

## Troubleshooting

### PVC Stuck in Pending

**Check events**:
```bash
kubectl describe pvc my-data -n default
```

**Common issues**:
- No available nodes with TopoLVM capacity
- Wrong storage class name
- Node doesn't have the CSI driver

**Check TopoLVM capacity**:
```bash
kubectl get topolvmnode -A
kubectl describe topolvmnode <node-name> | grep -A 5 "AvailableCapacity"
```

### VolSync Not Running

**Check ReplicationSource**:
```bash
kubectl get replicationsource -A
kubectl describe replicationsource my-app -n default
```

**Common issues**:
- Schedule syntax error
- MinIO credentials incorrect
- PVC doesn't exist
- Restic repository locked (stale backup)

**Unlock Restic repository**:
```bash
task volsync:unlock
```

**Check MinIO connectivity**:
```bash
kubectl exec -n default minio -- curl http://192.168.50.220:9010
```

### Snapshot Creation Failed

**Check VolumeSnapshot**:
```bash
kubectl get volumesnapshot -A
kubectl describe volumesnapshot my-snapshot -n default
```

**Common issues**:
- VolumeSnapshotClass doesn't exist
- CSI doesn't support snapshots
- No available capacity for snapshot

### TopoLVM Single-Node Upgrade Issues

**Problem**: After TopoLVM HelmRelease upgrade, the `topolvm-controller` pod remains in `Pending` state with `node(s) didn't satisfy existing pods anti-affinity rules`.

**Root Cause**: The TopoLVM chart defaults to `replicaCount: 2` with required Pod anti-affinity rules. In a single-node cluster, the anti-affinity rules prevent the second pod from scheduling during rolling updates.

**Solution**: The TopoLVM HelmRelease is pre-configured for single-node compatibility:
- `replicaCount: 1` (prevents scheduling conflicts)
- `affinity: ""` (anti-affinity disabled)
- `updateStrategy.type: Recreate` (ensures old pod deleted before new pod created)

**Manual recovery** if upgrade is stuck:
```bash
# Delete the pending pod
kubectl -n storage delete pod topolvm-controller-xxxxxxxx

# Or scale old ReplicaSet to 0
kubectl -n storage scale rs topolvm-controller-xxxxxxxx --replicas=0
```

### Slow Storage Performance

**For TopoLVM**:
- Check if node disk is overloaded
- Verify LVM thin pool isn't full
- Consider moving I/O-heavy app to separate node

**For NFS**:
- Check network latency between cluster and NFS server
- Verify NFS server performance
- Consider using TopoLVM for better performance
