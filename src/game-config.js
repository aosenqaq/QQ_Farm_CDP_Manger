// 水印：二开倒卖先别急，README 都没看明白就上链接，属实有点绷不住。
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CONFIG_ROOT = path.join(__dirname, "..", "gameConfig");
const PLANT_IMAGE_ROOT = path.join(CONFIG_ROOT, "plant_images");
const PLANT_MISC_IMAGE_ROOT = path.join(PLANT_IMAGE_ROOT, "stages");
const PLANT_STAGE_IMAGE_DIR = path.join(PLANT_IMAGE_ROOT, "stages", "作物");
const MUTATION_IMAGE_DIR = path.join(PLANT_IMAGE_ROOT, "stages", "变异");

let loaded = false;
let roleLevelConfig = [];
let plantConfig = [];
let itemInfoConfig = [];
const plantMap = new Map();
const seedToPlant = new Map();
const fruitToPlant = new Map();
const itemInfoMap = new Map();
const cropStageImageMap = new Map();
const externalItemMetaMap = new Map();
const externalItemNameMetaMap = new Map();
const cropFallbackPlantMap = new Map();
const cropFallbackSeedMap = new Map();
const cropFallbackFruitMap = new Map();
const mutationTypeMetaMap = new Map();
const mutationTypeNameMetaMap = new Map();
const mutationPlantNameMetaMap = new Map();
const mutationPlantAssetIdMetaMap = new Map();

function readJsonFile(filename, fallback) {
  const filePath = path.join(CONFIG_ROOT, filename);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeOptionalText(value) {
  const text = String(value == null ? "" : value).trim();
  return text || null;
}

function mergeExternalItemMetaRecord(current, payload, explicitItemId = null) {
  const base = current && typeof current === "object" ? current : {};
  const itemId = Number(explicitItemId) > 0
    ? Number(explicitItemId)
    : (Number(base.itemId) || Number(payload && payload.itemId) || 0);
  return {
    itemId,
    name: normalizeOptionalText(payload && payload.name) || normalizeOptionalText(base.name),
    level: payload && payload.level != null ? (Number(payload.level) || null) : (base.level ?? null),
    rarity: payload && payload.rarity != null ? (Number(payload.rarity) || null) : (base.rarity ?? null),
    type: payload && payload.type != null ? (Number(payload.type) || null) : (base.type ?? null),
    interactionType: normalizeOptionalText(payload && payload.interactionType) || normalizeOptionalText(base.interactionType),
    assetCategory: normalizeOptionalText(payload && payload.assetCategory) || normalizeOptionalText(base.assetCategory),
    sectionName: normalizeOptionalText(payload && payload.sectionName) || normalizeOptionalText(base.sectionName),
    sectionDesc: normalizeOptionalText(payload && payload.sectionDesc) || normalizeOptionalText(base.sectionDesc),
    itemDesc: normalizeOptionalText(payload && payload.itemDesc) || normalizeOptionalText(base.itemDesc),
    imagePath: normalizeOptionalText(payload && payload.imagePath) || normalizeOptionalText(base.imagePath),
    imageUrl: normalizeOptionalText(payload && payload.imageUrl) || normalizeOptionalText(base.imageUrl),
  };
}

function upsertExternalItemMetaByName(itemName, payload) {
  const normalizedName = normalizeLookupText(itemName);
  if (!normalizedName || !payload || typeof payload !== "object") return;
  const current = externalItemNameMetaMap.get(normalizedName) || {};
  const next = mergeExternalItemMetaRecord(current, {
    ...payload,
    name: normalizeOptionalText(itemName) || payload.name || null,
  });
  externalItemNameMetaMap.set(normalizedName, next);
}

function upsertExternalItemMeta(itemId, payload) {
  const normalizedId = Number(itemId) || 0;
  if (!payload || typeof payload !== "object") return;
  if (normalizedId > 0) {
    const current = externalItemMetaMap.get(normalizedId) || {};
    const next = mergeExternalItemMetaRecord(current, payload, normalizedId);
    externalItemMetaMap.set(normalizedId, next);
    if (next.name) upsertExternalItemMetaByName(next.name, next);
    return;
  }
  if (payload.name) upsertExternalItemMetaByName(payload.name, payload);
}

function getExternalMappingItemName(item) {
  return normalizeOptionalText(item && (item.name || item.item_name || item.image_alt));
}

function resolveExternalImageSources(dirPath, name, item, imageByBaseName, imageByNestedDirName) {
  const resolvedName = normalizeOptionalText(name);
  const remoteImageUrl = normalizeOptionalText(item && (item.image_url || item.imageUrl));
  let localImagePath = (resolvedName && imageByBaseName.get(resolvedName))
    || (resolvedName && imageByNestedDirName.get(resolvedName))
    || null;
  const mappedLocalPath = normalizeOptionalText(item && item.local_path);
  if (!localImagePath && mappedLocalPath) {
    const candidate = path.join(dirPath, ...mappedLocalPath.split(/[\\/]+/).filter(Boolean));
    if (fs.existsSync(candidate)) {
      localImagePath = candidate;
    }
  }
  return {
    imagePath: localImagePath,
    imageUrl: remoteImageUrl,
  };
}

function buildFallbackPlantFromCropMapping(item, existingPlant) {
  const base = existingPlant && typeof existingPlant === "object" ? existingPlant : null;
  const name = String(item && item.name || base && base.name || "").trim();
  if (!name) return null;

  const baseFruit = base && base.fruit && typeof base.fruit === "object" ? base.fruit : null;
  const plantId = Number(base && base.id) || Number(item && item.crop_id) || 0;
  const seedId = Number(base && base.seed_id) || Number(item && item.seed_id) || 0;
  const fruitId = Number(baseFruit && baseFruit.id) || Number(item && item.fruit_id) || 0;
  const fruitCount = Number(baseFruit && baseFruit.count) || Number(item && item.fruit_count) || 0;
  const landLevelNeed = Number(base && base.land_level_need) || Number(item && item.land_level_need) || Number(item && item.level) || 0;
  const seasons = Number(base && base.seasons) || Number(item && item.seasons) || 1;
  const exp = Number(base && base.exp) || Number(item && item.exp) || 0;
  const growPhases = String(base && base.grow_phases || item && item.grow_phases || "").trim();

  return {
    id: plantId,
    name,
    mutant: typeof (base && base.mutant) === "string" ? base.mutant : "",
    fruit: {
      id: fruitId,
      count: fruitCount,
    },
    seed_id: seedId,
    land_level_need: landLevelNeed,
    seasons,
    grow_phases: growPhases,
    exp,
    size: Number(base && base.size) || 0,
    offsetPosition: base && base.offsetPosition && typeof base.offsetPosition === "object"
      ? base.offsetPosition
      : { x: 0, y: 0 },
    mutantEffectScale: base && base.mutantEffectScale && typeof base.mutantEffectScale === "object"
      ? base.mutantEffectScale
      : { x: 1, y: 1 },
    harvestOffsetPosition: base && base.harvestOffsetPosition && typeof base.harvestOffsetPosition === "object"
      ? base.harvestOffsetPosition
      : { x: -35, y: 40 },
    harvestRandom: base ? base.harvestRandom === true : false,
    harvestAllSpineRes: String(base && base.harvestAllSpineRes || ""),
    harvestAllOffsetPosition: String(base && base.harvestAllOffsetPosition || ""),
    all_state_spine: String(base && base.all_state_spine || ""),
    mature_effect: String(base && base.mature_effect || "effect/prefab/effect_plant_maturation"),
    mature_effect_offset: base && base.mature_effect_offset && typeof base.mature_effect_offset === "object"
      ? base.mature_effect_offset
      : { x: 0, y: 0 },
    rare_plant_light_pos: String(base && base.rare_plant_light_pos || ""),
    exp_root: Number(base && base.exp_root) || 0,
    exp_alter: Number(base && base.exp_alter) || 0,
    fruit_root: Number(base && base.fruit_root) || 0,
    fruit_alter: Number(base && base.fruit_alter) || 0,
  };
}

function collectStageEntriesFromDir(dirPath) {
  let files = [];
  try {
    files = fs.readdirSync(dirPath);
  } catch (_) {
    files = [];
  }
  const stageEntries = [];
  files.forEach((filename) => {
    if (!/\.(png|jpg|jpeg|webp|gif)$/i.test(filename)) return;
    const match = /_(\d+)_([^.]*)\.(?:png|jpg|jpeg|webp|gif)$/i.exec(filename);
    if (!match) return;
    stageEntries.push({
      index: Number(match[1]) || 0,
      label: String(match[2] || "").trim(),
      path: path.join(dirPath, filename),
    });
  });
  stageEntries.sort((a, b) => a.index - b.index);
  return stageEntries;
}

function pickPrimaryStageEntry(stageEntries) {
  const list = Array.isArray(stageEntries) ? stageEntries : [];
  if (list.length === 0) return null;
  return list.find((entry) => entry.index === 0)
    || list.find((entry) => /^(作物图|主图)$/i.test(String(entry.label || "").trim()))
    || list.find((entry) => entry.index === 1)
    || list[0]
    || null;
}

function normalizeLookupText(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

function normalizeMutationPlantAssetId(value) {
  const raw = Number(value) || 0;
  if (raw <= 0) return 0;
  const text = String(Math.trunc(raw));
  const direct = Number(text);
  if (direct >= 1000000) {
    const suffix = Number(text.slice(-4));
    return suffix > 0 ? suffix : direct;
  }
  if (direct >= 10000) {
    const suffix = Number(text.slice(-4));
    return suffix > 0 ? suffix : direct;
  }
  return direct;
}

function collectLookupNames(...values) {
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    const text = String(value == null ? "" : value).trim();
    if (!text) return;
    const normalized = normalizeLookupText(text);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(text);
  });
  return result;
}

function getCropStageEntriesByNames(names) {
  ensureLoaded();
  const candidates = Array.isArray(names) ? names : [names];
  for (const name of candidates) {
    const normalizedName = String(name == null ? "" : name).trim();
    if (!normalizedName) continue;
    const stageEntries = cropStageImageMap.get(normalizedName);
    if (Array.isArray(stageEntries) && stageEntries.length > 0) {
      return stageEntries;
    }
  }
  return null;
}

function ensureLoaded() {
  if (loaded) return;
  roleLevelConfig = readJsonFile("RoleLevel.json", []);
  plantConfig = readJsonFile("Plant.json", []);
  itemInfoConfig = readJsonFile("ItemInfo.json", []);

  plantMap.clear();
  seedToPlant.clear();
  fruitToPlant.clear();
  itemInfoMap.clear();
  cropStageImageMap.clear();
  externalItemMetaMap.clear();
  externalItemNameMetaMap.clear();
  cropFallbackPlantMap.clear();
  cropFallbackSeedMap.clear();
  cropFallbackFruitMap.clear();
  mutationTypeMetaMap.clear();
  mutationTypeNameMetaMap.clear();
  mutationPlantNameMetaMap.clear();
  mutationPlantAssetIdMetaMap.clear();

  const plantByName = new Map();

  plantConfig.forEach((plant) => {
    const plantId = Number(plant && plant.id) || 0;
    if (plantId > 0) plantMap.set(plantId, plant);
    const seedId = Number(plant && plant.seed_id) || 0;
    if (seedId > 0) seedToPlant.set(seedId, plant);
    const fruitId = Number(plant && plant.fruit && plant.fruit.id) || 0;
    if (fruitId > 0) fruitToPlant.set(fruitId, plant);
    const name = String(plant && plant.name || "").trim();
    if (name && !plantByName.has(name)) plantByName.set(name, plant);
  });

  itemInfoConfig.forEach((item) => {
    const itemId = Number(item && item.id) || 0;
    if (itemId > 0) itemInfoMap.set(itemId, item);
  });

  if (fs.existsSync(PLANT_STAGE_IMAGE_DIR)) {
    let cropDirs = [];
    try {
      cropDirs = fs.readdirSync(PLANT_STAGE_IMAGE_DIR, { withFileTypes: true });
    } catch (_) {
      cropDirs = [];
    }
      cropDirs.forEach((entry) => {
      if (!entry || entry.isDirectory() !== true) return;
      const cropName = String(entry.name || "").trim();
      if (!cropName) return;
      const cropDirPath = path.join(PLANT_STAGE_IMAGE_DIR, cropName);
      const stageEntries = collectStageEntriesFromDir(cropDirPath);
      if (stageEntries.length > 0) {
        cropStageImageMap.set(cropName, stageEntries);
      }
    });
  }

  if (fs.existsSync(PLANT_MISC_IMAGE_ROOT)) {
    let assetDirs = [];
    try {
      assetDirs = fs.readdirSync(PLANT_MISC_IMAGE_ROOT, { withFileTypes: true });
    } catch (_) {
      assetDirs = [];
    }
    assetDirs.forEach((entry) => {
      if (!entry || entry.isDirectory() !== true) return;
      const dirName = String(entry.name || "").trim();
      if (!dirName || dirName === "作物") return;
      const dirPath = path.join(PLANT_MISC_IMAGE_ROOT, dirName);
      let entries = [];
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
      } catch (_) {
        entries = [];
      }
      const imageByBaseName = new Map();
      const imageByNestedDirName = new Map();
      entries.forEach((entry) => {
        if (!entry) return;
        if (entry.isFile() === true) {
          const filename = String(entry.name || "");
          if (!/\.(png|jpg|jpeg|webp|gif)$/i.test(filename)) return;
          const baseName = path.basename(filename, path.extname(filename)).trim();
          if (baseName && !imageByBaseName.has(baseName)) {
            imageByBaseName.set(baseName, path.join(dirPath, filename));
          }
          return;
        }
        if (entry.isDirectory() !== true) return;
        const nestedDirName = String(entry.name || "").trim();
        if (!nestedDirName) return;
        const stageEntries = collectStageEntriesFromDir(path.join(dirPath, nestedDirName));
        const mainEntry = pickPrimaryStageEntry(stageEntries);
        if (mainEntry && mainEntry.path && !imageByNestedDirName.has(nestedDirName)) {
          imageByNestedDirName.set(nestedDirName, mainEntry.path);
        }
      });
      entries
        .filter((entry) => entry && entry.isFile() === true && /_mapping\.json$/i.test(String(entry.name || "")))
        .forEach((filename) => {
          let parsed = null;
          try {
            parsed = JSON.parse(fs.readFileSync(path.join(dirPath, filename.name), "utf8").replace(/^\uFEFF/, ""));
          } catch (_) {
            parsed = null;
          }
          const items = Array.isArray(parsed && parsed.items) ? parsed.items : [];
          items.forEach((item) => {
            const itemId = Number(item && (item.item_id || item.id)) || 0;
            const name = getExternalMappingItemName(item);
            const imageSource = resolveExternalImageSources(dirPath, name, item, imageByBaseName, imageByNestedDirName);
            const payload = {
              name,
              level: item && item.level,
              rarity: item && item.rarity,
              type: item && item.type,
              interactionType: item && item.interaction_type,
              assetCategory: dirName,
              sectionName: item && item.section_name,
              sectionDesc: item && item.section_desc,
              itemDesc: item && (item.item_desc || item.desc),
              imagePath: imageSource.imagePath,
              imageUrl: imageSource.imageUrl,
            };
            if (itemId > 0) {
              upsertExternalItemMeta(itemId, payload);
            } else if (name) {
              upsertExternalItemMetaByName(name, payload);
            }
          });
        });
    });
  }

  if (fs.existsSync(PLANT_STAGE_IMAGE_DIR)) {
    let rootFiles = [];
    try {
      rootFiles = fs.readdirSync(PLANT_STAGE_IMAGE_DIR);
    } catch (_) {
      rootFiles = [];
    }
    rootFiles
      .filter((filename) => /_mapping\.json$/i.test(filename))
      .forEach((filename) => {
        let parsed = null;
        try {
          parsed = JSON.parse(fs.readFileSync(path.join(PLANT_STAGE_IMAGE_DIR, filename), "utf8").replace(/^\uFEFF/, ""));
        } catch (_) {
          parsed = null;
        }
        const items = Array.isArray(parsed && parsed.items) ? parsed.items : [];
        items.forEach((item) => {
          const name = String(item && item.name || "").trim();
          if (!name) return;
          const stageEntries = name ? cropStageImageMap.get(name) : null;
          const mainEntry = Array.isArray(stageEntries)
            ? (stageEntries.find((entry) => entry.index === 0)
              || stageEntries.find((entry) => /^(作物图|主图)$/i.test(String(entry.label || "").trim()))
              || null)
            : null;
          const assetCategory = (parsed && parsed.category) || "作物";
          const imagePath = mainEntry && mainEntry.path ? mainEntry.path : null;
          const seedId = Number(item && item.seed_id) || 0;
          const fruitId = Number(item && item.fruit_id) || 0;
          const explicitItemId = Number(item && (item.item_id || item.id)) || 0;
          const externalTargets = [];
          if (explicitItemId > 0) {
            externalTargets.push({
              itemId: explicitItemId,
              name,
              type: item && item.type,
              interactionType: item && item.interaction_type,
            });
          }
          if (seedId > 0) {
            externalTargets.push({
              itemId: seedId,
              name: `${name}种子`,
              type: 5,
              interactionType: "plant",
            });
          }
          if (fruitId > 0) {
            externalTargets.push({
              itemId: fruitId,
              name,
              type: 6,
            });
          }
          const seenMetaIds = new Set();
          externalTargets.forEach((target) => {
            const metaId = Number(target && target.itemId) || 0;
            if (metaId <= 0 || seenMetaIds.has(metaId)) return;
            seenMetaIds.add(metaId);
            upsertExternalItemMeta(metaId, {
              name: target.name,
              level: item && item.level,
              rarity: item && item.rarity,
              type: target.type,
              interactionType: target.interactionType,
              assetCategory,
              imagePath,
            });
          });

          const fallbackPlant = buildFallbackPlantFromCropMapping(item, plantByName.get(name) || null);
          if (!fallbackPlant) return;
          const cropId = Number(item && item.crop_id) || 0;
          if (cropId > 0 && !plantMap.has(cropId)) cropFallbackPlantMap.set(cropId, fallbackPlant);
          if (seedId > 0 && !seedToPlant.has(seedId)) cropFallbackSeedMap.set(seedId, fallbackPlant);
          if (fruitId > 0 && !fruitToPlant.has(fruitId)) cropFallbackFruitMap.set(fruitId, fallbackPlant);
        });
      });
  }

  loadMutationMapping();

  loaded = true;
}

function buildMutationLocalPath(localPath) {
  const text = normalizeOptionalText(localPath);
  if (!text) return null;
  const candidate = path.join(MUTATION_IMAGE_DIR, ...text.split(/[\\/]+/).filter(Boolean));
  return fs.existsSync(candidate) ? candidate : null;
}

function upsertMutationPlantMeta(name, item) {
  const plantName = normalizeOptionalText(name);
  if (!plantName || !item || typeof item !== "object") return;
  const current = mutationPlantNameMetaMap.get(normalizeLookupText(plantName)) || {};
  const localPath = buildMutationLocalPath(item.local_path);
  const imageRole = String(item.image_role || "").trim();
  const phaseIndex = Number(item.phase_index) || 0;
  const phaseLabel = normalizeOptionalText(item.phase_label);
  const stageEntries = Array.isArray(current.stageEntries) ? current.stageEntries.slice() : [];
  if (localPath && imageRole === "phase" && phaseIndex > 0) {
    const existingIndex = stageEntries.findIndex((entry) => Number(entry && entry.index) === phaseIndex);
    const nextEntry = { index: phaseIndex, label: phaseLabel || "", path: localPath };
    if (existingIndex >= 0) stageEntries[existingIndex] = nextEntry;
    else stageEntries.push(nextEntry);
    stageEntries.sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0));
  }
  const isMain = imageRole === "main" || !current.imagePath;
  const meta = {
    name: plantName,
    groupName: normalizeOptionalText(item.group_name) || current.groupName || null,
    sectionName: normalizeOptionalText(item.section_name) || current.sectionName || null,
    itemChips: normalizeOptionalText(item.item_chips) || current.itemChips || null,
    itemDesc: normalizeOptionalText(item.item_desc) || current.itemDesc || null,
    itemStats: normalizeOptionalText(item.item_stats) || current.itemStats || null,
    imagePath: isMain ? (localPath || current.imagePath || normalizeOptionalText(item.image_url) || null) : (current.imagePath || localPath || null),
    stageEntries,
  };
  mutationPlantNameMetaMap.set(normalizeLookupText(plantName), meta);

  const imagePath = normalizeOptionalText(item.image_path);
  const assetMatch = imagePath && /Crop_(\d+)(?:_|\.)/i.exec(imagePath);
  const assetId = assetMatch ? Number(assetMatch[1]) || 0 : 0;
  if (assetId > 0 && imageRole === "main") {
    const toneKey = /^黄金·/.test(plantName) ? "gold" : "normal";
    mutationPlantAssetIdMetaMap.set(`${toneKey}:${assetId}`, meta);
    if (!mutationPlantAssetIdMetaMap.has(assetId)) mutationPlantAssetIdMetaMap.set(assetId, meta);
  }
}

function loadMutationMapping() {
  const mappingPath = path.join(MUTATION_IMAGE_DIR, "mutation_mapping.json");
  if (!fs.existsSync(mappingPath)) return;
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(mappingPath, "utf8").replace(/^\uFEFF/, ""));
  } catch (_) {
    parsed = null;
  }
  const items = Array.isArray(parsed && parsed.items) ? parsed.items : [];
  items.forEach((item) => {
    const sectionName = normalizeOptionalText(item && item.section_name);
    const itemName = normalizeOptionalText(item && item.item_name);
    if (!sectionName || !itemName) return;
    if (sectionName === "变异宝典" && String(item && item.image_role || "") === "effect_icon") {
      const mutationType = Number(item && item.article_index) || 0;
      const meta = {
        id: mutationType,
        name: itemName,
        itemChips: normalizeOptionalText(item.item_chips),
        itemDesc: normalizeOptionalText(item.item_desc),
        iconPath: buildMutationLocalPath(item.local_path) || normalizeOptionalText(item.image_url),
      };
      if (mutationType > 0) mutationTypeMetaMap.set(mutationType, meta);
      mutationTypeNameMetaMap.set(normalizeLookupText(itemName), meta);
      return;
    }
    if (sectionName === "超变图鉴") {
      upsertMutationPlantMeta(itemName, item);
    }
  });
}

function getMutationTypeMeta(typeIdOrName) {
  ensureLoaded();
  const typeId = Number(typeIdOrName) || 0;
  if (typeId > 0 && mutationTypeMetaMap.has(typeId)) return mutationTypeMetaMap.get(typeId);
  const normalizedName = normalizeLookupText(typeIdOrName);
  return normalizedName ? (mutationTypeNameMetaMap.get(normalizedName) || null) : null;
}

function getMutationPlantMetaByName(name) {
  ensureLoaded();
  const normalizedName = normalizeLookupText(name);
  return normalizedName ? (mutationPlantNameMetaMap.get(normalizedName) || null) : null;
}

function getMutationPlantMetaByRuntimeId(runtimeId, options = {}) {
  ensureLoaded();
  const assetId = normalizeMutationPlantAssetId(runtimeId);
  const runtimeText = String(Math.trunc(Number(runtimeId) || 0));
  const toneKey = runtimeText.indexOf("112") === 0 ? "gold" : (runtimeText.indexOf("102") === 0 ? "normal" : "");
  if (assetId > 0 && toneKey && mutationPlantAssetIdMetaMap.has(`${toneKey}:${assetId}`)) {
    return mutationPlantAssetIdMetaMap.get(`${toneKey}:${assetId}`);
  }
  if (assetId > 0 && mutationPlantAssetIdMetaMap.has(assetId)) {
    return mutationPlantAssetIdMetaMap.get(assetId);
  }
  const typeMeta = getMutationTypeMeta(options.typeId);
  const baseName = normalizeOptionalText(options.basePlantName);
  if (typeMeta && typeMeta.name === "黄金" && baseName) {
    const byName = getMutationPlantMetaByName(`黄金·${baseName}`);
    if (byName) return byName;
  }
  return null;
}

function getMutationTypeIconPath(typeIdOrName) {
  const meta = getMutationTypeMeta(typeIdOrName);
  return meta && meta.iconPath ? meta.iconPath : null;
}

function getMutationPlantImagePath(runtimeId, options = {}) {
  const meta = getMutationPlantMetaByRuntimeId(runtimeId, options)
    || getMutationPlantMetaByName(options.name || options.plantName);
  const stageEntries = meta && Array.isArray(meta.stageEntries) ? meta.stageEntries : [];
  const currentStage = Number(options.currentStage);
  if (Number.isFinite(currentStage) && currentStage > 0) {
    const matchedByIndex = stageEntries.find((entry) => Number(entry && entry.index) === currentStage);
    if (matchedByIndex && matchedByIndex.path) return matchedByIndex.path;
  }
  return meta && meta.imagePath ? meta.imagePath : null;
}

function parseGrowPhases(growPhases) {
  return String(growPhases || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item, index) => {
      const parts = item.split(":");
      return {
        index: index + 1,
        name: parts[0] || "",
        duration: parts[1] == null ? 0 : (Number(parts[1]) || 0),
      };
    });
}

function getPlantGrowTimeSec(plantOrPlantId) {
  ensureLoaded();
  const plant = typeof plantOrPlantId === "object" && plantOrPlantId
    ? plantOrPlantId
    : getPlantById(plantOrPlantId);
  if (!plant) return 0;
  const phases = parseGrowPhases(plant.grow_phases);
  const durations = phases.map((item) => Number(item.duration) || 0);
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  const seasons = Number(plant.seasons) || 1;
  if (seasons !== 2) return total;
  const lastTwo = durations.filter((duration) => duration > 0).slice(-2);
  return total + lastTwo.reduce((sum, duration) => sum + duration, 0);
}

function formatGrowTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  if (total < 60) return `${total}秒`;
  if (total < 3600) return `${Math.floor(total / 60)}分钟`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours < 24) {
    return minutes > 0 ? `${hours}小时${minutes}分` : `${hours}小时`;
  }
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  if (remainHours > 0 && minutes > 0) return `${days}天${remainHours}小时${minutes}分`;
  if (remainHours > 0) return `${days}天${remainHours}小时`;
  return `${days}天`;
}

function getSeedImagePathBySeedId(seedId, options = {}) {
  ensureLoaded();
  const targetId = Number(seedId) || 0;
  const plant = targetId > 0 ? getPlantBySeedId(targetId) : null;
  const names = collectLookupNames(options.plantName, plant && plant.name);
  if (names.length === 0) return null;
  const stageEntries = getCropStageEntriesByNames(names);
  if (!Array.isArray(stageEntries) || stageEntries.length === 0) return null;
  const mainEntry = pickPrimaryStageEntry(stageEntries);
  return mainEntry && mainEntry.path ? mainEntry.path : null;
}

function normalizeStageLabel(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

function getPlantStageImagePathBySeedId(seedId, options = {}) {
  ensureLoaded();
  const plant = getPlantBySeedId(seedId);
  const names = collectLookupNames(options.plantName, plant && plant.name);
  if (names.length === 0) return null;
  const stageEntries = getCropStageEntriesByNames(names);
  if (!Array.isArray(stageEntries) || stageEntries.length === 0) return null;

  const normalizedPhaseName = normalizeStageLabel(options.phaseName);
  if (normalizedPhaseName) {
    const matchedByLabel = stageEntries.find((item) => normalizeStageLabel(item.label) === normalizedPhaseName);
    if (matchedByLabel && matchedByLabel.path) return matchedByLabel.path;
  }

  const phases = plant ? parseGrowPhases(plant.grow_phases) : [];
  const phaseIndex = phases.findIndex((item) => normalizeStageLabel(item.name) === normalizedPhaseName);
  if (phaseIndex >= 0) {
    const matchedByPhaseOrder = stageEntries.find((item) => item.index === (phaseIndex + 1));
    if (matchedByPhaseOrder && matchedByPhaseOrder.path) return matchedByPhaseOrder.path;
  }

  const currentStage = Number(options.currentStage);
  if (Number.isFinite(currentStage) && currentStage > 0) {
    const matchedByIndex = stageEntries.find((item) => item.index === currentStage);
    if (matchedByIndex && matchedByIndex.path) return matchedByIndex.path;
  }

  return null;
}

function getPlantBySeedId(seedId) {
  ensureLoaded();
  const targetId = Number(seedId) || 0;
  return seedToPlant.get(targetId) || cropFallbackSeedMap.get(targetId) || null;
}

function getPlantById(plantId) {
  ensureLoaded();
  const targetId = Number(plantId) || 0;
  return plantMap.get(targetId) || cropFallbackPlantMap.get(targetId) || null;
}

function getPlantByFruitId(fruitId) {
  ensureLoaded();
  const targetId = Number(fruitId) || 0;
  return fruitToPlant.get(targetId) || cropFallbackFruitMap.get(targetId) || null;
}

function getItemInfoById(itemId) {
  ensureLoaded();
  return itemInfoMap.get(Number(itemId) || 0) || null;
}

function getExternalItemMetaByItemId(itemId, options = {}) {
  ensureLoaded();
  const byId = externalItemMetaMap.get(Number(itemId) || 0) || null;
  if (byId) return byId;
  return getExternalItemMetaByName(options.name || options.itemName || options.plantName) || null;
}

function getExternalItemMetaByName(itemName) {
  ensureLoaded();
  const normalizedTarget = normalizeLookupText(itemName);
  if (!normalizedTarget) return null;
  const direct = externalItemNameMetaMap.get(normalizedTarget);
  if (direct) return direct;
  for (const meta of externalItemMetaMap.values()) {
    if (normalizeLookupText(meta && meta.name) === normalizedTarget) {
      return meta;
    }
  }
  return null;
}

function getExternalItemImagePathByItemId(itemId, options = {}) {
  const meta = getExternalItemMetaByItemId(itemId)
    || getExternalItemMetaByName(options.name || options.itemName || options.plantName);
  return meta && (meta.imagePath || meta.imageUrl) ? (meta.imagePath || meta.imageUrl) : null;
}

function getAllItemInfo() {
  ensureLoaded();
  return [...itemInfoConfig];
}

function getSeedPrice(seedId) {
  ensureLoaded();
  const item = itemInfoMap.get(Number(seedId) || 0);
  return Number(item && item.price) || 0;
}

function getFruitPrice(fruitId) {
  ensureLoaded();
  const item = itemInfoMap.get(Number(fruitId) || 0);
  return Number(item && item.price) || 0;
}

function getAllPlants() {
  ensureLoaded();
  return [...plantConfig];
}

function getAllRoleLevels() {
  ensureLoaded();
  return [...roleLevelConfig];
}

function getLevelExpProgress(level, totalExp) {
  ensureLoaded();
  const curLevel = Number(level) || 0;
  const exp = Number(totalExp) || 0;
  if (curLevel <= 0 || exp < 0 || !Array.isArray(roleLevelConfig) || roleLevelConfig.length === 0) {
    return null;
  }
  const current = roleLevelConfig.find((item) => Number(item && item.level) === curLevel) || null;
  const next = roleLevelConfig.find((item) => Number(item && item.level) === curLevel + 1) || null;
  if (!current) return null;
  const currentFloor = Number(current && current.exp) || 0;
  const nextFloor = next ? (Number(next && next.exp) || currentFloor) : null;
  const needed = nextFloor != null ? Math.max(0, nextFloor - currentFloor) : null;
  const looksLikeCurrentLevelExp = (
    needed != null &&
    currentFloor > 0 &&
    exp < currentFloor &&
    exp <= needed
  );
  const normalizedTotalExp = looksLikeCurrentLevelExp ? (currentFloor + exp) : exp;
  const currentProgressRaw = looksLikeCurrentLevelExp
    ? exp
    : Math.max(0, normalizedTotalExp - currentFloor);
  const currentProgress = needed != null
    ? Math.max(0, Math.min(currentProgressRaw, needed))
    : Math.max(0, currentProgressRaw);
  return {
    level: curLevel,
    totalExp: normalizedTotalExp,
    rawExp: exp,
    expMode: looksLikeCurrentLevelExp ? "current_level" : "total",
    current: currentProgress,
    needed,
    currentFloor,
    nextLevel: next ? (Number(next && next.level) || (curLevel + 1)) : null,
    nextLevelTotalExp: nextFloor,
    remaining: needed != null ? Math.max(0, needed - currentProgress) : null,
    percent: needed && needed > 0 ? Math.max(0, Math.min(100, Number(((currentProgress / needed) * 100).toFixed(2)))) : null,
  };
}

module.exports = {
  ensureLoaded,
  getAllPlants,
  getAllRoleLevels,
  getLevelExpProgress,
  getPlantById,
  getPlantBySeedId,
  getPlantByFruitId,
  getItemInfoById,
  getExternalItemMetaByItemId,
  getExternalItemImagePathByItemId,
  getMutationTypeMeta,
  getMutationTypeIconPath,
  getMutationPlantMetaByRuntimeId,
  getMutationPlantImagePath,
  getAllItemInfo,
  getSeedPrice,
  getFruitPrice,
  getPlantGrowTimeSec,
  getPlantStageImagePathBySeedId,
  formatGrowTime,
  getSeedImagePathBySeedId,
  parseGrowPhases,
};
