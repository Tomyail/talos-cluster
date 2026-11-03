#!/usr/bin/env bash
# 在 Bitwarden 建 content-admin 的 CloudKit 凭证条目 content-admin-cloudkit。
# 值从 ~/.config/workout-narrator/cloudkit/ 读，经 stdin 进 bw：不进命令行参数，不打印。
# 可重复执行：条目已存在时只覆盖这两个字段，其余字段保留。
set -euo pipefail

ITEM="content-admin-cloudkit"
SRC="${HOME}/.config/workout-narrator/cloudkit"
NAMESPACE="default"

command -v bw >/dev/null || { echo "缺 bw CLI（brew install bitwarden-cli）" >&2; exit 1; }
for f in eckey.pem key-id-development; do
  [[ -s "$SRC/$f" ]] || { echo "缺文件 $SRC/$f" >&2; exit 1; }
done

if ! bw status | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin)["status"]=="unlocked" else 1)'; then
  echo "Bitwarden 未解锁。请输入主密码。"
  BW_SESSION="$(bw unlock --raw)"
  export BW_SESSION
fi

bw sync --session "$BW_SESSION" >/dev/null

payload() {
  python3 - "$SRC" <<'PY'
import json, pathlib, sys
d = pathlib.Path(sys.argv[1])
print(json.dumps({
    "type": 1,
    "name": "content-admin-cloudkit",
    "notes": "content-admin 部署用；ESO ClusterSecretStore bitwarden-fields 按字段名读取",
    "login": {"username": "", "password": ""},
    "fields": [
        {"name": "eckey.pem", "value": (d / "eckey.pem").read_text(), "type": 0},
        {"name": "key-id-development", "value": (d / "key-id-development").read_text().strip(), "type": 0},
    ],
}, ensure_ascii=False))
PY
}

id="$(bw list items --search "$ITEM" --session "$BW_SESSION" | python3 -c '
import json, sys
name = "content-admin-cloudkit"
print(next((i["id"] for i in json.load(sys.stdin) if i["name"] == name), ""))')"

if [[ -n "$id" ]]; then
  echo "条目已存在，覆盖两个字段（其余保留）"
  existing="$(bw get item "$id" --session "$BW_SESSION")"
  payload | python3 -c '
import json, sys
new = json.load(sys.stdin)
old = json.loads(sys.argv[1])
merged = {f["name"]: f for f in old.get("fields", [])}
for f in new["fields"]:
    merged[f["name"]] = f
old["fields"] = list(merged.values())
print(json.dumps(old, ensure_ascii=False))
' "$existing" | bw encode | bw edit item "$id" --session "$BW_SESSION" >/dev/null
else
  echo "新建条目"
  payload | bw encode | bw create item --session "$BW_SESSION" >/dev/null
fi

echo "== 核对（只显示字段名与长度）"
bw get item "$ITEM" --session "$BW_SESSION" | python3 -c '
import json, sys
item = json.load(sys.stdin)
for f in item["fields"]:
    print(" ", f["name"], len(f["value"]))'

if command -v kubectl >/dev/null && kubectl -n "$NAMESPACE" annotate externalsecret content-admin \
     "force-sync=$(date +%s)" --overwrite >/dev/null 2>&1; then
  echo "== 已催 ESO 同步"
  kubectl -n "$NAMESPACE" get secret content-admin-secret \
    -o jsonpath='{.data}' 2>/dev/null \
    | python3 -c 'import json,sys
try:
    print("  secret keys:", sorted(json.load(sys.stdin)))
except Exception:
    print("  secret 还没生成；看 kubectl -n default describe externalsecret content-admin")'
else
  echo "== 跳过 ESO 同步（kubectl 不可用，或 ExternalSecret 还没部署）"
  echo "   手动催 ESO 同步："
  echo "   kubectl -n $NAMESPACE annotate externalsecret content-admin force-sync=\"\$(date +%s)\" --overwrite"
fi

bw lock >/dev/null 2>&1 || true
echo "完成"