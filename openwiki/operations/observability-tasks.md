---
type: "Reference"
title: "Observability tasks"
openwiki_generated: true
verified:
  - by: openwiki/0.4.3
    at: 2026-08-31T23:16:37.333Z
sources:
  - id: openwiki-source-d2d02a4d61439e92fb56846a
    resource: repo://kubernetes/apps/database/cloudnative-pg/cluster/gatus.yaml
  - id: openwiki-source-713804fe0a8649683e2d52d6
    resource: repo://kubernetes/apps/observability/gatus/app/helmrelease.yaml
  - id: openwiki-source-41639b32140bd05f2473e7be
    resource: repo://kubernetes/apps/observability/gatus/app/prometheusrule.yaml
  - id: openwiki-source-6d62d201721734391cebd4bd
    resource: repo://kubernetes/apps/observability/gatus/app/resources/config.yaml
  - id: openwiki-source-69cc6af1b9164ded19497ccb
    resource: repo://kubernetes/apps/observability/grafana/app/externalsecret.yaml
  - id: openwiki-source-b742f8057573a80a14049cc3
    resource: repo://kubernetes/apps/observability/grafana/app/helmrelease.yaml
  - id: openwiki-source-9f2f8a056bc4576db95d46f4
    resource: repo://kubernetes/apps/observability/grafana/ks.yaml
  - id: openwiki-source-cb93ddbc0f06cf7cb0d2c9b8
    resource: repo://kubernetes/apps/observability/kube-prometheus-stack/app/alertmanagerconfig.yaml
  - id: openwiki-source-1b4a21d2c33784701b2d34f2
    resource: repo://kubernetes/apps/observability/kube-prometheus-stack/app/httproute-main.yaml
  - id: openwiki-source-e41ba4d5a1b08d326af99c43
    resource: repo://kubernetes/apps/observability/kube-prometheus-stack/app/scrapconfig.yaml
  - id: openwiki-source-7eb48877b9bac67aa80aaf12
    resource: repo://kubernetes/apps/observability/kube-prometheus-stack/ks.yaml
  - id: openwiki-source-dd8cbf9c8398c5c726b33798
    resource: repo://kubernetes/apps/observability/loki/app/helmrelease.yaml
  - id: openwiki-source-2823e4e5c3c464dedc647934
    resource: repo://kubernetes/apps/observability/promtail/app/helmrelease.yaml
generated: { by: "openwiki/0.4.3", at: "2026-08-31T23:16:37.333Z" }
---


The observability stack operations center on accessing visualization interfaces, querying metrics and logs, configuring uptime checks, and managing alert routing. This guide covers the practical tasks for operating the integrated Prometheus, Grafana, Loki, and Gatus monitoring infrastructure.

## Accessing Grafana

Grafana serves as the primary visualization and query interface for the observability stack, providing unified access to metrics from Prometheus/Thanos and logs from Loki.

### Dashboard Access

Grafana is deployed with HTTPRoute ingress at `https://grafana-dev.${SECRET_DOMAIN}`. The deployment uses a Recreate strategy and depends on kube-prometheus-stack, Thanos, and external-secrets being available.

**Authentication** is managed via an ExternalSecret that retrieves credentials from Bitwarden:
- The `grafana-admin-secret` stores `admin-user` and `admin-password` keys
- Credentials are sourced from the `grafana` entry in the secret store
- Reloader annotations enable automatic reloads on secret changes

**Anonymous access** is enabled with Viewer role permissions, allowing read-only dashboard viewing without authentication.

### Dashboard Providers

Grafana uses file-based dashboard discovery configured via `dashboardproviders.yaml`:
- Provider name: `default`
- Folder: `""` (root)
- Type: `file`
- Deletion disabled: `false` (dashboards can be deleted through UI)

Dashboards are managed through Kubernetes ConfigMaps or Secrets that mount to the dashboard provider directory. Changes to dashboard definitions trigger pod reloads via Reloader.

### Data Source Configuration

Grafana pre-configures three core datasources:

**Prometheus/Thanos** (default datasource):
- URL: `http://thanos-query-frontend.observability.svc.cluster.local:9090`
- Type: `prometheus` with `prometheusType: Thanos`
- Time interval: 1 minute
- UID: `prometheus`

**Loki**:
- URL: `http://loki-headless.observability.svc.cluster.local:3100`
- Type: `loki`
- Max lines per query: 250
- UID: `loki`

**Alertmanager**:
- URL: `http://alertmanager-operated.observability.svc.cluster.local:9093`
- Type: `alertmanager`
- Implementation: `prometheus`
- UID: `alertmanager`

Datasources are automatically deleted and recreated on each deployment to ensure consistency.

### Environment Configuration

Grafana's behavior is controlled through environment variables and `grafana.ini` settings:

**Exploration and Queries**:
- `GF_EXPLORE_ENABLED: true` - Enables Explore mode for ad-hoc querying
- `GF_DATE_FORMATS_USE_BROWSER_LOCALE: true` - Uses browser locale for date formatting

**Plugin Support**:
- `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS` - Allows specific unsigned plugins: `natel-discrete-panel`, `pr0ps-trackmap-panel`, `panodata-map-panel`
- `GF_SECURITY_ANGULAR_SUPPORT_ENABLED: true` - Enables Angular dashboard support

**Analytics and Updates** (disabled):
- `GF_ANALYTICS_CHECK_FOR_UPDATES: false`
- `GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES: false`
- `GF_ANALYTICS_REPORTING_ENABLED: false`
- News feed disabled in `grafana.ini`

**Logging**:
- `GF_LOG_MODE: console` - Container-optimized logging output

**Server URL**:
- `GF_SERVER_ROOT_URL: https://grafana-dev.${SECRET_DOMAIN}` - Sets the base URL for links and redirects

## Querying Prometheus

Prometheus metrics are accessible through both the native Prometheus UI and the Thanos query frontend for long-term data.

### Prometheus Web UI Access

The Prometheus interface is exposed via HTTPRoute at `https://prometheus-dev.${SECRET_DOMAIN}`. The route selectively forwards paths to `prometheus-operated`:

**Query APIs**:
- `/api/v1/query` - Instant queries and PromQL evaluation
- `/api/v1/label` - Label name and value discovery

**Remote Write**:
- `/api/v1/write` - Remote write endpoint (should be protected at gateway level)

**Web UI**:
- `/graph` - Graph and query builder interface
- `/static` - Static assets
- `/` - Home page

The HTTPRoute implements path-based routing to expose only necessary endpoints while keeping administrative paths internal.

### Metrics Scraping Configuration

Prometheus uses both ServiceMonitor-based discovery for Kubernetes workloads and ScrapeConfig CRDs for static targets.

**Kubernetes Component Monitoring**:
- Kubelet and API Server scraping enabled with metric relabeling to reduce cardinality
- High-cardinality labels (`uid`, `id|name`) dropped from kubelet metrics
- Duration bucket metrics dropped from API Server to prevent metric explosion
- etcd, controller manager, and scheduler monitoring disabled for k3s compatibility

**External Static Targets** (ScrapeConfig):

1. **smartctl-exporters** (disk health):
   - Targets: `192.168.50.100:9633`, `192.168.50.220:9633`
   - Interval: 30 minutes
   - Job label: `smartctl-exporters`
   - Instance label extracted from IP address

2. **node-exporter-raspberry-pi** (system metrics):
   - Target: `192.168.50.1:9100`
   - Interval: 30 seconds
   - Job label: `node-exporter`
   - Instance label: `192.168.50.1`

3. **borgmatic-exporter** (backup status):
   - Target: `192.168.50.220:9996`
   - Interval: 24 hours (daily backup check)
   - Job label: `borgmatic-exporter`
   - Instance label: `192.168.50.220`

### Thanos Query Frontend

For historical metrics beyond Prometheus retention, queries route through the Thanos query frontend:
- Service: `thanos-query-frontend.observability.svc.cluster.local:9090`
- Provides unified querying across Prometheus local storage and long-term object storage
- Implements query caching and splitting for improved performance

Grafana's Prometheus datasource points to Thanos by default, enabling seamless access to both recent and historical metrics.

## Loki Log Aggregation and Querying

Loki aggregates logs from across the cluster with Promtail handling log collection and shipping.

### Loki Architecture

Loki runs in SingleBinary deployment mode with simplified architecture:
- Replication factor: 1 (no distributed replication)
- Chunk encoding: `snappy` for efficient storage
- Storage: `filesystem` backed by TopoLVM persistent volume (8Gi)
- Retention: 7 days (`retention_period: 7d`)
- Schema: `v13` with TSDB store and 24-hour index periods

**Component Scaling**:
- SingleBinary: 1 replica with persistence
- Gateway, Backend, Read, Write components: 0 replicas (disabled in single-binary mode)
- Chunks cache and Results cache: disabled
- Loki canary: disabled

### Log Collection with Promtail

Promtail ships logs to Loki from Kubernetes pods:
- Client URL: `http://loki-headless.observability.svc.cluster.local:3100/loki/api/v1/push`
- ServiceMonitor enabled for Prometheus scraping of Promtail metrics
- Uses pod discovery to automatically monitor new applications

### Querying Logs in Grafana

Access Loki queries through Grafana's Explore interface:

**Basic Query Pattern**:
```
{namespace="my-namespace", app="my-app"} |= "search term"
```

**LogQL Capabilities**:
- Label selectors: `{key="value"}` for filtering
- Pipe operators: `|=` for contains search, `!=` for exclusion
- Aggregation: `rate()`, `count_over_time()`, `sum()`
- Line filtering: `| line_format`, `| label_format`

**Query Limitations**:
- Max lines per query: 250 (configured in datasource)
- Retention window: 7 days

Loki datasource URL: `http://loki-headless.observability.svc.cluster.local:3100`

## Gatus Uptime Monitoring

Gatus provides automated uptime and health checks for endpoints, with automatic configuration discovery across namespaces.

### Gatus Configuration

Gatus uses a dynamic configuration model with a sidecar that watches for labeled ConfigMaps:

**Init Container** (k8s-sidecar):
- Watches resources labeled `gatus.io/enabled: "true"`
- Searches all namespaces (`NAMESPACE: ALL`)
- Watches both ConfigMaps and Secrets (`RESOURCE: both`)
- Generates unique filenames (`UNIQUE_FILENAMES: true`)
- Method: `WATCH` for continuous updates
- Output directory: `/config`

**Main Container**:
- Config path: `/config` (populated by sidecar)
- Metrics enabled for Prometheus scraping
- Storage: SQLite at `/config/sqlite.db` with caching
- Startup delay: 5 seconds
- Web port: 80

**Connectivity Checker**:
- Target: `1.1.1.1:53` (Cloudflare DNS)
- Interval: 1 minute
- Validates external connectivity before endpoint checks

### Endpoint Check Configuration

Endpoints are defined by creating ConfigMaps with the `gatus.io/enabled: "true"` label. Gatus automatically discovers and incorporates these checks.

**Example Configuration Pattern** (from postgres-gatus-ep):
```yaml
endpoints:
  - name: postgres
    group: infrastructure
    url: tcp://dev-postgres16-rw.database.svc.cluster.local:5432
    interval: 1m
    ui:
      hide-url: true
      hide-hostname: true
    conditions:
      - "[CONNECTED] == true"
    alerts:
      - type: pushover
```

**Default Endpoints** (in base config.yaml):
- **电信光猫** (ISP Modem 1): `icmp://192.168.71.1` - local group
- **移动光猫** (ISP Modem 2): `icmp://192.168.1.1` - local group
- **flux-webhook**: `https://flux-webhook.${SECRET_DOMAIN}` - external group, expects 404 status

### Gatus Web Interface

The status dashboard is accessible at `https://status-dev.${SECRET_DOMAIN}` via HTTPRoute ingress. The UI displays:
- Real-time endpoint health status
- Response times and uptime percentages
- Historical check results
- Configuration validation

### Adding New Endpoint Checks

To monitor a new service:

1. Create a ConfigMap in any namespace:
   ```yaml
   apiVersion: v1
   kind: ConfigMap
   metadata:
     name: my-service-gatus-ep
     labels:
       gatus.io/enabled: "true"
   data:
     config.yaml: |
       endpoints:
         - name: my-service
           group: external
           url: https://my-service.example.com
           interval: 1m
           conditions:
             - "[STATUS] == 200"
             - "[RESPONSE_TIME] < 500"
   ```

2. Apply the ConfigMap: Gatus sidecar automatically detects and loads the new configuration

3. Verify in Gatus UI: Check appears within the watch interval

**Check Types**:
- HTTP/HTTPS: `https://` or `http://` URLs
- TCP: `tcp://host:port` for port connectivity
- ICMP: `icmp://IP` for ping checks
- gRPC and DNS protocols also supported

## Alerting and Notification Setup

Alertmanager routes alerts from Prometheus and Gatus to Pushover for mobile/desktop notifications.

### Alertmanager Configuration

Alertmanager is deployed as part of kube-prometheus-stack with:

**Storage**:
- 1Gi persistent volume on TopoLVM
- Resource requests: 10m CPU, 64Mi memory
- Resource limits: 128Mi memory

**Ingress**:
- HTTPRoute at `https://alertmanager-dev.${SECRET_DOMAIN}`
- Routes to `alertmanager-operated:9093`

### Alert Routing Rules

The `alertmanager` AlertmanagerConfig defines routing behavior:

**Default Receiver**: `pushover`
- Group by: `alertname`, `job`
- Group wait: 1 minute (batch alerts within time window)
- Group interval: 10 minutes (wait between groups)
- Repeat interval: 12 hours (don't renotify same group)

**Special Routes**:
1. **InfoInhibitor alerts**: Silenced (null receiver) - suppress informational Watchdog alerts
2. **Critical severity**: Sent to Pushover immediately

**Inhibition Rules**:
- Critical alerts inhibit warning alerts with same `alertname` and `namespace`
- Prevents notification spam when a critical condition also triggers warnings

### Pushover Integration

Pushover receiver configuration:

**Message Template**:
- Priority: `1` for firing alerts, `0` for resolved
- Sound: `gamelan`
- Send resolved: `true`
- TTL: 86400 seconds (24 hours)

**Content**:
- Uses alert annotations (description, summary, message) in priority order
- Falls back to "Alert description not available" if empty
- Includes all label key-value pairs in small text

**Authentication**:
- Token and user key sourced from `alertmanager-secret`
- Keys: `ALERTMANAGER_PUSHOVER_TOKEN`, `PUSHOVER_USER_KEY`
- Managed via ExternalSecret (Bitwarden backend)

### Gatus Alert Rules

Gatus exposes metrics that Prometheus evaluates for alerting:

**GatusEndpointDown**:
- Expression: `gatus_results_endpoint_success{group="external"} == 0`
- For: 5 minutes
- Severity: critical
- Fires when external endpoint checks fail

**GatusEndpointExposed**:
- Expression: `gatus_results_endpoint_success{group="guarded"} == 0`
- For: 5 minutes
- Severity: critical
- Detects publicly exposed endpoints that should be internal

Alerts route through Alertmanager to Pushover following the standard routing rules.

### Creating Custom Alert Rules

Add alerting rules by creating PrometheusRule CRDs:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: my-service-rules
  namespace: observability
spec:
  groups:
    - name: my-service.rules
      rules:
        - alert: MyServiceHighErrorRate
          expr: rate(http_requests_total{status=~"5..", service="my-service"}[5m]) > 0.05
          for: 10m
          annotations:
            summary: "High error rate on {{ $labels.service }}"
          labels:
            severity: critical
```

The Prometheus Operator automatically loads rules into Prometheus evaluation engine.

## Operational Workflows

### Daily Monitoring Tasks

1. **Check Grafana dashboards** for system-wide health overview
2. **Review Alertmanager** for firing alerts and silenced notifications
3. **Verify Gatus status page** for endpoint availability
4. **Query Loki** for application errors using log filters
5. **Check Prometheus targets** page for any scrape failures

### Troubleshooting Metrics Issues

**Missing Metrics**:
1. Verify target accessibility from Prometheus network
2. Check ServiceMonitor/ScrapeConfig labels match pod service labels
3. Review Prometheus logs for scrape errors
4. Confirm metric relabeling isn't dropping required labels

**High Cardinality Warnings**:
1. Review metric relabel configs in kube-prometheus-stack values
2. Check for unbounded label values in applications
3. Consider additional `labeldrop` rules for high-cardinality labels

### Log Investigation Workflow

1. **Identify time window** from alert or dashboard
2. **Query Loki** with label selectors:
   - `{namespace="app-ns", container="app-container"} |= "error"`
3. **Filter results** using LogQL operators:
   - `|~ "regex"` for pattern matching
   - `| json` for structured log parsing
4. **Cross-reference metrics** in Grafana for correlation

### Managing Alert Fatigue

**Reducing Notification Volume**:
1. Adjust `repeatInterval` in AlertmanagerConfig (currently 12h)
2. Add inhibition rules for related alerts
3. Increase `for` duration in PrometheusRule to avoid transient alerts
4. Use severity labels to filter non-critical alerts

**Silencing Alerts**:
- Create silences in Alertmanager UI for planned maintenance
- Set appropriate end times or expiration
- Document silences with comments for team visibility

## Maintenance Operations

### Scaling Considerations

**Prometheus**:
- Monitor memory usage and scrape target count
- Consider increasing retention if storage allows
- Evaluate query performance for Thanos integration benefits

**Loki**:
- Current 8Gi storage supports 7-day retention
- Monitor ingestion rate and query latency
- Increase volume size for longer retention or higher traffic

**Gatus**:
- SQLite database scales to thousands of checks
- Monitor endpoint count and check interval density
- Consider database backup for persistence

### Backup and Recovery

**Grafana Dashboards**:
- Export important dashboards as JSON
- Version control dashboard definitions in Git
- Use Grafana's provisioning for automated recovery

**Prometheus Rules**:
- Stored as PrometheusRule CRDs (GitOps-managed)
- Automatically restored on cluster recovery
- No manual backup required

**Gatus Configuration**:
- Endpoint definitions in ConfigMaps (GitOps)
- SQLite database contains historical results (optional backup)

### Component Upgrade Strategy

All observability components use Flux HelmReleases with standardized upgrade settings:

**Upgrade Configuration**:
- Interval: 1 hour
- Cleanup on fail: `true` (removes failed resources)
- Remediation retries: 3
- Strategy: `rollback` on failure (kube-prometheus-stack, Loki)

**Dependency Order** (enforced by dependsOn):
1. prometheus-operator-crds
2. kube-prometheus-stack
3. thanos
4. grafana (depends on thanos, kube-prometheus-stack)

Loki has no dependency on other observability components and can upgrade independently.

When planning upgrades:
1. Check chart versions in HelmRelease specifications
2. Review release notes for breaking changes
3. Test in non-production environment first
4. Monitor Rollout status via `kubectl get helmrelease`
