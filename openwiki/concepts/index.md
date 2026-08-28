# Files

- [Cluster Architecture Overview](cluster-architecture.md) - High-level architecture of the Talos Linux Kubernetes cluster including control plane, networking stack with Cilium and Cloudflare Tunnel, storage layers with TopoLVM and VolSync, observability with Prometheus/Grafana/Loki, and security via SOPS and External Secrets.
- [Flux GitOps Architecture](flux-architecture.md) - Comprehensive documentation of the Flux GitOps reconciliation hierarchy, Kustomization structure (cluster-meta → CRDs → cluster-apps), source management, Helm vs Kustomize resources, and the automated image update system.
- [Network Architecture](networking.md) - Layered networking stack comprising Cilium CNI with L2 announcements and Gateway API, Cloudflare Tunnel for secure ingress, Cloudflare DNS and AdGuard DNS integration for external DNS management, k8s-gateway for internal DNS, and Tailscale for VPN and mesh networking.
- [Secrets Management](secrets-management.md)
- [Storage Architecture](storage.md) - Comprehensive storage infrastructure for the Talos Kubernetes cluster including TopoLVM with LVM thin provisioning for primary workloads, VolSync for backup and replication, snapshot-controller for volume snapshots, NFS CSI for network-attached storage, and local-path-provisioner for host-local volumes.
