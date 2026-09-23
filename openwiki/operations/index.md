# Files

- [Daily Operations](daily-operations.md) - Consolidated operations runbook for the Talos cluster covering Flux reconciliation, Talos node operations, VolSync backup/restore, networking (Cilium, Cloudflare Tunnel, DNS, Tailscale), SOPS/age secrets, storage (TopoLVM, snapshots), and observability access.
- [Local Tooling — mise, Taskfiles, and Bootstrap Scripts](local-tooling.md) - How local operators run the cluster toolchain via mise-managed tools and environment variables, the root Taskfile and its bootstrap/talos/volsync task groups, and the scripts/bootstrap-apps.sh ordered cluster bootstrap flow.
- [Troubleshooting Guide](troubleshooting.md) - Symptom-driven playbook for the Talos Kubernetes cluster covering stuck kustomizations, failed HelmReleases, Talos upgrade failures, VolSync backup errors, networking issues, and SOPS secret decryption problems, with diagnostic commands and fixes.
- [Upgrade Workflow](upgrade-workflow.md) - Complete upgrade process for Talos OS, Kubernetes, and cluster applications with proper ordering, rollback procedures, and verification steps.
- [VolSync PVC Migration Workflow](volsync-pvc-migration.md) - In-flight migration of app PVCs from app-local pvc.yaml/volsync.yaml manifests to the shared kubernetes/components/volsync component, including the 9-step standard flow, status tracking, and per-app caveats.
