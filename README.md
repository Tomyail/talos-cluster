<div align="center">

# talos-cluster

个人自用的 Talos Kubernetes 集群仓库。

[![Kubernetes](https://img.shields.io/endpoint?url=https%3A%2F%2Fkromgo.tomyail.com%2Fkubernetes_version&style=for-the-badge&logo=kubernetes&logoColor=white&color=326ce5&label=Kubernetes)](https://kubernetes.io)
[![Talos](https://img.shields.io/endpoint?url=https%3A%2F%2Fkromgo.tomyail.com%2Ftalos_version&style=for-the-badge&color=0f6fff&label=Talos)](https://www.talos.dev/)
[![Status](https://img.shields.io/uptimerobot/status/m798277065-6ebf858e537ac04b79e23625?label=Status%20Page&style=for-the-badge&color=2ea44f&logo=statuspage)](https://status-dev.tomyail.com/)

[![Age](https://img.shields.io/endpoint?url=https%3A%2F%2Fkromgo.tomyail.com%2Fcluster_age_days&style=flat-square&label=Age)](https://kromgo.tomyail.com/cluster_age_days)
[![Uptime](https://img.shields.io/endpoint?url=https%3A%2F%2Fkromgo.tomyail.com%2Fcluster_uptime_days&style=flat-square&label=Uptime)](https://kromgo.tomyail.com/cluster_uptime_days)
[![Nodes](https://img.shields.io/endpoint?url=https%3A%2F%2Fkromgo.tomyail.com%2Fcluster_node_count&style=flat-square&label=Nodes)](https://kromgo.tomyail.com/cluster_node_count)
[![Pods](https://img.shields.io/endpoint?url=https%3A%2F%2Fkromgo.tomyail.com%2Fcluster_pods_running&style=flat-square&label=Pods)](https://kromgo.tomyail.com/cluster_pods_running)
[![CPU](https://img.shields.io/endpoint?url=https%3A%2F%2Fkromgo.tomyail.com%2Fcluster_cpu_usage&style=flat-square&label=CPU)](https://kromgo.tomyail.com/cluster_cpu_usage)
[![Memory](https://img.shields.io/endpoint?url=https%3A%2F%2Fkromgo.tomyail.com%2Fcluster_memory_usage&style=flat-square&label=Memory)](https://kromgo.tomyail.com/cluster_memory_usage)
[![Net Up](https://img.shields.io/endpoint?url=https%3A%2F%2Fkromgo.tomyail.com%2Fcluster_network_transmit_usage&style=flat-square&label=Net%E2%AC%86)](https://kromgo.tomyail.com/cluster_network_transmit_usage)
[![Net Down](https://img.shields.io/endpoint?url=https%3A%2F%2Fkromgo.tomyail.com%2Fcluster_network_receive_usage&style=flat-square&label=Net%E2%AC%87)](https://kromgo.tomyail.com/cluster_network_receive_usage)

</div>

## 🚀 当前架构

- 操作系统：Talos Linux
- Kubernetes GitOps：Flux
- 网络：Cilium、Cloudflare Tunnel、Tailscale
- Secret 管理：SOPS + age、External Secrets、Bitwarden Connect
- 观测：kube-prometheus-stack、Grafana、Loki、Thanos、Gatus、Uptime Kuma
- 存储：Topolvm、Volsync、snapshot-controller、NFS CSI、local-path-provisioner

仓库里的应用已经按 namespace / domain 分组放在 `kubernetes/apps/` 下，当前主要包括：

- `kube-system`：Cilium、CoreDNS、metrics-server、node-feature-discovery、system-upgrade
- `flux-system`：flux-operator、flux-instance
- `network`：cloudflare-tunnel、adguard-dns、k8s-gateway、smtp-relay、tailscale
- `observability`：Grafana、Prometheus、Loki、Thanos、Gatus、promtail
- `storage`：Topolvm、Volsync、NFS CSI、snapshot-controller、Nextcloud
- `default`：一批个人业务应用，例如 Gitea、Paperless、Navidrome、Jellyfin、qBittorrent、RSSHub、n8n、Ollama 等

## 🗂️ 目录说明

```text
.
├── bootstrap/              # 集群首次引导时直接安装的 Helm charts
├── kubernetes/
│   ├── apps/               # Flux 管理的应用清单
│   ├── components/         # 通用组件与复用片段
│   └── flux/               # Flux cluster/meta kustomization
├── scripts/                # bootstrap 脚本
├── talos/
│   ├── talconfig.yaml      # Talhelper 主配置
│   ├── talenv.yaml         # Talos / Kubernetes 版本
│   ├── clusterconfig/      # 生成后的 talos 配置
│   └── patches/            # Talos 机器级 patch
├── .taskfiles/             # task 子命令定义
└── Taskfile.yaml           # 常用入口
```

## 🧰 本地依赖

仓库用 [mise](https://mise.jdx.dev/) 管理工具链，见 [`.mise.toml`](./.mise.toml)。

初始化本地环境：

```sh
mise trust
mise install
```

常用 CLI：

- `task`
- `talhelper`
- `talosctl`
- `kubectl`
- `flux`
- `helmfile`
- `sops`
- `age`
- `yq`

`mise` 还会自动设置这些环境变量：

- `KUBECONFIG=./kubeconfig`
- `TALOSCONFIG=./talos/clusterconfig/talosconfig`
- `SOPS_AGE_KEY_FILE=./age.key`

## 🛠️ 引导流程

### 1. ⚙️ 准备 Talos 配置

当前仓库直接维护 [`talos/talconfig.yaml`](./talos/talconfig.yaml) 和 [`talos/talenv.yaml`](./talos/talenv.yaml)，而不是依赖旧模版里的生成流程。

修改时通常关注：

- 节点定义、IP、VIP、磁盘选择器
- Talos / Kubernetes 版本
- machine patches
- 自定义 inline manifests

如果只想重新生成 Talos 配置：

```sh
task talos:generate-config
```

### 2. 🚧 引导 Talos 集群

首次安装：

```sh
task bootstrap:talos
```

这个任务会：

- 生成或复用 `talos/talsecret.sops.yaml`
- 运行 `talhelper genconfig`
- 将 machine config apply 到节点
- 执行 Talos bootstrap
- 导出 `kubeconfig`

### 3. 📦 引导基础组件

Talos 可用后，执行：

```sh
task bootstrap:apps
```

这个流程由 [`scripts/bootstrap-apps.sh`](./scripts/bootstrap-apps.sh) 完成，主要会：

- 等待节点进入可继续安装的状态
- 创建所需 namespace
- 预先应用 SOPS secrets
- 安装必要 CRD
- 用 [`bootstrap/helmfile.yaml`](./bootstrap/helmfile.yaml) 同步首批 Helm releases

当前 bootstrap 阶段直接安装的核心组件有：

- Cilium
- CoreDNS
- cert-manager
- flux-operator
- flux-instance

之后由 Flux 持续接管 `kubernetes/apps/` 下的资源。

## 🔧 日常运维

强制同步 Flux：

```sh
task reconcile
```

单节点重刷 Talos 配置：

```sh
task talos:apply-node IP=<node-ip>
```

升级单个节点 Talos：

```sh
task talos:upgrade-node IP=<node-ip>
```

按 `talos/talenv.yaml` 升级 Kubernetes：

```sh
task talos:upgrade-k8s
```

重置整个 Talos 集群：

```sh
task talos:reset
```

## 🔐 Secret 管理

仓库使用 SOPS + age：

- `talos/*.sops.yaml`：整文件加密
- `bootstrap/`、`kubernetes/` 下的 `*.sops.yaml`：只加密 `data` / `stringData`

规则见 [`.sops.yaml`](./.sops.yaml)。

修改 secret 后，提交前至少确认：

- 文件仍然是加密态
- `age.key` 与集群中的 `sops-age` secret 对应
- Flux 能正常解密 `kubernetes/components/common/sops/` 下资源

## 📝 备注

- 项目最初通过 [onedr0p/cluster-template](https://github.com/onedr0p/cluster-template) 初始化。
- `talos/patches/` 里的 patch 会被 talhelper 合并进最终 machine config。
- 仓库中包含不少强绑定个人环境的配置，复用时应先清理网络、域名、凭据和应用清单。
