# Files

- [Bitwarden Secrets Integration](bitwarden.md) - Runtime secret management using Bitwarden as the external secrets provider via External Secrets Operator, with cluster-wide secret stores and automated secret synchronization.
- [CI/CD Integration](ci-cd.md) - GitHub Actions workflows for validating Kubernetes manifests via flux-local testing and diff generation on pull requests, synchronizing repository labels, automating area-based PR labeling, and automating OpenWiki documentation updates.
- [Cloudflare Integration](cloudflare.md) - Cloudflare services integration providing secure ingress through Cloudflare Tunnel and automated DNS management via external-dns with DNSEndpoint resources for Kubernetes service discovery.
- [Renovate Integration](renovate.md) - Automated dependency update bot for container images, Helm charts, OCI repositories, Kubernetes manifests, Talos/Kubernetes versions, and toolchain versions.
- [Tailscale Integration](tailscale.md) - Mesh VPN networking using Tailscale operator for secure cluster access, OAuth-based authentication, API server proxy, and egress proxy configuration for multi-cluster service routing.
