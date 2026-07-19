"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { DEFAULTS, managedValues } = require("./migrate-config.js");

const script = path.join(__dirname, "migrate-config.js");
const managedEnv = {
  ...process.env,
  OPENCLAW_MANAGED_AGENTS_PATH: "/managed-test/agents.json5",
  OPENCLAW_MANAGED_BINDINGS_PATH: "/managed-test/bindings.json5",
  OPENCLAW_MANAGED_BROWSER_PATH: "/managed-test/browser.json5",
  OPENCLAW_MANAGED_COMMANDS_PATH: "/managed-test/commands.json5",
  OPENCLAW_MANAGED_GATEWAY_PATH: "/managed-test/gateway.json5",
  OPENCLAW_MANAGED_MODELS_PATH: "/managed-test/models.json5",
  OPENCLAW_MANAGED_SESSION_PATH: "/managed-test/session.json5",
  OPENCLAW_MANAGED_SKILLS_PATH: "/managed-test/skills.json5",
  OPENCLAW_MANAGED_TOOLS_PATH: "/managed-test/tools.json5",
};
const expectedIncludes = {
  agents: { $include: "/managed-test/agents.json5" },
  bindings: { $include: "/managed-test/bindings.json5" },
  browser: { $include: "/managed-test/browser.json5" },
  commands: { $include: "/managed-test/commands.json5" },
  gateway: { $include: "/managed-test/gateway.json5" },
  models: { $include: "/managed-test/models.json5" },
  session: { $include: "/managed-test/session.json5" },
  skills: { $include: "/managed-test/skills.json5" },
  tools: { $include: "/managed-test/tools.json5" },
};

function runMigration(input) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-config-test-"));
  const configPath = path.join(directory, "openclaw.json");
  fs.writeFileSync(configPath, JSON.stringify(input, null, 2));

  const run = () => {
    const result = spawnSync(process.execPath, [script, configPath], {
      encoding: "utf8",
      env: managedEnv,
    });
    assert.equal(result.status, 0, result.stderr);
    return fs.readFileSync(configPath, "utf8");
  };

  try {
    const first = run();
    const second = run();
    return { config: JSON.parse(second), first, second };
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
}

test("uses explicit, secret-free managed include defaults", () => {
  assert.deepEqual(managedValues({}), DEFAULTS);
});

test("migrates a fresh config to nine includes with byte idempotence", () => {
  const { config, first, second } = runMigration({ gateway: { mode: "local" } });

  assert.deepEqual(config, expectedIncludes);
  assert.equal(second, first);
});

test("replaces managed legacy sections and preserves unrelated fields", () => {
  const input = {
    unrelated: { nested: ["keep", { this: true }] },
    gateway: {
      custom: "remove",
      controlUi: { dangerouslyAllowHostHeaderOriginFallback: true },
    },
    models: {
      providers: {
        google: { apiKey: "legacy-google-value" },
        litellm: { apiKey: "legacy-litellm-value" },
      },
    },
    agents: {
      defaults: {
        models: {
          "openai-codex/gpt-5.2": { alias: "migrate-me" },
          "openai-codex/gpt-5.4-mini": { alias: "remove-legacy-duplicate" },
          "google/gemini-2.5-pro": { alias: "remove-me" },
          "local/model": { alias: "keep-me" },
        },
        model: {
          primary: "google/gemini-2.5-pro",
          fallbacks: [
            "google/gemini-2.5-flash",
            "openai-codex/gpt-5.4",
            "local/model",
          ],
        },
      },
      list: [
        {
          id: "main",
          model: {
            primary: "openai-codex/gpt-5.4",
            fallbacks: ["litellm/coding", "local/model"],
          },
        },
      ],
    },
    tools: {
      web: {
        fetch: { provider: "google", apiKey: "legacy", timeout: 10 },
        search: { provider: "google", apiKey: "legacy", limit: 5 },
      },
    },
    plugins: {
      entries: {
        brave: {
          enabled: true,
          config: {
            webSearch: {
              apiKey: "persisted-brave-key",
              mode: "web",
            },
          },
        },
      },
    },
  };

  const { config, first, second } = runMigration(input);

  assert.equal(second, first);
  assert.deepEqual(config.unrelated, input.unrelated);
  assert.deepEqual(config.gateway, expectedIncludes.gateway);
  assert.deepEqual(config.models, expectedIncludes.models);
  assert.deepEqual(config.tools, expectedIncludes.tools);
  assert.deepEqual(config.agents, expectedIncludes.agents);
  assert.deepEqual(config.bindings, expectedIncludes.bindings);
  assert.deepEqual(config.browser, expectedIncludes.browser);
  assert.deepEqual(config.commands, expectedIncludes.commands);
  assert.deepEqual(config.session, expectedIncludes.session);
  assert.deepEqual(config.skills, expectedIncludes.skills);
  assert.deepEqual(config.plugins.entries.brave, {
    enabled: true,
    config: { webSearch: { mode: "web" } },
  });
});

test("normalizes existing includes without retaining sibling keys", () => {
  const input = {
    agents: { $include: "/old/agents.json5", list: [{ id: "stale" }] },
    bindings: { $include: "/old/bindings.json5", sibling: "remove" },
    browser: { $include: "/old/browser.json5", profiles: {} },
    commands: { $include: "/old/commands.json5", restart: false },
    gateway: { $include: "/old/gateway.json5", sibling: "remove" },
    models: { $include: "/old/models.json5", providers: { stale: {} } },
    session: { $include: "/old/session.json5", dmScope: "main" },
    skills: { $include: "/old/skills.json5", entries: {} },
    tools: { $include: "/old/tools.json5", profile: "minimal" },
    plugins: { enabled: true },
  };

  const { config, first, second } = runMigration(input);

  assert.equal(second, first);
  assert.deepEqual(config, {
    ...expectedIncludes,
    plugins: { enabled: true },
  });
  for (const section of [
    "agents",
    "bindings",
    "browser",
    "commands",
    "gateway",
    "models",
    "session",
    "skills",
    "tools",
  ]) {
    assert.deepEqual(Object.keys(config[section]), ["$include"]);
  }
});

test("managed fragments are Git-owned and contain no credential literals or Gemini", () => {
  const managedDirectory = path.join(__dirname, "managed");
  const names = [
    "agent-feishu-tools.json5",
    "agents.json5",
    "bindings.json5",
    "browser.json5",
    "commands.json5",
    "gateway.json5",
    "models.json5",
    "session.json5",
    "skills.json5",
    "tools.json5",
  ];
  const contents = Object.fromEntries(
    names.map((name) => [
      name,
      fs.readFileSync(path.join(managedDirectory, name), "utf8"),
    ]),
  );
  const combined = Object.values(contents).join("\n");

  for (const content of Object.values(contents)) {
    assert.match(content, /Git-owned and read-only/);
  }
  assert.doesNotMatch(combined, /gemini/i);
  assert.doesNotMatch(combined, /(?:apiKey|token)\s*:\s*["']/);
  assert.doesNotMatch(combined, /\b(?:sk-|AIza)[A-Za-z0-9_-]+/);
  assert.match(combined, /id:\s*"OPENCLAW_GATEWAY_TOKEN"/);
  assert.match(combined, /id:\s*"LITELLM_AUTH_TOKEN"/);

  const agents = contents["agents.json5"];
  const bindings = contents["bindings.json5"];
  const models = contents["models.json5"];
  assert.doesNotMatch(agents, /openai(?:-codex)?\//i);
  assert.equal((agents.match(/agent-feishu-tools\.json5/g) || []).length, 6);
  assert.equal((bindings.match(/type:\s*"route"/g) || []).length, 7);
  assert.match(models, /baseUrl:\s*"http:\/\/litellm\.default\.svc\.cluster\.local:4000\/v1"/);
  assert.match(
    models,
    /id:\s*"glm-5-turbo"[\s\S]*?reasoning:\s*true[\s\S]*?input:\s*\["text"\][\s\S]*?contextWindow:\s*128000[\s\S]*?maxTokens:\s*16384/,
  );
  assert.match(
    models,
    /id:\s*"coding"[\s\S]*?reasoning:\s*true[\s\S]*?input:\s*\["text"\][\s\S]*?contextWindow:\s*204800[\s\S]*?maxTokens:\s*131072/,
  );
  assert.match(
    models,
    /zai:\s*\{[\s\S]*?baseUrl:\s*"https:\/\/open\.bigmodel\.cn\/api\/coding\/paas\/v4"[\s\S]*?apiKey:\s*\{[\s\S]*?source:\s*"env"[\s\S]*?provider:\s*"default"[\s\S]*?id:\s*"GLM_API_KEY"/,
  );
  assert.match(
    models,
    /litellm:\s*\{[\s\S]*?apiKey:\s*\{[\s\S]*?source:\s*"env"[\s\S]*?provider:\s*"default"[\s\S]*?id:\s*"LITELLM_AUTH_TOKEN"/,
  );
  for (const id of ["glm-5.1", "glm-5", "glm-5-turbo", "glm-4.7"]) {
    assert.match(models, new RegExp(`id:\\s*"${id.replace(".", "\\.")}"`));
  }
  assert.equal(
    (models.match(/cost:\s*\{ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 \}/g) || [])
      .length,
    4,
  );
});
