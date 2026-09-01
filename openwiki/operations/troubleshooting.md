---
type: operations
title: Troubleshooting Guide
description: Common issues and solutions for the Talos Kubernetes cluster, including TopoLVM single-node upgrade problems, Flux reconciliation failures, secret decryption issues, and single-node architecture constraints.
tags: [troubleshooting, operations, flux, topolvm, secrets, single-node, sops]
sources:
  - id: openwiki-source-6378149bc01898a8718f6f2d
    resource: repo://.github/workflows/flux-local.yaml
  - id: openwiki-source-240e6406ed4b6841961679cb
    resource: repo://.sops.yaml
  - id: openwiki-source-9baccf3ae41f07f1fd5a1914
    resource: repo://kubernetes/apps/storage/topolvm/app/helmrelease.yaml
  - id: openwiki-source-9a91d01bb54fc0b7d652e6d3
    resource: repo://kubernetes/apps/storage/topolvm/README.md
  - id: openwiki-source-244e2919bbe6d12c6c8c9757
    resource: repo://kubernetes/components/common/sops/sops-age.sops.yaml
  - id: openwiki-source-0696023deccf378a358f7526
    resource: repo://kubernetes/flux/cluster/ks.yaml
generated: { by: "openwiki/0.4.3", at: "2026-08-29T21:52:21.026Z" }
verified:
  - by: openwiki/0.5.0
    at: 2026-09-01T21:54:26.927Z
---

# Troubleshooting Guide

Common operational issues and their solutions for the Talos Kubernetes cluster. This guide covers TopoLVM single-node upgrade failures, Flux reconciliation problems, SOPS secret decryption issues, and known constraints of the single-node architecture.

## TopoLVM Single-Node Upgrade Issues

### Problem: Controller Pod Pending During Upgrade

**Symptoms:**
- After a TopoLVM HelmRelease upgrade, the `topolvm-controller` pod remains in `Pending` state
- `kubectl describe pod` shows `node(s) didn't satisfy existing pods anti-affinity rules`
- Flux reports `context deadline exceeded` and Kustomization is `Stalled`

**Root Cause:**
The TopoLVM chart defaults to `replicaCount: 2` with required Pod anti-affinity rules. In a single-node cluster, the anti-affinity rules prevent the second pod from scheduling during rolling updates, causing Helm's wait logic to timeout.

**Solution:**

The TopoLVM HelmRelease is pre-configured for single-node compatibility (`kubernetes/apps/storage/topolvm/app/helmrelease.yaml#L51-L55`):

```yaml
controller:
  replicaCount: 1
  affinity: ""
  updateStrategy:
    type: Recreate
```

If you encounter this issue:

1. **Verify the configuration is applied**:
   ```bash
   flux --namespace storage reconcile helmrelease topolvm
   ```

2. **If pods remain pending**, manually delete the old controller pod:
   ```bash
   kubectl -n storage delete pod topolvm-controller-<old-suffix>
   ```

3. **For severe cases**, scale the old ReplicaSet to 0:
   ```bash
   kubectl -n storage scale rs topolvm-controller-<old-suffix> --replicas=0
   ```

4. **Verify recovery**:
   ```bash
   kubectl -n storage get pods -l app.kubernetes.io/name=topolvm
   flux -n storage get helmreleases topolvm
   ```

**Prevention:**
Always set `replicaCount: 1`, disable affinity (`affinity: ""`), and use `Recreate` update strategy for any stateful controllers in single-node clusters. This prevents scheduling conflicts during upgrades.

## Flux Reconciliation Failures

### Problem: Kustomization Stalled or Timeout

**Symptoms:**
- `flux get kustomizations` shows status as `Stalled`
- Reconciliation logs show errors or timeouts
- Changes in Git are not applied to the cluster

**Common Causes and Solutions:**

1. **Missing or Invalid SOPS Secret**
   - **Check**: `kubectl get secret sops-age -n flux-system`
   - **Solution**: Ensure the `sops-age` secret exists and contains the correct age private key
   - **Verification**: Test decryption with `sops --decrypt <file>.sops.yaml`

2. **Dependency Not Ready**
   - **Check**: `flux get kustomizations --all-namespaces` for dependent resources
   - **Solution**: Ensure all `dependsOn` resources are Ready before reconciling
   - **Example**: TopoLVM depends on `snapshot-controller`, Cilium Gateway depends on `cert-manager`
   - **Debug**: Use `kubectl describe kustomization <name> -n <namespace>` to see dependency status

3. **Helm Chart Rendering Errors**
   - **Check**: `flux logs helmrelease <name> -n <namespace>`
   - **Solution**: Validate values syntax and chart compatibility
   - **Prevention**: Use flux-local CI workflow to catch rendering errors before merge

4. **Source Repository Issues**
   - **Check**: `flux get sources all`
   - **Solution**: Verify GitRepository/HelmRepository URLs and authentication
   - **GitHub tokens**: Ensure `flux-system-https` has valid authentication

**General Troubleshooting Commands:**

```bash
# Check all Flux resources
flux get sources all
flux get kustomizations --all-namespaces

# View reconciliation logs
flux -n flux-system logs kustomization flux-system --tail 50
flux -n <namespace> logs kustomization <name> --tail 50
flux -n <namespace> logs helmrelease <name> --tail 50

# Force reconciliation
flux reconcile kustomization <name> -n <namespace> --with-source
flux reconcile helmrelease <name> -n <namespace>
```

**Reconciliation Configuration:**
- Default interval: 1 hour for most Kustomizations
- Timeout: 5 minutes (`kubernetes/flux/cluster/ks.yaml#L43,L64,L93`)
- Retry interval: 2 minutes on failure
- Suspended resources can be resumed with `flux resume kustomization <name>`

## Secret Decryption Problems

### Problem: SOPS Decryption Fails

**Symptoms:**
- Flux reconciliation fails with decryption errors
- Logs show `failed to decrypt` or `sops-age secret not found`
- Encrypted secrets are not applied to the cluster

**Common Causes and Solutions:**

1. **Missing `sops-age` Secret**
   - **Check**: `kubectl get secret sops-age -n flux-system`
   - **Solution**: Create the secret from your local `age.key`:
     ```bash
     kubectl create secret generic sops-age \
       --from-file=age.agekey=age.key \
       -n flux-system
     ```

2. **Key Mismatch**
   - **Check**: Compare `age.key` local content with cluster secret
   - **Solution**: Ensure the age key in the cluster matches your local encryption key
   - **Verification**: Test with `sops --decrypt --encrypted-age-key <recipients> <file>.sops.yaml`

3. **Incorrect Encryption Rules**
   - **Check**: Review `.sops.yaml` for path regex patterns
   - **Solution**: Ensure file paths match encryption rules:
     - `talos/.*\.sops\.ya?ml`: Whole-file encryption
     - `(bootstrap|kubernetes)/.*\.sops\.ya?ml`: `data`/`stringData` only

4. **File Format Issues**
   - **Check**: `sops <file>.sops.yaml` to verify file structure
   - **Solution**: Re-encrypt the file if corrupted:
     ```bash
     sops --decrypt <file>.sops.yaml | sops --encrypt > <file>.sops.yaml
     ```

**Prevention:**
- Never commit decrypted secrets to Git
- Always verify files remain encrypted after editing: `sops <file>.sops.yaml`
- Keep `age.key` backed up securely and never commit it
- Test decryption locally before pushing changes

### Problem: External Secrets Not Syncing

**Symptoms:**
- ExternalSecret shows `SecretSyncedError` or `NotFound` status
- Target Kubernetes secrets are not created
- Applications fail to start due to missing secrets

**Troubleshooting Steps:**

1. **Check Bitwarden Connect status**:
   ```bash
   kubectl get pods -n external-secrets -l app.kubernetes.io/name=bitwarden-cli
   kubectl logs -n external-secrets deployment/bitwarden-cli --tail=50
   ```

2. **Verify ClusterSecretStore exists**:
   ```bash
   kubectl get clustersecretstore
   ```

3. **Check ExternalSecret status**:
   ```bash
   kubectl get externalsecret -n <namespace> <name> -o yaml
   ```

4. **Verify target secret was created**:
   ```bash
   kubectl get secret -n <namespace> <secret-name>
   ```

**Common Issues:**
- Bitwarden credentials incorrect or expired in `bitwarden-cli` secret
- Bitwarden entry ID does not exist or access is denied
- Custom field names in Bitwarden don't match ExternalSecret spec
- Network connectivity issues between cluster and Bitwarden instance

## Single-Node Architecture Constraints

The cluster runs a **single-node control plane** with specific operational constraints that affect troubleshooting and maintenance.

### Known Constraints

1. **Pod Anti-Affinity Rules**
   - **Constraint**: Controllers with `replicaCount > 1` and anti-affinity rules cannot schedule pods
   - **Impact**: Helm upgrades for controllers like TopoLVM will fail with default settings
   - **Solution**: Always set `replicaCount: 1` and `affinity: ""` for stateful controllers

2. **Control Plane Unavailability During Reboots**
   - **Constraint**: Single control plane means API server is unavailable during Talos upgrades
   - **Impact**: `kubectl` commands fail during node reboots
   - **Mitigation**: Use Virtual IP (192.168.50.10) for API endpoint; plan maintenance windows

3. **No High Availability for etcd**
   - **Constraint**: Single etcd instance with no quorum backup
   - **Impact**: Cluster data loss if node fails completely
   - **Mitigation**: Regular VolSync backups of application data; etcd backups via Talos

4. **Resource Competition**
   - **Constraint**: Control plane and workloads share the same node resources
   - **Impact**: High resource usage by workloads can affect control plane stability
   - **Mitigation**: Monitor resource usage; set appropriate resource requests/limits

5. **Upgrade Coordination Required**
   - **Constraint**: Cannot perform rolling upgrades across control plane nodes
   - **Impact**: Talos upgrades require node downtime
   - **Procedure**: Use `task talos:upgrade-node IP=<node-ip>` for single-node upgrades

### Operational Implications

**When performing maintenance:**
- Plan for brief API server unavailability during Talos upgrades
- Schedule upgrades during low-traffic periods
- Ensure critical applications have VolSync backups before upgrades
- Test controller upgrades in non-production environments first

**When deploying new applications:**
- Avoid Helm charts that require multiple controller replicas
- Disable anti-affinity rules for single-node compatibility
- Use `Recreate` update strategies for stateful controllers
- Consider resource limits to prevent starving control plane components

**Monitoring considerations:**
- Set up alerts for control plane component health
- Monitor node resource utilization (CPU, memory, disk)
- Track etcd performance and backup success
- Monitor TopoLVM thin pool utilization

## Cilium Connectivity Issues

### Problem: Pod Communication Failures

**Symptoms:**
- Pods cannot reach each other across namespaces
- DNS resolution fails for cluster services
- External ingress via Gateway API not working
- `kubectl exec` timeouts or connection refused

**Common Causes and Solutions:**

1. **CNI Not Ready**
   - **Check**: `kubectl get pods -n kube-system -l k8s-app=cilium`
   - **Solution**: Ensure all Cilium pods are Running
   - **Verify**: `cilium status` (if cilium CLI installed) or check pod logs
   - **Impact**: If Cilium is not ready, all pod-to-pod communication fails

2. **Pod CIDR Misconfiguration**
   - **Check**: `kubectl get nodes -o custom-columns=NAME:.metadata.name,CIDR:.spec.podCIDR`
   - **Expected**: Pod CIDR should be `10.42.0.0/16` (configured in Cilium values)
   - **Solution**: Verify Cilium IPAM mode is set to `kubernetes` in helm values

3. **L2 Announcements Not Working**
   - **Symptoms**: LoadBalancer IPs not responding on local network
   - **Check**: `kubectl get ciliuml2announcement -A`
   - **Verify**: Ensure `l2announcements.enabled: true` in Cilium configuration
   - **Debug**: Check Cilium agent logs for BPF program errors

4. **Gateway API Issues**
   - **Check**: `kubectl get gateway -A`
   - **Verify**: Gateway IPs (external: `192.168.50.13`, internal: `192.168.50.12`) are assigned
   - **Debug**: `kubectl describe gateway <name> -n kube-system`
   - **Dependencies**: Cilium Gateway depends on `cert-manager` being ready first

5. **Connectivity Checker**
   - **Gatus monitors** external endpoint connectivity via ICMP to `1.1.1.1:53`
   - **Check**: `kubectl get gatusendpoints -n observability`
   - **Purpose**: Validates network connectivity from the cluster to external services
   - **Alerts**: Prometheus rules fire when external endpoints fail for 5+ minutes

**General Troubleshooting Commands:**

```bash
# Check Cilium status
kubectl get pods -n kube-system -l k8s-app=cilium
kubectl logs -n kube-system -l k8s-app=cilium --tail=50

# Check Gateway configuration
kubectl get gateway -A
kubectl get httproute -A

# Test pod connectivity
kubectl run test-pod --image=nicolaka/netshoot --rm -it --restart=Never -- curl <service-url>

# Check L2 announcements
kubectl get ciliuml2announcement -A
kubectl get ciliumloadbalancerippool -A
```

## VolSync Backup and Restore Failures

### Problem: Restic Repository Locked

**Symptoms:**
- VolSync replication jobs fail with "repository is locked" errors
- Backup/restore jobs hang without completing
- Job logs show `restic check` failures

**Root Cause:**
Restic repositories use a lock file to prevent concurrent modifications. If a previous job failed or was interrupted, the lock may not have been released properly.

**Solutions:**

1. **Unlock All Repositories** (Bulk)
   ```bash
   task volsync:unlock CLUSTER=main
   ```
   This patches all `replicationsources` to unlock their restic repositories simultaneously.

2. **Unlock Single Repository** (Targeted)
   ```bash
   task volsync:unlock-local CLUSTER=main NS=<namespace> APP=<app-name>
   ```
   Creates a one-time job that runs `restic unlock --remove-all` for the specific application.

3. **Manual Unlock** (Emergency)
   ```bash
   kubectl exec -n <namespace> <volsync-job-pod> -- restic unlock --remove-all
   kubectl exec -n <namespace> <volsync-job-pod> -- restic check
   ```

### Problem: VolSync Job Failures

**Symptoms:**
- ReplicationSource/ReplicationDestination stuck in `InProgress`
- Job pods show `Error` or `Failed` status
- PVCs not being backed up or restored

**Troubleshooting Steps:**

1. **Check Job Status and Logs**
   ```bash
   # Find the VolSync job
   kubectl get jobs -n <namespace> -l app.kubernetes.io/name=volsync

   # Check job logs
   kubectl logs -n <namespace> job/volsync-src-<app> --container main

   # Check ReplicationSource status
   kubectl get replicationsources -n <namespace> <app> -o yaml
   ```

2. **Verify Storage Backend Connectivity**
   - **MinIO**: Check if `192.168.50.220:9010` is reachable from cluster
   - **R2/Cloudflare**: Verify credentials in `*-volsync-r2-secret` are valid
   - **Test**: Create a test pod and try to access the storage endpoint

3. **Check PVC and Storage Class**
   ```bash
   # Verify source PVC exists
   kubectl get pvc -n <namespace> <claim-name>

   # Check storage class
   kubectl get sc topolvm-thin-provisioner

   # Verify VolSync can access the PVC
   kubectl describe pvc -n <namespace> <claim-name>
   ```

4. **Common Job Issues**

   **Insufficient Resources:**
   - **Check**: `kubectl describe pod <volsync-job-pod>` for "Insufficient cpu/memory" events
   - **Solution**: Adjust mover resources in ReplicationSource spec

   **Permission Denied:**
   - **Check**: Job logs for "permission denied" errors
   - **Solution**: Verify `moverSecurityContext.runAsUser/runAsGroup` match PVC ownership
   - **Debug**: Check PVC fsGroup and pod security context

   **Repository Not Found:**
   - **Check**: Storage backend URL and bucket/container names
   - **Solution**: Initialize a new backup or verify existing repository path
   - **Test**: Use `restic init` with the same credentials to verify connectivity

### Problem: Restore Job Fails

**Symptoms:**
- ReplicationDestination job fails after creation
- Application pods crash after restore
- Data appears corrupted or missing

**Solution Workflow:**

```bash
# 1. List available snapshots
task volsync:list NS=<namespace> APP=<app>

# 2. Perform restore (suspends app, wipes PVC, restores data, resumes app)
task volsync:restore NS=<namespace> APP=<app> PREVIOUS=2

# 3. Monitor restore progress
kubectl logs -n <namespace> job/volsync-dst-<app> --container main -f

# 4. Verify application started
kubectl get pods -n <namespace> -l app.kubernetes.io/name=<app>
```

**Restore Process Details:**

1. **Suspend Phase**: Suspends Flux Kustomization, scales down application controller
2. **Wipe Phase**: Creates job to delete all PVC data (prevents conflicts)
3. **Restore Phase**: Creates ReplicationDestination with `previous: N` snapshots
4. **Resume Phase**: Scales up application controller, resumes Flux reconciliation

**Manual Restore (Advanced):**

If the automated restore fails, you can manually restore from a snapshot:

```bash
# 1. Create ReplicationDestination manifest
cat <<EOF | kubectl apply -f -
apiVersion: volsync.backube/v1alpha1
kind: ReplicationDestination
metadata:
  name: <app>-manual
  namespace: <namespace>
spec:
  restic:
    repository: <app>-volsync
    destinationPVC: <claim-name>
    storageClassName: topolvm-thin-provisioner
    previous: 2
    moverSecurityContext:
      runAsUser: <puid>
      runAsGroup: <pgid>
    accessModes: [ReadWriteOnce]
    capacity: <size>
EOF

# 2. Wait for job completion
kubectl wait -n <namespace> job/volsync-dst-<app>-manual --for=condition=complete --timeout=120m

# 3. Check job logs
kubectl logs -n <namespace> job/volsync-dst-<app>-manual --container main
```

## Additional Resources

- [Networking Architecture](/openwiki/concepts/networking.md) - Cilium CNI configuration and L2 announcements
- [Storage Architecture](/openwiki/concepts/storage.md) - TopoLVM configuration and LVM management
- [Secrets Management](/openwiki/concepts/secrets-management.md) - SOPS and External Secrets Operator details
- [Daily Operations](/openwiki/operations/daily-operations.md) - Common operational procedures including VolSync workflows
