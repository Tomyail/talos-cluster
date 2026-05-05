# Image Automation 模板

这个模板包含为应用启用 Flux Image Automation 所需的三个资源。

## 使用方法

1. 复制这三个文件到你的应用目录：
   ```bash
   cp registry-externalsecret.yaml imagerepository.yaml imagepolicy.yaml \
     /path/to/kubernetes/apps/NAMESPACE/app/
   ```

2. 替换模板变量：
   - `APPNAME`: 应用名称（如 fava, yt-audio）
   - `NAMESPACE`: 命名空间（如 default, media）
   - `REGISTRY_URL`: 完整的镜像地址（如 gitea.tomyail.com/tomyail/beancount）
   - `REGISTRY_HOST`: Registry 主机名（如 gitea.tomyail.com）
   - `BITWARDEN_ITEM_ID`: Bitwarden 中的项目 ID

3. 更新 kustomization.yaml 添加这些资源：
   ```yaml
   resources:
     - registry-externalsecret.yaml
     - imagerepository.yaml
     - imagepolicy.yaml
     - helmrelease.yaml
   ```

4. 在 helmrelease.yaml 中使用 ImagePolicy 标记：
   ```yaml
   image:
     repository: REGISTRY_URL
     tag: "current-tag" # {"$imagepolicy": "NAMESPACE:APPNAME:tag"}
   ```

## 注意事项

- ImagePolicy 必须有 `image-automation: enabled` 标签才会被自动更新
- 确保 Bitwarden 中有正确的 registry 凭据
- 统一的 ImageUpdateAutomation 会自动发现所有带该标签的 ImagePolicy
