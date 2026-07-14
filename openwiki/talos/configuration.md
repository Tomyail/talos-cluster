# Talos Configuration

How Talos Linux is configured and managed in this cluster.

## Configuration Architecture

### Talhelper

Talhelper is the tool that generates Talos machine configurations from a high-level YAML spec.

**Key files**:
- `talos/talconfig.yaml` - Main Talhelper configuration
- `talos/talenv.yaml` - Version pins (Talos and Kubernetes)
- `talos/talsecret.sops.yaml` - Encrypted cluster secrets (generated)
- `talos/clusterconfig/` - Generated machine configs (DO NOT EDIT)
- `talos/patches/` - Machine-level patches

### Version Management

The `talos/talenv.yaml` file pins versions:

```yaml
talosVersion: "v1.13.6"
kubernetesVersion: "v1.32.1"
```

**Why this matters**:
- Renovate tracks these files and updates them automatically
- Consistent versions across all nodes
- Kubernetes upgrades are coordinated through this file

**Update process**:
1. Wait for Renovate PR or manually update versions
2. Run `task talos:generate-config`
3. Review generated configs
4. Apply with `task talos:apply-node IP=<node-ip>` (for Talos changes)
5. Run `task talos:upgrade-k8s` (for Kubernetes changes)

## Machine Configuration

### Node Definition

In `talos/talconfig.yaml`, nodes are defined with:

```yaml
nodes:
  - hostname: "master0-nuc12"
    ipAddress: "192.168.50.145"
    installDiskSelector:
      size: "<= 256GB"
      type: ssd
    machineSpec:
      secureboot: true
    controlPlane: true
    nodeLabels:
      intel.feature.node.kubernetes.io/gpu: "true"
```

**Key fields**:
- `hostname` - Node hostname
- `ipAddress` - Static IP configuration
- `installDiskSelector` - Disk selection criteria
- `machineSpec.secureboot` - Enable secure boot
- `controlPlane` - Is this a control plane node?
- `nodeLabels` - Kubernetes labels (used for GPU scheduling)

### Disk Configuration

The cluster uses LVM-aware disk configuration:

**Install disk selector**:
- Size: ≤256GB (system disk)
- Type: SSD

**Custom volume provisioning** (via inline manifest):
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

This enables dynamic volume provisioning for local-path storage.

### Network Configuration

Each node defines network interfaces:

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

**Key concepts**:
- Static IP assignment (no DHCP)
- Hardware address matching (MAC address)
- VIP for control plane API endpoint
- MTU configuration for network optimization

### Kernel Modules

Required kernel modules are loaded per node:

```yaml
kernelModules:
  - name: dm_thin_pool    # LVM thin provisioning
  - name: dm_mod          # Device mapper
  - name: i915            # Intel GPU driver
  - name: drm             # Direct Rendering Manager
  - name: drm_kms_helper  # DRM KMS helper
```

**Why these modules**:
- `dm_*`: Required for TopoLVM (LVM storage)
- `i915/drm`: Intel GPU support for hardware acceleration

### Custom Extensions

Control plane nodes load system extensions:

```yaml
schematic:
  customization:
    systemExtensions:
      officialExtensions:
        - siderolabs/i915          # Intel GPU support
        - siderolabs/intel-ucode    # Intel microcode
        - siderolabs/thunderbolt   # Thunderbolt support
```

These extensions are built into the Talos image factory URL.

## Patches

### Patch Structure

Talhelper merges patches from `talos/patches/` into the final machine config:

```
talos/patches/
├── global/          # Applied to all nodes
│   ├── machine-files.yaml
│   ├── machine-kubelet.yaml
│   ├── machine-network.yaml
│   ├── machine-sysctls.yaml
│   ├── machine-time.yaml
│   ├── machine-udev.yaml
│   └── machine-api-access.yaml
└── controller/      # Applied to control plane nodes only
    └── cluster.yaml
```

### Global Patches

**machine-files.yaml** - Extra files on nodes:
- Custom configuration files
- System utilities

**machine-kubelet.yaml** - Kubelet configuration:
- Extra args for kubelet
- Resource limits
- Volume configuration

**machine-network.yaml** - Network settings:
- Extra network interfaces
- Bonding configurations

**machine-sysctls.yaml** - Kernel parameters:
- sysctl settings for performance/security
- Network tuning

**machine-time.yaml** - Time synchronization:
- NTP servers
- Timezone settings

**machine-udev.yaml** - udev rules:
- Device naming
- Permissions

**machine-api-access.yaml** - API access policies:
- Cluster role bindings
- Admission control

### Controller Patches

**cluster.yaml** - Cluster-wide settings:
- Cluster network configuration
- API server settings
- Etcd configuration
- Pod security policies

## Machine Config Generation

### Generation Process

When you run `task talos:generate-config`:

1. Talhelper reads `talos/talconfig.yaml`
2. Expands variables from `talos/talenv.yaml`
3. Merges patches from `talos/patches/`
4. Encrypts secrets with `talos/talsecret.sops.yaml`
5. Writes machine configs to `talos/clusterconfig/`

**Output structure**:
```
talos/clusterconfig/
├── talosconfig                    # Talosctl config
├── master0-nuc12.yaml            # Control plane config
└── ...                           # Worker node configs (if any)
```

### Applying Configuration

To apply updated configuration to a node:

```bash
task talos:apply-node IP=192.168.50.145
```

This:
1. Reads the node's machine config
2. Applies it via Talos API
3. Triggers necessary services to restart (most changes are non-disruptive)

### Configuration Validation

Before applying, validate:

```bash
talosctl validate --config talos/clusterconfig/master0-nuc12.yaml --mode strict
```

## Cluster Secrets

### Secret Generation

The `talos/talsecret.sops.yaml` file contains:

- Cluster CA certificate and key
- API server certificate and key
- Etcd certificates
- Kubernetes service account keys
- Kubelet certificates
- Cluster encryption key

These are generated once during initial bootstrap and encrypted with age.

### Secret Rotation

To rotate cluster secrets (rare, destructive):

1. Delete `talos/talsecret.sops.yaml`
2. Re-run `talhelper genconfig` (generates new secrets)
3. Re-bootstrap the cluster (required because all certificates change)

**This is extremely disruptive** - only do this for critical security incidents.

## Upgrade Workflow

### Talos OS Upgrade

Single node upgrade:

```bash
task talos:upgrade-node IP=192.168.50.145
```

This performs a rolling upgrade:
1. Drains the node (if worker)
2. Applies Talos upgrade
3. Reboots
4. Uncordon the node

For multi-node clusters, upgrade one node at a time.

### Kubernetes Upgrade

Cluster-wide Kubernetes upgrade:

```bash
task talos:upgrade-k8s
```

This:
1. Updates `talos/talenv.yaml` (or you do it first)
2. Regenerates machine configs
3. Applies to all nodes sequentially
4. Upgrades control plane first, then workers

**Prerequisites**:
- All nodes must be healthy
- No ongoing upgrades
- Recent VolSync snapshots of critical data

### Upgrade Best Practices

1. **Test in staging** if possible
2. **Take VolSync snapshots** before upgrading
3. **Monitor upgrade progress**:
   ```bash
   talosctl --nodes 192.168.50.145 version
   ```
4. **Verify post-upgrade**:
   - All nodes report new version
   - All pods are running
   - No resource warnings
5. **Rollback if needed**:
   - Talos upgrades can be rolled back via `talosctl rollback`
   - Kubernetes upgrades are more difficult (may require cluster re-bootstrap)

## Custom Factory Image

The cluster uses a custom Talos factory image with system extensions:

```yaml
talosImageURL: factory.talos.dev/installer-secureboot/a30c16a32db3c99cb35f22401fad96807f80896dfc86aa4ec716ed6b4aff09de
```

This image includes:
- Secure boot support
- i915 GPU driver
- Intel microcode
- Thunderbolt support

**Why custom image**:
- Hardware acceleration support (GPU)
- Secure boot enforcement
- Built-in extensions without runtime loading

**Updating the image**:
1. Build new factory image via [Talos image factory](https://factory.talos.dev/)
2. Update `talosImageURL` in `talos/talconfig.yaml`
3. Regenerate configs: `task talos:generate-config`
4. Apply to nodes: `task talos:apply-node IP=<ip>`

## Troubleshooting

### Node Not Booting

1. Check Talos API:
   ```bash
   talosctl --nodes 192.168.50.145 version
   ```

2. Check machine config:
   ```bash
   talosctl --nodes 192.168.50.145 get mc
   ```

3. Check if configuration is applied:
   ```bash
   talosctl --nodes 192.168.50.145 get machineconfig
   ```

### Network Issues After Config Apply

1. Verify network interface configuration in machine config
2. Check if IP address is correct
3. Test connectivity from Talos API:
   ```bash
   talosctl --nodes 192.168.50.145 interfaces
   ```

### Module Loading Failures

1. Check if kernel modules are in config:
   ```bash
   talosctl --nodes 192.168.50.145 read /proc/modules
   ```

2. Verify schematic extensions include required modules

3. Re-apply machine config if modules were added recently

### Regeneration Issues

If `talhelper genconfig` fails:

1. Check `talos/talconfig.yaml` syntax:
   ```bash
   yq eval . talos/talconfig.yaml
   ```

2. Verify `talos/talenv.yaml` has valid versions

3. Check if `talos/talsecret.sops.yaml` is decrypted:
   ```bash
   sops --decrypt talos/talsecret.sops.yaml
   ```

4. Review patch files for syntax errors

## Best Practices

1. **Never edit `talos/clusterconfig/` directly** - It's generated
2. **Always validate** before applying to production nodes
3. **Test patches** on a single node first
4. **Keep secrets encrypted** - Never commit decrypted `talos/talsecret.yaml`
5. **Version control everything** - All configuration is in git
6. **Document changes** - Commit messages explain why patches were added
7. **Monitor after changes** - Check node health and pod status
