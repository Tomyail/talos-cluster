# Files

- [Daily Operations](daily-operations.md) - Common operational tasks for the Talos cluster including Flux reconciliation, Talos configuration application, node operations, VolSync backup procedures, and monitoring access.
- [Daily Tasks Reference](daily-tasks.md) - Quick reference for routine operational tasks including checking cluster status, reconciling Flux resources, applying Talos configs, managing nodes, working with VolSync backups, and accessing logs.
- [Network Operations](network-tasks.md) - Operational procedures for troubleshooting and configuring Cilium CNI connectivity, Cloudflare Tunnel ingress, k8s-gateway DNS resolution, AdGuard DNS filtering, and Tailscale mesh networking services.
- [Observability tasks](observability-tasks.md) - Monitoring and alerting operations: Prometheus queries, Grafana dashboards, log analysis
- [Secrets Operations](secrets-tasks.md) - Operational procedures for managing encrypted secrets including SOPS editing workflows, age key rotation, cluster-secrets variable substitution, and Flux decryption troubleshooting.
- [Storage Operations](storage-tasks.md) - LVM thin pool management, storage class usage, snapshot creation, and PVC provisioning troubleshooting for the cluster storage layer.
- [Talos Operations](talos-tasks.md) - Talos-specific operational tasks including config generation, node upgrades, Kubernetes upgrades, cluster reset, and node configuration updates using talhelper.
- [Troubleshooting Guide](troubleshooting.md) - Common issues and solutions for the Talos Kubernetes cluster, including TopoLVM single-node upgrade problems, Flux reconciliation failures, secret decryption issues, and single-node architecture constraints.
- [Upgrade Workflow](upgrade-workflow.md) - Complete upgrade process for Talos OS, Kubernetes, and cluster applications with proper ordering, rollback procedures, and verification steps.
- [VolSync Backup and Restore](volsync-tasks.md) - Taskfile-based operations for VolSync manual snapshots, backup listing, PVC restoration from MinIO, restic repository maintenance, and suspend/resume workflows.
