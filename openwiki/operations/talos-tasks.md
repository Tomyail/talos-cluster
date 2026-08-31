---
type: operations
title: Talos Operations
description: Talos-specific operational tasks including config generation, node upgrades, Kubernetes upgrades, cluster reset, and node configuration updates using talhelper.
tags: [talos, operations, upgrade, config, talhelper, maintenance]
verified:
  - by: openwiki/0.4.3
    at: 2026-08-31T23:16:37.333Z
sources:
  - id: openwiki-source-4f5be6b4c7dcc699aca46164
    resource: repo://.taskfiles/talos/Taskfile.yaml
  - id: openwiki-source-1fd71dc29915917549048436
    resource: repo://talos/talconfig.yaml
  - id: openwiki-source-b65e4f1ccd91316116ad973a
    resource: repo://talos/talenv.yaml
generated: { by: "openwiki/0.4.3", at: "2026-08-31T23:16:37.333Z" }
---

# Talos Operations

Talos Linux cluster operations are managed through talhelper-based tasks defined in `.taskfiles/talos/Taskfile.yaml`. These tasks provide standardized workflows for configuration generation, node upgrades, Kubernetes version upgrades, and cluster destruction.

## Task Overview

The Talos task file provides five primary operations:

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
    A[Talos Operations] --> B[generate-config<br/>Regenerate machine configs]
    A --> C[apply-node<br/>Apply config to single node]
    A --> D[upgrade-node<br/>Upgrade Talos OS]
    A --> E[upgrade-k8s<br/>Upgrade Kubernetes]
    A --> F[reset<br/>Destroy cluster]
    
    B --> B1[talhelper genconfig]
    C --> C1[talhelper gencommand apply]
    D --> D1[talhelper gencommand upgrade]
    E --> E1[talhelper gencommand upgrade-k8s]
    F --> F1[talhelper gencommand reset]
```

All tasks execute within the `{{.TALOS_DIR}}` directory (`talos/`) and require specific preconditions to ensure safe operations.

## Configuration Generation

### `talos:generate-config`

Regenerates Talos machine configurations after modifying cluster definitions.

```bash
task talos:generate-config
```

**Task execution** (`.taskfiles/talos/Taskfile.yaml#L7-L15`):
- Runs `talhelper genconfig` in the Talos directory
- Reads from `talconfig.yaml` (cluster topology, node definitions)
- Substitutes versions from `talenv.yaml`
- Applies patches from `patches/global/`, `patches/controller/`, `patches/worker/`, and `patches/${hostname}/`
- Outputs generated configs to `talos/clusterconfig/`

**Prerequisites:**
- `talconfig.yaml` must exist
- `.sops.yaml` must exist for secret decryption
- SOPS age key file must be available
- `talhelper` binary must be installed

**Use cases:**
- After modifying `talconfig.yaml` node definitions
- After updating versions in `talenv.yaml`
- After adding or modifying patches
- After changing cluster network settings

**Important:** Never manually edit files in `talos/clusterconfig/`—they are auto-generated and will be overwritten on the next `generate-config` run.

## Node Configuration Updates

### `talos:apply-node`

Applies updated Talos configuration to a specific node without full reinstallation.

```bash
task talos:apply-node IP=<node-ip>
```

**Example:**
```bash
task talos:apply-node IP=192.168.50.145
```

**Task execution** (`.taskfiles/talos/Taskfile.yaml#L17-L29`):
- Generates apply command via `talhelper gencommand apply`
- Targets the specified node IP address
- Applies configuration with `--mode=auto` by default (can be overridden)
- Executes the generated command through bash

**Configuration modes:**
- `auto` (default): Talos determines if reboot is needed
- `reboot`: Forces reboot after applying config
- `no-reboot`: Applies changes without reboot (when possible)

**Prerequisites:**
- Node must be accessible via `talosctl --nodes <ip> get machineconfig`
- `talosconfig` must be configured and valid
- `talhelper`, `talosctl`, and `yq` must be available

**Use cases:**
- Applying configuration changes from regenerated machine configs
- Updating node-specific settings without full reinstall
- Rolling out patch changes incrementally

**Best practices:**
- Most configuration changes apply without rebooting in `auto` mode
- Test configuration changes on a single node first
- Monitor node health during and after application
- Verify `talosctl --nodes <ip> get machineconfig` shows the new version

## Talos OS Upgrades

### `talos:upgrade-node`

Upgrades Talos Linux on a single node to the version specified in configuration files.

```bash
task talos:upgrade-node IP=<node-ip>
```

**Example:**
```bash
task talos:upgrade-node IP=192.168.50.145
```

**Task execution** (`.taskfiles/talos/Taskfile.yaml#L31-L46`):
- Retrieves Talos image URL for the specific node from `talconfig.yaml` using `yq`
- Retrieves target Talos version from `talenv.yaml`
- Generates upgrade command via `talhelper gencommand upgrade`
- Adds `--image` flag with node-specific factory image URL
- Adds `--timeout=10m` for 10-minute operation timeout
- Executes the upgrade command through bash

**Upgrade process:**
1. Talos validates the target image
2. Node drains if it's a worker (evicts pods)
3. Downloads and applies new Talos image
4. Reboots into new version
5. Rejoins cluster and verifies health

**Prerequisites:**
- Node must be accessible and healthy
- `talosconfig` must be configured
- `kubectl`, `talhelper`, `talosctl`, and `yq` must be available
- Node's `talosImageURL` must be defined in `talconfig.yaml`
- Target `talosVersion` must be set in `talenv.yaml`

**Best practices:**
- Upgrade one node at a time in multi-node clusters
- Upgrade control plane nodes first, then workers
- Monitor upgrade progress: `talosctl --nodes <ip> version`
- Verify post-upgrade health: all pods running, no errors
- Keep cluster capacity in mind during upgrades (one node unavailable)

**Rollback:**
If an upgrade fails, use `talosctl rollback <node-ip>` to revert to the previous Talos version.

## Kubernetes Upgrades

### `talos:upgrade-k8s`

Upgrades Kubernetes across the entire cluster to the version specified in `talenv.yaml`.

```bash
task talos:upgrade-k8s
```

**Task execution** (`.taskfiles/talos/Taskfile.yaml#L48-L58`):
- Retrieves target Kubernetes version from `talenv.yaml`
- Generates upgrade-k8s command via `talhelper gencommand upgrade-k8s`
- Adds `--to` flag with the target version
- Executes the upgrade across all nodes

**Upgrade sequence:**
1. Upgrades control plane nodes first (sequentially)
2. Upgrades worker nodes (can be parallel)
3. Updates kubelet configuration on all nodes
4. Verifies cluster health after each phase

**Prerequisites:**
- All nodes must be healthy and running
- `talosconfig` must be configured
- `talhelper`, `talosctl`, and `yq` must be available
- No ongoing Talos upgrades or maintenance
- Sufficient cluster capacity during upgrade

**Best practices:**
- Test in staging environment if possible
- Take VolSync snapshots of critical data before upgrading
- Schedule upgrades during low-traffic periods
- Monitor progress: `kubectl get nodes -w`
- Verify all nodes reach `Ready` status after upgrade
- Kubernetes upgrades are difficult to rollback (may require cluster re-bootstrap)

**Version compatibility:**
- Ensure Kubernetes version is compatible with current Talos version
- Check Talos documentation for supported Kubernetes versions
- Update Talos first if required for new Kubernetes version

## Cluster Reset

### `talos:reset`

Destroys the cluster and resets all nodes back to maintenance mode.

```bash
task talos:reset
```

**Task execution** (`.taskfiles/talos/Taskfile.yaml#L60-L66`):
- Prompts for confirmation before proceeding
- Generates reset command via `talhelper gencommand reset`
- Adds `--reboot` flag to reboot after reset
- Adds `--system-labels-to-wipe STATE` and `--system-labels-to-wipe EPHEMERAL` unless `--force` is set
- Adds `--graceful=false` for immediate shutdown
- Adds `--wait=false` to return immediately
- Executes the reset command through bash

**Reset behavior:**
- Deletes all Kubernetes data and etcd state
- Wipes EPHEMERAL and STATE disk partitions
- Reboots nodes into maintenance mode
- Nodes ready for re-installation or bootstrap

**Prerequisites:**
- `talhelper` must be available
- Confirmation prompt acknowledged (or use `--force` flag)

**Use cases:**
- Complete cluster destruction
- Preparing for re-bootstrap
- Cleaning up after failed installations
- Decommissioning cluster hardware

**Warning:** This operation is destructive and cannot be undone. Ensure you have backups of any critical data before proceeding.

## Talhelper gencommand Workflow

All node-level operations (`apply-node`, `upgrade-node`, `upgrade-k8s`, `reset`) use the `talhelper gencommand` workflow, which generates appropriate `talosctl` commands based on cluster configuration.

**Workflow steps:**

1. **Read Configuration**: talhelper reads `talconfig.yaml` and generated machine configs
2. **Generate Command**: Creates node-specific `talosctl` command with appropriate flags
3. **Execute Command**: Pipes the generated command to `bash` for execution
4. **Verify Result**: Command returns success or error status

**Advantages:**
- Consistent command generation across operations
- Automatic node lookup by IP address
- Integration with version variables from `talenv.yaml`
- Supports extra flags for customization

**Example generated commands:**
```bash
# apply-node
talosctl --nodes 192.168.50.145 apply-config --file clusterconfig/master0-nuc12.yaml --mode=auto

# upgrade-node
talosctl --nodes 192.168.50.145 upgrade --image=factory.talos.dev/installer-secureboot/...:v1.12.7 --timeout=10m

# upgrade-k8s
talosctl upgrade-k8s --to v1.35.4

# reset
talosctl --nodes 192.168.50.145 reset --reboot --system-labels-to-wipe STATE --system-labels-to-wipe EPHEMERAL --graceful=false --wait=false
```

## Version Management

Talos and Kubernetes versions are managed through `talos/talenv.yaml`, which uses Renovate annotations for automated dependency tracking.

**Version variables** (`talos/talenv.yaml#L1-L4`):
```yaml
talosVersion: v1.12.7    # Renovate tracks ghcr.io/siderolabs/installer
kubernetesVersion: v1.35.4  # Renovate tracks ghcr.io/siderolabs/kubelet
```

**Version usage:**
- `talosVersion`: Referenced by `talconfig.yaml` nodes via `${talosVersion}`
- `kubernetesVersion`: Used by `upgrade-k8s` task and cluster configuration

**Renovate integration:**
- Automatically updates versions when new tags are available
- Creates pull requests with version bump commits
- Maintains compatibility between Talos and Kubernetes versions

## Related Documentation

- **[Talos Configuration Management](/openwiki/concepts/talos-config.md)**: Detailed explanation of `talconfig.yaml`, node definitions, and patch system
- **[Cluster Upgrade Workflow](/openwiki/workflows/upgrade.md)**: Comprehensive upgrade procedures including tuppr automation
- **[Bootstrap Workflow](/openwiki/workflows/bootstrap.md)**: Initial cluster installation and configuration
- **[Daily Tasks Reference](/openwiki/operations/daily-tasks.md)**: Quick reference for common operational tasks
