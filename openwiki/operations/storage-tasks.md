---
type: operations
title: Storage Operations
description: LVM thin pool management, storage class usage, snapshot creation, and PVC provisioning troubleshooting for the cluster storage layer.
tags: [storage, lvm, topolvm, snapshot, pvc, troubleshooting, operations]
verified:
  - by: openwiki/0.4.3
    at: 2026-08-31T23:16:37.333Z
sources:
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
  - id: openwiki-source-9a91d01bb54fc0b7d652e6d3
    resource: repo://kubernetes/apps/storage/topolvm/README.md
  - id: openwiki-source-3714a051b30e9b02471fe9bf
    resource: repo://kubernetes/apps/storage/volsync/ks.yaml
  - id: openwiki-source-67d09412df5e9b5263585304
    resource: repo://lvm-format-manual.yaml
generated: { by: "openwiki/0.4.3", at: "2026-08-31T23:16:37.333Z" }
---

# Storage Operations

The storage layer requires regular maintenance and operational tasks to ensure reliable volume provisioning, backup operations, and optimal resource utilization. This guide covers LVM management, storage class selection, snapshot creation, and troubleshooting common PVC provisioning issues.

## LVM Thin Pool Management

The cluster uses LVM thin provisioning through TopoLVM to allocate storage on-demand. The thin pool must be monitored and maintained to prevent provisioning failures.

### Thin Pool Configuration

The LVM setup consists of three layers:

- **Physical Volume**: `/dev/nvme0n1` provides the base block device
- **Volume Group**: `lvm_vg` contains the physical volume
- **Thin Pool**: `lvm_thin` uses 100% of available space for on-demand allocation

TopoLVM manages the thin pool through a device class with the following configuration:

```yaml
deviceClasses:
  - name: thin
    volume-group: lvm_vg
    default: true
    spare-gb: 10
    type: thin
    thin-pool:
      name: lvm_thin
      overprovision-ratio: 10.0
```

### Overprovisioning Ratio

The thin pool uses an overprovisioning ratio of **10.0**, which allows provisioning up to 10x the physical disk capacity. This ratio is suitable for workloads that:

- Request large PVC sizes but use only a fraction of allocated space
- Have sparse data allocation patterns
- Don't write to all provisioned volumes simultaneously

**Monitoring overprovisioning**:
```bash
# Check thin pool usage on the node
sudo lvs lvm_vg/lvm_thin

# Check data and metadata percentages
# Data% should stay below 80% for safe operation
# Meta% indicates metadata pool utilization
```

**Adjusting the ratio**:
If you encounter provisioning failures due to insufficient space, reduce the overprovisioning ratio in `kubernetes/apps/storage/topolvm/app/helmrelease.yaml`. Lower ratios provide more conservative provisioning but reduce total allocatable capacity.

### Manual LVM Formatting

When setting up a new node or replacing a failed disk, use the manual LVM formatting guide. The process creates the required volume group and thin pool for TopoLVM.

**Formatting procedure**:

1. Deploy the privileged formatting pod:
   ```bash
   kubectl apply -f lvm-format-manual.yaml
   ```

2. Execute the LVM setup commands inside the pod:
   ```bash
   # Install required tools
   apk add --no-cache findutils nvme-cli lvm2

   # Wipe the disk (optional, for clean state)
   nvme format --lbaf=0 /dev/disk/nvme0n1 --force
   nvme format --block-size=4096 /dev/disk/nvme0n1 --force

   # Create physical volume
   pvcreate /dev/nvme0n1

   # Create volume group
   vgcreate lvm_vg /dev/nvme0n1
   vgchange -a y lvm_vg

   # Create thin pool using all available space
   lvcreate --thinpool -l 100%FREE -n lvm_thin lvm_vg
   ```

3. Verify the setup:
   ```bash
   sudo vgs
   sudo lvs
   ```

4. Delete the pod after completion:
   ```bash
   kubectl delete pod lvm-format-manual
   ```

## Storage Class Selection

The cluster provides multiple storage classes optimized for different workload patterns. Understanding the differences ensures proper performance and cost characteristics.

### TopoLVM Thin Provisioner (Default)

**Storage Class**: `topolvm-thin-provisioner`

**Characteristics**:
- **Type**: Block storage on local NVMe
- **Filesystem**: XFS (high-performance, supports online resize)
- **Binding Mode**: Immediate (provisions before pod scheduling)
- **Volume Expansion**: Enabled
- **Default Class**: Yes

**Use cases**:
- Databases (PostgreSQL, MySQL, Dragonfly)
- High I/O workloads
- Applications requiring low latency
- Production data stores

**Advantages**:
- Fast local NVMe performance
- Low latency compared to network storage
- Online volume expansion without pod restart
- CSI snapshot support

**Limitations**:
- Limited to single-node (no multi-node redundancy)
- Capacity tied to physical disk size
- Requires LVM thin pool management

### Local Path Provisioner

**Storage Class**: `local-path`

**Characteristics**:
- **Type**: Host-path mount
- **Path**: `/var/mnt/local-path-provisioner` on host
- **Binding Mode**: WaitForFirstConsumer (schedules after pod placement)
- **Volume Expansion**: Not supported

**Use cases**:
- Temporary scratch storage
- Caching layers
- VolSync backup cache
- Development/testing environments

**Advantages**:
- Simple host-path mounting
- No LVM overhead
- Suitable for ephemeral data

**Limitations**:
- No volume expansion
- No CSI snapshot support
- Host-path security considerations
- Not suitable for critical persistent data

**Example from VolSync configuration**:
```yaml
restic:
  cacheStorageClassName: local-path
  cacheCapacity: 2Gi
```

### Storage Class Comparison

| Feature | topolvm-thin-provisioner | local-path |
|---------|-------------------------|------------|
| Storage Type | Block (NVMe) | Host Path |
| Filesystem | XFS | Host fs |
| Volume Expansion | Yes | No |
| CSI Snapshots | Yes | No |
| Default | Yes | No |
| Performance | High | Medium |
| Use Case | Databases, production | Cache, temp |

## Volume Snapshot Creation

CSI volume snapshots provide instant point-in-time copies of volumes for backup and cloning operations. The snapshot-controller enables this functionality through the VolumeSnapshot API.

### Snapshot Configuration

The cluster deploys a default VolumeSnapshotClass for TopoLVM:

```yaml
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshotClass
metadata:
  name: topolvm-thin-provisioner
  annotations:
    snapshot.storage.kubernetes.io/is-default-class: "true"
driver: topolvm.io
deletionPolicy: Delete
```

**Deployment details**:
- Chart: `snapshot-controller` version 5.2.0
- Source: Piraeus Helm repository
- ServiceMonitor: Enabled for Prometheus metrics
- CRD upgrade policy: CreateReplace

### Creating Snapshots

Create a VolumeSnapshot to capture a point-in-time copy of a PVC:

```yaml
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: my-app-snapshot
spec:
  volumeSnapshotClassName: topolvm-thin-provisioner
  source:
    persistentVolumeClaimName: my-app-data
```

**Apply and monitor**:
```bash
kubectl apply -f snapshot.yaml

# Check snapshot status
kubectl get volumesnapshot my-app-snapshot

# View detailed status
kubectl describe volumesnapshot my-app-snapshot
```

**Snapshot restoration**:
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-app-restored
spec:
  storageClassName: topolvm-thin-provisioner
  dataSource:
    name: my-app-snapshot
    kind: VolumeSnapshot
    apiGroup: snapshot.storage.k8s.io/v1
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

### When to Use Snapshots

**Appropriate use cases**:
- Pre-upgrade backups (quick rollback if upgrade fails)
- Testing/dev environment cloning
- Temporary backups before major changes
- Complement to VolSync (snapshots are fast, VolSync provides off-cluster backup)

**Limitations**:
- Snapshots reside in the same storage system
- Not a replacement for off-cluster backup
- Deleted when VolumeSnapshot resource is deleted (DeletionPolicy: Delete)
- Use VolSync for disaster recovery and long-term retention

## PVC Provisioning Troubleshooting

Persistent Volume Claim provisioning failures can stem from storage capacity issues, configuration errors, or component availability. This section covers common issues and resolution steps.

### PVC Stuck in Pending

**Symptoms**:
- PVC remains in `Pending` phase indefinitely
- Events show provisioning failures
- Pods fail to start with `ContainerCreating` state

**Diagnostic steps**:

1. **Check PVC events**:
   ```bash
   kubectl describe pvc my-data -n <namespace>
   ```

2. **Verify storage class exists**:
   ```bash
   kubectl get sc topolvm-thin-provisioner
   kubectl get sc local-path
   ```

3. **Check TopoLVM node capacity**:
   ```bash
   kubectl get topolvmnode -A
   kubectl describe topolvmnode <node-name> | grep -A 5 "AvailableCapacity"
   ```

**Common causes and solutions**:

| Issue | Symptom | Resolution |
|-------|---------|------------|
| Wrong storage class name | `StorageClassNotFound` event | Verify `storageClassName` matches available classes |
| No TopoLVM capacity | `InsufficientCapacity` event | Check thin pool usage, add disk space |
| CSI driver not ready | `Failed to provision` event | Verify topolvm-controller and lvmd pods running |
| LVM thin pool full | Volume allocation failures | Check `sudo lvs lvm_vg/lvm_thin`, add physical storage |

### TopoLVM Component Failures

**Symptoms**:
- New PVCs fail to provision
- Existing volumes still work but new allocations fail
- TopoLVM controller pods in CrashLoopBackOff

**Diagnostic steps**:

1. **Check TopoLVM pods**:
   ```bash
   kubectl get pods -n storage -l app.kubernetes.io/name=topolvm
   ```

2. **Check controller logs**:
   ```bash
   kubectl logs -n storage topolvm-controller-<hash>
   ```

3. **Check lvmd status on nodes**:
   ```bash
   # The lvmd daemon runs embedded in each node
   kubectl get pods -n storage -l app.kubernetes.io/component=lvmd
   ```

### Single-Node Upgrade Issues

**Problem**: After TopoLVM HelmRelease upgrade, the `topolvm-controller` pod remains in `Pending` state with `node(s) didn't satisfy existing pods anti-affinity rules`.

**Root Cause**: The TopoLVM chart defaults to `replicaCount: 2` with required Pod anti-affinity rules. In single-node clusters, the anti-affinity rules prevent the second pod from scheduling during rolling updates.

**Prevention**: The HelmRelease is pre-configured for single-node compatibility:

```yaml
controller:
  replicaCount: 1
  affinity: ""
  updateStrategy:
    type: Recreate
```

**Manual recovery if upgrade is stuck**:

1. **Delete the pending pod**:
   ```bash
   kubectl -n storage delete pod topolvm-controller-xxxxxxxx
   ```

2. **Or scale old ReplicaSet to 0**:
   ```bash
   kubectl -n storage scale rs topolvm-controller-xxxxxxxx --replicas=0
   ```

3. **Trigger Flux reconciliation**:
   ```bash
   flux reconcile helmrelease topolvm -n storage
   ```

4. **Verify recovery**:
   ```bash
   kubectl -n storage get pods -l app.kubernetes.io/name=topolvm
   flux get helmreleases -n storage topolvm
   ```

### Volume Expansion Failures

**Symptoms**:
- PVC resize request not reflected in filesystem
- Pod still sees old volume size
- Expansion stuck in `InProgress`

**Diagnostic steps**:

1. **Check PVC expansion status**:
   ```bash
   kubectl get pvc my-data -n <namespace> -o yaml
   kubectl describe pvc my-data -n <namespace>
   ```

2. **Verify filesystem expansion** (from pod):
   ```bash
   kubectl exec -n <namespace> <pod> -- df -h /mount/path
   xfs_growfs /mount/path  # For XFS filesystems
   ```

**Common issues**:
- XFS filesystems support online expansion without restart
- Some applications require pod restart to recognize new size
- Check TopoLVM CSI logs for expansion errors

### Storage Capacity Planning

**Monitor thin pool usage**:
```bash
# On the node, check LVM thin pool utilization
sudo lvs lvm_vg/lvm_thin -o+data_percent,meta_percent

# Keep Data% below 80% for safe operation
# Monitor Meta% for metadata pool exhaustion
```

**Check PVC allocation vs usage**:
```bash
# List all PVCs with requested vs actual usage
kubectl get pvc -A

# Check actual disk usage from pods
kubectl exec -n <namespace> <pod> -- df -h /data
```

**Plan capacity expansion**:
- Monitor thin pool data percentage trends
- Add physical disks before reaching 80% utilization
- Adjust overprovisioning ratio if consistently over-provisioned
- Consider moving workloads to different storage classes

## Related Operations

- [Storage Architecture](/openwiki/concepts/storage-architecture.md) - Component deployment and LVM configuration details
- [VolSync Tasks](/openwiki/operations/volsync-tasks.md) - Backup and restore operations for PVCs
- [Daily Operations](/openwiki/operations/daily-operations.md) - Routine storage monitoring and maintenance
- [Troubleshooting](/openwiki/operations/troubleshooting.md) - Common storage issues and resolution steps
