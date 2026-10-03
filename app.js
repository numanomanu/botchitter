// =============================================================
// botchitter — 一人Twitter: アプリケーションロジック
//
// データ（tweets 配列、新しい順。IndexedDB と localStorage に丸ごと保存）:
//   tweet = { id, createdAt, editedAt, text, history, targetQuoteId, quoted: { createdAt, text } | null, replies: [reply] }
//   reply = { id, createdAt, editedAt, text, history }
//   quoted は引用した時点のスナップショット（元が消えても残る）。targetQuoteId は元ポストの ID。
//   編集しても前の版は消さず history（[{ text, createdAt }]、古い順）に残す。editedAt は未編集なら null。
// 表示用の日付は保存せず、描画のたびに createdAt から作る。タグも保存せず、本文の #xxx から都度読み取る。
// 状態を変えたら save() → refresh(tweetId) の順に呼ぶ。
// =============================================================

let tweets = [];
let currentQuoteTarget = null; // { id, createdAt, text }
let activeReplyBoxId = null;
let editingTarget = null; // { tweetId, replyId, text }（詳細画面で編集中の項目と入力途中の文）
let tagFilter = null; // タイムラインを絞り込み中のタグ（#tag-<tag> のとき）
let confirmCallback = null;
let renderedDayKey = "";
let timelineScrollY = 0;

// DOM要素
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
const themeToggleBtn = $("themeToggleBtn");
const confirmOverlay = $("confirmOverlay");
const menuOverlay = $("menuOverlay");
const installHint = $("installHint");
const tagFilterBar = $("tagFilterBar");
const tagList = $("tagList");

const ICONS = {
  comment: `<svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
  quote: `<svg viewBox="0 0 24 24"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  share: `<svg viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`,
  trash: `<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  edit: `<svg viewBox="0 0 24 24"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
  send: `<svg viewBox="0 0 24 24"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`,
  sun: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  moon: `<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`
};

// -------------------------------------------------------------
// 多言語対応（ブラウザ言語で ja / en を自動判定）
// -------------------------------------------------------------
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
    yesterday: "昨日",
    edited: "編集済み",
    menu_export: "バックアップを書き出す",
    menu_import: "バックアップを読み込む",
    install_hint: "ホーム画面に追加すると、記録が消えにくくなります",
    toast_copied: "コピーしました",
    toast_imported: (n) => `${n}件を読み込みました`,
    toast_import_failed: "読み込めませんでした",
    theme_light_title: "ライトモード",
    theme_dark_title: "ダークモード"
  },
  en: {
    placeholder_default: "What did you feel today?",
    placeholder_comment: "Comment",
    btn_post: "Post",
    btn_save: "Save",
    btn_cancel: "Cancel",
    btn_delete: "Delete",
    confirm_delete: "Delete?",
    yesterday: "Yesterday",
    edited: "Edited",
    menu_export: "Export backup",
    menu_import: "Import backup",
    install_hint: "Add to Home Screen so your notes don't get cleared",
    toast_copied: "Copied",
    toast_imported: (n) => `Imported ${n}`,
    toast_import_failed: "Couldn't import this file",
    theme_light_title: "Light mode",
    theme_dark_title: "Dark mode"
  }
};

function t(key, ...args) {
  const val = I18N[LOCALE][key];
  return typeof val === "function" ? val(...args) : val;
}

function applyTranslations() {
  document.documentElement.lang = LOCALE;
  composerInput.placeholder = t("placeholder_default");
  postBtn.textContent = t("btn_post");
  $("confirmTitle").textContent = t("confirm_delete");
  $("btnConfirmCancel").textContent = t("btn_cancel");
  $("btnConfirmDelete").textContent = t("btn_delete");
  $("btnExport").textContent = t("menu_export");
  $("btnImport").textContent = t("menu_import");
  $("installHintText").textContent = t("install_hint");
}

// -------------------------------------------------------------
// 日付表示
// -------------------------------------------------------------
const DATE_LOCALE = LOCALE === "ja" ? "ja-JP" : "en-US";
const headerDateFormat = new Intl.DateTimeFormat(DATE_LOCALE, { month: "short", day: "numeric", weekday: "short" });
const monthDayFormat = new Intl.DateTimeFormat(DATE_LOCALE, { month: "short", day: "numeric" });
const fullDateFormat = new Intl.DateTimeFormat(DATE_LOCALE, { year: "numeric", month: "short", day: "numeric" });

const pad2 = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// 今日「20:30」/ 昨日「昨日 20:30」/ 今年「9月28日 20:30」/ それ以前「2025年9月28日」
// full=true（詳細画面）は常に年月日と時刻
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

function renderTodayDate() {
  $("todayDateLabel").textContent = headerDateFormat.format(new Date());
}

// -------------------------------------------------------------
// テーマ（保存された選択が無ければ OS に追従）
// -------------------------------------------------------------
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function currentTheme() {
  return document.documentElement.dataset.theme || (darkQuery.matches ? "dark" : "light");
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) document.documentElement.dataset.theme = saved;
  updateThemeButton();
  darkQuery.addEventListener("change", updateThemeButton);
}

function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_KEY, next);
  updateThemeButton();
}

function updateThemeButton() {
  const isDark = currentTheme() === "dark";
  themeToggleBtn.innerHTML = isDark ? ICONS.sun : ICONS.moon;
  themeToggleBtn.title = t(isDark ? "theme_light_title" : "theme_dark_title");
}

// -------------------------------------------------------------
// 永続化（IndexedDB が本体、localStorage は IndexedDB が使えない環境向けの控え）
// -------------------------------------------------------------
// 接続は毎回開いて閉じる（iOS では開きっぱなしの接続がバックグラウンド中に切れることがあるため）
function openDB() {
  return new Promise((resolve) => {
    if (!window.indexedDB) return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

// 保存データが無ければ null
async function loadFromDB() {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get("tweets");
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  }).finally(() => db.close());
}

async function saveToDB(data) {
  const db = await openDB();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(data, "tweets");
      tx.oncomplete = tx.onerror = tx.onabort = resolve;
    } catch (e) {
      resolve();
    }
  });
  db.close();
}

async function loadTweets() {
  const fromDB = await loadFromDB();
  if (fromDB) return fromDB;
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    return null;
  }
}

let isSaveQueued = false;
let saveChain = Promise.resolve();

// 同じタイミングの連続呼び出しは1回にまとめる。保存中に来た変更は次の保存に回す（取りこぼさない）
function save() {
  if (isSaveQueued) return;
  isSaveQueued = true;
  saveChain = saveChain
    .then(async () => {
      isSaveQueued = false;
      await saveToDB(tweets);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tweets));
    })
    .catch((err) => console.warn("Storage save failed:", err));
}

// 容量不足のときにブラウザに消されないよう頼む（Firefox は確認を出すので、起動時ではなく投稿時に呼ぶ）
async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch (e) {}
}

// -------------------------------------------------------------
// 読み込み・インポート時の整形（旧形式の移行と、不正データの除外）
// -------------------------------------------------------------
// ID は onclick 属性に埋め込むので、英数字・_・- 以外は受け付けない
const isValidId = (id) => typeof id === "string" && /^[\w-]+$/.test(id);

// 旧形式は createdAt が無いことがあるので、ID に埋め込まれた時刻（tw-1727...）で補う
function toTimestamp(item) {
  if (Number.isFinite(item.createdAt)) return item.createdAt;
  const fromId = Number(item.id.split("-").pop());
  return fromId > 1e12 ? fromId : Date.now();
}

// ポスト・コメント共通の項目（編集履歴は旧形式には無い）
function normalizeEntry(item) {
  const history = (Array.isArray(item.history) ? item.history : [])
    .filter((v) => typeof v?.text === "string" && Number.isFinite(v.createdAt))
    .map((v) => ({ text: v.text, createdAt: v.createdAt }));
  return {
    id: item.id,
    createdAt: toTimestamp(item),
    editedAt: Number.isFinite(item.editedAt) ? item.editedAt : null,
    text: item.text,
    history
  };
}

function normalizeTweets(raw) {
  if (!Array.isArray(raw)) return [];
  const list = raw
    .filter((tw) => tw && isValidId(tw.id) && typeof tw.text === "string")
    .map((tw) => ({
      ...normalizeEntry(tw),
      targetQuoteId: isValidId(tw.targetQuoteId) ? tw.targetQuoteId : null,
      quoted: typeof tw.quoted?.text === "string" ? { createdAt: tw.quoted.createdAt || null, text: tw.quoted.text } : null,
      replies: (Array.isArray(tw.replies) ? tw.replies : [])
        .filter((rep) => rep && isValidId(rep.id) && typeof rep.text === "string")
        .map(normalizeEntry)
    }));

  // 旧形式の引用は時刻しか持っていないので、引用元（ポストかそのコメント）から日時を補う
  for (const tw of list) {
    if (tw.quoted && !tw.quoted.createdAt) {
      const source = list.find((s) => s.id === tw.targetQuoteId);
      const match = source && [source, ...source.replies].find((item) => item.text === tw.quoted.text);
      tw.quoted.createdAt = match ? match.createdAt : null;
    }
  }
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

// ID 単位で足し合わせる（既存の投稿は上書きしない）。追加した件数を返す
function mergeTweets(incoming) {
  let added = 0;
  for (const tw of incoming) {
    const existing = findTweet(tw.id);
    if (!existing) {
      tweets.push(tw);
      added += 1 + tw.replies.length;
      continue;
    }
    for (const rep of tw.replies) {
      if (existing.replies.some((r) => r.id === rep.id)) continue;
      existing.replies.push(rep);
      added++;
    }
    existing.replies.sort((a, b) => a.createdAt - b.createdAt);
  }
  tweets.sort((a, b) => b.createdAt - a.createdAt);
  return added;
}

// -------------------------------------------------------------
// バックアップ（書き出し / 読み込み）
// -------------------------------------------------------------
function openMenu() {
  renderTagList();
  menuOverlay.classList.add("open");
}

function closeMenu() {
  menuOverlay.classList.remove("open");
}

async function exportData() {
  closeMenu();
  const json = JSON.stringify({ app: "botchitter", version: 1, exportedAt: Date.now(), tweets }, null, 2);
  const file = new File([json], `botchitter-${dayKey(new Date())}.json`, { type: "application/json" });

  // スマホは共有シート（iOS なら「"ファイル"に保存」）、それ以外は通常のダウンロード
  if (window.matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importData(input) {
  const file = input.files[0];
  input.value = "";
  closeMenu();
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const incoming = normalizeTweets(Array.isArray(parsed) ? parsed : parsed.tweets);
    if (!incoming.length) throw new Error("no valid tweets");
    const added = mergeTweets(incoming);
    save();
    renderAll();
    showToast(t("toast_imported", added));
  } catch (err) {
    console.warn("Import failed:", err);
    showToast(t("toast_import_failed"));
  }
}

// iOS Safari のタブで開いている時だけ出す（Safari のデータは7日使わないと消えることがあり、ホーム画面版とも別領域）
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
// ルーティング（#tweet-<id> で詳細画面）
// -------------------------------------------------------------
function currentDetailId() {
  const hash = window.location.hash;
  return hash.startsWith("#tweet-") ? hash.slice("#tweet-".length) : null;
}

function currentTagFilter() {
  const hash = window.location.hash;
  if (!hash.startsWith("#tag-")) return null;
  try {
    return normalizeTag(decodeURIComponent(hash.slice("#tag-".length)));
  } catch (e) {
    return null;
  }
}

function handleRouting() {
  const detailId = currentDetailId();
  const wasTimeline = !viewTimeline.classList.contains("hidden");
  if (detailId && wasTimeline) timelineScrollY = window.scrollY;
  editingTarget = null;

  viewTimeline.classList.toggle("hidden", !!detailId);
  viewDetail.classList.toggle("active", !!detailId);
  btnBack.classList.toggle("show", !!detailId);

  if (detailId) {
    renderDetailView(detailId);
    window.scrollTo(0, 0);
    return;
  }
  const tag = currentTagFilter();
  if (tag !== tagFilter) {
    tagFilter = tag;
    renderTimeline();
    window.scrollTo(0, 0);
  } else if (!wasTimeline) {
    window.scrollTo(0, timelineScrollY);
  }
}

function goHome() {
  window.location.hash = "";
}

function goToTweet(tweetId) {
  window.location.hash = `#tweet-${tweetId}`;
}

// -------------------------------------------------------------
// 投稿・引用・コメント
// -------------------------------------------------------------
const findTweet = (id) => tweets.find((tw) => tw.id === id);

function findItem(tweetId, replyId) {
  const tweet = findTweet(tweetId);
  return replyId ? tweet?.replies.find((rep) => rep.id === replyId) : tweet;
}

// 下書き（一時保存）
function saveComposerDraft() {
  const text = composerInput.value;
  if (!text.trim() && !currentQuoteTarget) {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    return;
  }
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      text,
      quote: currentQuoteTarget
    }));
  } catch (e) {}
}

function clearComposerDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
}

function restoreComposerDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (draft.quote && findTweet(draft.quote.id)) {
      currentQuoteTarget = draft.quote;
      quotePreviewDate.textContent = formatTimestamp(draft.quote.createdAt);
      quotePreviewText.textContent = draft.quote.text;
      quotePreview.classList.add("active");
    }
    if (draft.text) {
      composerInput.value = draft.text;
      autoResizeTextarea(composerInput);
    }
    postBtn.disabled = !composerInput.value.trim();
  } catch (e) {}
}

function handleInput() {
  autoResizeTextarea(composerInput);
  postBtn.disabled = !composerInput.value.trim();
  saveComposerDraft();
}

// ⌘/Ctrl + Enter で送信（IME 変換中は無視）
function submitOnCmdEnter(event, submit) {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    submit();
  }
}

// ポストかコメントを引用する（スレッド奥の思考もタイムライン最前線に引き上げられる）
function quoteTweet(tweetId, replyId) {
  const source = findItem(tweetId, replyId);
  if (!source) return;

  currentQuoteTarget = { id: tweetId, createdAt: source.createdAt, text: source.text };
  quotePreviewDate.textContent = formatTimestamp(source.createdAt);
  quotePreviewText.textContent = source.text;
  quotePreview.classList.add("active");

  if (currentDetailId()) {
    timelineScrollY = 0;
    goHome();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
  composerInput.focus();
  handleInput();
}

function clearQuote() {
  currentQuoteTarget = null;
  quotePreview.classList.remove("active");
  handleInput();
}

function publishTweet() {
  const text = composerInput.value.trim();
  if (!text) return;

  const now = Date.now();
  const quote = currentQuoteTarget;
  tweets.unshift({
    id: `tw-${now}`,
    createdAt: now,
    editedAt: null,
    text,
    history: [],
    targetQuoteId: quote ? quote.id : null,
    quoted: quote ? { createdAt: quote.createdAt, text: quote.text } : null,
    replies: []
  });
  save();
  requestPersistentStorage();

  composerInput.value = "";
  composerInput.style.height = "";
  clearComposerDraft();
  clearQuote();
  refresh(`tw-${now}`);
  if (tagFilter && !matchesTag(tweets[0], tagFilter)) goHome();
}

// -------------------------------------------------------------
// 高度なテキストエリア自動伸縮（リフロー・スクロール跳ね上がり完全防止）
// -------------------------------------------------------------
let resizeMirror = null;

function getResizeMirror(targetEl) {
  if (!resizeMirror) {
    resizeMirror = document.createElement("div");
    resizeMirror.setAttribute("aria-hidden", "true");
    resizeMirror.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      visibility: hidden;
      pointer-events: none;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: break-word;
      box-sizing: border-box;
      z-index: -9999;
    `;
    document.body.appendChild(resizeMirror);
  }
  const style = window.getComputedStyle(targetEl);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const innerWidth = targetEl.clientWidth - paddingLeft - paddingRight;
  resizeMirror.style.width = Math.max(innerWidth, 20) + "px";
  resizeMirror.style.fontFamily = style.fontFamily;
  resizeMirror.style.fontSize = style.fontSize;
  resizeMirror.style.fontWeight = style.fontWeight;
  resizeMirror.style.lineHeight = style.lineHeight;
  resizeMirror.style.letterSpacing = style.letterSpacing;
  resizeMirror.style.padding = "0px";
  resizeMirror.style.border = "none";
  return resizeMirror;
}

function calculateTargetHeight(el, minHeight) {
  if (!el) return minHeight;
  if (el.clientWidth === 0) return Math.max(minHeight, el.scrollHeight || 0);

  const mirror = getResizeMirror(el);
  const text = el.value || "";
  mirror.textContent = text.endsWith("\n") ? text + " " : (text || " ");
  const style = window.getComputedStyle(el);
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  const borderTop = parseFloat(style.borderTopWidth) || 0;
  const borderBottom = parseFloat(style.borderBottomWidth) || 0;
  const totalHeight = mirror.offsetHeight + paddingTop + paddingBottom + borderTop + borderBottom;
  return Math.max(minHeight, totalHeight);
}

function getCaretOffsetY(el) {
  if (!el) return 0;
  const sel = el.selectionStart ?? el.value.length;
  const textUpToCaret = el.value.slice(0, sel);
  const mirror = getResizeMirror(el);
  mirror.textContent = textUpToCaret.endsWith("\n") ? textUpToCaret + " " : (textUpToCaret || " ");
  return mirror.offsetHeight;
}

function keepCaretVisible(el) {
  if (document.activeElement !== el) return;
  const vp = window.visualViewport;
  const viewportHeight = vp ? vp.height : window.innerHeight;
  const rect = el.getBoundingClientRect();
  const caretY = rect.top + getCaretOffsetY(el);

  // キーボードの上端（または画面下端）から48pxの余裕を持たせる
  const bottomThreshold = viewportHeight - 48;
  const topThreshold = 64;

  if (caretY > bottomThreshold) {
    const diff = caretY - bottomThreshold;
    window.scrollBy({ top: diff, behavior: "smooth" });
  } else if (caretY < topThreshold) {
    const diff = caretY - topThreshold;
    window.scrollBy({ top: diff, behavior: "smooth" });
  }
}

function autoResizeTextarea(el) {
  if (!el) return;
  const isReply = el.classList.contains("reply-input");
  const isDetail = el.classList.contains("detail-composer-textarea");
  const minHeight = isReply ? 36 : (isDetail ? 56 : 64);

  const targetHeight = calculateTargetHeight(el, minHeight);

  if (isReply) {
    el.style.height = Math.min(targetHeight, 180) + "px";
    return;
  }

  // 高さを "auto" に落とさず直接目標値へ移行することで、スクロール位置の跳ね上がりを完全に防ぐ
  const currentHeight = parseInt(el.style.height, 10);
  if (currentHeight !== targetHeight) {
    el.style.height = targetHeight + "px";
  }

  keepCaretVisible(el);
}

function handleDetailReplyInput(el, tweetId) {
  autoResizeTextarea(el);
  const btn = $("detailPostBtn");
  if (btn) btn.disabled = !el.value.trim();
  if (tweetId) {
    try {
      if (el.value.trim()) {
        localStorage.setItem(REPLY_DRAFT_PREFIX + tweetId, el.value);
      } else {
        localStorage.removeItem(REPLY_DRAFT_PREFIX + tweetId);
      }
    } catch (e) {}
  }
}

function handleTimelineReplyInput(el, tweetId) {
  autoResizeTextarea(el);
  if (tweetId) {
    try {
      if (el.value.trim()) {
        localStorage.setItem(REPLY_DRAFT_PREFIX + tweetId, el.value);
      } else {
        localStorage.removeItem(REPLY_DRAFT_PREFIX + tweetId);
      }
    } catch (e) {}
  }
}

function toggleReplyBox(tweetId) {
  const box = $(`reply-box-${tweetId}`);
  if (!box) return;
  const isOpen = box.classList.toggle("open");
  activeReplyBoxId = isOpen ? tweetId : null;
  if (isOpen) {
    const input = $(`reply-input-${tweetId}`);
    try {
      const saved = localStorage.getItem(REPLY_DRAFT_PREFIX + tweetId);
      if (saved && !input.value) {
        input.value = saved;
      }
    } catch (e) {}
    input.focus();
    autoResizeTextarea(input);
  }
}

function addReply(tweetId, inputId = `reply-input-${tweetId}`) {
  const tweet = findTweet(tweetId);
  const text = $(inputId)?.value.trim();
  if (!tweet || !text) return;

  const now = Date.now();
  tweet.replies.push({ id: `rep-${now}`, createdAt: now, editedAt: null, text, history: [] });
  save();
  try {
    localStorage.removeItem(REPLY_DRAFT_PREFIX + tweetId);
  } catch (e) {}
  activeReplyBoxId = null;
  refresh(tweetId);
}

// replyId があればコメント、無ければポストを削除
function deleteItem(tweetId, replyId) {
  askConfirmation(() => {
    if (replyId) {
      const tweet = findTweet(tweetId);
      if (!tweet) return;
      tweet.replies = tweet.replies.filter((rep) => rep.id !== replyId);
    } else {
      tweets = tweets.filter((tw) => tw.id !== tweetId);
      try {
        localStorage.removeItem(REPLY_DRAFT_PREFIX + tweetId);
      } catch (e) {}
      if (currentQuoteTarget && currentQuoteTarget.id === tweetId) {
        clearQuote();
      }
      if (currentDetailId() === tweetId) goHome();
    }
    save();
    refresh(tweetId);
  });
}

// -------------------------------------------------------------
// 編集（詳細画面からだけ。前の版は history に残す）
// -------------------------------------------------------------
const isEditing = (tweetId, replyId = null) => editingTarget?.tweetId === tweetId && editingTarget.replyId === replyId;

function startEdit(tweetId, replyId = null) {
  const item = findItem(tweetId, replyId);
  if (!item) return;
  editingTarget = { tweetId, replyId, text: item.text };
  renderDetailView(tweetId);
  const input = $("edit-input");
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  autoResizeTextarea(input);
}

function handleEditInput(el) {
  autoResizeTextarea(el);
  editingTarget.text = el.value;
  $("editSaveBtn").disabled = !el.value.trim();
}

function saveEdit() {
  if (!editingTarget) return;
  const { tweetId, replyId } = editingTarget;
  const item = findItem(tweetId, replyId);
  const text = editingTarget.text.trim();
  if (!item || !text) return;

  editingTarget = null;
  if (text !== item.text) {
    item.history.push({ text: item.text, createdAt: item.editedAt || item.createdAt });
    item.text = text;
    item.editedAt = Date.now();
    save();
  }
  refresh(tweetId);
}

function cancelEdit() {
  if (!editingTarget) return;
  const { tweetId } = editingTarget;
  editingTarget = null;
  renderDetailView(tweetId);
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

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeConfirm();
    closeMenu();
    cancelEdit();
  }
});

// -------------------------------------------------------------
// 共有（Web Share API → クリップボード → X の投稿画面）
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
// タグ（本文中の #株 など。文字や数字の直後（今日は#株）と URL 中の # は除く。数字だけのものも除く）
// -------------------------------------------------------------
const TAG_PATTERN = /(^|[^\p{L}\p{N}_&\/:#＃])[#＃]([^\s#＃.,!?、。，．！？・「」『』（）()【】\[\]<>＜＞"'“”‘’:：;；\/\\]+)/gu;

// 全角・半角や大文字・小文字の違いは同じタグとして扱う
const normalizeTag = (raw) => raw.normalize("NFKC").toLowerCase();

function* tagMatches(text) {
  for (const m of text.matchAll(TAG_PATTERN)) {
    const tag = normalizeTag(m[2]);
    if (/^\d+$/.test(tag)) continue;
    const start = m.index + m[1].length;
    yield { tag, start, end: start + 1 + m[2].length };
  }
}

// ポストとそのコメントに出てくるタグ
const threadTags = (tweet) => [tweet, ...tweet.replies].flatMap((item) => [...tagMatches(item.text)].map((m) => m.tag));
const matchesTag = (tweet, tag) => threadTags(tweet).includes(tag);

function openTag(event, tag) {
  event.stopPropagation();
  closeMenu();
  window.location.hash = `#tag-${encodeURIComponent(tag)}`;
}

// メニューのタグ一覧（そのタグを含むポストの数が多い順）
function renderTagList() {
  const counts = new Map();
  for (const tweet of tweets) {
    for (const tag of new Set(threadTags(tweet))) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  tagList.innerHTML = sorted.map(([tag, count]) => `
    <button class="tag-chip" data-tag="${escapeHtml(tag)}" onclick="openTag(event, this.dataset.tag)">#${escapeHtml(tag)}<span class="tag-count">${count}</span></button>
  `).join("");
  tagList.classList.toggle("show", sorted.length > 0);
}

function updateTagFilterBar() {
  tagFilterBar.classList.toggle("show", !!tagFilter);
  if (!tagFilter) return;
  $("tagFilterLabel").textContent = `#${tagFilter}`;
  $("tagFilterCount").textContent = tweets.filter((tw) => matchesTag(tw, tagFilter)).length;
}

// -------------------------------------------------------------
// HTMLジェネレーター（文字のない直感UI）
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

// 本文を HTML にする。#タグはタップで絞り込み（タグは JS 文字列に埋め込まず data 属性から読む）
function formatText(text) {
  let html = "";
  let last = 0;
  for (const { tag, start, end } of tagMatches(text)) {
    html += escapeHtml(text.slice(last, start));
    html += `<span class="tag" data-tag="${escapeHtml(tag)}" onclick="openTag(event, this.dataset.tag)">${escapeHtml(text.slice(start, end))}</span>`;
    last = end;
  }
  return html + escapeHtml(text.slice(last));
}

// 作成直後（新規投稿・新規コメント）の要素だけフェードインさせる。
// 終わったらクラスを外す（残すと、隠れていたタイムラインを再表示した時に再生されてしまう）
const enterClass = (createdAt) => (Date.now() - createdAt < 2000 ? "enter" : "");
document.addEventListener("animationend", (e) => e.target.classList.remove("enter"));

// タイムラインでは日付の横に小さな印だけ出す（履歴は詳細画面で見る）
const buildEditedMarkHtml = (item) =>
  item.editedAt ? `<span class="edited-mark" title="${t("edited")}">${ICONS.edit}</span>` : "";

// 編集前の版（詳細画面でだけ、たたんで見せる。新しい版から順に）
function buildHistoryHtml(item) {
  if (!item.history.length) return "";
  const versions = [...item.history].reverse().map((v) => `
    <div class="history-item">
      <div class="history-meta">${formatTimestamp(v.createdAt, true)}</div>
      <div class="history-text">${escapeHtml(v.text)}</div>
    </div>
  `).join("");
  return `
    <details class="edit-history">
      <summary title="${t("edited")}">${ICONS.edit}${formatTimestamp(item.editedAt)}</summary>
      ${versions}
    </details>
  `;
}

function buildEditBoxHtml() {
  return `
    <div class="edit-box">
      <textarea
        id="edit-input"
        class="detail-composer-textarea"
        rows="2"
        oninput="handleEditInput(this)"
        onkeydown="submitOnCmdEnter(event, saveEdit)"
      >${escapeHtml(editingTarget.text)}</textarea>
      <div class="edit-actions">
        <button class="btn-confirm-cancel" onclick="cancelEdit()">${t("btn_cancel")}</button>
        <button id="editSaveBtn" class="btn-post" onclick="saveEdit()">${t("btn_save")}</button>
      </div>
    </div>
  `;
}

// inDetail=true（詳細画面）のときだけ編集ボタンと編集履歴を出す
function buildReplyItemHtml(rep, tweetId, inDetail = false) {
  const args = `'${tweetId}', '${rep.id}'`;
  if (inDetail && isEditing(tweetId, rep.id)) {
    return `
      <div class="reply-item">
        <div class="reply-meta"><span>${formatTimestamp(rep.createdAt)}</span></div>
        ${buildEditBoxHtml()}
      </div>
    `;
  }
  return `
    <div class="reply-item ${enterClass(rep.createdAt)}">
      <div class="reply-meta">
        <span>${formatTimestamp(rep.createdAt)}${inDetail ? "" : buildEditedMarkHtml(rep)}</span>
        <div class="reply-actions">
          ${inDetail ? `<button class="reply-action-btn" onclick="startEdit(${args})" aria-label="Edit">${ICONS.edit}</button>` : ""}
          <button class="reply-action-btn" onclick="shareItem(${args})" aria-label="Share">${ICONS.share}</button>
          <button class="reply-action-btn" onclick="quoteTweet(${args})" aria-label="Quote">${ICONS.quote}</button>
          <button class="reply-action-btn delete-btn" onclick="deleteItem(${args})" aria-label="Delete">${ICONS.trash}</button>
        </div>
      </div>
      <div class="reply-text">${formatText(rep.text)}</div>
      ${inDetail ? buildHistoryHtml(rep) : ""}
    </div>
  `;
}

function buildRepliesThreadHtml(tweet, inDetail = false) {
  if (!tweet.replies.length) return "";
  return `<div class="replies-thread">${tweet.replies.map((rep) => buildReplyItemHtml(rep, tweet.id, inDetail)).join("")}</div>`;
}

// 引用カード（元ポストが残っていればリンクし、そのコメント数を出す）
function buildQuotedCardHtml(tweet) {
  if (!tweet.quoted) return "";
  const original = findTweet(tweet.targetQuoteId);
  const commentCount = original ? original.replies.length : 0;
  return `
    <div class="quoted-card" ${original ? `onclick="goToTweet('${original.id}')"` : ""}>
      <div class="quoted-card-header">
        <span class="quoted-card-date">${ICONS.quote}${formatTimestamp(tweet.quoted.createdAt)}</span>
        ${commentCount ? `<span class="quoted-card-comments-badge">${ICONS.comment}${commentCount}</span>` : ""}
      </div>
      <div class="quoted-card-body">${escapeHtml(tweet.quoted.text)}</div>
    </div>
  `;
}

function buildPostActionsHtml(tweetId, inDetail = false) {
  return `
    ${inDetail ? `<button class="action-btn" onclick="startEdit('${tweetId}')" aria-label="Edit">${ICONS.edit}</button>` : ""}
    <button class="action-btn" onclick="quoteTweet('${tweetId}')" aria-label="Quote">${ICONS.quote}</button>
    <button class="action-btn" onclick="shareItem('${tweetId}')" aria-label="Share">${ICONS.share}</button>
    <button class="action-btn delete-btn" onclick="deleteItem('${tweetId}')" aria-label="Delete">${ICONS.trash}</button>
  `;
}

function buildTweetItemHtml(tweet) {
  const id = tweet.id;
  return `
    <article class="tweet-item ${enterClass(tweet.createdAt)}" id="${id}">
      <div class="tweet-header">
        <span class="tweet-date-link" onclick="goToTweet('${id}')">${formatTimestamp(tweet.createdAt)}${buildEditedMarkHtml(tweet)}</span>
      </div>
      <div class="tweet-content" onclick="goToTweet('${id}')">${formatText(tweet.text)}</div>
      ${buildQuotedCardHtml(tweet)}
      ${buildRepliesThreadHtml(tweet)}
      <div class="reply-input-box ${activeReplyBoxId === id ? "open" : ""}" id="reply-box-${id}">
        <textarea
          id="reply-input-${id}"
          class="reply-input"
          placeholder="…"
          rows="1"
          oninput="handleTimelineReplyInput(this, '${id}')"
          onkeydown="submitOnCmdEnter(event, () => addReply('${id}'))"
        ></textarea>
        <button class="btn-submit-reply" onclick="addReply('${id}')" aria-label="Send">${ICONS.send}</button>
      </div>
      <div class="tweet-footer">
        <button class="action-btn" onclick="toggleReplyBox('${id}')" aria-label="Reply">
          ${ICONS.comment}<span class="action-count">${tweet.replies.length || ""}</span>
        </button>
        ${buildPostActionsHtml(id)}
      </div>
    </article>
  `;
}

// -------------------------------------------------------------
// 描画
// -------------------------------------------------------------
const isVisibleInTimeline = (tweet) => !tagFilter || matchesTag(tweet, tagFilter);

function renderTimeline() {
  timelineStream.innerHTML = tweets.filter(isVisibleInTimeline).map(buildTweetItemHtml).join("");
  updateTagFilterBar();
  renderedDayKey = dayKey(new Date());
}

function renderAll() {
  renderTodayDate();
  renderTimeline();
  const detailId = currentDetailId();
  if (detailId) renderDetailView(detailId);
}

// 状態を変えた後に呼ぶ唯一の描画入口。タイムライン上の該当ポスト（とそれを引用しているポスト）を
// 差し替え・追加・削除し、詳細画面を開いていれば描き直す
function refresh(tweetId) {
  const quotingIds = tweets.filter((tw) => tw.targetQuoteId === tweetId).map((tw) => tw.id);
  for (const id of [tweetId, ...quotingIds]) patchTimelineItem(id);
  updateTagFilterBar();
  const detailId = currentDetailId();
  if (detailId) renderDetailView(detailId);
}

// 表示中なら差し替え、表示対象から外れたら消し、新たに対象になったら時系列の位置に差し込む
function patchTimelineItem(id) {
  const el = $(id);
  const tweet = findTweet(id);
  const visible = tweet && isVisibleInTimeline(tweet);
  if (el && visible) {
    el.outerHTML = buildTweetItemHtml(tweet);
  } else if (el) {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 150);
  } else if (visible) {
    const olderShown = tweets.slice(tweets.indexOf(tweet) + 1).find((tw) => $(tw.id));
    if (olderShown) {
      $(olderShown.id).insertAdjacentHTML("beforebegin", buildTweetItemHtml(tweet));
    } else {
      timelineStream.insertAdjacentHTML("beforeend", buildTweetItemHtml(tweet));
    }
  }
}

// 詳細画面：ポスト本体 → コメント → コメント入力 → このポストを引用した未来のポスト
function renderDetailView(tweetId) {
  const tweet = findTweet(tweetId);
  if (!tweet) {
    detailContent.innerHTML = `<div class="detail-missing"><a href="#" onclick="goHome()">←</a></div>`;
    return;
  }

  const id = tweet.id;
  const replyCount = tweet.replies.length;
  const quotingPosts = tweets.filter((tw) => tw.targetQuoteId === id);

  const isEditingPost = isEditing(id);

  detailContent.innerHTML = `
    <article class="detail-focus-card">
      <div class="detail-meta">${formatTimestamp(tweet.createdAt, true)}</div>
      ${isEditingPost ? buildEditBoxHtml() : `
        <div class="detail-text">${formatText(tweet.text)}</div>
        ${buildHistoryHtml(tweet)}
      `}
      ${buildQuotedCardHtml(tweet)}
      ${isEditingPost ? "" : `<div class="tweet-footer">${buildPostActionsHtml(id, true)}</div>`}
    </article>

    ${replyCount ? `<div class="detail-section-title">${ICONS.comment}<span>${replyCount}</span></div>` : ""}
    ${buildRepliesThreadHtml(tweet, true)}

    <section class="detail-composer">
      <textarea
        id="detail-reply-input"
        class="detail-composer-textarea"
        placeholder="${t("placeholder_comment")}"
        rows="2"
        oninput="handleDetailReplyInput(this, '${id}')"
        onkeydown="submitOnCmdEnter(event, () => addReply('${id}', 'detail-reply-input'))"
      ></textarea>
      <div class="detail-composer-bottom">
        <button id="detailPostBtn" class="btn-post" disabled onclick="addReply('${id}', 'detail-reply-input')">${t("btn_post")}</button>
      </div>
    </section>

    ${quotingPosts.length ? `
      <div class="detail-section-title">${ICONS.quote}<span>${quotingPosts.length}</span></div>
      <div class="detail-quote-children">
        ${quotingPosts.map((qp) => `
          <div class="quote-child-card" onclick="goToTweet('${qp.id}')">
            <div class="quote-child-meta">${formatTimestamp(qp.createdAt)}</div>
            <div class="quote-child-text">${escapeHtml(qp.text)}</div>
          </div>
        `).join("")}
      </div>
    ` : ""}
  `;

  const detailInput = $("detail-reply-input");
  if (detailInput) {
    detailInput.addEventListener("focus", () => {
      document.body.classList.add("keyboard-open");
      setTimeout(() => keepCaretVisible(detailInput), 300);
    });
    detailInput.addEventListener("blur", () => {
      document.body.classList.remove("keyboard-open");
    });
    try {
      const saved = localStorage.getItem(REPLY_DRAFT_PREFIX + id);
      if (saved) {
        detailInput.value = saved;
        handleDetailReplyInput(detailInput, id);
      }
    } catch (e) {}
  }
}

// -------------------------------------------------------------
// 起動
// -------------------------------------------------------------
async function init() {
  initTheme();
  applyTranslations();
  renderTodayDate();
  initInstallHint();

  composerInput.addEventListener("focus", () => {
    document.body.classList.add("keyboard-open");
    setTimeout(() => keepCaretVisible(composerInput), 300);
  });
  composerInput.addEventListener("blur", () => {
    document.body.classList.remove("keyboard-open");
  });

  // 何も保存されていない初回だけ案内用ポストを入れる（全部消した後の [] では復活させない）
  const stored = await loadTweets();
  tweets = normalizeTweets(stored ?? getDefaultTweets(LOCALE));
  save();

  renderTimeline();
  handleRouting();
  restoreComposerDraft();
  window.addEventListener("hashchange", handleRouting);

  // 日付をまたいで再開したら「今日」「昨日」の表示を描き直す
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && dayKey(new Date()) !== renderedDayKey) renderAll();
  });
}

// Service Worker（PWA オフライン起動）。init の await より前に登録しないと load を取り逃がす
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => console.warn("ServiceWorker registration failed:", err));
  });
}

init();
