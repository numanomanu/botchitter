// =============================================================
// botchitter — 一人Twitter (app.js)
// コア状態管理・ルーティング・共通UI・起動
//
// データ構造（tweets 配列の1要素）：
//   id:             "tw-" + タイムスタンプ
//   createdAt:      ミリ秒数値
//   editedAt:       ミリ秒数値 | null
//   text:           本文文字列
//   history:        [{ text, createdAt }, ...]（編集前の版）
//   link:           { url, title, siteName, image } | null
//   mood:           1〜5 | null（1:とても沈んでいる 〜 5:とても晴れやか）
//   targetQuoteId:  引用元の tweetId | null
//   quoted:         { createdAt, text } | null（引用元が消えても残るようテキストを複製）
//   replies:        [{ id: "rep-" + タイムスタンプ, createdAt, editedAt, text, history, link }, ...]
// =============================================================

// -------------------------------------------------------------
// 状態
// -------------------------------------------------------------
let tweets = [];
let currentQuoteTarget = null; // { id, createdAt, text }
let activeReplyBoxId = null;
let editingTarget = null; // { tweetId, replyId, text, mood }
let tagFilter = null; // タイムラインを絞り込み中のタグ
let monthFilter = null; // タイムラインを絞り込み中の月 YYYY-MM
let searchFilter = null; // タイムラインを絞り込み中の検索語
let isSearchOpen = false;
let composerMood = null; // 入力欄で選んでいる気分（1〜5 / null）
let pendingScroll = null; // 草から月を開いた直後のスクロール先: "top" か押した日 YYYY-MM-DD
let autoTag = null; // { prefix, original }
let confirmCallback = null;
let renderedDayKey = "";
let timelineScrollY = 0;

// -------------------------------------------------------------
// DOM要素
// -------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const composerInput = $("composerInput");
const postBtn = $("postBtn");
const quotePreview = $("quotePreview");
const quotePreviewDate = $("quotePreviewDate");
const quotePreviewText = $("quotePreviewText");
const timelineStream = $("timelineStream");
const detailContent = $("detailContent");
const viewTimeline = $("viewTimeline");
const viewDetail = $("viewDetail");
const btnBack = $("btnBack");
const btnSearch = $("btnSearch");
const searchBar = $("searchBar");
const searchInput = $("searchInput");
const btnClearSearch = $("btnClearSearch");
const confirmOverlay = $("confirmOverlay");
const menuOverlay = $("menuOverlay");
const installHint = $("installHint");
const filterBar = $("filterBar");
const viewArchive = $("viewArchive");
const archiveContent = $("archiveContent");
const tagList = $("tagList");
const btnRandom = $("btnRandom");

// -------------------------------------------------------------
// データ参照ヘルパー
// -------------------------------------------------------------
const findTweet = (id) => tweets.find((tw) => tw.id === id);

function findItem(tweetId, replyId) {
  const tweet = findTweet(tweetId);
  return replyId ? tweet?.replies.find((rep) => rep.id === replyId) : tweet;
}

// -------------------------------------------------------------
// 日付表示
// -------------------------------------------------------------
const DATE_LOCALE = LOCALE === "ja" ? "ja-JP" : "en-US";
const headerDateFormat = new Intl.DateTimeFormat(DATE_LOCALE, { month: "short", day: "numeric", weekday: "short" });
const monthDayFormat = new Intl.DateTimeFormat(DATE_LOCALE, { month: "short", day: "numeric" });
const fullDateFormat = new Intl.DateTimeFormat(DATE_LOCALE, { year: "numeric", month: "short", day: "numeric" });
const monthLabelFormat = new Intl.DateTimeFormat(DATE_LOCALE, { month: "short" });
const weekdayFormat = new Intl.DateTimeFormat(DATE_LOCALE, { weekday: "narrow" });
const yearMonthFormat = new Intl.DateTimeFormat(DATE_LOCALE, { year: "numeric", month: "long" });

const pad2 = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

function formatMonth(key) {
  const [year, month] = key.split("-").map(Number);
  return yearMonthFormat.format(new Date(year, month - 1, 1));
}

// 今日「20:30」/ 昨日「昨日 20:30」/ 今年「9月28日 20:30」/ それ以前「2025年9月28日」
function formatTimestamp(ts, full = false) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (full) return `${fullDateFormat.format(d)} ${time}`;
  if (dayKey(d) === dayKey(now)) return time;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(d) === dayKey(yesterday)) return `${t("yesterday")} ${time}`;
  if (d.getFullYear() === now.getFullYear()) return `${monthDayFormat.format(d)} ${time}`;
  return fullDateFormat.format(d);
}

// タイムラインの日付区切りヘッダー用フォーマット
function formatDateDivider(date) {
  const now = new Date();
  const targetDay = dayKey(date);
  const todayDay = dayKey(now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayDay = dayKey(yesterday);

  if (targetDay === todayDay) {
    return t("today");
  }
  if (targetDay === yesterdayDay) {
    return t("yesterday");
  }
  if (date.getFullYear() === now.getFullYear()) {
    return headerDateFormat.format(date);
  }
  return fullDateFormat.format(date);
}

function renderTodayDate() {
  $("todayDateLabel").textContent = headerDateFormat.format(new Date());
}

// -------------------------------------------------------------
// HTMLエスケープ
// -------------------------------------------------------------
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// -------------------------------------------------------------
// テーマ
// -------------------------------------------------------------
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function currentTheme() {
  return document.documentElement.dataset.theme || (darkQuery.matches ? "dark" : "light");
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) document.documentElement.dataset.theme = saved;
  updateThemeMenuItem();
  darkQuery.addEventListener("change", updateThemeMenuItem);
}

function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  updateThemeMenuItem();
  closeMenu();
}

function updateThemeMenuItem() {
  $("btnTheme").textContent = t(currentTheme() === "dark" ? "theme_to_light" : "theme_to_dark");
}

// -------------------------------------------------------------
// メニュー
// -------------------------------------------------------------
function openMenu() {
  renderTagList();
  menuOverlay.classList.add("open");
}

function closeMenu() {
  menuOverlay.classList.remove("open");
}

// -------------------------------------------------------------
// PWAインストール案内
// -------------------------------------------------------------
function initInstallHint() {
  if (navigator.standalone === false && !localStorage.getItem(INSTALL_HINT_KEY)) {
    installHint.classList.add("show");
  }
}

function dismissInstallHint() {
  installHint.classList.remove("show");
  localStorage.setItem(INSTALL_HINT_KEY, "1");
}

// -------------------------------------------------------------
// 削除確認モーダル
// -------------------------------------------------------------
function askConfirmation(onConfirm) {
  confirmCallback = onConfirm;
  confirmOverlay.classList.add("open");
}

function closeConfirm() {
  confirmOverlay.classList.remove("open");
  confirmCallback = null;
}

function runConfirm() {
  const callback = confirmCallback;
  closeConfirm();
  callback?.();
}

// -------------------------------------------------------------
// トースト & 共有
// -------------------------------------------------------------
let toastTimer = null;
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

async function shareItem(tweetId, replyId) {
  const item = findItem(tweetId, replyId);
  if (!item) return;
  const text = item.quoted ? `${item.text}\n\n> ${item.quoted.text}` : item.text;

  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast(t("toast_copied"));
    return;
  } catch (err) {}
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

// -------------------------------------------------------------
// ルーティング（URL の # 以降）
//   #tweet-<id>  詳細画面
//   #archive     振り返り（草）
//   それ以外はタイムライン: tag-<タグ> / month-<YYYY-MM> / q-<検索語>
// -------------------------------------------------------------
function currentDetailId() {
  const hash = window.location.hash;
  return hash.startsWith("#tweet-") ? hash.slice("#tweet-".length) : null;
}

function parseRoute() {
  const detailId = currentDetailId();
  if (detailId) return { view: "detail", detailId, tag: null, month: null, search: null };
  const route = { view: "timeline", detailId: null, tag: null, month: null, search: null };
  for (const part of window.location.hash.slice(1).split("&")) {
    if (part === "archive") route.view = "archive";
    else if (/^month-\d{4}-\d{2}$/.test(part)) route.month = part.slice("month-".length);
    else if (part.startsWith("tag-")) {
      try {
        route.tag = normalizeTag(decodeURIComponent(part.slice("tag-".length)));
      } catch (e) {}
    } else if (part.startsWith("q-")) {
      try {
        route.search = decodeURIComponent(part.slice("q-".length)).trim() || null;
      } catch (e) {}
    }
  }
  return route;
}

// replace=true は履歴を積まずに URL だけ書き換える
function navigate({ view = "timeline", tag = null, month = null, search = null, replace = false } = {}) {
  const parts = [];
  if (view === "archive") parts.push("archive");
  if (month) parts.push(`month-${month}`);
  if (tag) parts.push(`tag-${encodeURIComponent(tag)}`);
  if (search) parts.push(`q-${encodeURIComponent(search)}`);
  const hash = parts.join("&");
  if (replace) history.replaceState(null, "", `#${hash}`);
  else window.location.hash = hash;
}

function handleRouting() {
  const route = parseRoute();
  const wasTimeline = !viewTimeline.classList.contains("hidden");
  if (route.view !== "timeline" && wasTimeline) timelineScrollY = window.scrollY;
  editingTarget = null;

  viewTimeline.classList.toggle("hidden", route.view !== "timeline");
  viewDetail.classList.toggle("active", route.view === "detail");
  viewArchive.classList.toggle("active", route.view === "archive");
  btnBack.classList.toggle("show", route.view !== "timeline");

  if (route.view === "detail") {
    renderDetailView(route.detailId);
    window.scrollTo(0, 0);
    return;
  }
  if (route.view === "archive") {
    renderArchive(route.tag);
    window.scrollTo(0, 0);
    return;
  }
  if (route.tag !== tagFilter || route.month !== monthFilter || route.search !== searchFilter) {
    if (route.tag !== tagFilter) applyAutoTag(route.tag);
    tagFilter = route.tag;
    monthFilter = route.month;
    searchFilter = route.search;
    syncSearchUi();
    renderTimeline();
    window.scrollTo(0, 0);
  } else if (!wasTimeline) {
    window.scrollTo(0, timelineScrollY);
  }
  if (pendingScroll === "top") window.scrollTo(0, 0);
  else if (pendingScroll) scrollToDay(pendingScroll);
  pendingScroll = null;
}

let internalNavCount = 0;
let isBackNavigating = false;
window.addEventListener("hashchange", () => {
  if (isBackNavigating) {
    isBackNavigating = false;
  } else {
    internalNavCount++;
  }
});

function handleBack() {
  if (internalNavCount > 0 && window.history.length > 1) {
    isBackNavigating = true;
    internalNavCount = Math.max(0, internalNavCount - 1);
    history.back();
  } else {
    goHome();
  }
}

function goHome() {
  window.location.hash = "";
}

function removeFilter(kind) {
  if (kind === "search") {
    clearSearch();
  } else {
    navigate({
      tag: kind === "tag" ? null : tagFilter,
      month: kind === "month" ? null : monthFilter,
      search: searchFilter
    });
  }
}

// -------------------------------------------------------------
// キーボードショートカット
// -------------------------------------------------------------
window.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    toggleSearch();
    return;
  }
  if (e.key === "/" && document.activeElement !== composerInput && document.activeElement !== searchInput && !editingTarget) {
    e.preventDefault();
    openSearch();
    return;
  }
  if (e.key === "Escape") {
    if (isSearchOpen && document.activeElement === searchInput) {
      searchInput.blur();
      return;
    }
    closeMoodMenus();
    closeConfirm();
    closeMenu();
    cancelEdit();
    return;
  }

  // 詳細画面での前後ポスト送り（入力中でない時のみ）
  const isInputActive = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName) || editingTarget;
  const detailId = currentDetailId();
  if (detailId && !isInputActive && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const curIdx = tweets.findIndex((tw) => tw.id === detailId);
    if (curIdx !== -1) {
      if (e.key === "ArrowLeft" || e.key === "j" || e.key === "[") {
        const older = tweets[curIdx + 1];
        if (older) {
          e.preventDefault();
          goToTweet(older.id);
        }
      } else if (e.key === "ArrowRight" || e.key === "k" || e.key === "]") {
        const newer = tweets[curIdx - 1];
        if (newer) {
          e.preventDefault();
          goToTweet(newer.id);
        }
      }
    }
  }
});

// -------------------------------------------------------------
// 外から開かれたとき（他のアプリの「共有」→ ?title=&text=&url= を下書きに入れる）
// -------------------------------------------------------------
function handleSharedTargetParams() {
  try {
    const urlObj = new URL(window.location.href);
    const title = urlObj.searchParams.get("title");
    const text = urlObj.searchParams.get("text");
    const url = urlObj.searchParams.get("url");

    if (!title && !text && !url) return;

    const parts = [];
    if (text) parts.push(text);
    if (title && (!text || !text.includes(title))) parts.push(title);
    if (url && (!text || !text.includes(url))) parts.push(url);

    const shareContent = parts.join(" ").trim();
    if (shareContent) {
      composerInput.value = composerInput.value ? `${shareContent}\n${composerInput.value}` : shareContent;
      handleInput();
      syncHighlight(composerInput);
    }
    urlObj.search = "";
    history.replaceState(null, "", urlObj.toString());
  } catch (e) {}
}

// -------------------------------------------------------------
// 起動
// -------------------------------------------------------------
async function init() {
  initTheme();
  applyTranslations();
  renderTodayDate();
  initInstallHint();
  handleSharedTargetParams();

  composerInput.addEventListener("focus", () => {
    document.body.classList.add("keyboard-open");
    setTimeout(() => keepCaretVisible(composerInput), 300);
  });
  composerInput.addEventListener("blur", () => {
    document.body.classList.remove("keyboard-open");
  });

  // 初回だけ案内用ポストを入れる
  const stored = await loadTweets();
  tweets = normalizeTweets(stored ?? getDefaultTweets(LOCALE));
  save();

  renderTimeline();
  restoreComposerDraft();
  renderComposerMood();
  handleRouting();
  window.addEventListener("hashchange", handleRouting);

  if (window.location.hash === "#compose") {
    window.location.hash = "";
    setTimeout(() => {
      composerInput.focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 100);
  }

  // 日付をまたいで再開したら「今日」「昨日」の表示を描き直す
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && dayKey(new Date()) !== renderedDayKey) renderAll();
  });
}

// Service Worker（PWA オフライン起動）
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => console.warn("ServiceWorker registration failed:", err));
  });
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
