// =============================================================
// botchitter — 多言語リソース & アイコン定義
// =============================================================

const ICONS = {
  comment: `<svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
  quote: `<svg viewBox="0 0 24 24"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  share: `<svg viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`,
  trash: `<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  edit: `<svg viewBox="0 0 24 24"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
  send: `<svg viewBox="0 0 24 24"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`,
  moodAdd: `<svg viewBox="0 0 24 24"><path d="M22 11v1a10 10 0 1 1-9-10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/><path d="M16 5h6M19 2v6"/></svg>`,
  arrowLeft: `<svg viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>`,
  arrowRight: `<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`
};

const LOCALE = (navigator.language || "").toLowerCase().startsWith("ja") ? "ja" : "en";

const I18N = {
  ja: {
    placeholder_default: "今日、何を感じた？",
    placeholder_comment: "コメント",
    btn_post: "残す",
    btn_save: "保存",
    btn_cancel: "キャンセル",
    btn_delete: "削除",
    confirm_delete: "削除しますか？",
    today: "今日",
    yesterday: "昨日",
    edited: "編集済み",
    menu_archive: "振り返る",
    menu_theme: "テーマ",
    menu_backup: "バックアップ",
    btn_export: "書き出し",
    btn_import: "読み込み",
    install_hint: "ホーム画面に追加すると、記録が消えにくくなります",
    toast_copied: "コピーしました",
    toast_imported: (n) => `${n}件を読み込みました`,
    toast_import_failed: "読み込めませんでした",
    theme_to_light: "ライトモードにする",
    theme_to_dark: "ダークモードにする",
    mood_add: "気分を付ける",
    archive_all: "すべて",
    mood_low: "沈",
    mood_high: "晴",
    mood_none: "なし",
    heat_cell_title: (date, n) => `${date} ${n}件`,
    archive_recent: "直近2週間",
    archive_recent_summary: (days, n) => `${days}日・${n}件`,
    archive_past: "これまで",
    memory_year: "1年前の今日",
    memory_month: "1か月前の今日",
    count_posts: (n) => `${n}件`,
    mood_label: (m) => ["とても沈んでいる", "すこし沈んでいる", "ふつう", "すこし晴れやか", "とても晴れやか"][m - 1],
    search_placeholder: "過去の記録を検索…",
    search_empty: "該当する記録は見つかりませんでした",
    btn_clear_search: "検索を解除",
    nav_prev: "前",
    nav_next: "次",
    app_title: "ボッチッター (botchitter) — 自分にしか見えないタイムライン"
  },
  en: {
    placeholder_default: "What did you feel today?",
    placeholder_comment: "Comment",
    btn_post: "Post",
    btn_save: "Save",
    btn_cancel: "Cancel",
    btn_delete: "Delete",
    confirm_delete: "Delete?",
    today: "Today",
    yesterday: "Yesterday",
    edited: "Edited",
    menu_archive: "Look back",
    menu_theme: "Theme",
    menu_backup: "Backup",
    btn_export: "Export",
    btn_import: "Import",
    install_hint: "Add to Home Screen so your notes don't get cleared",
    toast_copied: "Copied",
    toast_imported: (n) => `Imported ${n}`,
    toast_import_failed: "Couldn't import this file",
    theme_to_light: "Switch to light mode",
    theme_to_dark: "Switch to dark mode",
    mood_add: "Add mood",
    archive_all: "All",
    mood_low: "Low",
    mood_high: "High",
    mood_none: "None",
    heat_cell_title: (date, n) => `${date}: ${n}`,
    archive_recent: "Last 2 weeks",
    archive_recent_summary: (days, n) => `${days} days · ${n} posts`,
    archive_past: "Over time",
    memory_year: "A year ago today",
    memory_month: "A month ago today",
    count_posts: (n) => `${n} posts`,
    mood_label: (m) => ["Very low", "Low", "Neutral", "Good", "Great"][m - 1],
    search_placeholder: "Search past notes...",
    search_empty: "No matching notes found",
    btn_clear_search: "Clear search",
    nav_prev: "Prev",
    nav_next: "Next",
    app_title: "botchitter — A timeline only for yourself"
  }
};

function t(key, ...args) {
  const val = I18N[LOCALE]?.[key] ?? I18N.ja[key];
  return typeof val === "function" ? val(...args) : val;
}

function applyTranslations() {
  document.documentElement.lang = LOCALE;
  document.title = t("app_title");
  if ($("composerInput")) $("composerInput").placeholder = t("placeholder_default");
  if ($("postBtn")) $("postBtn").textContent = t("btn_post");
  if ($("confirmTitle")) $("confirmTitle").textContent = t("confirm_delete");
  if ($("btnConfirmCancel")) $("btnConfirmCancel").textContent = t("btn_cancel");
  if ($("btnConfirmDelete")) $("btnConfirmDelete").textContent = t("btn_delete");
  if ($("btnArchive")) $("btnArchive").textContent = t("menu_archive");
  if ($("labelTheme")) $("labelTheme").textContent = t("menu_theme");
  if ($("labelBackup")) $("labelBackup").textContent = t("menu_backup");
  if ($("todayDateLabel")) $("todayDateLabel").title = t("menu_archive");
  if ($("btnExport")) $("btnExport").textContent = t("btn_export");
  if ($("btnImport")) $("btnImport").textContent = t("btn_import");
  if ($("installHintText")) $("installHintText").textContent = t("install_hint");
  if ($("searchInput")) $("searchInput").placeholder = t("search_placeholder");
}
