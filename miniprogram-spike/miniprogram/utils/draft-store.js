const { SCHEMA_VERSION, migrateDraft } = require("../models/draft");

const MANUAL_DRAFT_KEY = "journal.spike.manualDraft.v1";
const AUTO_DRAFT_KEY = "journal.spike.autoDraft.v1";

function saveDraft(draft) {
  return writeDraft(MANUAL_DRAFT_KEY, draft);
}

function saveAutoDraft(draft) {
  return writeDraft(AUTO_DRAFT_KEY, draft);
}

function loadDraft() {
  return readDraft(MANUAL_DRAFT_KEY);
}

function loadLatestDraft() {
  return readDraft(MANUAL_DRAFT_KEY) || readDraft(AUTO_DRAFT_KEY);
}

function clearDraft() {
  wx.removeStorageSync(MANUAL_DRAFT_KEY);
  wx.removeStorageSync(AUTO_DRAFT_KEY);
}

function writeDraft(key, draft) {
  const nextDraft = {
    ...draft,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: Date.now()
  };
  wx.setStorageSync(key, nextDraft);
  return nextDraft;
}

function readDraft(key) {
  const draft = wx.getStorageSync(key);
  if (!draft || !Array.isArray(draft.layers)) {
    return null;
  }
  return migrateDraft(draft);
}

module.exports = {
  saveDraft,
  saveAutoDraft,
  loadDraft,
  loadLatestDraft,
  clearDraft
};
