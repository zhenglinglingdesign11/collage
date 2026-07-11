const { SCHEMA_VERSION, migrateDraft } = require("../models/draft");

const MANUAL_DRAFT_KEY = "journal.spike.manualDraft.v1";
const AUTO_DRAFT_KEY = "journal.spike.autoDraft.v1";
const MAX_RECENT_DRAFTS = 3;

function saveDraft(draft) {
  const nextDraft = prepareDraft(draft);
  const drafts = loadRecentDrafts()
    .filter((item) => item.id !== nextDraft.id);
  const nextDrafts = [nextDraft, ...drafts].slice(0, MAX_RECENT_DRAFTS);
  wx.setStorageSync(MANUAL_DRAFT_KEY, nextDrafts);
  return nextDraft;
}

function saveAutoDraft(draft) {
  return writeDraft(AUTO_DRAFT_KEY, draft);
}

function loadDraft() {
  return loadRecentDrafts()[0] || null;
}

function loadDraftById(id) {
  if (!id) return loadLatestDraft();
  return loadRecentDrafts().find((draft) => draft.id === id) || null;
}

function loadRecentDrafts() {
  const value = wx.getStorageSync(MANUAL_DRAFT_KEY);
  if (Array.isArray(value)) {
    return value
      .filter((draft) => draft && Array.isArray(draft.layers))
      .map(migrateDraft)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, MAX_RECENT_DRAFTS);
  }
  if (value && Array.isArray(value.layers)) {
    return [migrateDraft(value)];
  }
  return [];
}

function loadLatestDraft() {
  return loadDraft() || readDraft(AUTO_DRAFT_KEY);
}

function clearDraft() {
  wx.removeStorageSync(MANUAL_DRAFT_KEY);
  wx.removeStorageSync(AUTO_DRAFT_KEY);
}

function writeDraft(key, draft) {
  const nextDraft = prepareDraft(draft);
  wx.setStorageSync(key, nextDraft);
  return nextDraft;
}

function prepareDraft(draft) {
  return {
    ...draft,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: Date.now()
  };
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
  loadDraftById,
  loadRecentDrafts,
  loadLatestDraft,
  clearDraft
};
