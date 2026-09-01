---
type: concept
title: Storage Classes and Provisioning
description: Available storage classes for Kubernetes workloads including TopoLVM thin provisioning, local-path host storage, and NFS network-attached storage with guidance on when to use each class and how PVC provisioning works.
tags: [storage, storageclasses, pvc, provisioning, kubernetes, csi]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-01T21:54:26.927Z
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
generated: { by: "openwiki/0.5.0", at: "2026-09-01T21:54:26.927Z" }
---

# Storage Classes and Provisioning

The cluster provides three storage classes optimized for different workload requirements: **TopoLVM thin provisioning** for high-performance local block storage, **local-path** for lightweight host-local volumes, and **NFS** for network-attached shared storage. PersistentVolumeClaims (PVCs) are dynamically provisioned through CSI drivers integrated with the underlying storage infrastructure.

## Storage Classes Overview

```mermaid
flowchart TD
    PVC[PersistentVolumeClaim] -->|spec.storageClass| SC{StorageClass Selection}
    
    SC -->|topolvm-thin-provisioner<br>Default Class| TopoLVM[TopoLVM CSI]
    SC -->|local-path| Local[Local Path Provisioner]
    SC -->|nfs| NFS[NFS CSI Driver]
    
    TopoLVM -->|CSI Provisioning| LVMD[Embedded lvmd Daemon]
    LVMD -->|LVM Operations| VG[LVM Volume Group lvm_vg]
    VG --> ThinPool[Thin Pool lvm_thin]
    ThinPool -->|On-demand allocation| LVs[Logical Volumes]
    
    Local -->|Host Directories| HostPath[/var/mnt/local-path-provisioner]
    
    NFS -->|Network Mounts| NFSShare[NFS Shares]
    
    TopoLVM -.->|VolumeSnapshot| SnapCtrl[Snapshot Controller]
    NFS -.->|VolumeSnapshot| SnapCtrl
```

*Figure: Storage class provisioning flow showing how PVCs are fulfilled through different CSI drivers and storage backends.*

## Storage Class Selection

| Storage Class | Type | Use Case | Access Mode | Features |
|--------------|------|----------|-------------|----------|
| `topolvm-thin-provisioner` | Local Block | Primary storage for databases, applications requiring high performance | ReadWriteOnce | Thin provisioning, snapshots, volume expansion, default class |
| `local-path` | Host Local | Cache storage, temporary volumes, smaller workloads | ReadWriteOnce | Fast host-local access, no LVM overhead |
| `nfs` | Network Attached | Shared storage, multi-pod concurrent access | ReadWriteMany | Network-attached, concurrent read/write access |

## TopoLVM: Default Storage Class

**`topolvm-thin-provisioner`** serves as the cluster's default storage class, providing high-performance local block storage through LVM thin provisioning. It combines the flexibility of Kubernetes CSI with the efficiency of LVM thin pools for optimal space utilization.

### Capabilities and Configuration

The default storage class provides:

- **Filesystem**: XFS (high-performance, robust for databases and transactional workloads)
- **Binding Mode**: Immediate (provisions volume before pod scheduling)
- **Volume Expansion**: Enabled (allows PVC resize without pod restart)
- **Default Class**: Yes (used when no storage class specified in PVC)
- **Access Mode**: ReadWriteOnce (single pod read/write access)

Example PVC specification:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: topolvm-thin-provisioner
```

### TopoLVM CSI Architecture

TopoLVM operates with an embedded lvmd daemon running on each node, managed by the TopoLVM controller:

- **Controller Deployment**: Single replica (`replicaCount: 1`) with Recreate update strategy
- **Embedded lvmd**: Each node runs an embedded lvmd daemon (`lvmdEmbedded: true`) that manages LVM operations locally, eliminating the need for a separate daemonset
- **CSI Driver**: TopoLVM CSI driver implements the Kubernetes CSI interface for volume provisioning
- **Metrics**: Prometheus metrics enabled for monitoring volume operations and thin pool utilization

### LVM Thin Provisioning

TopoLVM uses a single device class configured for thin provisioning:

| Property | Value | Description |
|----------|-------|-------------|
| Device Class Name | `thin` | Identifier for this storage tier |
| Volume Group | `lvm_vg` | LVM volume group containing physical storage |
| Thin Pool | `lvm_thin` | Logical volume acting as thin pool |
| Spare Capacity | 10 GB | Reserved for metadata and LVM operations |
| Overprovision Ratio | 10.0 | Allows provisioning up to 10x physical capacity |
| Type | Thin | Allocates physical storage on-demand |

The thin pool design enables efficient space utilization by allocating physical storage only as data is written. The overprovision ratio allows the cluster to provision more logical storage than physically available, suitable for workloads that don't use full capacity simultaneously.

### Manual LVM Setup Requirement

The LVM volume group and thin pool must be manually created before TopoLVM can provision volumes. The `lvm-format-manual.yaml` provides a privileged pod for disk initialization:

```bash
# Apply the privileged pod
kubectl apply -f lvm-format-manual.yaml

# Enter the pod
kubectl exec -it lvm-format-manual -- sh

# Install LVM tools
apk add --no-cache lvm2 nvme-cli

# Create physical volume, volume group, and thin pool
pvcreate /dev/nvme0n1
vgcreate lvm_vg /dev/nvme0n1
vgchange -a y lvm_vg
lvcreate --thinpool -l 100%FREE -n lvm_thin lvm_vg
```

This manual setup is required only once per cluster before deploying TopoLVM.

### Single-Node Cluster Configuration

The TopoLVM deployment is optimized for single-node clusters to prevent upgrade failures. Default TopoLVM chart settings include pod anti-affinity rules and `replicaCount: 2`, which causes rolling upgrades to fail in single-node environments when the new replica cannot schedule.

The deployment prevents this through three configuration overrides:

- **Replica Count**: 1 (prevents scheduling conflicts in single-node environments)
- **Anti-Affinity**: Disabled (`affinity: ""`) - removes default pod anti-affinity rules
- **Update Strategy**: Recreate (ensures old pod deleted before new pod created)

This configuration prevents the common single-node issue where default anti-affinity rules prevent controller pod scheduling during upgrades.

### Volume Snapshot Support

TopoLVM integrates with the snapshot-controller for instant point-in-time volume snapshots:

- **Snapshot Class**: `topolvm-thin-provisioner`
- **Driver**: `topolvm.io`
- **Deletion Policy**: Delete (snapshots deleted when VolumeSnapshot resource deleted)
- **Default**: Yes (used when no snapshot class specified)

Example VolumeSnapshot:

```yaml
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: data-snapshot
spec:
  volumeSnapshotClassName: topolvm-thin-provisioner
  source:
    persistentVolumeClaimName: data-pvc
```

### Volume Expansion

TopoLVM supports online volume expansion through the `allowVolumeExpansion: true` storage class setting. Workloads can resize their PVCs without pod restart:

```bash
kubectl patch pvc data-pvc -p '{"spec":{"resources":{"requests":{"storage":"20Gi"}}}}'
```

The CSI driver handles the filesystem expansion (XFS grow) online without interrupting running pods.

## Local Path Provisioner

**`local-path`** provides simple host-local storage for workloads that don't require the full capabilities of TopoLVM or need smaller volumes.

### Configuration

- **Version**: 0.0.37 from Containeroo charts
- **Default Path**: `/var/mnt/local-path-provisioner`
- **Chart Source**: `https://charts.containeroo.ch`

The provisioner creates directories on the host node and mounts them directly into pods, providing fast local storage without LVM overhead.

### Use Cases

The local-path storage class is commonly used for:

- **VolSync cache storage**: Temporary scratch space during backup/restore operations
- **Temporary data processing**: Short-lived workloads with ephemeral data
- **Smaller application volumes**: Workloads that don't require thin provisioning or snapshots
- **Development/testing**: Non-critical workloads where simplicity is preferred

Example PVC specification:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: cache-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
  storageClassName: local-path
```

## NFS CSI Driver

**`nfs`** provides network-attached storage capabilities for workloads requiring shared access to the same volume from multiple pods.

### Configuration

- **Version**: 4.13.4
- **Replicas**: 1 controller (single-node compatible)
- **External Snapshotter**: Disabled (snapshot-controller handles snapshots)
- **Access Mode**: ReadWriteMany (concurrent read/write from multiple pods)

The NFS driver enables provisioning of PVs backed by NFS shares, supporting multi-writer scenarios that local storage cannot handle.

### Use Cases

The NFS storage class is appropriate for:

- **Shared application data**: Multiple pods needing concurrent access to the same files
- **Media storage**: Images, videos, or other assets shared across services
- **Configuration sharing**: Common configuration files or templates
- **Document management**: Collaborative editing or file management systems

## PVC Provisioning Flow

When a workload creates a PVC, the provisioning follows this sequence:

1. **PVC Creation**: User creates PVC with `storageClassName` field
2. **StorageClass Lookup**: Kubernetes retrieves the StorageClass definition
3. **CSI Provisioning**: The appropriate CSI driver receives a provisioning call
4. **Volume Creation**: The CSI driver creates the underlying volume:
   - **TopoLVM**: lvmd creates thin logical volume in `lvm_vg/lvm_thin`
   - **local-path**: Provisioner creates directory in `/var/mnt/local-path-provisioner`
   - **NFS**: CSI driver creates NFS share and mounts it
5. **PV Binding**: PersistentVolume is automatically bound to the PVC
6. **Pod Mount**: Pod receives volume mount and can access the storage

### Default Storage Class Behavior

When a PVC is created without specifying a storage class:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: auto-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  # storageClassName omitted - uses default
```

The cluster provisions the volume using `topolvm-thin-provisioner` (the default storage class). This behavior ensures workloads get high-performance thin-provisioned storage by default.

### Storage Class Selection for Workloads

Workloads should select storage classes based on their requirements:

**For databases and stateful applications requiring high performance:**
```yaml
storageClassName: topolvm-thin-provisioner  # XFS, thin provisioning, snapshots
```

**For cache and temporary storage:**
```yaml
storageClassName: local-path  # Fast host-local, simpler than LVM
```

**For shared storage accessed by multiple pods:**
```yaml
storageClassName: nfs  # ReadWriteMany access
```

## Storage Component Deployment Order

Storage components deploy in strict dependency order to ensure proper initialization:

1. **snapshot-controller** deploys first, providing the VolumeSnapshot API and CRDs
2. **TopoLVM** deploys second, depending on snapshot-controller for CSI snapshot support
3. **VolSync** deploys third, depending on TopoLVM for storage classes and CSI driver
4. **NFS CSI** and **local-path-provisioner** deploy independently

All components deploy to the `storage` namespace with standardized labels and resource management through Flux Kustomizations.

## Operational Considerations

### Monitoring Storage Capacity

Monitor these metrics to ensure storage health:

- **TopoLVM thin pool utilization**: Available space in `lvm_thin` pool
- **TopoLVM volume provisioning**: Rate of PVC creation and sizing
- **Local-path usage**: Host disk consumption at `/var/mnt/local-path-provisioner`
- **NFS share capacity**: Network storage availability

### Troubleshooting Provisioning Failures

**PVC stuck in Pending state:**
- Verify the storage class exists: `kubectl get storageclass`
- Check CSI driver pods are running: `kubectl -n storage get pods`
- For TopoLVM, verify LVM is configured: `kubectl -n storage logs -l app.kubernetes.io/name=topolvm`
- Ensure sufficient capacity exists in the underlying storage

**TopoLVM single-node upgrade issues:**
In single-node clusters, TopoLVM upgrades may fail with:
- Controller pod stuck in `Pending` state
- Error: `node(s) didn't satisfy existing pods anti-affinity rules`
- HelmRelease timeout with `context deadline exceeded`

The current deployment prevents this with `replicaCount: 1`, disabled anti-affinity, and Recreate strategy. If issues persist, manually delete pending pods:

```bash
kubectl -n storage delete pod topolvm-controller-xxxxxxxx
kubectl -n storage scale rs topolvm-controller-xxxxxxxx --replicas=0
flux reconcile kustomization topolvm -n storage --with-source
flux reconcile helmrelease topolvm -n storage
```

### Volume Expansion Best Practices

When expanding volumes:
1. Verify the storage class supports expansion (`allowVolumeExpansion: true`)
2. Check available capacity in the underlying storage (LVM thin pool, host disk, NFS share)
3. Patch the PVC with new size: `kubectl patch pvc <name> -p '{"spec":{"resources":{"requests":{"storage":"<new-size>"}}}}'`
4. Verify the resize completed: `kubectl get pvc <name>` - check `status.capacity`
5. For filesystems requiring online growth (XFS), the CSI driver handles this automatically

### Snapshot Management

Volume snapshots created through the TopoLVM snapshot class should be managed to prevent unbounded storage consumption:

- **Review snapshots regularly**: `kubectl get volumesnapshots -A`
- **Delete outdated snapshots**: `kubectl delete volumesnapshot <name> -n <namespace>`
- **VolSync cleanup**: The cluster includes a CronJob that runs weekly (Sunday 2 AM) to delete VolSync destination snapshots older than 7 days
- **Consider retention policies**: Implement automated cleanup for application-specific snapshots

## Related Documentation

- **Storage Architecture**: Detailed component relationships and integration patterns
- **VolSync Backup/Restore**: Automated backup and disaster recovery procedures
