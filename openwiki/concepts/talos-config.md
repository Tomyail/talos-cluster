---
type: concept
title: Talos Configuration Management
description: Talos Linux configuration structure using talhelper for node definitions, patch system, and machine config generation with version tracking via Renovate.
tags: [talos, talhelper, configuration, patches, machine-config, kernel-modules, networking]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-01T21:54:26.927Z
sources:
  - id: openwiki-source-aa55808be329b3f929ddf105
    resource: repo://.renovaterc.json5
  - id: openwiki-source-f04021c19122a44288e9cea0
    resource: repo://.taskfiles/bootstrap/Taskfile.yaml
  - id: openwiki-source-d2a09e6daa777d44de395a25
    resource: repo://talos/patches/controller/cluster.yaml
  - id: openwiki-source-3e196790f656e0269a8c26fb
    resource: repo://talos/patches/global/machine-kubelet.yaml
  - id: openwiki-source-c665b51a497196ebe6988995
    resource: repo://talos/patches/global/machine-network.yaml
  - id: openwiki-source-3d83fad84bedab7bcf047491
    resource: repo://talos/patches/global/machine-sysctls.yaml
  - id: openwiki-source-456ed6bb68f86e098d0036e2
    resource: repo://talos/patches/global/machine-udev.yaml
  - id: openwiki-source-fa722a4fd56cf74de886d778
    resource: repo://talos/patches/README.md
  - id: openwiki-source-1fd71dc29915917549048436
    resource: repo://talos/talconfig.yaml
  - id: openwiki-source-b65e4f1ccd91316116ad973a
    resource: repo://talos/talenv.yaml
generated: { by: "openwiki/0.5.0", at: "2026-09-01T21:54:26.927Z" }
---

# Talos Configuration Management

Talos Linux cluster configuration uses a declarative approach through talhelper, which transforms human-readable YAML definitions into machine configurations applied to nodes. The configuration system supports cluster-wide settings, node-specific overrides, and a hierarchical patch system for customizing Talos behavior.

## Configuration Structure

The Talos configuration is managed through three primary files:

- **`talconfig.yaml`** - Cluster topology, node definitions, and patch references
- **`talenv.yaml`** - Version variables managed by Renovate
- **`talsecret.sops.yaml`** - Encrypted cluster secrets (generated, not edited manually)

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart LR
    A["talenv.yaml<br/>Version Variables"] --> B["talconfig.yaml<br/>Cluster Definition"]
    C["talconfig.yaml<br/>Patches Section"] --> D["Global Patches<br/>global/*.yaml"]
    C --> E["Controller Patches<br/>controller/*.yaml"]
    C --> F["Worker Patches<br/>worker/*.yaml"]
    C --> G["Node Patches<br/>hostname/*.yaml"]
    B --> H["talhelper genconfig<br/>Generate Machine Configs"]
    D --> H
    E --> H
    F --> H
    G --> H
    H --> I["clusterconfig/<br/>Node-specific YAML"]
```

*Figure: Talos configuration flow from source definitions through talhelper to generated machine configurations*

## talconfig.yaml Structure

The `talconfig.yaml` file defines the complete cluster configuration structure.

### Cluster Settings

Cluster-wide settings define the Kubernetes cluster identity and networking:

```yaml
clusterName: kubernetes
endpoint: https://192.168.50.10:6443
clusterPodNets: ["10.42.0.0/16"]
clusterSvcNets: ["10.43.0.0/16"]
cniConfig:
  name: none
```

**Key Configuration Elements** (`talos/talconfig.yaml#L3-L19`):

- **Endpoint**: VIP address `192.168.50.10:6443` used for API server access
- **Certificate SANs**: Additional IPs and hostnames added to API server and machine certificates
- **Network CIDRs**: Pod (`10.42.0.0/16`) and service (`10.43.0.0/16`) networks
- **CNI**: Set to `none` to disable built-in CNI, allowing Cilium installation

### Node Definitions

The `nodes` array contains individual node configurations with hardware selection, networking, and system extensions.

```yaml
nodes:
  - hostname: "master0-nuc12"
    ipAddress: "192.168.50.145"
    installDiskSelector:
      size: "<= 256GB"
      type: ssd
    controlPlane: true
```

**Node Configuration** (`talos/talconfig.yaml#L22-L64`):

- **Disk Selection**: Automatic disk targeting by size and type
- **Machine Spec**: SecureBoot status and factory image URLs
- **Control Plane**: Boolean flag designating control-plane nodes
- **Node Labels**: Kubernetes labels applied to the node (e.g., GPU availability)

### Kernel Modules

Nodes can load specific kernel modules required for hardware support or container features:

```yaml
kernelModules:
  - name: dm_thin_pool
  - name: dm_mod
  - name: i915        # Intel GPU driver
  - name: drm         # Direct Rendering Manager
  - name: drm_kms_helper  # DRM KMS helper
```

**Module Categories** (`talos/talconfig.yaml#L35-L40`):

- **LVM modules** (`dm_thin_pool`, `dm_mod`): Logical volume management for storage
- **Intel GPU drivers** (`i915`, `drm`, `drm_kms_helper`): GPU rendering support for ML workloads

### Network Interfaces

Network configuration supports static IP assignment, routing, and VIP management:

```yaml
networkInterfaces:
  - deviceSelector:
      hardwareAddr: "48:21:0b:58:14:f9"
    dhcp: false
    addresses:
      - "192.168.50.145/24"
    routes:
      - network: "0.0.0.0/0"
        gateway: "192.168.50.1"
    mtu: 1500
    vip:
      ip: "192.168.50.10"
```

**Network Features** (`talos/talconfig.yaml#L41-L52`):

- **Hardware Address Selection**: Interface matching by MAC address
- **Static Configuration**: Fixed IP, gateway, and MTU assignment
- **VIP Assignment**: Virtual IP (`192.168.50.10`) for high-availability API access

### User Volumes

Inline manifests can configure automatic volume provisioning:

```yaml
inlineManifests:
  - name: uservolume
    contents: |-
      apiVersion: v1alpha1
      kind: UserVolumeConfig
      name: local-path-provisioner
      provisioning:
        diskSelector:
          match: system_disk
        minSize: 2GB
        grow: true
```

**Volume Behavior** (`talos/talconfig.yaml#L53-L63`):

- **Automatic Provisioning**: Creates volumes on system disk
- **Dynamic Sizing**: Minimum 2GB with automatic growth
- **Use Case**: Local storage for local-path-provisioner

## talenv.yaml Version Tracking

The `talenv.yaml` file contains Talos and Kubernetes version variables managed by Renovate:

```yaml
# renovate: datasource=docker depName=ghcr.io/siderolabs/installer
talosVersion: v1.12.7
# renovate: datasource=docker depName=ghcr.io/siderolabs/kubelet
kubernetesVersion: v1.35.4
```

**Version Management** (`talos/talenv.yaml#L1-L4`):

- **Renovate Integration**: Comments define datasource and package names
- **Automated Updates**: Renovate tracks Docker image tags and updates versions
- **Variable Substitution**: `talconfig.yaml` references `${talosVersion}` and `${kubernetesVersion}`

**Renovate Configuration** (`.renovaterc.json5`):

- **Schedule**: Runs weekly ("every weekend")
- **Docker Datasource**: Tracks `ghcr.io/siderolabs/installer` and `ghcr.io/siderolabs/kubelet`
- **Semantic Commits**: Generates structured commit messages for version changes
- **Custom Managers**: Regex-based parsing extracts versions from YAML files with renovate comments

## Patch System

The patch system applies configuration overlays at different scopes: global, controller, worker, and node-specific.

### Patch Directories

```yaml
patches:
  - "@./patches/global/machine-files.yaml"
  - "@./patches/global/machine-kubelet.yaml"
  - "@./patches/global/machine-network.yaml"
  - "@./patches/global/machine-sysctls.yaml"
  - "@./patches/global/machine-time.yaml"
  - "@./patches/global/machine-udev.yaml"
  - "@./patches/global/machine-api-access.yaml"
```

**Patch Scopes** (`talos/patches/README.md#L12-L15`):

- **`global/`**: Applied to all nodes (controllers and workers)
- **`controller/`**: Applied only to control-plane nodes
- **`worker/`**: Applied only to worker nodes
- **`${hostname}/`**: Applied to specific node by hostname

### Global Patches

Global patches configure system-wide behavior for all node types.

**Kubelet Configuration** (`talos/patches/global/machine-kubelet.yaml`):

```yaml
machine:
  kubelet:
    extraConfig:
      serializeImagePulls: false
    nodeIP:
      validSubnets:
        - 192.168.50.0/24
    extraMounts:
      - destination: /var/mnt/local-path-provisioner
        type: bind
        source: /var/mnt/local-path-provisioner
        options:
          - bind
          - rshared
          - rw
```

**Kubelet Customizations**:

- **Image Pull Parallelization**: Disabled serialization for faster pulls
- **Node IP Subnet**: Restricts kubelet node IP to management network
- **Storage Mounts**: Binds local-path-provisioner storage for pods

**Network Configuration** (`talos/patches/global/machine-network.yaml`):

```yaml
machine:
  network:
    disableSearchDomain: true
    nameservers:
      - 1.1.1.1
      - 1.0.0.1
```

**System Tuning** (`talos/patches/global/machine-sysctls.yaml`):

```yaml
machine:
  sysctls:
    fs.inotify.max_user_watches: "1048576"
    fs.inotify.max_user_instances: "8192"
    net.core.rmem_max: "7500000"
    net.core.wmem_max: "7500000"
    user.max_user_namespaces: "65536"
```

**Sysctl Settings**:

- **inotify limits**: Increased for file watchers (required by some applications)
- **Network buffers**: Increased for QUIC protocol (Cloudflared)
- **User namespaces**: Enabled for rootless container support

**Udev Rules** (`talos/patches/global/machine-udev.yaml`):

```yaml
machine:
  udev:
    rules:
      - SUBSYSTEM=="drm", KERNEL=="renderD*", GROUP="44", MODE="0660"
```

**GPU Device Access**:

- **DRM Devices**: Matches Direct Rendering Manager render devices
- **Group 44**: Video group (GID 44) ownership
- **Permissions 0660**: Read/write for owner and group

**Containerd Configuration** (`talos/patches/global/machine-files.yaml`):

```yaml
machine:
  files:
    - op: create
      path: /etc/cri/conf.d/20-customization.part
      permissions: 0o644
      content: |-
        [plugins."io.containerd.cri.v1.images"]
          discard_unpacked_layers = false
```

**Containerd Optimization**: Prevents discarding unpacked layers for efficient image storage

**Time Synchronization** (`talos/patches/global/machine-time.yaml`):

```yaml
machine:
  time:
    disabled: false
    servers:
      - 162.159.200.1
      - 162.159.200.123
```

**NTP Servers**: Uses Cloudflare time servers for accurate clock synchronization

**API Access Configuration** (`talos/patches/global/machine-api-access.yaml`):

```yaml
machine:
  features:
    kubernetesTalosAPIAccess:
      enabled: true
      allowedRoles:
        - os:admin
      allowedKubernetesNamespaces:
        - kube-system
```

**Talos API Access**: Enables Kubernetes-based access to Talos API from privileged namespaces

### Controller Patches

Controller-specific patches configure cluster components running on control-plane nodes.

```yaml
controlPlane:
  patches:
    - "@./patches/controller/cluster.yaml"
  schematic:
    customization:
      systemExtensions:
        officialExtensions:
          - siderolabs/i915
          - siderolabs/intel-ucode
          - siderolabs/thunderbolt
```

**Cluster Configuration** (`talos/patches/controller/cluster.yaml`):

```yaml
cluster:
  allowSchedulingOnControlPlanes: true
  apiServer:
    extraArgs:
      enable-aggregator-routing: true
  controllerManager:
    extraArgs:
      bind-address: 0.0.0.0
  coreDNS:
    disabled: true
  etcd:
    extraArgs:
      listen-metrics-urls: http://0.0.0.0:2381
    advertisedSubnets:
      - 192.168.50.0/24
  proxy:
    disabled: true
  scheduler:
    extraArgs:
      bind-address: 0.0.0.0
```

**Controller Settings**:

- **Scheduling**: Allows pods to run on control-plane nodes
- **Aggregator Routing**: Enables API aggregator layer for CRDs
- **CoreDNS/Proxy**: Disabled (replaced by Cilium and CoreDNS via Helm)
- **etcd Metrics**: Exposes metrics on subnet for monitoring
- **Component Binding**: Binds to all interfaces for metric access

**System Extensions** (`talos/talconfig.yaml#L78-L84`):

- **i915**: Intel GPU driver kernel module
- **intel-ucode**: Intel CPU microcode updates
- **thunderbolt**: Thunderbolt controller support

## talhelper genconfig Workflow

The `talhelper genconfig` workflow transforms configuration into machine configs.

### Workflow Steps

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
    A["1. Load talenv.yaml<br/>Resolve version variables"] --> B["2. Load talconfig.yaml<br/>Parse cluster definition"]
    B --> C["3. Load patches<br/>Read global, controller, worker, node-specific"]
    C --> D["4. Merge patches<br/>Apply hierarchical overrides"]
    D --> E["5. Generate machine configs<br/>Create per-node YAML"]
    E --> F["6. Output clusterconfig/<br/>Write machine-hostname.yaml"]
```

**Execution** (`.taskfiles/talos/Taskfile.yaml#L7-L10`):

```bash
talhelper genconfig
```

**Output Directory**: `talos/clusterconfig/`

- **Machine Configs**: `machine-<hostname>.yaml` for each node
- **Secrets Config**: `talsecret.sops.yaml` (generated once, reused)
- **Git Ignore**: Cluster configs ignored by git (generated artifacts)

### Patch Merge Order

Patches are applied in priority order (later patches override earlier ones):

1. Global patches (all nodes)
2. Role-specific patches (controller or worker)
3. Node-specific patches (${hostname})

**Example** (`talos/talconfig.yaml#L65-L77`):

```yaml
patches:
  - "@./patches/global/machine-kubelet.yaml"
controlPlane:
  patches:
    - "@./patches/controller/cluster.yaml"
```

## Integration with Bootstrap

The Talos configuration integrates with the bootstrap flow for cluster initialization.

### Bootstrap Integration

**Phase 1: Talos Bootstrap** (`.taskfiles/bootstrap/Taskfile.yaml#L7-L20`):

1. **Secret Generation**: `talhelper gensecret` → `sops encrypt` → `talsecret.sops.yaml`
2. **Config Generation**: `talhelper genconfig` reads `talconfig.yaml`
3. **Node Apply**: `talhelper gencommand apply` pushes configs to nodes
4. **Bootstrap**: `talhelper gencommand bootstrap` initializes etcd and control plane
5. **Kubeconfig**: `talhelper gencommand kubeconfig` exports admin credentials

### Configuration Updates

When modifying Talos configuration:

1. **Edit Source Files**: Modify `talconfig.yaml`, patches, or `talenv.yaml`
2. **Regenerate Configs**: Run `talhelper genconfig`
3. **Apply Changes**: Use `talhelper gencommand apply` to update nodes
4. **Version Bumps**: Renovate updates `talenv.yaml` automatically

**Validation**: talhelper validates configuration before generation, catching syntax errors and invalid values.

### Node Operations

The Talos taskfile provides operations for individual node management:

**Apply Configuration** (`.taskfiles/talos/Taskfile.yaml#L17-L29`):

```bash
task talos:apply-node IP=192.168.50.145 MODE=auto
```

**Upgrade Talos** (`.taskfiles/talos/Taskfile.yaml#L31-L46`):

```bash
task talos:upgrade-node IP=192.168.50.145
```

The upgrade command extracts node-specific image URLs and Talos versions from `talconfig.yaml` and `talenv.yaml` using `yq`.

**Upgrade Kubernetes** (`.taskfiles/talos/Taskfile.yaml#L48-L58`):

```bash
task talos:upgrade-k8s
```

Coordinates Kubernetes version upgrades across the cluster using the version from `talenv.yaml`.

## Related Pages

- **Cluster Architecture** (`/openwiki/concepts/cluster-architecture.md`) - Overall cluster design and component relationships
- **Talos Tasks** (`/openwiki/operations/talos-tasks.md`) - Operational procedures for Talos cluster management
