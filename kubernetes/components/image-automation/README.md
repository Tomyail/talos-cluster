# Image Automation Component

这个 component 为应用自动添加 Flux Image Automation 功能。

## 使用方法

在应用的 `ks.yaml` 中添加 component 引用和变量：

```yaml
components:
  - ../../../../components/image-automation

postBuild:
  substitute:
    APP: *app                    # 应用名称
    NAMESPACE: *namespace         # 命名空间
    REGISTRY_URL: gitea.tomyail.com/tomyail/myapp  # 完整镜像地址
    REGISTRY_HOST: gitea.tomyail.com               # Registry 主机
    BW_ID: d01d04c2-30c2-4afe-b19b-10dfaced8670   # Bitwarden 项目 ID
```

## 组件包含

- **ExternalSecret**: 从 Bitwarden 获取 registry 凭据
- **ImageRepository**: 每分钟扫描一次镜像 tag
- **ImagePolicy**: 选择最新的 SHA tag（降序）

## 在 HelmRelease 中使用

```yaml
image:
  repository: gitea.tomyail.com/tomyail/myapp
  tag: "sha-xxx" # {"$imagepolicy": "NAMESPACE:APP:tag"}
```

注意：ImagePolicy 会自动被统一的 ImageUpdateAutomation 发现并更新（因为有 `image-automation: enabled` 标签）。
