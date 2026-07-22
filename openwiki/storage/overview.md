---
type: Storage overview
title: Storage & Backup Overview
description: How the cluster manages persistent storage and data backup with TopoLVM, VolSync, snapshots, and related operators.
tags: [storage, backup, volsync, topolvm, pvc]
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
│  provisioner │  (Ceph/NFS)      │  (hostPath)            │
│  (LVM)       │                  │                       │
└──────┬───────┴──────────┬───────┴───────────┬───────────┘
       │                  │                   │
       ▼                  ▼                   ▼
┌─────────────────────────────────────────────────────────┐
│                Physical Storage                           │
│  ┌─────────────────┐  ┌──────────┐  ┌────────────────┐ │
│  │ LVM on Node     │  │ NFS Server│  │ Node Disk      │ │
│  │ /dev/disk/by-id │  │ External │  │ /var/local-path │ │
│  └─────────────────┘  └──────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Storage Providers

### TopoLVM

**Primary storage provider** for the cluster.

**What it does**:
- Creates LVM logical volumes for each PVC
- Provides dynamic provisioning with thin snapshots
- Supports volume expansion
- Better performance than hostPath/emptyDir

**StorageClass**: `topolvm-provisioner`

**When to use**:
- High-performance storage requirements
- Databases (PostgreSQL, MySQL)
- Applications with heavy I/O
- When volume expansion is needed

**Configuration**:
- Located in `kubernetes/apps/storage/topolvm/`
- Uses LVM on node system disks
- Automatically resizes filesystems when PVCs are expanded

**Example PVC**:
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-data
spec:
  storageClassName: topolvm-provisioner
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

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
- Located in `kubernetes/apps/storage/nfs-csi/`
- Points to external NFS server
- Supports ReadWriteMany access mode

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
- See `kubernetes/apps/default/qbittorrent/app/helmrelease.yaml` for a complete example

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
│  Restic/Rclone                                │
│  (Uploads to MinIO/B2)                        │
└──────────────┬────────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────────┐
│  MinIO (local backup store)                   │
│  ┌─────────────────────────────────────────┐ │
│  │  Buckets:                               │ │
│  │  - volsync-default                      │ │
│  │  - volsync-storage                      │ │
│  │  - volsync-database                     │ │
│  └─────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

### VolSync Configuration

**Common pattern** (from `kubernetes/components/volsync-new/`):

```yaml
apiVersion: volsync.backube/v1alpha1
kind: ReplicationSource
metadata:
  name: my-app
spec:
  sourcePVC: my-app-data
  trigger:
    schedule: "0 2 * * *"  # Daily at 2 AM
  restic:
    copyMethod: Snapshot
    repository: my-app-minio
    storageClassName: topolvm-provisioner
    cacheCapacity: 1Gi
    volumeSnapshotClassName: topolvm-snapshot
    mover:
      image: ghcr.io/backube/volsync:latest
    retention:
      daily: 7
      weekly: 4
      monthly: 3
```

**Secret for MinIO credentials**:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: my-app-minio
stringData:
  RESTIC_REPOSITORY: s3:http://minio.default.svc.cluster.local:9000/volsync-default
  RESTIC_PASSWORD: <restic-password>
  AWS_ACCESS_KEY_ID: <minio-access-key>
  AWS_SECRET_ACCESS_KEY: <minio-secret-key>
```

### Manual Backup Operations

**Trigger immediate backup**:
```bash
task volsync:snapshot APP=my-app NS=default
```

**List available snapshots**:
```bash
task volsync:list APP=my-app NS=default
```

This uses Restic to list snapshots in MinIO:
```bash
restic -r s3:http://minio.default.svc.cluster.local:9000/volsync-default snapshots
```

**Restore from snapshot**:
```bash
task volsync:restore APP=my-app NS=default
```

This:
1. Creates a `ReplicationDestination` pointing to the Restic repository
2. VolSync creates a new PVC from the snapshot
3. You can then swap the app to use the restored PVC

### VolSync Scheduler

**Default schedules**:
- Daily at 2 AM for most apps
- Hourly for critical databases (PostgreSQL)
- Weekly for static content

**Schedules are defined** in app `ReplicationSource` resources.

## Snapshot Controller

### Volume Snapshots

The cluster supports CSI volume snapshots for instant backups:

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
- `topolvm-snapshot` - For TopoLVM PVCs
- `nfs-csi-snapshot` - For NFS PVCs (if supported)

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
2. **Filesystem**: Automatically expands (ext4/xfs support online resize)
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
kubectl exec -n default minio -- mc ls local/volsync-default/
```

### Moving Data Between StorageClasses

**Use VolSync restore**:
1. Create backup from source PVC
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
   - Can restore from MinIO or B2

3. **Set appropriate PVC sizes**:
   - Don't oversize (wastes space)
   - Don't undersize (performance issues)
   - You can expand, but shrinking is hard

4. **Monitor storage capacity**:
   - Check node disk space
   - Monitor TopoLVM pool usage
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
   - Where are backups stored? (MinIO vs B2)
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
kubectl exec -n default my-app -- restic unlock
```

**Check MinIO connectivity**:
```bash
kubectl exec -n default minio -- curl http://minio.default.svc.cluster.local:9000
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

### Slow Storage Performance

**For TopoLVM**:
- Check if node disk is overloaded
- Verify LVM thin pool isn't full
- Consider moving I/O-heavy app to separate node

**For NFS**:
- Check network latency between cluster and NFS server
- Verify NFS server performance
- Consider using TopoLVM for better performance
