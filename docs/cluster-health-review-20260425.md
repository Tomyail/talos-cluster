# 集群健康分析报告 — 2026-04-25

## 背景

当日完成了 Kubernetes 版本升级（v1.34.5 → v1.35.4），升级后对集群进行了全面排查。

---

## 集群基本信息

| 项目 | 值 |
|------|-----|
| 节点 | master0-nuc12（单节点） |
| CPU | 16 核，使用 ~6% |
| 内存 | 32GB，使用 ~47%（14.6GB） |
| 系统盘 | 256GB NVMe（Talos OS + Ephemeral） |
| 数据盘 | 2TB NVMe（LVM, topolvm） |
| NAS | 10TB（external, nas-media PV） |
| Talos 版本 | v1.12.7 |
| Kubernetes 版本 | v1.35.4（升级后） |

---

## 今日故障：paperless CrashLoopBackOff

### 根本原因（连锁故障）

```
Dragonfly operator 无法访问 port 9999
    ↓
operator 无法验证 pod readiness（i/o timeout）
    ↓
dragonfly-0 未被打上 role=master 标签
    ↓
dragonfly Service endpoints 为空（selector 要求 role=master）
    ↓
paperless 无法连接 Redis → CrashLoopBackOff
```

### 直接原因

Dragonfly 的 NetworkPolicy 规定 port 9999 只允许带 `control-plane: controller-manager` 标签的 pod 访问，但 operator pod 没有该标签（因为是用 app-template 自定义部署的，而非官方 chart）。

此问题在**每次节点重启后必然复现**。

### 修复方案

**临时修复（当日立即生效）：**
```bash
kubectl label pod dragonfly-0 -n database role=master
```

**永久修复（已提交 commit `40e108d`）：**

在 `kubernetes/apps/database/dragonfly/app/helmrelease.yaml` 中，给 operator pod 添加标签：
```yaml
pod:
  labels:
    control-plane: controller-manager
```

Flux 同步后自动生效，后续节点重启不再复现。

---

## 升级过程问题记录

升级期间出现以下临时 CrashLoopBackOff，均为正常过渡现象，升级完成后自动恢复：

- `kube-controller-manager` — 等待 kube-apiserver 就绪
- `kube-scheduler` — 同上
- `cert-manager-cainjector` — 依赖 kube-apiserver
- flux-system 全系列组件 — 依赖 kube-apiserver
- `topolvm-controller` — CSI socket 未就绪（等主容器稳定后恢复）

升级 Job `kubernetes-master0-nuc12-7bd3fded-7wxmb` 因等待 kube-apiserver 配置版本同步超时报 Error，属正常现象，可安全删除：
```bash
kubectl delete pod -n kube-system kubernetes-master0-nuc12-7bd3fded-7wxmb
```

---

## 集群健康建议

### 优先级：中

#### 1. 更新本地 kubectl 版本
当前 client v1.32.7 与 server v1.35.4 相差 3 个 minor 版本，超出官方支持的 ±1 范围，会产生警告并可能导致部分功能异常。

#### 2. 确认 Dragonfly 永久修复已部署
临时打的 `role=master` 标签在 pod 重启后会丢失，需确认 Flux 已同步 commit `40e108d`：
```bash
flux reconcile helmrelease dragonfly-operator -n database
kubectl get pod -n database -l app.kubernetes.io/name=dragonfly-operator -o jsonpath='{.items[0].metadata.labels}'
# 应包含 control-plane: controller-manager
```

---

### 优先级：低

#### 3. 清理过期 VolumeSnapshot
部分快照已超过 264 天未更新（pgadmin 306 天、atuin/calibre 264 天等），作为 LVM thin snapshot 占用实际存储。
建议在 `ReplicationSource` 中配置 `retain` 策略自动轮转，或手动清理旧快照。

#### 4. 补全缺失的资源限制
以下 pod 未设置 `resources.limits`，单节点场景下存在 OOM 连锁风险：
- `cert-manager` 全系列
- `external-secrets` 全系列
- `cilium-operator`
- `metrics-server`

#### 5. 配置 etcd 定期快照备份
Volsync 保护了应用持久化数据，但 etcd 中的 Kubernetes 状态（所有资源定义、Secret）未单独备份。节点磁盘故障时，恢复集群需重建所有 K8s 资源。

建议通过 CronJob 定期执行并备份到 NAS：
```bash
talosctl -n 192.168.50.145 etcd snapshot ./etcd-backup-$(date +%Y%m%d).db
```

---

### 优先级：信息（不需立即处理）

#### 6. 单节点单点故障
整个集群（包括 etcd）运行在单台 NUC12 上，任何硬件故障均导致全量宕机。这是 homelab 的常见权衡，恢复能力依赖 Volsync restic 备份的完整性和速度。

---

## 备份状态（截至 2026-04-25）

Volsync 所有 ReplicationSource 均正常，今日全部同步成功，无 missedSyncCount：

涵盖应用：atuin, calibre-web-automated, cookiecloud, gitea, home-assistant, jellyfin, jellyseerr, lidarr, linkwarden, n8n, navidrome, nextcloud, omnifocus-sync-server, openclaw, paperless, pgadmin, playwright, prowlarr, qbittorrent, radarr, recyclarr, sonarr, uptime-kuma, wallos
