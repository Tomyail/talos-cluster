# Files

- [Bitwarden Secrets Integration](bitwarden.md) - Runtime secret management using Bitwarden as the external secrets provider via External Secrets Operator, with cluster-wide secret stores and automated secret synchronization.
- [CI/CD Integration](ci-cd.md) - GitHub Actions workflows for validating Kubernetes manifests via flux-local testing and diff generation on pull requests, synchronizing repository labels, automating area-based PR labeling, and automating OpenWiki documentation updates.
- [Cloudflare Integration](cloudflare.md) - Cloudflare services integration providing secure ingress through Cloudflare Tunnel and automated DNS management via external-dns with DNSEndpoint resources for Kubernetes service discovery.
- [External Secrets Integration](external-secrets.md) - External Secrets Operator deployment and configuration for pulling external secrets from Bitwarden into Kubernetes, including operator setup, CRD installation, secret synchronization patterns, and troubleshooting.
- [Hardware and GPU Support](hardware-support.md) - Intel GPU device plugin setup, node feature discovery for hardware labeling, kernel module configuration, and troubleshooting GPU device scheduling on Talos nodes.
- [Flux Image Automation](image-automation.md) - Automated container image tag updates for default namespace applications using Flux ImageRepository, ImagePolicy, and ImageUpdateAutomation with Setters strategy and flux-bot commits.
- [Renovate Dependency Automation](renovate.md) - Automated dependency update bot for container images, Helm charts, OCI repositories, Kubernetes manifests, Talos/Kubernetes versions, and toolchain versions.
- [Tailscale Integration](tailscale.md) - Mesh VPN networking using Tailscale operator for secure cluster access, OAuth-based authentication, API server proxy, and egress proxy configuration for multi-cluster service routing.
