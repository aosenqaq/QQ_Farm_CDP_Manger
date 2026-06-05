// 水印：二开倒卖先别急，README 都没看明白就上链接，属实有点绷不住。
"use strict";

const QQ_RPC_HOST_METHODS = Object.freeze([
  "host.ping",
  "host.describe",
]);

const QQ_RPC_GAME_CTL_METHODS = Object.freeze([
  "getFarmOwnership",
  "getFarmStatus",
  "getFriendList",
  "enterOwnFarm",
  "enterFriendFarm",
  "triggerOneClickOperation",
  "clickMatureEffect",
  "dismissRewardPopup",
  "getRewardPopupInterceptorState",
  "setRewardPopupInterceptorEnabled",
  "inspectRewardPopupTextMatches",
  "inspectRewardPopupTarget",
  "inspectLandDetail",
  "inspectFarmModelRuntime",
  "inspectMainUiRuntime",
  "inspectFarmComponentCandidates",
  "getPlayerProfile",
  "scanSystemAccountCandidates",
  "getWarehouseItems",
  "inspectFertilizerRuntime",
  "inspectProtocolTransport",
  "inspectRecentClickTrace",
  "fertilizeLand",
  "shovelLand",
  "shovelLandsBatch",
  "getSeedList",
  "requestShopData",
  "getShopGoodsList",
  "getShopSeedList",
  "inspectShopModelRuntime",
  "inspectShopUi",
  "autoReconnectIfNeeded",
  "autoPlant",
]);

const QQ_RPC_OPTIONAL_ALLOWED_PATHS = Object.freeze([
  "gameCtl.closePlantInteractionUi",
  "gameCtl.detectActiveOverlays",
  "gameCtl.dismissActiveOverlay",
  "gameCtl.fertilizeLandsBatch",
  "gameCtl.getOtherPlaceLoginPromptState",
  "gameCtl.clickOtherPlaceLoginReconnectPrompt",
  "gameCtl.getOtherPlaceLoginReconnectState",
  "gameCtl.setOtherPlaceLoginReconnectEnabled",
]);

const QQ_RPC_ALLOWED_PATHS = Object.freeze([
  ...QQ_RPC_HOST_METHODS,
  ...QQ_RPC_GAME_CTL_METHODS.map((name) => "gameCtl." + name),
  ...QQ_RPC_OPTIONAL_ALLOWED_PATHS,
]);

module.exports = {
  QQ_RPC_ALLOWED_PATHS,
  QQ_RPC_GAME_CTL_METHODS,
  QQ_RPC_HOST_METHODS,
  QQ_RPC_OPTIONAL_ALLOWED_PATHS,
};
