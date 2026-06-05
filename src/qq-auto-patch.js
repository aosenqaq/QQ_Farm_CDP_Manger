// 水印：二开倒卖先别急，README 都没看明白就上链接，属实有点绷不住。
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  buildQqBundle,
  ensureParentDir,
  inspectPatchedQqGameFile,
  patchQqGameFiles,
  resolveQqPatchTarget,
} = require("./qq-bundle");
const { findLatestQqMiniappAnyApp } = require("./qq-miniapp-discovery");

function buildTargetList(target) {
  const paths = Array.isArray(target && target.targetPaths) && target.targetPaths.length > 0
    ? target.targetPaths
    : (target && target.targetPath ? [target.targetPath] : []);
  return [...new Set(paths.map((item) => String(item || "").trim()).filter(Boolean))];
}

function summarizeInspections(inspections) {
  if (!Array.isArray(inspections) || inspections.length === 0) return "未检测到补丁目标";
  const total = inspections.length;
  const synced = inspections.filter((item) => item && item.matchesExpected).length;
  const patched = inspections.filter((item) => item && item.patched).length;
  return `${synced}/${total} 已是最新补丁，${patched}/${total} 已存在补丁块`;
}

function resolvePatchTargetWithFallback(config, options) {
  const target = resolveQqPatchTarget({
    targetPath: options.targetPath,
    appId: options.appId,
    fallbackTargetPath: config.qqGameJsPath,
    fallbackAppId: config.qqAppId,
    srcRoot: options.srcRoot || config.qqMiniappSrcRoot,
  });
  if (target && target.targetPath) return target;
  if (options.targetPath || options.appId || config.qqGameJsPath || config.qqAppId) return target;

  try {
    const any = findLatestQqMiniappAnyApp({
      srcRoot: options.srcRoot || config.qqMiniappSrcRoot,
    });
    return {
      appId: any.appId || null,
      targetMode: "auto",
      targetPath: any.selected && any.selected.gameJsPath ? any.selected.gameJsPath : null,
      targetPaths: any.selected && any.selected.gameJsPath ? [any.selected.gameJsPath] : [],
      targetResolvable: !!(any.selected && any.selected.gameJsPath),
      targetError: null,
      discovery: any,
    };
  } catch (_) {
    return target;
  }
}

async function ensureLatestQqPatch(options = {}) {
  const config = options.config;
  const projectRoot = options.projectRoot || path.join(__dirname, "..");
  const logger = options.logger && typeof options.logger === "object" ? options.logger : console;
  const built = buildQqBundle({
    config,
    projectRoot,
    bundleMode: options.bundleMode || undefined,
  });
  const outPath = path.resolve(
    options.outPath || built.meta.outputPath || path.join(projectRoot, "dist", built.meta.defaultFilename || "qq-miniapp-bootstrap.js"),
  );

  ensureParentDir(outPath);
  await fs.writeFile(outPath, built.bundleText, "utf8");

  const target = resolvePatchTargetWithFallback(config, options);
  const targetPaths = buildTargetList(target);
  if (!target.targetPath || targetPaths.length === 0) {
    return {
      ok: false,
      action: "manual_required",
      reason: target.targetError || "未配置 QQ game.js 路径，也未提供 QQ appid",
      meta: built.meta,
      target,
      targetPaths,
      inspections: [],
      outPath,
    };
  }

  const inspections = targetPaths.map((targetPath) => inspectPatchedQqGameFile(targetPath, built.meta.scriptHash));
  const needsPatch = inspections.some((item) => !item.matchesExpected);
  if (!needsPatch) {
    if (logger.info) {
      logger.info(`[qq-auto-patch] QQ game.js 已是最新补丁：${summarizeInspections(inspections)}`);
    }
    return {
      ok: true,
      action: "already_latest",
      reason: null,
      meta: built.meta,
      target,
      targetPaths,
      inspections,
      patches: [],
      outPath,
    };
  }

  const patches = patchQqGameFiles(targetPaths, built.bundleText, { noBackup: !!options.noBackup });
  const nextInspections = targetPaths.map((targetPath) => inspectPatchedQqGameFile(targetPath, built.meta.scriptHash));
  const failed = nextInspections.filter((item) => !item.matchesExpected);
  if (failed.length > 0) {
    throw new Error(`自动补丁写入后校验失败：${summarizeInspections(nextInspections)}`);
  }

  if (logger.info) {
    logger.info(`[qq-auto-patch] 已自动写入最新 QQ 补丁：${patches.length} 个目标，scriptHash=${built.meta.scriptHash}`);
  }

  return {
    ok: true,
    action: "patched",
    reason: null,
    meta: built.meta,
    target,
    targetPaths,
    inspections: nextInspections,
    previousInspections: inspections,
    patches,
    outPath,
  };
}

module.exports = {
  ensureLatestQqPatch,
};
