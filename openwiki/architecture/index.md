# Files

- [Bootstrap Flow](bootstrap-flow.md) - Complete cluster initialization process from bare metal to GitOps-managed state, including two-phase bootstrap (Talos OS setup via talhelper, then app installation via helmfile), SOPS secrets and CRD prerequisites, and Flux handoff.
- [Shared Component Library (kubernetes/components)](component-library.md) - Reusable Flux kustomize components under kubernetes/components/ — common bootstrap resources, Gatus uptime-check variants, Flux image automation, and VolSync backup/restore — and how apps compose them via ks.yaml component references and postBuild substitutes.
- [Namespace and Application Organization](namespace-structure.md) - Organizational structure for Kubernetes applications by namespace/domain under kubernetes/apps/, the Flux reconciliation hierarchy, app-template OCI repository pattern, and the kustomization.yaml pattern including components/common for shared resources.
- [Architecture Overview](overview.md) - Cluster architecture, GitOps patterns, and how major Talos, Flux, networking, and storage components interact.
