"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const appDirectory = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(appDirectory, "../../../../..");
const helmRelease = path.join(appDirectory, "helmrelease.yaml");
const chartVersion = "4.6.2";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function yqJson(expression, file) {
  return JSON.parse(run("yq", ["eval", "-o=json", expression, file]));
}

test("Kustomize publishes exactly the managed fragments", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-kustomize-test-"));
  const output = path.join(directory, "resources.yaml");

  try {
    fs.writeFileSync(output, run("kubectl", ["kustomize", appDirectory]));
    const data = yqJson(
      'select(.kind == "ConfigMap" and .metadata.name == "openclaw-managed-config") | .data',
      output,
    );
    assert.deepEqual(Object.keys(data).sort(), [
      "agent-feishu-tools.json5",
      "agents.json5",
      "bindings.json5",
      "gateway.json5",
      "models.json5",
      "tools.json5",
    ]);
    assert.match(data["gateway.json5"], /https:\/\/openclaw\.\$\{SECRET_DOMAIN\}/);
    assert.match(data["gateway.json5"], /Git-owned and read-only/);

    const externalSecret = yqJson(
      'select(.kind == "ExternalSecret" and .metadata.name == "openclaw")',
      output,
    );
    assert.equal(
      externalSecret.spec.target.template.data.GLM_API_KEY,
      "{{ .GLM_API_KEY }}",
    );
    for (const value of Object.values(externalSecret.spec.target.template.data)) {
      assert.match(value, /^\{\{ \.[A-Z0-9_]+ \}\}$/);
    }
    const glm = externalSecret.spec.data.find(({ secretKey }) => secretKey === "GLM_API_KEY");
    assert.deepEqual(glm, {
      secretKey: "GLM_API_KEY",
      sourceRef: {
        storeRef: { name: "bitwarden-login", kind: "ClusterSecretStore" },
      },
      remoteRef: { key: "CLAUDE_GLM", property: "password" },
    });
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});

test("pinned Helm render mounts managed config read-only and relies on Reloader", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-helm-test-"));
  const values = path.join(directory, "values.json");
  const rendered = path.join(directory, "rendered.yaml");

  try {
    fs.writeFileSync(
      values,
      run("yq", ["eval", "-o=json", ".spec.values", helmRelease]),
    );
    fs.writeFileSync(
      rendered,
      run("helm", [
        "template",
        "openclaw",
        "oci://ghcr.io/bjw-s-labs/helm/app-template",
        "--version",
        chartVersion,
        "--namespace",
        "default",
        "--values",
        values,
      ]),
    );

    const deployment = yqJson('select(.kind == "Deployment")', rendered);
    const pod = deployment.spec.template.spec;
    const init = pod.initContainers.find(({ name }) => name === "init-config");
    const app = pod.containers.find(({ name }) => name === "app");
    const env = (container) =>
      Object.fromEntries((container.env || []).map(({ name, value }) => [name, value]));
    const mount = (container, mountPath) =>
      container.volumeMounts.find((item) => item.mountPath === mountPath);

    assert.equal(deployment.metadata.annotations["reloader.stakater.com/auto"], "true");
    assert.equal(env(init).OPENCLAW_INCLUDE_ROOTS, "/etc/openclaw/managed");
    assert.equal(
      env(init).OPENCLAW_MANAGED_AGENTS_PATH,
      "/etc/openclaw/managed/agents.json5",
    );
    assert.equal(
      env(init).OPENCLAW_MANAGED_BINDINGS_PATH,
      "/etc/openclaw/managed/bindings.json5",
    );
    assert.equal(
      env(init).OPENCLAW_MANAGED_GATEWAY_PATH,
      "/etc/openclaw/managed/gateway.json5",
    );
    assert.equal(
      env(init).OPENCLAW_MANAGED_MODELS_PATH,
      "/etc/openclaw/managed/models.json5",
    );
    assert.equal(
      env(init).OPENCLAW_MANAGED_TOOLS_PATH,
      "/etc/openclaw/managed/tools.json5",
    );
    assert.equal(env(app).OPENCLAW_INCLUDE_ROOTS, "/etc/openclaw/managed");
    assert.equal(mount(init, "/etc/openclaw/managed").readOnly, true);
    assert.equal(mount(app, "/etc/openclaw/managed").readOnly, true);
    assert.equal(mount(init, "/etc/openclaw/migrate-config.js").subPath, "migrate-config.js");
    assert.equal(mount(init, "/etc/openclaw/migrate-config.js").readOnly, true);
    assert.equal(mount(app, "/etc/openclaw/migrate-config.js"), undefined);
    assert.deepEqual(app.args, ["dist/index.js", "gateway", "--allow-unconfigured"]);

    const managedVolume = pod.volumes.find(({ name }) => name === "managed-config");
    assert.equal(managedVolume.configMap.name, "openclaw-managed-config");
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});
