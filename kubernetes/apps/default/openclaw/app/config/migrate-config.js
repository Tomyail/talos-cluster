"use strict";

const fs = require("fs");

const DEFAULTS = Object.freeze({
  gatewayInclude: "/etc/openclaw/managed/gateway.json5",
  modelsInclude: "/etc/openclaw/managed/models.json5",
  toolsInclude: "/etc/openclaw/managed/tools.json5",
  targetModel: "litellm/coding",
});

function managedValues(env = process.env) {
  return {
    gatewayInclude:
      env.OPENCLAW_MANAGED_GATEWAY_PATH || DEFAULTS.gatewayInclude,
    modelsInclude: env.OPENCLAW_MANAGED_MODELS_PATH || DEFAULTS.modelsInclude,
    toolsInclude: env.OPENCLAW_MANAGED_TOOLS_PATH || DEFAULTS.toolsInclude,
    targetModel: env.OPENCLAW_TARGET_MODEL || DEFAULTS.targetModel,
  };
}

function migrateConfig(config, values) {
  const isGemini = (model) =>
    typeof model === "string" && model.startsWith("google/gemini");
  const isLegacyCodex = (model) =>
    typeof model === "string" && model.startsWith("openai-codex/");
  const removeGemini = (modelConfig) => {
    if (!modelConfig || typeof modelConfig !== "object") return;

    modelConfig.fallbacks = (modelConfig.fallbacks || []).filter(
      (model) => !isGemini(model),
    );
    if (isGemini(modelConfig.primary)) {
      modelConfig.primary = modelConfig.fallbacks.shift();
    }
    if (!modelConfig.primary) delete modelConfig.primary;
    if (modelConfig.fallbacks.length === 0) delete modelConfig.fallbacks;
  };
  const replaceLegacyCodex = (modelConfig) => {
    if (!modelConfig || typeof modelConfig !== "object") return;

    if (isLegacyCodex(modelConfig.primary)) {
      modelConfig.primary = values.targetModel;
    }
    modelConfig.fallbacks = [
      ...new Set(
        (modelConfig.fallbacks || []).map((model) =>
          isLegacyCodex(model) ? values.targetModel : model,
        ),
      ),
    ].filter((model) => model !== modelConfig.primary);
    if (modelConfig.fallbacks.length === 0) delete modelConfig.fallbacks;
  };

  // Sanitize legacy live values before handing ownership to the allowlisted
  // read-only fragments below. No live section content is copied into Git.
  if (config.gateway && typeof config.gateway === "object") {
    if (config.gateway.controlUi) {
      delete config.gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback;
    }
  }

  if (config.tools?.web?.fetch) {
    delete config.tools.web.fetch.provider;
    delete config.tools.web.fetch.apiKey;
  }
  if (config.tools?.web?.search) {
    delete config.tools.web.search.provider;
    delete config.tools.web.search.apiKey;
  }

  if (config.models && typeof config.models === "object") {
    if (config.models.providers?.litellm) {
      delete config.models.providers.litellm.apiKey;
    }
    if (config.models.providers) delete config.models.providers.google;
  }

  const defaults = config.agents?.defaults;
  if (defaults?.models) {
    let migratedModel = null;
    for (const model of Object.keys(defaults.models)) {
      if (isLegacyCodex(model)) {
        migratedModel ||= defaults.models[model];
        delete defaults.models[model];
      }
    }
    if (migratedModel && !defaults.models[values.targetModel]) {
      defaults.models[values.targetModel] = migratedModel;
    }
    for (const model of Object.keys(defaults.models)) {
      if (isGemini(model)) delete defaults.models[model];
    }
  }
  removeGemini(defaults?.model);
  replaceLegacyCodex(defaults?.model);
  if (defaults?.imageGenerationModel) {
    removeGemini(defaults.imageGenerationModel);
    if (!defaults.imageGenerationModel.primary) {
      delete defaults.imageGenerationModel;
    }
  }
  for (const agent of config.agents?.list || []) {
    removeGemini(agent.model);
    replaceLegacyCodex(agent.model);
  }

  if (config.tools?.media?.audio?.models) {
    config.tools.media.audio.models = config.tools.media.audio.models.filter(
      ({ provider, model }) =>
        provider !== "google" && !String(model).startsWith("gemini"),
    );
    if (config.tools.media.audio.models.length === 0) {
      config.tools.media.audio.enabled = false;
      delete config.tools.media.audio.models;
    }
  }

  // These sections are wholly Git-owned. Replacing the complete section also
  // removes sibling keys from legacy or already-partial include objects.
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
