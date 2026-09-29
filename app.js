// =============================================================
// botchitter — 一人Twitter: アプリケーションロジック
// =============================================================

let tweets = [];
let currentQuoteTarget = null;
let activeReplyBoxId = null;
let isTimelineRendered = false;
let isTimelineDirty = false;
let isSavePending = false;
let confirmCallback = null;

// DOM要素
const composerInput = document.getElementById("composerInput");
const postBtn = document.getElementById("postBtn");
const quotePreview = document.getElementById("quotePreview");
const quotePreviewDate = document.getElementById("quotePreviewDate");
const quotePreviewText = document.getElementById("quotePreviewText");
const timelineStream = document.getElementById("timelineStream");

// -------------------------------------------------------------
// 多言語対応（i18n & ブラウザ言語自動判定）
// 文字で説明せず、直感とミニマリズムを徹底
// -------------------------------------------------------------
const I18N = {
  ja: {
    placeholder_default: "今日、何を感じた？",
    btn_post: "残す",
    btn_cancel: "キャンセル",
    btn_delete: "削除",
    confirm_delete: "削除しますか？",
    toast_copied: "コピーしました",
    theme_light_title: "ライトモード",
    theme_dark_title: "ダークモード"
  },
  en: {
    placeholder_default: "What did you feel today?",
    btn_post: "Post",
    btn_cancel: "Cancel",
    btn_delete: "Delete",
    confirm_delete: "Delete?",
    toast_copied: "Copied",
    theme_light_title: "Light mode",
    theme_dark_title: "Dark mode"
  }
};

function getLocale() {
  const navLang = (navigator.language || (navigator.languages && navigator.languages[0]) || "").toLowerCase();
  return navLang.startsWith("ja") ? "ja" : "en";
}

function t(key, ...args) {
  const locale = getLocale();
  const dict = I18N[locale] || I18N.en;
  const val = dict[key] !== undefined ? dict[key] : (I18N.ja[key] || "");
  if (typeof val === "function") {
    return val(...args);
  }
  return val;
}

function applyTranslations() {
  const locale = getLocale();
  document.documentElement.setAttribute("lang", locale);

  if (composerInput) {
    composerInput.placeholder = t("placeholder_default");
  }
  if (postBtn) {
    postBtn.textContent = t("btn_post");
  }
  const btnConfirmCancel = document.getElementById("btnConfirmCancel");
  if (btnConfirmCancel) {
    btnConfirmCancel.textContent = t("btn_cancel");
  }
  const btnConfirmDelete = document.getElementById("btnConfirmDelete");
  if (btnConfirmDelete) {
    btnConfirmDelete.textContent = t("btn_delete");
  }
}

// -------------------------------------------------------------
// テーマ管理（ライト／ダーク／OS連動）
// -------------------------------------------------------------
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initialTheme = saved || (prefersDark ? "dark" : "light");
  applyTheme(initialTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  const btn = document.getElementById("themeToggleBtn");
  if (!btn) return;
  if (theme === "dark") {
    btn.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
    btn.setAttribute("title", t("theme_light_title"));
  } else {
    btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    btn.setAttribute("title", t("theme_dark_title"));
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current === "dark" ? "light" : "dark");
}

// -------------------------------------------------------------
// IndexedDB & LocalStorage ハイブリッド永続化層
// -------------------------------------------------------------
const DB_NAME = "botchitter_db_v2";
const DB_VERSION = 1;
const STORE_NAME = "tweets_store";

function openDB() {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => {
      console.warn("IndexedDB open error, fallback to localStorage:", e);
      resolve(null);
    };
  });
}

async function loadFromDB() {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get("tweets");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

async function saveToDB(data) {
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(data, "tweets");
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

// 保存（IndexedDB に非同期保存しつつ、localStorage にもミラーリング）
function save() {
  if (isSavePending) return;
  isSavePending = true;
  queueMicrotask(async () => {
    try {
      await saveToDB(tweets);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tweets));
    } catch (err) {
      console.error("Storage save failed:", err);
    }
    isSavePending = false;
  });
}

function renderTodayDate() {
  const now = new Date();
  const locale = getLocale();
  const dateEl = document.getElementById("todayDateLabel");
  if (!dateEl) return;
  if (locale === "ja") {
    const options = { month: "long", day: "numeric", weekday: "short" };
    dateEl.textContent = new Intl.DateTimeFormat("ja-JP", options).format(now);
  } else {
    const options = { weekday: "short", month: "short", day: "numeric" };
    dateEl.textContent = new Intl.DateTimeFormat("en-US", options).format(now);
  }
}

// 時刻文字列（例: 20:30）
function formatCurrentTime(dateObj = new Date()) {
  const h = String(dateObj.getHours()).padStart(2, "0");
  const m = String(dateObj.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

// 日時表示ラベル（「今日」は入れず時間「20:30」のみ。過去日はそのまま）
function getDisplayDateLabel(dateLabel, createdAt) {
  if (!dateLabel) return "";
  if (dateLabel.startsWith("今日")) {
    const timePart = dateLabel.replace(/^今日\s*/, "").trim();
    if (timePart) return timePart;
    const d = createdAt ? new Date(createdAt) : new Date();
    return formatCurrentTime(d);
  }
  return dateLabel;
}

// -------------------------------------------------------------
// ルーティング（パーマリンク対応 & ビューキャッシュ）
// -------------------------------------------------------------
function handleRouting() {
  const hash = window.location.hash;
  const viewTimeline = document.getElementById("viewTimeline");
  const viewDetail = document.getElementById("viewDetail");
  const btnBack = document.getElementById("btnBack");

  if (hash.startsWith("#tweet-")) {
    const tweetId = hash.replace("#tweet-", "");
    viewTimeline.classList.add("hidden");
    viewDetail.classList.add("active");
    btnBack.classList.add("show");
    renderDetailView(tweetId);
  } else {
    viewTimeline.classList.remove("hidden");
    viewDetail.classList.remove("active");
    btnBack.classList.remove("show");
    if (!isTimelineRendered || isTimelineDirty) {
      renderTimeline();
    }
  }
}

function goHome() {
  window.location.hash = "";
}

function goToTweet(tweetId) {
  window.location.hash = `#tweet-${tweetId}`;
}

// -------------------------------------------------------------
// 投稿・引用
// -------------------------------------------------------------
function handleInput() {
  postBtn.disabled = !composerInput.value.trim();
}

// ポストの引用
function quoteTweet(tweetId) {
  const target = tweets.find(t => t.id === tweetId);
  if (!target) return;

  const displayDate = getDisplayDateLabel(target.dateLabel, target.createdAt);
  currentQuoteTarget = {
    id: target.id,
    dateLabel: displayDate,
    text: target.text,
    isReply: false
  };

  if (quotePreviewDate) quotePreviewDate.textContent = displayDate;
  quotePreviewText.textContent = target.text;
  quotePreview.classList.add("active");

  if (window.location.hash) {
    goHome();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
  composerInput.focus();
  handleInput();
}

// コメント（返信）の引用（スレッド奥の思考をタイムライン最前線に引き上げる）
function quoteReply(tweetId, replyId, event) {
  if (event) event.stopPropagation();
  const targetTweet = tweets.find(t => t.id === tweetId);
  if (!targetTweet || !targetTweet.replies) return;
  const targetReply = targetTweet.replies.find(r => r.id === replyId);
  if (!targetReply) return;

  const replyDate = getDisplayDateLabel(targetReply.dateLabel, targetReply.createdAt);
  currentQuoteTarget = {
    id: targetTweet.id,
    replyId: targetReply.id,
    dateLabel: replyDate,
    text: targetReply.text,
    isReply: true
  };

  if (quotePreviewDate) quotePreviewDate.textContent = replyDate;
  quotePreviewText.textContent = targetReply.text;
  quotePreview.classList.add("active");

  if (window.location.hash) {
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

// 投稿（O(1)の差分DOM挿入で瞬時にタイムライン最上部へ反映）
function publishTweet() {
  const text = composerInput.value.trim();
  if (!text) return;

  const now = new Date();
  const timeLabel = formatCurrentTime(now);

  const newTweet = {
    id: "tw-" + now.getTime(),
    dateLabel: timeLabel,
    createdAt: now.getTime(),
    isToday: true,
    text: text,
    targetQuoteId: currentQuoteTarget ? currentQuoteTarget.id : null,
    quoted: currentQuoteTarget ? {
      dateLabel: currentQuoteTarget.dateLabel,
      text: currentQuoteTarget.text
    } : null,
    replies: []
  };

  tweets.unshift(newTweet);
  save();

  composerInput.value = "";
  clearQuote();
  handleInput();

  const isTimelineView = !window.location.hash.startsWith("#tweet-");
  if (isTimelineView && timelineStream) {
    timelineStream.insertAdjacentHTML("afterbegin", buildTweetItemHtml(newTweet));
  } else {
    isTimelineDirty = true;
  }
}

// テキストエリア自動リサイズ
function autoResizeTextarea(el) {
  window.requestAnimationFrame(() => {
    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, 160);
    el.style.height = newHeight + "px";
  });
}

function handleReplyKeydown(event, tweetId, inputElementId) {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    addReply(tweetId, inputElementId);
  }
}

// コメント入力欄のトグル
function toggleReplyBox(tweetId) {
  const box = document.getElementById(`reply-box-${tweetId}`);
  if (!box) return;
  const isOpen = box.classList.toggle("open");
  activeReplyBoxId = isOpen ? tweetId : null;
  if (isOpen) {
    const inputEl = document.getElementById(`reply-input-${tweetId}`);
    if (inputEl) {
      inputEl.focus();
      autoResizeTextarea(inputEl);
    }
  }
}

// コメント追加
function addReply(tweetId, inputElementId) {
  const inputEl = document.getElementById(inputElementId || `reply-input-${tweetId}`);
  if (!inputEl) return;
  const text = inputEl.value.trim();
  if (!text) return;

  const targetTweet = tweets.find(t => t.id === tweetId);
  if (!targetTweet) return;

  if (!targetTweet.replies) targetTweet.replies = [];

  const now = new Date();
  const newReply = {
    id: "rep-" + now.getTime(),
    dateLabel: formatCurrentTime(now),
    createdAt: now.getTime(),
    text: text
  };
  targetTweet.replies.push(newReply);
  save();

  inputEl.value = "";
  inputEl.style.height = "auto";

  if (window.location.hash.startsWith("#tweet-")) {
    isTimelineDirty = true;
    renderDetailView(tweetId);
    return;
  }

  const thread = document.getElementById(`replies-thread-${tweetId}`);
  if (thread) {
    thread.style.display = "flex";
    thread.insertAdjacentHTML("beforeend", buildReplyItemHtml(newReply, tweetId));
  }

  // ボタンのカウント表記更新（数字のみ表示、0件時は非表示）
  const countLabel = document.getElementById(`reply-btn-label-${tweetId}`);
  if (countLabel) {
    countLabel.textContent = targetTweet.replies.length > 0 ? targetTweet.replies.length : "";
  }

  const box = document.getElementById(`reply-box-${tweetId}`);
  if (box) box.classList.remove("open");
  activeReplyBoxId = null;
}

// -------------------------------------------------------------
// 削除確認モーダル制御
// -------------------------------------------------------------
function askConfirmation(onConfirm) {
  const overlay = document.getElementById("confirmOverlay");
  const title = document.getElementById("confirmTitle");
  const deleteBtn = document.getElementById("btnConfirmDelete");

  title.textContent = t("confirm_delete");
  confirmCallback = onConfirm;

  overlay.classList.add("open");

  deleteBtn.onclick = function() {
    const cb = confirmCallback;
    closeConfirm();
    if (cb) cb();
  };
}

function closeConfirm() {
  const overlay = document.getElementById("confirmOverlay");
  overlay.classList.remove("open");
  confirmCallback = null;
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeConfirm();
});

// コメント削除
function deleteReply(tweetId, replyId, event) {
  if (event) event.stopPropagation();
  askConfirmation(() => {
    const targetTweet = tweets.find(t => t.id === tweetId);
    if (!targetTweet || !targetTweet.replies) return;

    targetTweet.replies = targetTweet.replies.filter(r => r.id !== replyId);
    save();

    if (window.location.hash.startsWith("#tweet-")) {
      isTimelineDirty = true;
      renderDetailView(tweetId);
    } else {
      const repEl = document.getElementById(replyId);
      if (repEl) repEl.remove();

      const thread = document.getElementById(`replies-thread-${tweetId}`);
      if (thread && targetTweet.replies.length === 0) {
        thread.style.display = "none";
      }

      const countLabel = document.getElementById(`reply-btn-label-${tweetId}`);
      if (countLabel) {
        countLabel.textContent = targetTweet.replies.length > 0 ? targetTweet.replies.length : "";
      }
    }
  });
}

// ポスト削除
function deleteTweet(tweetId, event) {
  if (event) event.stopPropagation();
  askConfirmation(() => {
    tweets = tweets.filter(t => t.id !== tweetId);
    save();
    if (window.location.hash === `#tweet-${tweetId}`) {
      isTimelineDirty = true;
      goHome();
    } else {
      const item = document.getElementById(tweetId);
      if (item) {
        item.style.transition = "opacity 0.15s ease, transform 0.15s ease";
        item.style.opacity = "0";
        item.style.transform = "scale(0.96)";
        setTimeout(() => item.remove(), 150);
      } else {
        renderTimeline();
      }
    }
  });
}

// -------------------------------------------------------------
// Web Share API & フォールバック
// -------------------------------------------------------------
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}

// ポストの共有
async function shareTweet(tweetId, event) {
  if (event) event.stopPropagation();
  const tweet = tweets.find(t => t.id === tweetId);
  if (!tweet) return;

  let shareText = tweet.text;
  if (tweet.quoted && tweet.quoted.text) {
    shareText += `\n\n> ${tweet.quoted.text}`;
  }

  if (navigator.share) {
    try {
      await navigator.share({ text: shareText });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(shareText);
      showToast(t("toast_copied"));
      return;
    }
  } catch (clipErr) {}

  const xIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
  window.open(xIntentUrl, "_blank", "noopener,noreferrer");
}

// コメント（返信）の共有
async function shareReply(tweetId, replyId, event) {
  if (event) event.stopPropagation();
  const targetTweet = tweets.find(t => t.id === tweetId);
  if (!targetTweet || !targetTweet.replies) return;
  const rep = targetTweet.replies.find(r => r.id === replyId);
  if (!rep) return;

  let shareText = rep.text;

  if (navigator.share) {
    try {
      await navigator.share({ text: shareText });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(shareText);
      showToast(t("toast_copied"));
      return;
    }
  } catch (clipErr) {}

  const xIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
  window.open(xIntentUrl, "_blank", "noopener,noreferrer");
}

// -------------------------------------------------------------
// HTMLジェネレーター（文字のない直感UI）
// -------------------------------------------------------------
function buildReplyItemHtml(rep, tweetId) {
  const displayDate = escapeHtml(getDisplayDateLabel(rep.dateLabel, rep.createdAt));
  return `
    <div class="reply-item" id="${rep.id}">
      <div class="reply-meta">
        <span>${displayDate}</span>
        <div class="reply-actions">
          <button class="reply-action-btn" onclick="shareReply('${tweetId}', '${rep.id}', event)" aria-label="Share">
            <svg viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          </button>
          <button class="reply-action-btn" onclick="quoteReply('${tweetId}', '${rep.id}', event)" aria-label="Quote">
            <svg viewBox="0 0 24 24"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          </button>
          <button class="reply-action-btn delete-btn" onclick="deleteReply('${tweetId}', '${rep.id}', event)" aria-label="Delete">
            <svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
      <div class="reply-text">${escapeHtml(rep.text)}</div>
    </div>
  `;
}

function buildTweetItemHtml(tweet) {
  const repliesList = tweet.replies || [];
  const isReplyOpen = activeReplyBoxId === tweet.id;

  let quotedRepliesCount = 0;
  if (tweet.targetQuoteId) {
    const original = tweets.find(t => t.id === tweet.targetQuoteId);
    if (original && original.replies) {
      quotedRepliesCount = original.replies.length;
    }
  }

  const repliesHtml = `
    <div class="replies-thread" id="replies-thread-${tweet.id}" style="${repliesList.length > 0 ? '' : 'display:none;'}">
      ${repliesList.map(rep => buildReplyItemHtml(rep, tweet.id)).join("")}
    </div>
  `;

  return `
    <article class="tweet-item ${tweet.isToday ? 'is-today' : ''}" id="${tweet.id}">
      <div class="tweet-header">
        <span class="tweet-date-link" onclick="goToTweet('${tweet.id}')">${escapeHtml(getDisplayDateLabel(tweet.dateLabel, tweet.createdAt))}</span>
      </div>

      <div class="tweet-content" onclick="goToTweet('${tweet.id}')">${escapeHtml(tweet.text)}</div>

      <!-- 引用カード（文字ラベルなし・日付とアイコンのみ） -->
      ${tweet.quoted ? `
        <div class="quoted-card" onclick="${tweet.targetQuoteId ? `goToTweet('${tweet.targetQuoteId}')` : ''}">
          <div class="quoted-card-header">
            <span class="quoted-card-date">
              <svg viewBox="0 0 24 24" class="quoted-card-icon"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
              ${escapeHtml(getDisplayDateLabel(tweet.quoted.dateLabel))}
            </span>
            ${quotedRepliesCount > 0 ? `<span class="quoted-card-comments-badge"><svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>${quotedRepliesCount}</span>` : ''}
          </div>
          <div class="quoted-card-body">${escapeHtml(tweet.quoted.text)}</div>
        </div>
      ` : ''}

      <!-- スレッド一覧 -->
      ${repliesHtml}

      <!-- コメント入力（プレースホルダー「…」、送信アイコンボタン） -->
      <div class="reply-input-box ${isReplyOpen ? 'open' : ''}" id="reply-box-${tweet.id}">
        <textarea
          id="reply-input-${tweet.id}"
          class="reply-input"
          placeholder="…"
          rows="1"
          oninput="autoResizeTextarea(this)"
          onkeydown="handleReplyKeydown(event, '${tweet.id}')"
        ></textarea>
        <button class="btn-submit-reply" onclick="addReply('${tweet.id}')" aria-label="Send">
          <svg viewBox="0 0 24 24"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
        </button>
      </div>

      <!-- アクション（アイコン＋件数数字のみの極めてクリーンなUI） -->
      <div class="tweet-footer">
        <button class="action-btn" onclick="toggleReplyBox('${tweet.id}')" aria-label="Reply">
          <svg viewBox="0 0 24 24">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
          <span class="action-count" id="reply-btn-label-${tweet.id}">${repliesList.length > 0 ? repliesList.length : ''}</span>
        </button>
        <button class="action-btn" onclick="quoteTweet('${tweet.id}')" aria-label="Quote">
          <svg viewBox="0 0 24 24">
            <path d="M17 1l4 4-4 4"/>
            <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
            <path d="M7 23l-4-4 4-4"/>
            <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          </svg>
        </button>
        <button class="action-btn" onclick="shareTweet('${tweet.id}', event)" aria-label="Share">
          <svg viewBox="0 0 24 24">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
        </button>
        <button class="action-btn delete-btn" onclick="deleteTweet('${tweet.id}', event)" aria-label="Delete">
          <svg viewBox="0 0 24 24">
            <path d="M3 6h18"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </article>
  `;
}

// -------------------------------------------------------------
// タイムライン描画（一括生成）
// -------------------------------------------------------------
function renderTimeline() {
  timelineStream.innerHTML = tweets.map(buildTweetItemHtml).join("");
  isTimelineRendered = true;
  isTimelineDirty = false;
}

// -------------------------------------------------------------
// 詳細画面のレンダリング（パーマリンク先）
// -------------------------------------------------------------
function renderDetailView(tweetId) {
  const detailContainer = document.getElementById("detailContent");
  const tweet = tweets.find(t => t.id === tweetId);

  if (!tweet) {
    detailContainer.innerHTML = `<div style="padding:40px 0; color:var(--text-tertiary);"><a href="#" onclick="goHome()">←</a></div>`;
    return;
  }

  const repliesList = tweet.replies || [];
  const quotingPosts = tweets.filter(t => t.targetQuoteId === tweet.id);

  const repliesHtml = repliesList.length > 0 ? `
    <div class="replies-thread" style="margin-bottom: 24px;">
      ${repliesList.map(rep => buildReplyItemHtml(rep, tweet.id)).join("")}
    </div>
  ` : "";

  const quotesHtml = quotingPosts.length > 0 ? `
    <div class="detail-section-title">
      <svg viewBox="0 0 24 24" class="section-title-icon"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
      <span>${quotingPosts.length}</span>
    </div>
    <div class="detail-quote-children">
      ${quotingPosts.map(qp => `
        <div class="quote-child-card" onclick="goToTweet('${qp.id}')">
          <div class="quote-child-meta">${escapeHtml(getDisplayDateLabel(qp.dateLabel, qp.createdAt))}</div>
          <div class="quote-child-text">${escapeHtml(qp.text)}</div>
        </div>
      `).join("")}
    </div>
  ` : "";

  detailContainer.innerHTML = `
    <article class="detail-focus-card">
      <div class="detail-meta">${escapeHtml(getDisplayDateLabel(tweet.dateLabel, tweet.createdAt))}</div>
      <div class="detail-text">${escapeHtml(tweet.text)}</div>

      ${tweet.quoted ? `
        <div class="quoted-card" onclick="${tweet.targetQuoteId ? `goToTweet('${tweet.targetQuoteId}')` : ''}" style="margin-bottom: 16px;">
          <div class="quoted-card-header">
            <span class="quoted-card-date">
              <svg viewBox="0 0 24 24" class="quoted-card-icon"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
              ${escapeHtml(getDisplayDateLabel(tweet.quoted.dateLabel))}
            </span>
          </div>
          <div class="quoted-card-body">${escapeHtml(tweet.quoted.text)}</div>
        </div>
      ` : ''}

      <div class="tweet-footer" style="margin-top: 10px;">
        <button class="action-btn" onclick="quoteTweet('${tweet.id}')" aria-label="Quote">
          <svg viewBox="0 0 24 24"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        </button>
        <button class="action-btn" onclick="shareTweet('${tweet.id}', event)" aria-label="Share">
          <svg viewBox="0 0 24 24">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
        </button>
        <button class="action-btn delete-btn" onclick="deleteTweet('${tweet.id}', event)" aria-label="Delete">
          <svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </article>

    ${repliesList.length > 0 ? `
      <div class="detail-section-title">
        <svg viewBox="0 0 24 24" class="section-title-icon"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        <span>${repliesList.length}</span>
      </div>
      ${repliesHtml}
    ` : ""}

    <!-- コメント入力 -->
    <div style="display:flex; gap:8px; align-items:flex-end; margin-bottom: 28px;">
      <textarea
        id="detail-reply-input"
        class="reply-input"
        placeholder="…"
        rows="1"
        oninput="autoResizeTextarea(this)"
        onkeydown="handleReplyKeydown(event, '${tweet.id}', 'detail-reply-input')"
      ></textarea>
      <button class="btn-submit-reply" onclick="addReply('${tweet.id}', 'detail-reply-input')" aria-label="Send">
        <svg viewBox="0 0 24 24"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
      </button>
    </div>

    ${quotesHtml}
  `;
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 初期ロード（IndexedDB -> localStorage -> DEFAULT_TWEETS の順で優先読み込み）
async function init() {
  initTheme();
  applyTranslations();

  let loaded = null;
  try {
    loaded = await loadFromDB();
  } catch (e) {
    console.warn("IndexedDB load error, fallback to localStorage", e);
  }

  if (!loaded || !loaded.length) {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        loaded = JSON.parse(raw);
        if (loaded && loaded.length) {
          saveToDB(loaded);
        }
      } catch (e) {}
    }
  }

  // どちらにもデータが無ければブラウザ言語に合わせた初期シードデータを採用
  if (loaded && loaded.length) {
    tweets = loaded;
  } else {
    tweets = JSON.parse(JSON.stringify(getDefaultTweets(getLocale())));
    save();
  }

  renderTodayDate();
  handleRouting();
  window.addEventListener("hashchange", handleRouting);

  // Service Worker 登録（PWA オフライン起動）
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((err) => {
        console.warn("ServiceWorker registration failed:", err);
      });
    });
  }
}

// 起動
init();
