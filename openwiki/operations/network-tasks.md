---
type: operations
title: Network Operations
description: Operational procedures for troubleshooting and configuring Cilium CNI connectivity, Cloudflare Tunnel ingress, k8s-gateway DNS resolution, AdGuard DNS filtering, and Tailscale mesh networking services.
tags: [networking, operations, cilium, cloudflare, dns, tailscale, troubleshooting, configuration]
verified:
  - by: openwiki/0.5.0
    at: 2026-09-01T21:54:26.927Z
sources:
  - id: openwiki-source-d9f5f9eb0be17b72994fcd3e
    resource: repo://kubernetes/apps/kube-system/cilium/app/helm/values.yaml
  - id: openwiki-source-0fea713b3cc38997c9682b8e
    resource: repo://kubernetes/apps/kube-system/cilium/app/networks.yaml
  - id: openwiki-source-406c92f3368aa84a28fbd72b
    resource: repo://kubernetes/apps/kube-system/cilium/gateway/external.yaml
  - id: openwiki-source-367dcc8235c3b0a144a93539
    resource: repo://kubernetes/apps/kube-system/cilium/gateway/internal.yaml
  - id: openwiki-source-e4bcfe57ab9e469c34ab93eb
    resource: repo://kubernetes/apps/network/adguard-dns/app/externalsecret.yaml
  - id: openwiki-source-6462236f173fe5751314fd3e
    resource: repo://kubernetes/apps/network/adguard-dns/app/helmrelease.yaml
  - id: openwiki-source-de69c17387d286bdb57630c8
    resource: repo://kubernetes/apps/network/cloudflare-tunnel/app/dnsendpoint.yaml
  - id: openwiki-source-f340d1876ec8cdef13a12327
    resource: repo://kubernetes/apps/network/cloudflare-tunnel/app/helmrelease.yaml
  - id: openwiki-source-96402a3e006ffe5b5b97c943
    resource: repo://kubernetes/apps/network/cloudflare-tunnel/app/resources/config.yaml
  - id: openwiki-source-1ff1d265d4864ecc58515b0a
    resource: repo://kubernetes/apps/network/k8s-gateway/app/helmrelease.yaml
  - id: openwiki-source-d568e7b5376ab5b1f66e0d17
    resource: repo://kubernetes/apps/network/tailscale/app/egress-proxy.yaml
  - id: openwiki-source-d4d025f39bde91bcff75daaa
    resource: repo://kubernetes/apps/network/tailscale/app/helmrelease.yaml
generated: { by: "openwiki/0.4.3", at: "2026-08-31T23:16:37.333Z" }
---

# Network Operations

This guide covers operational procedures for maintaining and troubleshooting the cluster's networking infrastructure, including Cilium CNI, Cloudflare Tunnel, DNS services, and Tailscale VPN connectivity.

## Cilium CNI Operations

Cilium provides the cluster's Container Network Interface with eBPF-based networking, load balancing, and Gateway API support.

### Status and Health Checks

Check Cilium cluster status:

```bash
# Verify Cilium pods are running
kubectl get pods -n kube-system -l k8s-app=cilium

# Check Cilium status (requires cilium CLI)
cilium status

# Review recent logs
kubectl logs -n kube-system -l k8s-app=cilium --tail=50 --follow
```

### Connectivity Testing

Test pod-to-pod and pod-to-service connectivity:

```bash
# Test DNS resolution from a pod
kubectl run debug --image=busybox --rm -it --restart=Never -- nslookup kubernetes.default.svc.cluster.local

# Test HTTP connectivity to a service
kubectl run test-pod --image=nicolaka/netshoot --rm -it --restart=Never -- curl http://service-name:port

# Verify pod CIDR assignment
kubectl get nodes -o custom-columns=NAME:.metadata.name,CIDR:.spec.podCIDR
```

Expected pod CIDR is `10.42.0.0/16` as configured in Cilium values (kubernetes/apps/kube-system/cilium/app/helm/values.yaml#L33).

### Gateway API Troubleshooting

Verify Gateway API resources:

```bash
# Check Gateway status
kubectl get gateway -A

# Check HTTPRoute configuration
kubectl get httproute -A

# Describe specific Gateway
kubectl describe gateway external -n kube-system

# Describe specific HTTPRoute
kubectl describe httproute <route-name> -n <namespace>
```

**Gateway Addresses:**
- External Gateway: `192.168.50.13`
- Internal Gateway: `192.168.50.12`

**Common Issues:**

1. **Gateway Not Assigned**: Ensure Cilium Gateway API is enabled and L2 announcements are working
2. **Route Not Matching**: Verify HTTPRoute hostname matches the Gateway listener pattern
3. **Certificate Issues**: Check that the TLS certificate Secret exists and is valid

### LoadBalancer IP Pool Management

View LoadBalancer IP pool configuration:

```bash
# Check IP pool
kubectl get ciliumloadbalancerippool pool -n kube-system

# Check L2 announcement policy
kubectl get ciliuml2announcementpolicy l2-policy -n kube-system
```

The LoadBalancer pool uses `192.168.50.0/24` with first/last IP restrictions (kubernetes/apps/kube-system/cilium/app/networks.yaml#L8-L10).

### Network Policy Verification

List and troubleshoot Cilium network policies:

```bash
# List all network policies
kubectl get cnp --all-namespaces

# Describe a specific policy
kubectl describe cnp <policy-name> -n <namespace>
```

## Cloudflare Tunnel Operations

Cloudflare Tunnel (cloudflared) provides secure ingress without open ports.

### Status and Health Checks

```bash
# Check cloudflared pod status
kubectl get pods -n network -l app.kubernetes.io/name=cloudflare-tunnel

# View logs
kubectl logs -n network -l app.kubernetes.io/name=cloudflare-tunnel --tail=100 --follow

# Check metrics endpoint (exposed on port 8080)
kubectl port-forward -n network svc/cloudflare-tunnel 8080:8080
# Then access http://localhost:8080/metrics
```

### Configuration Debugging

The tunnel configuration is mounted from ConfigMap at `/etc/cloudflared/config.yaml`:

```bash
# View current ConfigMap
kubectl get configmap cloudflare-tunnel-configmap -n network -o yaml

# Check ingress rules
kubectl get configmap cloudflare-tunnel-configmap -n network -o jsonpath='{.data.config\.yaml}'
```

**Ingress Rules:**
- `${SECRET_DOMAIN}` → Cilium external gateway
- `*.${SECRET_DOMAIN}` → Cilium external gateway
- Default → HTTP 404

### Tunnel Credential Management

The tunnel authenticates using `TUNNEL_TOKEN` from `cloudflare-tunnel-secret`:

```bash
# Verify secret exists
kubectl get secret cloudflare-tunnel-secret -n network

# Check secret age/version
kubectl describe secret cloudflare-tunnel-secret -n network
```

To rotate tunnel credentials:
1. Create new tunnel in Cloudflare dashboard
2. Update `TUNNEL_TOKEN` in `kubernetes/apps/network/cloudflare-tunnel/app/secret.sops.yaml`
3. Commit and push changes
4. Flux will automatically reconcile the updated secret

### DNS Registration

The tunnel endpoint is registered via DNSEndpoint CRD:

```bash
# Check DNSEndpoint
kubectl get dnsendpoint cloudflare-tunnel -n network -o yaml
```

The DNSEndpoint creates a CNAME record: `external.${SECRET_DOMAIN}` → `<tunnel-id>.cfargotunnel.com` (kubernetes/apps/network/cloudflare-tunnel/app/dnsendpoint.yaml#L9-L11).

### Common Issues

**Tunnel Not Connecting:**
- Verify `TUNNEL_TOKEN` is valid and not expired
- Check cloudflared logs for authentication errors
- Ensure tunnel is active in Cloudflare dashboard

**Traffic Not Reaching Services:**
- Verify Cilium external gateway is healthy
- Check HTTPRoute configuration matches requested hostname
- Test direct connection to gateway: `kubectl run debug --image=curlimages/curl --rm -it --restart=Never -- curl https://cilium-gateway-external.kube-system.svc.cluster.local`

## DNS Operations

The cluster runs a multi-tier DNS system with k8s-gateway for internal resolution and AdGuard DNS for local network filtering.

### k8s-gateway Troubleshooting

k8s-gateway provides DNS-based service discovery at `192.168.50.11`.

```bash
# Check pod status
kubectl get pods -n network -l app.kubernetes.io/name=k8s-gateway

# View logs
kubectl logs -n network -l app.kubernetes.io/name=k8s-gateway --tail=100 --follow

# Test DNS resolution
kubectl run debug --image=busybox --rm -it --restart=Never -- nslookup app.${SECRET_DOMAIN}. 192.168.50.11

# Check LoadBalancer IP assignment
kubectl get svc k8s-gateway -n network -o yaml | grep lbipam
```

**Configuration:**
- Domain: `${SECRET_DOMAIN}`
- TTL: 1 second (for rapid updates)
- Watched resources: HTTPRoute, Service

**DNS Resolution Issues:**

1. **Service Not Resolving:**
   - Verify HTTPRoute or Service exists
   - Check k8s-gateway logs for errors
   - Ensure Service has appropriate labels or Gateway configuration

2. **Stale DNS Records:**
   - k8s-gateway uses 1-second TTL for rapid updates
   - Check if controller is processing updates: `kubectl logs -n network -l app.kubernetes.io/name=k8s-gateway --tail=100 | grep -i event`

### AdGuard DNS Operations

AdGuard DNS integration synchronizes internal service records to AdGuard Home at `192.168.50.1:3000`.

```bash
# Check AdGuard DNS pod status
kubectl get pods -n network -l app.kubernetes.io/name=adguard-dns

# View logs
kubectl logs -n network -l app.kubernetes.io/name=adguard-dns --tail=100 --follow

# Check ExternalSecret status
kubectl get externalsecret adguard-dns-secret -n network -o yaml

# Verify secret was created
kubectl get secret adguard-dns-secret -n network
```

**AdGuard DNS Filtering Configuration:**

AdGuard DNS provides network-level filtering and security. The integration connects to AdGuard Home using credentials stored in Bitwarden:

- **AdGuard Home URL**: `http://192.168.50.1:3000` (kubernetes/apps/network/adguard-dns/app/helmrelease.yaml#L44-L45)
- **Credentials**: Retrieved from Bitwarden entry `adguard-home` via ExternalSecret (kubernetes/apps/network/adguard-dns/app/externalsecret.yaml#L21-L26)

To configure DNS filtering in AdGuard Home:
1. Access AdGuard Home web interface at `http://192.168.50.1:3000`
2. Navigate to Settings → DNS settings → Filters
3. Configure blocklists (e.g., AdGuard DNS filter, OpenPhish, PhishTank)
4. Enable DNS blocking for ads, trackers, and malicious domains

**DNS Synchronization Flow:**

1. k8s-gateway generates DNS records for Kubernetes HTTPRoutes and Services
2. AdGuard DNS (external-dns webhook) reads Gateway API resources
3. Records are synchronized to AdGuard Home via API
4. Local network clients query AdGuard Home for cluster service resolution

**Common Issues:**

**Records Not Syncing to AdGuard:**
- Verify AdGuard Home credentials: `kubectl get secret adguard-dns-secret -n network -o yaml`
- Check AdGuard Home is accessible from cluster network
- Review webhook provider logs for API errors
- Ensure AdGuard Home user has permissions to modify DNS records

**DNS Filtering Not Working:**
- Verify AdGuard Home DNS filtering is enabled
- Check that clients are using AdGuard Home as their DNS resolver
- Review filter lists in AdGuard Home settings
- Test filtering by querying a blocked domain

### CoreDNS Operations

CoreDNS provides standard Kubernetes service discovery at `10.43.0.10`.

```bash
# Check CoreDNS pods
kubectl get pods -n kube-system -l k8s-app=kube-dns

# View logs
kubectl logs -n kube-system -l k8s-app=kube-dns --tail=50

# Test cluster.local resolution
kubectl run debug --image=busybox --rm -it --restart=Never -- nslookup kubernetes.default.svc.cluster.local
```

CoreDNS handles standard `cluster.local` domains while k8s-gateway provides enhanced resolution for Gateway API resources.

## Tailscale Operations

Tailscale operator provides mesh VPN networking for secure cluster access and multi-cluster connectivity.

### Status and Health Checks

```bash
# Check Tailscale operator pod
kubectl get pods -n network -l app.kubernetes.io/name=tailscale

# View operator logs
kubectl logs -n network deployment/tailscale-operator --tail=100 --follow

# List Tailscale resources
kubectl get tsn -A  # Tailscale nodes
kubectl get tailscale -A  # Tailscale resources
```

### OAuth Authentication

Tailscale operator authenticates using OAuth credentials from Bitwarden:

```bash
# Check OAuth credentials secret
kubectl get secret tailscale-secret -n network

# View ExternalSecret status
kubectl get externalsecret tailscale-secret -n network -o yaml
```

**OAuth Setup:**
1. Create OAuth client in Tailscale admin console: https://login.tailscale.com/admin/settings/oauth
2. Store `client_id` as username and `client_secret` as password in Bitwarden entry `tailscale_k8s_oauth`
3. External Secrets Operator synchronizes credentials to `tailscale-secret`

### API Server Proxy

The API Server Proxy enables remote `kubectl` access through Tailscale:

```bash
# Verify proxy is enabled
kubectl get deployment tailscale-operator -n network -o yaml | grep apiServerProxy

# Check proxy status in operator logs
kubectl logs -n network deployment/tailscale-operator | grep -i proxy
```

To access the cluster remotely:
1. Authenticate with Tailscale on your local machine
2. Configure `kubectl` to use the Tailscale proxy endpoint
3. Access cluster resources without additional VPN configuration

### Subnet Router Setup

Tailscale subnet router enables cluster services to be accessed from other Tailnet networks.

**Egress Proxy Configuration:**

The cluster uses egress proxy to access services in remote clusters via ExternalName services annotated with Tailnet IPs (kubernetes/apps/network/tailscale/app/egress-proxy.yaml#L1-L11):

```yaml
apiVersion: v1
kind: Service
metadata:
  name: prod-cluster-mosquitto
  annotations:
    tailscale.com/tailnet-ip: '100.123.28.51'  # Remote cluster Mosquitto Tailscale IP
spec:
  type: ExternalName
  externalName: unused
```

**Adding Remote Services:**

To enable access to a service in another cluster:
1. Identify the remote service's Tailscale IP or hostname
2. Create an ExternalName service in the `network` namespace
3. Annotate with `tailscale.com/tailnet-ip: "<remote-tailscale-ip>"`
4. Pods can now access the remote service via the ExternalName service

**Example Configuration:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: b-cluster-api
  namespace: network
  annotations:
    tailscale.com/tailnet-ip: "100.64.0.11"  # Remote cluster API Tailscale IP
spec:
  type: ExternalName
  externalName: unused
  ports:
  - port: 8080
    targetPort: 8080
```

### DNS Registration

Tailscale nodes register in the cluster's internal DNS automatically. Services exposed via egress proxy resolve through standard Kubernetes DNS to the ExternalName service, which then routes via Tailscale.

### Common Issues

**Operator Not Connecting:**
- Verify OAuth credentials are valid: `kubectl get secret tailscale-secret -n network -o yaml`
- Check Bitwarden ExternalSecret status for sync errors
- Review operator logs for authentication failures

**Egress Proxy Not Working:**
- Verify remote service's Tailscale IP is correct
- Check that remote service is accessible from the Tailnet
- Test connectivity: `kubectl exec -it <pod> -- curl http://<service-name>:<port>`

**API Server Proxy Unreachable:**
- Ensure proxy mode is enabled in HelmRelease configuration
- Check Tailscale ACLs allow kubectl access
- Verify client has valid Tailscale authentication

## General Network Troubleshooting

### Pod Communication Failures

**Symptoms:**
- Pods cannot reach each other across namespaces
- DNS resolution fails for cluster services
- External ingress via Gateway API not working
- `kubectl exec` timeouts or connection refused

**Diagnostic Steps:**

1. **Check CNI Status:**
   ```bash
   kubectl get pods -n kube-system -l k8s-app=cilium
   cilium status  # If CLI installed
   ```

2. **Verify Pod CIDR:**
   ```bash
   kubectl get nodes -o custom-columns=NAME:.metadata.name,CIDR:.spec.podCIDR
   # Expected: 10.42.0.0/16
   ```

3. **Check L2 Announcements:**
   ```bash
   kubectl get ciliuml2announcement -A
   kubectl get ciliumloadbalancerippool -A
   ```

4. **Verify Gateway Resources:**
   ```bash
   kubectl get gateway -A
   kubectl describe gateway external -n kube-system
   ```

5. **Test Connectivity:**
   ```bash
   kubectl run test-pod --image=nicolaka/netshoot --rm -it --restart=Never -- curl <service-url>
   ```

### Network Performance Issues

**Check Cilium Metrics:**
```bash
# Port-forward to Hubble UI (if enabled)
kubectl port-forward -n kube-system svc/hubble-ui 8081:8081

# Check Cilium Prometheus metrics
kubectl port-forward -n kube-system svc/cilium-metrics 9090:9090
```

**Verify Load Balancing:**
- Cilium uses Maglev hashing algorithm for consistent distribution
- Direct Server Return (DSR) mode enabled for optimal performance
- Check BPF maps: `cilium bpf map list | grep lb`

## Monitoring and Observability

### Metrics Endpoints

All network services expose Prometheus metrics:

- **Cilium**: `cilium-metrics` service in `kube-system` namespace
- **Cloudflare Tunnel**: Port 8080 on cloudflared pods
- **k8s-gateway**: ServiceMonitor integration enabled
- **AdGuard DNS**: ServiceMonitor on port 8080
- **Tailscale**: Operator metrics via ServiceMonitor

### Health Check Endpoints

- **Cloudflare Tunnel**: `/ready` endpoint on port 8080
- **AdGuard DNS Webhook**: `/healthz` endpoint
- **External Connectivity**: Gatus monitors ICMP to `1.1.1.1:53`

### Log Collection

```bash
# Stream logs for all network components
kubectl logs -n network -l app.kubernetes.io/name=k8s-gateway --tail=100 --follow &
kubectl logs -n network -l app.kubernetes.io/name=cloudflare-tunnel --tail=100 --follow &
kubectl logs -n network -l app.kubernetes.io/name=adguard-dns --tail=100 --follow &
kubectl logs -n network deployment/tailscale-operator --tail=100 --follow &
kubectl logs -n kube-system -l k8s-app=cilium --tail=100 --follow &
```

## Related Documentation

- [Networking Architecture](../concepts/networking.md) - Overview of the cluster's networking stack
- [Cloudflare Integration](../integrations/cloudflare.md) - Detailed Cloudflare Tunnel and DNS configuration
- [Tailscale Integration](../integrations/tailscale.md) - Mesh VPN and multi-cluster connectivity
- [Daily Operations](daily-tasks.md) - Routine operational procedures
- [Troubleshooting Guide](troubleshooting.md) - Common cluster issues and resolutions
