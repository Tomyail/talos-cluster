# TopoLVM 故障排查笔记

> 针对单节点集群（如 Talos 单控制平面）记录的一次 TopoLVM 升级故障及解决方案，方便下次遇到时快速处理。

## 故障现象

- Flux 进行 `topolvm` HelmRelease 升级后，`topolvm-controller` 一直处于 `Pending`。
- `kubectl -n storage describe pod topolvm-controller-xxxx` 显示 `node(s) didn't satisfy existing pods anti-affinity rules`。
- `flux get helmreleases -n storage topolvm` 报告 `context deadline exceeded`，Kustomization 处于 `Stalled`。

## 原因分析

- 官方 chart 默认为 controller 设置了必需的 Pod 反亲和规则，并默认 `replicaCount=2`。
- 在单节点集群中，这会导致滚动升级时新副本无法调度，从而让 Helm 的等待逻辑卡住并最终超时。
- 只保留单副本时仍会继承反亲和策略，所以需要显式覆盖该配置。

## 解决办法

1. **覆盖 chart 配置**
   - 在 `kubernetes/apps/storage/topolvm/app/helmrelease.yaml` 中设置：
     ```yaml
     controller:
       replicaCount: 1
       affinity: ""
       updateStrategy:
         type: Recreate
     ```
   - 这会完全移除反亲和规则，同时让 Helm 使用 `Recreate` 策略，确保新 Pod 创建前强制删除旧 Pod，避免再次卡住。

2. **触发 Flux 重新对齐**
   ```bash
   flux --kubeconfig kubeconfig reconcile kustomization topolvm -n storage --with-source
   flux --kubeconfig kubeconfig reconcile helmrelease topolvm -n storage
   ```

3. **如仍有 Pending Pod，手动清理旧副本**
   - 删除遗留的 controller Pod 或 ReplicaSet（名称形如 `topolvm-controller-xxxxxxxx`）：
     ```bash
     kubectl --kubeconfig kubeconfig -n storage delete pod topolvm-controller-xxxxxxxx
     ```
   - 情况严重时，可将旧 ReplicaSet scale 到 0：
     ```bash
     kubectl --kubeconfig kubeconfig -n storage scale rs topolvm-controller-xxxxxxxx --replicas=0
     ```

4. **验证**
   ```bash
   kubectl --kubeconfig kubeconfig -n storage get pods | grep topolvm
   flux --kubeconfig kubeconfig get helmreleases -n storage topolvm
   flux --kubeconfig kubeconfig get kustomizations -n storage topolvm
   ```
   - 期望只有一个 `topolvm-controller` Pod 处于 `Running`，Flux/Kustomization 显示 Ready。

## 经验提示

- 单节点环境务必禁用此类强制反亲和规则，否则任何滚动更新都会卡住。
- HelmRelease 里添加 Recreate 策略同样可以用于其他类似控制器，确保升级时不会出现双副本竞争。
