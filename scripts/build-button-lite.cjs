#!/usr/bin/env node
// 水印：二开倒卖先别急，README 都没看明白就上链接，属实有点绷不住。
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const projectRoot = path.join(__dirname, "..");
const inputPath = path.join(projectRoot, "button.js");
const outputPath = path.join(projectRoot, "button-lite.js");

function findFunctionRange(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("\\r?\\n  (async\\s+)?function\\s+" + escaped + "\\s*\\(");
  const match = re.exec(source);
  if (!match) throw new Error(`function not found: ${name}`);

  const start = match.index + (source[match.index] === "\r" ? 2 : 1);
  const brace = source.indexOf("{", start);
  if (brace < 0) throw new Error(`function body not found: ${name}`);

  let depth = 0;
  let quote = null;
  let escapedChar = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escapedChar) {
        escapedChar = false;
        continue;
      }
      if (ch === "\\") {
        escapedChar = true;
        continue;
      }
      if (quote === "`" && ch === "$" && next === "{") {
        depth += 1;
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === "/" && next === "/") {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return [start, i + 1];
    }
  }

  throw new Error(`function body end not found: ${name}`);
}

function replaceFunction(source, name, replacement) {
  const [start, end] = findFunctionRange(source, name);
  return source.slice(0, start) + replacement + source.slice(end);
}

function makeDisabledFunction(name, isAsync = false) {
  return `  ${isAsync ? "async " : ""}function ${name}(opts) {\n    return liteDisabled('${name}', opts);\n  }`;
}

function insertLiteDisabledHelper(source) {
  if (source.includes("function liteDisabled(")) return source;
  const [, end] = findFunctionRange(source, "out");
  const helper = [
    "",
    "",
    "  function liteDisabled(action, opts) {",
    "    const payload = { action: action, disabled: true, reason: 'lite_bundle' };",
    "    return opts && opts.silent ? payload : out(payload);",
    "  }",
  ].join("\n");
  return source.slice(0, end) + helper + source.slice(end);
}

function shrinkReadyApiList(source) {
  const start = source.indexOf("    api: [");
  if (start < 0) return source;
  const arrayStart = source.indexOf("[", start);
  if (arrayStart < 0) return source;

  let depth = 0;
  let quote = null;
  let escapedChar = false;
  let arrayEnd = -1;
  for (let i = arrayStart; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escapedChar) {
        escapedChar = false;
        continue;
      }
      if (ch === "\\") {
        escapedChar = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "[") depth += 1;
    if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        arrayEnd = i + 1;
        break;
      }
    }
  }
  if (arrayEnd < 0) return source;

  const api = [
    "    api: [",
    "      'gameCtl.getFarmStatus()',",
    "      'gameCtl.triggerOneClickOperation(typeOrIndex, opts)',",
    "      'gameCtl.enterOwnFarm(opts)',",
    "      'gameCtl.enterFriendFarm(target, opts)',",
    "      'gameCtl.getFriendList(opts)',",
    "      'gameCtl.autoPlant(opts)',",
    "      'gameCtl.fertilizeLand(opts)',",
    "      'gameCtl.shovelLand(opts)',",
    "      'gameCtl.shovelLandsBatch(opts)',",
    "      'gameCtl.refreshWarehouseSnapshot(opts)',",
    "      'gameCtl.sellWarehouseItems(opts)',",
    "      'gameCtl.autoReconnectIfNeeded(opts)'",
    "    ]",
  ].join("\n");
  return source.slice(0, start) + api + source.slice(arrayEnd);
}

function buildLiteSource(source) {
  let next = insertLiteDisabledHelper(source);

  const syncDisabled = [
    "dumpButtons",
    "inspectFarmModelRuntime",
    "inspectMainUiRuntime",
    "inspectFarmComponentCandidates",
    "getPlayerProfileDebug",
    "scanAccountRuntimeDebug",
    "scanSystemAccountCandidates",
    "ensureInteractionManagerSpyRetry",
    "installInteractionManagerSpies",
    "getRuntimeSpySnapshot",
    "startRuntimeSpies",
    "resetRuntimeSpyEvents",
    "installRuntimeSendSpies",
    "installRuntimeSpies",
    "inspectWarehouseProtocolCandidates",
    "inspectWarehouseControllerRuntime",
    "inspectWarehouseDataSource",
    "inspectMessageBusListeners",
    "inspectProtocolTransport",
    "inspectRecentClickTrace",
    "inspectRewardPopupTextMatches",
    "inspectRewardPopupTarget",
    "inspectOneClickToolNodes",
    "farmNodes",
    "guessFarmCandidates",
    "dumpFarmNodes",
    "dumpFarmCandidates",
    "snapshotNode",
    "diffSnapshots",
  ];
  for (const name of syncDisabled) {
    next = replaceFunction(next, name, makeDisabledFunction(name));
  }

  const asyncDisabled = [
    "captureWarehouseProtocol",
    "inspectShopUi",
    "inspectShopModelRuntime",
    "openLandAndDiffButtons",
    "inspectLandDetail",
    "inspectFertilizerRuntime",
    "tapAndSnapshot",
    "batchTap",
    "tapFarmCandidates",
  ];
  for (const name of asyncDisabled) {
    next = replaceFunction(next, name, makeDisabledFunction(name, true));
  }

  const profileLite = [
    "  function getPlayerProfile(opts) {",
    "    opts = opts || {};",
    "    const m = safeCall(function () { return getFarmModel(opts); }, null);",
    "    const u = m && (safeReadKey(m, 'curUserModel') || safeReadKey(m, 'userModel') || safeReadKey(m, 'selfModel'));",
    "    function p(a) { for (let i = 0; i < a.length; i += 1) { const v = u ? safeReadKey(u, a[i]) : null; if (v != null && v !== '') return v; } return null; }",
    "    const profile = { gid: getSelfGid(), playerId: p(['playerId', 'player_id', 'roleId', 'uid']), name: p(['name', 'limitName', 'nick', 'nickname', 'role_name']), level: p(['level', 'lv', 'grade', 'role_level']), plantLevel: p(['plantLevel', 'maxPlantLevel', 'farmMaxLandLevel', 'maxLandLevel']), exp: p(['exp', 'curExp', 'currentExp']), nextLevelExp: p(['nextLevelExp', 'maxExp', 'next_exp', 'needExp', 'targetExp']), gold: p(['gold', 'coin', 'coins', 'money']), coupon: p(['coupon', 'couponNum', 'coupons', 'ticket']), diamond: p(['diamond', 'diamonds', 'gem']), bean: p(['bean', 'beans', 'goldBean']), source: 'lite_runtime' };",
    "    return opts.silent ? profile : out(profile);",
    "  }",
  ].join("\n");
  next = replaceFunction(next, "getPlayerProfile", profileLite);

  const hidePopupLite = [
    "  async function hideGetRewardsPopup(opts) {",
    "    opts = opts || {};",
    "    const silent = !!opts.silent;",
    "    const waitAfter = Math.max(0, Number(opts.waitAfter) || 0);",
    "    const names = getRewardPopupTargetNames(opts);",
    "    const roots = ['startup/root/ui/LayerDialog/view_get_rewards', 'root/ui/LayerDialog/view_get_rewards'].map(function (path) { return safeCall(function () { return findNode(path); }, null); }).filter(Boolean);",
    "    walk(scene()).forEach(function (node) {",
    "      if (roots.indexOf(node) >= 0 || !node || !node.activeInHierarchy || typeof node.getComponent !== 'function') return;",
    "      if (!/等级提升|解锁新内容|level\\s*up/i.test(getNodeTextList(node, { maxDepth: 2 }).join(' '))) return;",
    "      for (let cur = node, depth = 0; cur && depth < 8; cur = cur.parent, depth += 1) {",
    "        const name = String(cur.name || '').trim().toLowerCase();",
    "        if (names.indexOf(name) >= 0) { roots.push(cur); break; }",
    "        const parentPath = cur.parent ? String(fullPath(cur.parent) || '').toLowerCase() : '';",
    "        if (parentPath.endsWith('/ui/layerdialog') || parentPath.endsWith('/ui/layerpopup')) { roots.push(cur); break; }",
    "      }",
    "    });",
    "    if (roots.length <= 0) {",
    "      const miss = { ok: false, hidden: false, count: 0, hiddenCount: 0, reason: 'reward_or_upgrade_popup_not_found' };",
    "      return silent ? miss : out(miss);",
    "    }",
    "    let hiddenCount = 0;",
    "    for (let i = 0; i < roots.length; i += 1) {",
    "      const rootNode = roots[i];",
    "      const controller = findRewardPopupController(rootNode);",
    "      const steps = [];",
    "      const invokedClose = tryInvokeRewardPopupClose(controller, rootNode, waitAfter, steps);",
    "      if (invokedClose && waitAfter > 0) await wait(waitAfter);",
    "      const nodeChanged = forceHideRewardPopupNodes([rootNode], steps);",
    "      const backdropChanged = forceHideRewardPopupNodes(collectRewardPopupBackdropNodes(rootNode, controller, steps), steps);",
    "      if (nodeChanged || backdropChanged || !rootNode.activeInHierarchy || rootNode.active === false) hiddenCount += 1;",
    "    }",
    "    const payload = { ok: hiddenCount > 0, hidden: hiddenCount > 0, count: roots.length, hiddenCount: hiddenCount, targetViewNames: names };",
    "    return silent ? payload : out(payload);",
    "  }",
  ].join("\n");
  next = replaceFunction(next, "hideGetRewardsPopup", hidePopupLite, true);

  const shovelLandLite = [
    "  async function shovelLand(opts) {",
    "    opts = opts || {};",
    "    const targetNode = opts.landId != null ? findGridNodeByLandId(opts.landId, opts.root || opts.path) : toNode(opts.path);",
    "    if (!targetNode) throw new Error('Target land not found');",
    "    const waitAfterOpen = Math.max(100, Number(opts.waitAfterOpen) || 350);",
    "    const waitAfterAction = Math.max(100, Number(opts.waitAfterAction) || 700);",
    "    const dryRun = opts.dryRun !== false;",
    "    let manager = null;",
    "    const payload = { ok: false, action: dryRun ? 'dry_run' : 'shovel', landId: null, before: null, after: null, reason: null, executionAttempts: [] };",
    "    try {",
    "      const ownership = getFarmOwnership({ silent: true, allowWeakUi: true });",
    "      if (ownership && ownership.farmType && ownership.farmType !== 'own') throw new Error('shovel only supported in own farm');",
    "      const before = getGridState(targetNode, { silent: true, farmType: 'own' });",
    "      payload.landId = before.landId;",
    "      payload.before = { landId: before.landId, stageKind: before.stageKind, hasPlant: before.hasPlant, plantName: before.plantName, plantId: before.plantId };",
    "      if (before.hasPlant !== true) { payload.ok = true; payload.action = 'skipped'; payload.reason = 'land_has_no_plant'; return opts.silent ? payload : out(payload); }",
    "      const open = await openLandInteractionAndFindManager(targetNode, { waitAfterOpen: waitAfterOpen, maxWaitMs: Math.max(900, waitAfterOpen + 450) });",
    "      payload.openInteractionAttempts = open.attempts;",
    "      manager = open.manager;",
    "      if (!manager) throw new Error('plant interaction manager not found');",
    "      try {",
    "        payload.detailPrepare = await inspectLandDetail({ silent: true, landId: before.landId, waitAfter: waitAfterOpen });",
    "      } catch (err) {",
    "        payload.detailPrepareError = err && err.message ? err.message : String(err || 'inspectLandDetail failed');",
    "      }",
    "      const summarizeButton = function (node, source) { return node ? { path: safeCall(function () { return fullPath(node); }, null), texts: getNodeTextList(node, { maxDepth: 2 }).slice(0, 8), rect: safeCall(function () { return getNodeScreenRect(node); }, null), source: source || null } : null; };",
    "      const findDetailErase = function () {",
    "        const direct = findNode('startup/root/ui/LayerUI/plant_interactive_v2/land_detail/erase') || findNode('root/ui/LayerUI/plant_interactive_v2/land_detail/erase');",
    "        if (direct && direct.activeInHierarchy && direct.getComponent && direct.getComponent(cc.Button)) return { node: direct, source: 'direct_path' };",
    "        const nodes = walk(scene()).filter(function (node) {",
    "          if (!node || !node.activeInHierarchy || !node.getComponent || !node.getComponent(cc.Button)) return false;",
    "          const path = safeCall(function () { return fullPath(node); }, '') || '';",
    "          return String(node.name || '').toLowerCase() === 'erase' || /plant_interactive_v2\\/land_detail\\/erase$/i.test(path);",
    "        });",
    "        if (!nodes.length) return null;",
    "        nodes.sort(function (a, b) {",
    "          const pa = safeCall(function () { return fullPath(a); }, '') || '';",
    "          const pb = safeCall(function () { return fullPath(b); }, '') || '';",
    "          return (/plant_interactive_v2\\/land_detail\\/erase$/i.test(pa) ? 0 : 1) - (/plant_interactive_v2\\/land_detail\\/erase$/i.test(pb) ? 0 : 1);",
    "        });",
    "        return { node: nodes[0], source: 'scan' };",
    "      };",
    "      const emitButtonSequence = async function (node, hold) {",
    "        hold = Math.max(20, Number(hold) || 80);",
    "        const btn = node && node.getComponent ? node.getComponent(cc.Button) : null;",
    "        if (!btn || (typeof btn._onTouchBegan !== 'function' && typeof btn._onTouchEnded !== 'function')) { const r = emitNodeTouch(node, hold); await wait(hold + 20); return r; }",
    "        const p = nodeToClient(node);",
    "        const makeEvent = function (type) { return { type: type, target: node, currentTarget: node, getLocation: function () { return { x: p.x, y: p.y }; }, getUILocation: function () { return { x: p.x, y: p.y }; }, stopPropagation: function () {}, preventDefault: function () {} }; };",
    "        if (typeof btn._onTouchBegan === 'function') { safeCall(function () { return btn._onTouchBegan(makeEvent('touchstart')); }, null); await wait(hold); }",
    "        if (typeof btn._onTouchEnded === 'function') safeCall(function () { return btn._onTouchEnded(makeEvent('touchend')); }, null);",
    "        await wait(20);",
    "        return { action: 'emitButtonSequence', path: safeCall(function () { return fullPath(node); }, null), hold: hold };",
    "      };",
    "      const findConfirm = function () {",
    "        const direct = findNode('startup/root/ui/LayerDialog/confirm/btn_ok') || findNode('root/ui/LayerDialog/confirm/btn_ok');",
    "        if (direct && direct.activeInHierarchy && direct.getComponent && direct.getComponent(cc.Button)) {",
    "          return { node: direct, texts: getNodeTextList(direct, { maxDepth: 2 }).slice(0, 8), rect: safeCall(function () { return getNodeScreenRect(direct); }, null), source: 'direct_path' };",
    "        }",
    "        const keywords = /^(确定|确认|铲除|移除|拔除|是|好)$/;",
    "        const nodes = walk(scene()).filter(function (node) { return !!(node && node.activeInHierarchy && node.getComponent && node.getComponent(cc.Button)); });",
    "        const scored = [];",
    "        for (let i = 0; i < nodes.length; i += 1) {",
    "          const texts = getNodeTextList(nodes[i], { maxDepth: 2 }).slice(0, 8);",
    "          const joined = texts.join(' ').trim();",
    "          if (joined && keywords.test(joined)) scored.push({ node: nodes[i], texts: texts, rect: safeCall(function () { return getNodeScreenRect(nodes[i]); }, null) });",
    "        }",
    "        scored.sort(function (a, b) {",
    "          const areaA = a.rect ? (Number(a.rect.width) || 0) * (Number(a.rect.height) || 0) : 999999;",
    "          const areaB = b.rect ? (Number(b.rect.width) || 0) * (Number(b.rect.height) || 0) : 999999;",
    "          return areaA - areaB;",
    "        });",
    "        return scored.length ? scored[0] : null;",
    "      };",
    "      const tapConfirm = async function (waitAfter) {",
    "        const target = findConfirm();",
    "        if (!target) return { clicked: false, reason: 'confirm_button_not_found' };",
    "        let result = null, error = null;",
    "        try { result = await emitButtonSequence(target.node, 80); } catch (err) { error = err && err.message ? err.message : String(err || 'confirm tap failed'); }",
    "        if (waitAfter > 0) await wait(waitAfter);",
    "        return { clicked: !error, error: error, result: result, target: { path: safeCall(function () { return fullPath(target.node); }, null), texts: target.texts, rect: target.rect } };",
    "      };",
    "      const waitForDetailErase = async function () {",
    "        const maxWaitMs = Math.max(300, Math.min(2000, waitAfterOpen + 800));",
    "        const startedAt = Date.now();",
    "        let lastOpenAt = 0;",
    "        let last = null;",
    "        do {",
    "          last = findDetailErase();",
    "          if (last && last.node) return last;",
    "          if (Date.now() - lastOpenAt >= 260) {",
    "            lastOpenAt = Date.now();",
    "            safeCall(function () { return openLandInteraction(targetNode); }, null);",
    "          }",
    "          await wait(120);",
    "        } while (Date.now() - startedAt < maxWaitMs);",
    "        return last;",
    "      };",
    "      const detailErase = await waitForDetailErase();",
    "      payload.detailEraseButton = detailErase ? summarizeButton(detailErase.node, detailErase.source) : null;",
    "      if (dryRun) { payload.ok = true; payload.wouldCall = 'openLandInteraction(targetLand) -> tap land_detail/erase -> confirm shovel dialog'; return opts.silent ? payload : out(payload); }",
    "      if (detailErase && detailErase.node) {",
    "        const attempt = { label: 'tap_land_detail_erase_button', result: null, error: null };",
    "        try { attempt.result = await emitButtonSequence(detailErase.node, 80); } catch (err) { attempt.error = err && err.message ? err.message : String(err || 'tap detail erase failed'); }",
    "        payload.executionAttempts.push(attempt);",
    "        await wait(Math.min(260, waitAfterAction));",
    "        payload.confirmAfterDetailErase = await tapConfirm(waitAfterAction);",
    "        const afterDetail = getGridState(targetNode, { silent: true, farmType: 'own' });",
    "        payload.after = { landId: afterDetail.landId, stageKind: afterDetail.stageKind, hasPlant: afterDetail.hasPlant, plantName: afterDetail.plantName, plantId: afterDetail.plantId };",
    "        if (before.hasPlant === true && afterDetail.hasPlant === false) { payload.ok = true; payload.action = 'shoveled'; payload.executionSource = 'land_detail_erase_button_confirm'; return opts.silent ? payload : out(payload); }",
    "      }",
    "      const itemM = getItemManager();",
    "      const shovelItem = safeCall(function () { return itemM.getItemById(10002); }, null) || safeCall(function () { return itemM.getitembyid(10002); }, null) || safeCall(function () { return itemM.getTempItemModel(10002); }, null) || { id: 10002, itemId: 10002, count: 1, isSelected: true, _tempData: { id: 10002, name: '铲除', interaction_type: 'erase' } };",
    "      const toolNode = getToolNodeByItemId(manager, 10002);",
    "      payload.shovelItem = summarizeInventoryEntry(shovelItem);",
    "      payload.toolNode = summarizeNodeForClick(toolNode);",
    "      safeCall(function () {",
    "        manager.currentData = [shovelItem];",
    "        manager.currentDragType = 'erase';",
    "        if (Object.prototype.hasOwnProperty.call(manager, 'currentDetailType')) manager.currentDetailType = null;",
    "        const host = toolNode || safeReadKey(manager, 'currentDragItem') || safeReadKey(manager, 'toolInteractionNode') || {};",
    "        host.ItemModel = shovelItem;",
    "        if (!safeReadKey(host, 'itemModel')) host.itemModel = shovelItem;",
    "        host.dragType = 'erase';",
    "        manager.currentDragItem = host;",
    "        return true;",
    "      }, null);",
    "      if (toolNode) {",
    "        const selected = invokeManagerToolTouch(manager, toolNode);",
    "        if (!selected) emitNodeTouch(toolNode);",
    "        payload.executionAttempts.push({ label: 'select_shovel_tool_node', result: true, error: null });",
    "        await wait(100);",
    "      }",
    "      if (typeof manager.selectAppropriateInteractionNode === 'function') safeCall(function () { return manager.selectAppropriateInteractionNode(); }, null);",
    "      const methods = ['performErasing', 'performErase', 'performRemovePlant', 'attemptPerform'];",
    "      for (let i = 0; i < methods.length; i += 1) {",
    "        const method = methods[i];",
    "        if (typeof manager[method] !== 'function') continue;",
    "        let error = null;",
    "        let result = null;",
    "        try { result = summarizeSpyValue(manager[method](before.landId != null ? before.landId : targetNode), 1); } catch (err) { error = err && err.message ? err.message : String(err || method + ' failed'); }",
    "        payload.executionAttempts.push({ label: method + '(target)', result: result, error: error });",
    "        await wait(waitAfterAction);",
    "        const afterTry = getGridState(targetNode, { silent: true, farmType: 'own' });",
    "        payload.after = { landId: afterTry.landId, stageKind: afterTry.stageKind, hasPlant: afterTry.hasPlant, plantName: afterTry.plantName, plantId: afterTry.plantId };",
    "        if (before.hasPlant === true && afterTry.hasPlant === false) { payload.ok = true; payload.action = 'shoveled'; payload.executionSource = method; return opts.silent ? payload : out(payload); }",
    "        payload.confirmAfterMethod = await tapConfirm(Math.min(300, waitAfterAction));",
    "        const afterConfirm = getGridState(targetNode, { silent: true, farmType: 'own' });",
    "        payload.after = { landId: afterConfirm.landId, stageKind: afterConfirm.stageKind, hasPlant: afterConfirm.hasPlant, plantName: afterConfirm.plantName, plantId: afterConfirm.plantId };",
    "        if (before.hasPlant === true && afterConfirm.hasPlant === false) { payload.ok = true; payload.action = 'shoveled'; payload.executionSource = method + '_confirm'; return opts.silent ? payload : out(payload); }",
    "      }",
    "      const interaction = invokeManagerAttemptLandInteraction(manager, targetNode);",
    "      payload.landInteraction = interaction;",
    "      payload.executionAttempts.push({ label: 'attemptLandInteraction(after_shovel_tool)', result: summarizeSpyValue(interaction, 2), error: interaction && (interaction.error || interaction.reason) || null });",
    "      await wait(waitAfterAction);",
    "      let after = getGridState(targetNode, { silent: true, farmType: 'own' });",
    "      payload.after = { landId: after.landId, stageKind: after.stageKind, hasPlant: after.hasPlant, plantName: after.plantName, plantId: after.plantId };",
    "      if (!(before.hasPlant === true && after.hasPlant === false)) {",
    "        payload.confirmAfterLandInteraction = await tapConfirm(Math.min(300, waitAfterAction));",
    "        after = getGridState(targetNode, { silent: true, farmType: 'own' });",
    "        payload.after = { landId: after.landId, stageKind: after.stageKind, hasPlant: after.hasPlant, plantName: after.plantName, plantId: after.plantId };",
    "      }",
    "      payload.ok = before.hasPlant === true && after.hasPlant === false;",
    "      payload.action = payload.ok ? 'shoveled' : 'shovel_failed';",
    "      payload.executionSource = payload.ok ? 'attempt_land_interaction' : null;",
    "      if (!payload.ok) payload.reason = 'shovel_no_observed_effect';",
    "      return opts.silent ? payload : out(payload);",
    "    } finally {",
    "      if (opts.cleanupUi !== false) {",
    "        try { await closePlantInteractionUi(manager || findPlantInteractionManager(), { waitAfterEach: Math.min(120, Math.max(60, Math.floor(waitAfterAction / 4) || 0)), maxCommonCloseAttempts: 2 }); } catch (_) {}",
    "      }",
    "    }",
    "  }",
  ].join("\n");
  next = replaceFunction(next, "shovelLand", shovelLandLite);

  const shovelLandsBatchLite = [
    "  async function shovelLandsBatch(opts) {",
    "    opts = opts || {};",
    "    const ids = normalizeLandIds(Array.isArray(opts.landIds) ? opts.landIds : (Array.isArray(opts.landIdList) ? opts.landIdList : (opts.landId != null ? [opts.landId] : [])));",
    "    if (!ids.length) throw new Error('landIds required');",
    "    const dryRun = opts.dryRun !== false;",
    "    const waitAfterAction = Math.max(100, Number(opts.waitAfterAction) || 900);",
    "    const between = Math.max(0, Number(opts.betweenLandWait) || 0);",
    "    const ownership = getFarmOwnership({ silent: true, allowWeakUi: true });",
    "    if (ownership && ownership.farmType && ownership.farmType !== 'own') throw new Error('shovel only supported in own farm');",
    "    const entries = ids.map(function (id, index) {",
    "      const node = findGridNodeByLandId(id);",
    "      const before = node ? getGridState(node, { silent: true, farmType: 'own' }) : null;",
    "      let reason = null;",
    "      if (!node) reason = 'land_not_found';",
    "      else if (!before || before.hasPlant !== true) reason = 'land_has_no_plant';",
    "      else if (before.occupiedByMultiTilePlant && Number(before.occupancyAnchorLandId) > 0 && Number(before.occupancyAnchorLandId) !== Number(before.landId)) reason = 'multi_tile_non_anchor';",
    "      return { index: index, landId: id, node: node, before: before, skipReason: reason };",
    "    });",
    "    const runnable = entries.filter(function (entry) { return !entry.skipReason; });",
    "    const payload = { ok: false, action: dryRun ? 'dry_run' : 'shovel_batch', landIds: ids, results: [] };",
    "    function state(s) { return s ? { landId: s.landId, stageKind: s.stageKind, hasPlant: s.hasPlant } : null; }",
    "    if (dryRun) {",
    "      payload.ok = true;",
    "      payload.results = entries.map(function (entry) { return { index: entry.index, landId: entry.landId, ok: !entry.skipReason, action: entry.skipReason ? 'skipped' : 'dry_run', reason: entry.skipReason, before: state(entry.before), after: null, error: null }; });",
    "      payload.processedCount = runnable.length; payload.successCount = runnable.length; payload.skippedCount = entries.length - runnable.length; payload.failureCount = 0;",
    "      return opts.silent ? payload : out(payload);",
    "    }",
    "    const message = getOopsMessage();",
    "    if (!message || typeof message.dispatchEvent !== 'function') throw new Error('message dispatch not found');",
    "    let dispatchError = null;",
    "    for (let i = 0; i < runnable.length; i += 1) {",
    "      const entry = runnable[i];",
    "      if (i > 0 && between > 0) await wait(between);",
    "      try { message.dispatchEvent('REQUEST_ERASE_PLANT', { land_id: entry.landId }); }",
    "      catch (err) { dispatchError = err && err.message ? err.message : String(err || 'erase dispatch failed'); break; }",
    "    }",
    "    await wait(waitAfterAction);",
    "    payload.results = entries.map(function (entry) {",
    "      if (entry.skipReason) return { index: entry.index, landId: entry.landId, ok: true, action: 'skipped', reason: entry.skipReason, before: state(entry.before), after: state(entry.before), error: null };",
    "      const after = entry.node ? getGridState(entry.node, { silent: true, farmType: 'own' }) : null;",
    "      const observed = entry.before && entry.before.hasPlant === true && after && after.hasPlant === false;",
    "      return { index: entry.index, landId: entry.landId, ok: !dispatchError && observed, action: observed ? 'shoveled' : 'shovel_batch', reason: dispatchError ? null : (observed ? null : 'shovel_no_observed_effect'), before: state(entry.before), after: state(after), error: dispatchError };",
    "    });",
    "    payload.processedCount = runnable.length;",
    "    payload.successCount = payload.results.filter(function (item) { return item && item.action === 'shoveled' && item.ok === true; }).length;",
    "    payload.skippedCount = payload.results.filter(function (item) { return item && item.action === 'skipped'; }).length;",
    "    payload.failureCount = payload.results.filter(function (item) { return item && item.action !== 'skipped' && item.ok !== true; }).length;",
    "    payload.reason = dispatchError || null; payload.ok = payload.failureCount === 0 && !dispatchError;",
    "    return opts.silent ? payload : out(payload);",
    "  }",
  ].join("\n");
  next = replaceFunction(next, "shovelLandsBatch", shovelLandsBatchLite, true);

  return shrinkReadyApiList(next);
}

function run() {
  const source = fs.readFileSync(inputPath, "utf8");
  const liteSource = buildLiteSource(source);
  const tempPath = path.join(os.tmpdir(), `button-lite-${process.pid}.js`);
  fs.writeFileSync(tempPath, liteSource, "utf8");
  try {
    const args = ["--yes", "terser", tempPath, "-c", "passes=3,toplevel=true", "-m", "toplevel=true", "-o", outputPath];
    if (process.platform === "win32") {
      execFileSync("cmd.exe", ["/d", "/c", "npx", ...args], { cwd: projectRoot, stdio: "inherit" });
    } else {
      execFileSync("npx", args, { cwd: projectRoot, stdio: "inherit" });
    }
  } finally {
    try {
      fs.unlinkSync(tempPath);
    } catch (_) {}
  }

  const bytes = fs.statSync(outputPath).size;
  if (bytes > 210_000) {
    throw new Error(`button-lite.js is ${bytes} bytes, expected <= 210000 bytes`);
  }
  console.log(`[button-lite] generated ${path.relative(projectRoot, outputPath)} (${bytes} bytes)`);
}

run();
