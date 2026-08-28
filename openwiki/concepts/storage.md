---
type: architecture
title: Storage Architecture
description: Comprehensive storage infrastructure for the Talos Kubernetes cluster including TopoLVM with LVM thin provisioning for primary workloads, VolSync for backup and replication, snapshot-controller for volume snapshots, NFS CSI for network-attached storage, and local-path-provisioner for host-local volumes.
tags: [storage, topolvm, volsync, lvm, csi, backup, kubernetes]
verified:
  - by: openwiki/0.4.3
    at: 2026-08-28T03:38:47.877Z
sources:
  - id: openwiki-source-ce5428b32557cc11ea784146
    resource: repo://kubernetes/apps/database/cloudnative-pg/cluster/cluster16.yaml
  - id: openwiki-source-193460b9ee15eb184a70e006
    resource: repo://kubernetes/apps/storage/csi-driver-nfs/app/helmrelease.yaml
  - id: openwiki-source-f4981326e8ef2c12ac7b791b
    resource: repo://kubernetes/apps/storage/kustomization.yaml
  - id: openwiki-source-3f4695f29abb7b8703c0c7d0
    resource: repo://kubernetes/apps/storage/local-path-provisioner/app/helmrelease.yaml
  - id: openwiki-source-c121a86abebb73e95ad75f6e
    resource: repo://kubernetes/apps/storage/snapshot-controller/app/helmrelease.yaml
  - id: openwiki-source-9baccf3ae41f07f1fd5a1914
    resource: repo://kubernetes/apps/storage/topolvm/app/helmrelease.yaml
  - id: openwiki-source-027a84f036951766a791c0e5
    resource: repo://kubernetes/apps/storage/topolvm/app/snapshot.yaml
  - id: openwiki-source-015490ec49e95d08d0ea6358
    resource: repo://kubernetes/apps/storage/topolvm/ks.yaml
  - id: openwiki-source-9a91d01bb54fc0b7d652e6d3
    resource: repo://kubernetes/apps/storage/topolvm/README.md
  - id: openwiki-source-e8e3b6391a058eac1aa3950b
    resource: repo://kubernetes/apps/storage/volsync/app/snapshot-cleanup-cronjob.yaml
  - id: openwiki-source-3714a051b30e9b02471fe9bf
    resource: repo://kubernetes/apps/storage/volsync/ks.yaml
  - id: openwiki-source-e77f449e947f9b25cfc86044
    resource: repo://kubernetes/components/volsync/minio.yaml
  - id: openwiki-source-166f1c0dfe572891e7fa2f96
    resource: repo://kubernetes/flux/meta/repos/local-path-provisioner.yaml
  - id: openwiki-source-67d09412df5e9b5263585304
    resource: repo://lvm-format-manual.yaml
generated: { by: "openwiki/0.4.3", at: "2026-08-28T03:38:47.877Z" }
---

# Storage Architecture

The cluster's storage layer provides multiple provisioning options optimized for different workload requirements: high-performance local block storage via TopoLVM with LVM thin provisioning, automated backup/replication via VolSync, volume snapshot capabilities, NFS for network-attached storage, and host-local provisioning for smaller workloads.

## Storage Layer Overview

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
    Workloads[Workloads] -->|PVC Requests| SC[StorageClasses]
    
    SC -->|topolvm-thin-provisioner<br/>Default Class| TopoLVM[TopoLVM CSI]
    SC -->|local-path| Local[Local Path Provisioner]
    SC -->|nfs| NFS[NFS CSI Driver]
    
    TopoLVM --> LVMD[lvmd Daemon<br/>Embedded on Nodes]
    LVMD --> LVM[LVM Volume Group<br/>lvm_vg]
    LVM --> ThinPool[Thin Pool<br/>lvm_thin]
    ThinPool --> Volumes[Thin Logical Volumes]
    
    Workloads -->|ReplicationSource/Destination| VolSync[VolSync]
    VolSync -->|Restic Backup| MinIO[MinIO S3<br/>192.168.50.220:9010]
    VolSync -->|Snapshots| SnapCtrl[Snapshot Controller]
    
    TopoLVM -->|VolumeSnapshot| SnapCtrl
```

## TopoLVM: Primary Block Storage

TopoLVM serves as the cluster's default storage provisioner, providing high-performance local block storage through LVM thin provisioning. It combines the flexibility of Kubernetes CSI with the efficiency of LVM thin pools.

### Architecture

TopoLVM operates with an embedded lvmd daemon running on each node, managed by the TopoLVM controller:

- **Controller Deployment**: Single replica (`replicaCount: 1`) with Recreate update strategy and anti-affinity disabled for single-node cluster compatibility
- **Embedded lvmd**: Each node runs an embedded lvmd daemon that manages LVM operations locally
- **CSI Driver**: TopoLVM CSI driver implements the Kubernetes CSI interface for volume provisioning
- **Metrics**: Prometheus metrics enabled for monitoring volume operations

### LVM Configuration

The storage infrastructure relies on a manually configured LVM setup:

```bash
# Physical volume creation
pvcreate /dev/nvme0n1

# Volume group for TopoLVM
vgcreate lvm_vg /dev/nvme0n1
vgchange -a y lvm_vg

# Thin pool using all available space
lvcreate --thinpool -l 100%FREE -n lvm_thin lvm_vg
```

The manual LVM formatting process is documented in `lvm-format-manual.yaml`, which provides a privileged pod for disk initialization.

### Device Class Configuration

TopoLVM uses a single device class configured for thin provisioning:

- **Device Class Name**: `thin`
- **Volume Group**: `lvm_vg`
- **Thin Pool**: `lvm_thin`
- **Spare Capacity**: 10 GB reserved for metadata and operations
- **Overprovision Ratio**: 10.0 (allows provisioning up to 10x physical capacity)
- **Type**: Thin (allocates space on-demand)

The thin pool design enables efficient space utilization by allocating physical storage only as data is written, while the overprovision ratio allows the cluster to provision more logical storage than physically available (suitable for workloads that don't use full capacity simultaneously).

### Storage Class: topolvm-thin-provisioner

The default storage class provides these capabilities:

- **Filesystem**: XFS (high-performance, robust for databases)
- **Binding Mode**: Immediate (provisions before pod scheduling)
- **Volume Expansion**: Enabled (allows PVC resize without data loss)
- **Default Class**: Yes (used when no storage class specified)
- **Device Class**: `thin`

Example usage from CloudNative-PG cluster:

```yaml
storage:
  size: 10Gi
  storageClass: topolvm-thin-provisioner
```

### Volume Snapshot Support

TopoLVM integrates with the snapshot-controller for volume snapshots:

- **Snapshot Class**: `topolvm-thin-provisioner`
- **Driver**: `topolvm.io`
- **Deletion Policy**: Delete (snapshots deleted when VolumeSnapshot resource deleted)
- **Default**: Yes (used when no snapshot class specified)

Snapshots enable instant point-in-time copies of volumes for backup or cloning operations.

### Single-Node Cluster Configuration

The TopoLVM deployment is optimized for single-node clusters to prevent upgrade failures:

- **Replica Count**: 1 (prevents scheduling conflicts)
- **Anti-Affinity**: Disabled (`affinity: ""`)
- **Update Strategy**: Recreate (ensures old pod deleted before new pod created)

This configuration prevents the common single-node issue where default anti-affinity rules prevent controller pod scheduling during upgrades. For details on troubleshooting this scenario, see the TopoLVM troubleshooting notes.

## VolSync: Backup and Replication

VolSync provides asynchronous backup and replication capabilities for Kubernetes persistent volumes, supporting both scheduled backups and manual restore operations.

### Architecture

VolSync operates through two custom resources that define backup and restore operations:

- **ReplicationSource**: Defines scheduled backup operations from a source PVC
- **ReplicationDestination**: Defines restore operations to a destination PVC

Both resources use the Restic format for efficient, deduplicated backups with support for retention policies.

### Backup Configuration (ReplicationSource)

Workloads define backup schedules through ReplicationSource resources:

```yaml
spec:
  sourcePVC: "${APP}"
  trigger:
    schedule: "0 */6 * * *"  # Every 6 hours
  restic:
    copyMethod: Direct
    storageClassName: topolvm-thin-provisioner
    accessModes: [ReadWriteOnce]
    pruneIntervalDays: 7
    repository: "${APP}-volsync-secret"
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

### Restore Configuration (ReplicationDestination)

Restore operations use ReplicationDestination for one-time or recurring restores:

```yaml
spec:
  restic:
    accessModes: [ReadWriteOnce]
    cacheCapacity: 1Gi
    cacheStorageClassName: local-path
    capacity: 1Gi
    cleanupCachePVC: true
    cleanupTempPVC: true
    enableFileDeletion: true
    copyMethod: Snapshot
    moverSecurityContext:
      runAsUser: 1000
      runAsGroup: 1000
      fsGroup: 1000
    repository: "${APP}-volsync-secret"
    storageClassName: topolvm-thin-provisioner
    volumeSnapshotClassName: topolvm-thin-provisioner
  trigger:
    manual: restore-once
```

### Storage Backend

VolSync backups are stored in MinIO S3-compatible storage:

- **Endpoint**: `http://192.168.50.220:9010`
- **Path**: `s3://volsync/dev/${APP}`
- **Compression**: bzip2 (for data and WAL in database backups)
- **Credentials**: Managed via External Secrets Operator from Bitwarden

The MinIO storage provides durable, scalable backup storage accessible from any cluster for disaster recovery scenarios.

### Snapshot Cleanup

VolSync destination snapshots accumulate over time and require periodic cleanup. A CronJob runs weekly to delete snapshots older than 7 days:

```yaml
schedule: "0 2 * * 0"  # Sunday 2 AM
THRESHOLD_DAYS: 7
```

The cleanup job identifies snapshots by name pattern (`volsync-volsync-dst-`) and deletes those exceeding the retention threshold, preventing unbounded storage consumption.

### Dependencies

VolSync depends on TopoLVM for primary storage:

```yaml
dependsOn:
  - name: topolvm
    namespace: storage
```

This ensures TopoLVM CSI and storage classes are available before VolSync attempts backup or restore operations.

## Snapshot Controller

The snapshot-controller provides Kubernetes volume snapshot functionality, enabling instant point-in-time copies of persistent volumes.

### Capabilities

- **CRD Management**: CreateReplace strategy for CRD upgrades
- **Default Snapshot Class**: `topolvm-thin-provisioner` marked as cluster default
- **ServiceMonitor**: Prometheus metrics enabled for monitoring
- **Webhook**: Disabled (validation webhook not required for this deployment)

The snapshot-controller integrates with CSI drivers (TopoLVM, NFS) to create snapshots through the Kubernetes VolumeSnapshot API.

## NFS CSI Driver

The NFS CSI driver provides network-attached storage capabilities for workloads requiring shared access to the same volume from multiple pods.

### Configuration

- **Replicas**: 1 controller (single-node compatible)
- **External Snapshotter**: Disabled (snapshot-controller handles snapshots)
- **Version**: 4.13.4

The NFS driver enables provisioning of PVs backed by NFS shares, supporting ReadWriteMany access modes for workloads that need concurrent read/write access from multiple pods.

## Local Path Provisioner

The local-path-provisioner provides simple host-local storage for workloads that don't require the full capabilities of TopoLVM or need smaller volumes.

### Configuration

- **Default Path**: `/var/mnt/local-path-provisioner`
- **Version**: 0.0.37
- **Chart Source**: Containeroo charts

This provisioner creates directories on the host node and mounts them into pods, providing fast local storage without LVM overhead. It's commonly used for:

- VolSync cache storage during backup/restore operations
- Temporary scratch space for data processing
- Smaller application data volumes that don't require thin provisioning

## Storage Class Selection

Workloads choose the appropriate storage class based on their requirements:

| Storage Class | Use Case | Access Mode | Features |
|--------------|----------|-------------|----------|
| `topolvm-thin-provisioner` | Primary storage for databases, applications | ReadWriteOnce | Thin provisioning, snapshots, expansion |
| `local-path` | Cache, temporary storage, small volumes | ReadWriteOnce | Fast host-local, no snapshots |
| `nfs` | Shared storage, multi-writer workloads | ReadWriteMany | Network-attached, concurrent access |

## Operational Considerations

### LVM Management

The LVM volume group and thin pool must be manually created before TopoLVM can provision volumes. The `lvm-format-manual.yaml` provides a privileged pod for executing LVM commands:

```bash
# Enter the privileged pod
kubectl exec -it lvm-format-manual -- sh

# Install LVM tools
apk add --no-cache lvm2 nvme-cli

# Format and setup LVM
pvcreate /dev/nvme0n1
vgcreate lvm_vg /dev/nvme0n1
lvcreate --thinpool -l 100%FREE -n lvm_thin lvm_vg
```

### Volume Expansion

TopoLVM supports online volume expansion through the `allowVolumeExpansion: true` storage class setting. Workloads can resize their PVCs without pod restart:

```bash
kubectl patch pvc my-pvc -p '{"spec":{"resources":{"requests":{"storage":"20Gi"}}}}'
```

### Backup Verification

VolSync backups should be verified periodically by:

1. Checking ReplicationSource status for successful backups
2. Confirming objects exist in MinIO storage
3. Testing restore procedure through ReplicationDestination
4. Validating restored data integrity

### Monitoring

Storage components expose Prometheus metrics:

- **TopoLVM**: Volume provisioning, thin pool utilization
- **VolSync**: Backup/restore operations, transfer sizes
- **Snapshot Controller**: Snapshot creation/deletion rates

These metrics enable monitoring storage health, capacity planning, and backup reliability.
