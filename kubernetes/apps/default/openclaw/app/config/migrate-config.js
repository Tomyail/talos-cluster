"use strict";

const fs = require("fs");

const DEFAULTS = Object.freeze({
  agentsInclude: "/etc/openclaw/managed/agents.json5",
  bindingsInclude: "/etc/openclaw/managed/bindings.json5",
  gatewayInclude: "/etc/openclaw/managed/gateway.json5",
  modelsInclude: "/etc/openclaw/managed/models.json5",
  toolsInclude: "/etc/openclaw/managed/tools.json5",
});

function managedValues(env = process.env) {
  return {
    agentsInclude: env.OPENCLAW_MANAGED_AGENTS_PATH || DEFAULTS.agentsInclude,
    bindingsInclude:
      env.OPENCLAW_MANAGED_BINDINGS_PATH || DEFAULTS.bindingsInclude,
    gatewayInclude:
      env.OPENCLAW_MANAGED_GATEWAY_PATH || DEFAULTS.gatewayInclude,
    modelsInclude: env.OPENCLAW_MANAGED_MODELS_PATH || DEFAULTS.modelsInclude,
    toolsInclude: env.OPENCLAW_MANAGED_TOOLS_PATH || DEFAULTS.toolsInclude,
  };
}

function migrateConfig(config, values) {
  // These sections are wholly Git-owned. Replacing the complete section also
  // removes sibling keys from legacy or already-partial include objects.
  config.agents = { $include: values.agentsInclude };
  config.bindings = { $include: values.bindingsInclude };
  config.gateway = { $include: values.gatewayInclude };
  config.models = { $include: values.modelsInclude };
  config.tools = { $include: values.toolsInclude };

  return config;
}

function main(argv = process.argv, env = process.env) {
  const configPath = argv[2];
  if (!configPath || argv.length > 3) {
    throw new Error("usage: node migrate-config.js <config-path>");
  }

  const config = JSON.parse(fs.readFileSync(configPath));
  migrateConfig(config, managedValues(env));
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

if (require.main === module) main();

module.exports = { DEFAULTS, managedValues, migrateConfig };
