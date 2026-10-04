// =============================================================
// botchitter — 投稿・編集・コメント・タグ・気分 (compose.js)
// =============================================================

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

// -------------------------------------------------------------
// タグとリンク（本文中の #株 など）
// -------------------------------------------------------------
const TAG_PATTERN = /(^|[^\p{L}\p{N}_&\/:#＃])[#＃]([^\s#＃.,!?、。，．！？・「」『』（）()【】\[\]<>＜＞"'“”‘’:：;；\/\\]+)/gu;

// 全角・半角や大文字・小文字の違いは同じタグとして扱う
const normalizeTag = (raw) => raw.normalize("NFKC").toLowerCase();

// URL は ASCII 文字まで（日本語が直後に続いても含めない）
const URL_PATTERN = /https?:\/\/[^\s<>"'`\u0080-\uffff]+/g;

function trimUrl(url) {
  const trimmed = url.replace(/[.,!?;:]+$/, "");
  return trimmed.endsWith(")") && !trimmed.includes("(") ? trimmed.slice(0, -1) : trimmed;
}

// 本文を { type: "text" | "link" | "tag", text, value } に分ける
function* textTokens(text) {
  let last = 0;
  for (const m of text.matchAll(URL_PATTERN)) {
    const url = trimUrl(m[0]);
    yield* tagTokens(text.slice(last, m.index));
    yield { type: "link", text: url, value: url };
    last = m.index + url.length;
  }
  yield* tagTokens(text.slice(last));
}

function* tagTokens(segment) {
  let last = 0;
  for (const m of segment.matchAll(TAG_PATTERN)) {
    const tag = normalizeTag(m[2]);
    if (/^\d+$/.test(tag)) continue;
    const start = m.index + m[1].length;
    const end = start + 1 + m[2].length;
    yield { type: "text", text: segment.slice(last, start) };
    yield { type: "tag", text: segment.slice(start, end), value: tag };
    last = end;
  }
  yield { type: "text", text: segment.slice(last) };
}

const findTags = (text) => [...textTokens(text)].filter((tk) => tk.type === "tag").map((tk) => tk.value);
const findFirstUrl = (text) => [...textTokens(text)].find((tk) => tk.type === "link")?.value ?? null;

// ポストとそのコメントに出てくるタグ
const threadTags = (tweet) => [tweet, ...tweet.replies].flatMap((item) => findTags(item.text));
const matchesTag = (tweet, tag) => threadTags(tweet).includes(tag);

function openTag(event, tag) {
  event.stopPropagation();
  closeMenu();
  navigate({ tag });
}

// [[タグ, そのタグを含むポストの数], ...]（多い順）
function tagCounts() {
  const counts = new Map();
  for (const tweet of tweets) {
    for (const tag of new Set(threadTags(tweet))) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

// メニューのタグ一覧
function renderTagList() {
  const sorted = tagCounts();
  tagList.innerHTML = sorted.map(([tag, count]) => `
    <button class="tag-chip" data-tag="${escapeHtml(tag)}" onclick="openTag(event, this.dataset.tag)">#${escapeHtml(tag)}<span class="tag-count">${count}</span></button>
  `).join("");
  tagList.classList.toggle("show", sorted.length > 0);
}

// -------------------------------------------------------------
// 入力欄の #タグのハイライト
// -------------------------------------------------------------
const HIGHLIGHT_STYLE_PROPS = [
  "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"
];

function formatHighlight(text) {
  const html = [...textTokens(text)]
    .map((tk) => (tk.type === "tag" ? `<span class="tag-mark">${escapeHtml(tk.text)}</span>` : escapeHtml(tk.text)))
    .join("");
  return text.endsWith("\n") ? `${html} ` : html;
}

function syncHighlight(el) {
  const backdrop = el?.previousElementSibling;
  if (!backdrop?.classList.contains("highlight-backdrop")) return;
  const style = getComputedStyle(el);
  for (const prop of HIGHLIGHT_STYLE_PROPS) backdrop.style[prop] = style[prop];
  backdrop.innerHTML = formatHighlight(el.value);
  backdrop.scrollTop = el.scrollTop;
}

document.addEventListener("input", (e) => syncHighlight(e.target));
document.addEventListener("scroll", (e) => {
  const backdrop = e.target.previousElementSibling;
  if (backdrop?.classList.contains("highlight-backdrop")) backdrop.scrollTop = e.target.scrollTop;
}, true);

// -------------------------------------------------------------
// 気分（1 とても沈んでいる 〜 5 とても晴れやか）
// -------------------------------------------------------------
const isMood = (v) => Number.isInteger(v) && v >= 1 && v <= 5;

const FACE_FEATURES = {
  1: `<path class="face-eyes" d="M9 10h.01M15 10h.01"/><path d="M8 16.8c1-1.6 2.4-2.4 4-2.4s3 .8 4 2.4"/>`,
  2: `<path class="face-eyes" d="M9 10h.01M15 10h.01"/><path d="M8.6 16c.9-.9 2-1.3 3.4-1.3s2.5.4 3.4 1.3"/>`,
  3: `<path class="face-eyes" d="M9 10h.01M15 10h.01"/><path d="M8.6 15h6.8"/>`,
  4: `<path class="face-eyes" d="M9 10h.01M15 10h.01"/><path d="M8.6 14c.9.9 2 1.4 3.4 1.4s2.5-.5 3.4-1.4"/>`,
  5: `<path d="M7.8 10.2c.7-1 1.7-1 2.4 0M13.8 10.2c.7-1 1.7-1 2.4 0"/><path d="M7.6 13.4c1 1.9 2.5 2.9 4.4 2.9s3.4-1 4.4-2.9"/>`
};

const faceSvg = (mood) => `<svg viewBox="0 0 24 24" class="face"><circle class="face-bg" cx="12" cy="12" r="10"/>${FACE_FEATURES[mood]}</svg>`;

function moodControlHtml(id, selected, onPick) {
  const label = isMood(selected) ? t("mood_label", selected) : t("mood_add");
  return `
    <div class="mood-control" id="${id}">
      <button class="mood-trigger ${isMood(selected) ? `m${selected} is-set` : ""}" onclick="toggleMoodMenu('${id}')" aria-label="${label}" title="${label}">
        ${isMood(selected) ? faceSvg(selected) : ICONS.moodAdd}
      </button>
      <div class="mood-menu">
        ${[1, 2, 3, 4, 5].map((m) => `
          <button class="mood-option m${m} ${selected === m ? "is-selected" : ""}" onclick="${onPick}(${m})" aria-label="${t("mood_label", m)}" title="${t("mood_label", m)}">${faceSvg(m)}</button>
        `).join("")}
      </div>
    </div>
  `;
}

function toggleMoodMenu(id) {
  const willOpen = !$(id).classList.contains("open");
  closeMoodMenus();
  $(id).classList.toggle("open", willOpen);
}

const closeMoodMenus = () => document.querySelectorAll(".mood-control.open").forEach((el) => el.classList.remove("open"));

document.addEventListener("click", (e) => {
  if (!e.target.closest(".mood-control")) closeMoodMenus();
});

const renderComposerMood = () => {
  $("composerMoodSlot").innerHTML = moodControlHtml("composerMood", composerMood, "pickComposerMood");
};

function pickComposerMood(mood) {
  composerMood = composerMood === mood ? null : mood;
  renderComposerMood();
  saveComposerDraft();
}

function pickEditMood(mood) {
  editingTarget.mood = editingTarget.mood === mood ? null : mood;
  $("editMood").outerHTML = moodControlHtml("editMood", editingTarget.mood, "pickEditMood");
}

// -------------------------------------------------------------
// 下書き（一時保存）と入力処理
// -------------------------------------------------------------
function composerDraftText() {
  const value = composerInput.value;
  return autoTag && value === autoTag.prefix + autoTag.original ? autoTag.original : value;
}

function saveComposerDraft() {
  const text = composerDraftText();
  if (!text.trim() && !currentQuoteTarget && !composerMood) {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
    return;
  }
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      text,
      quote: currentQuoteTarget,
      mood: composerMood
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
    if (isMood(draft.mood)) composerMood = draft.mood;
    syncHighlight(composerInput);
    postBtn.disabled = !composerInput.value.trim();
  } catch (e) {}
}

function handleInput() {
  autoResizeTextarea(composerInput);
  postBtn.disabled = !composerDraftText().trim();
  saveComposerDraft();
}

function applyAutoTag(tag) {
  if (autoTag && composerInput.value === autoTag.prefix + autoTag.original) {
    composerInput.value = autoTag.original;
  }
  autoTag = null;
  if (tag && !findTags(composerInput.value).includes(tag)) {
    autoTag = { prefix: `#${tag} `, original: composerInput.value };
    composerInput.value = autoTag.prefix + autoTag.original;
  }
  syncHighlight(composerInput);
  handleInput();
}

function submitOnCmdEnter(event, submit) {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    submit();
  }
}

// -------------------------------------------------------------
// 引用・投稿
// -------------------------------------------------------------
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
  if (!composerDraftText().trim()) return;

  const now = Date.now();
  const quote = currentQuoteTarget;
  tweets.unshift({
    id: `tw-${now}`,
    createdAt: now,
    editedAt: null,
    text,
    history: [],
    link: null,
    mood: composerMood,
    targetQuoteId: quote ? quote.id : null,
    quoted: quote ? { createdAt: quote.createdAt, text: quote.text } : null,
    replies: []
  });
  save();
  requestPersistentStorage();

  composerInput.value = "";
  composerInput.style.height = "";
  composerMood = null;
  renderComposerMood();
  autoTag = null;
  syncHighlight(composerInput);
  clearComposerDraft();
  clearQuote();
  refresh(`tw-${now}`);

  const keepTag = tagFilter && matchesTag(tweets[0], tagFilter) ? tagFilter : null;
  if (!isVisibleInTimeline(tweets[0])) navigate({ tag: keepTag });
  if (keepTag) applyAutoTag(keepTag);
  attachLinkPreview(`tw-${now}`);
}

// -------------------------------------------------------------
// コメント（返信）
// -------------------------------------------------------------
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
    syncHighlight(input);
  }
}

function addReply(tweetId, inputId = `reply-input-${tweetId}`) {
  const tweet = findTweet(tweetId);
  const text = $(inputId)?.value.trim();
  if (!tweet || !text) return;

  const now = Date.now();
  tweet.replies.push({ id: `rep-${now}`, createdAt: now, editedAt: null, text, history: [], link: null });
  save();
  try {
    localStorage.removeItem(REPLY_DRAFT_PREFIX + tweetId);
  } catch (e) {}
  activeReplyBoxId = null;
  refresh(tweetId);
  attachLinkPreview(tweetId, `rep-${now}`);
}

// -------------------------------------------------------------
// 削除
// -------------------------------------------------------------
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
  editingTarget = { tweetId, replyId, text: item.text, mood: replyId ? null : item.mood };
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
  const { tweetId, replyId, mood } = editingTarget;
  const item = findItem(tweetId, replyId);
  const text = editingTarget.text.trim();
  if (!item || !text) return;

  editingTarget = null;
  let changed = false;
  if (text !== item.text) {
    item.history.push({ text: item.text, createdAt: item.editedAt || item.createdAt });
    item.text = text;
    item.editedAt = Date.now();
    changed = true;
  }
  if (!replyId && mood !== item.mood) {
    item.mood = mood;
    changed = true;
  }
  if (changed) save();
  refresh(tweetId);
  attachLinkPreview(tweetId, replyId);
}

function cancelEdit() {
  if (!editingTarget) return;
  const { tweetId } = editingTarget;
  editingTarget = null;
  renderDetailView(tweetId);
}

// -------------------------------------------------------------
// リンクのタイトル取得（URL 付きで投稿・編集した時に1回だけ）
// -------------------------------------------------------------
async function attachLinkPreview(tweetId, replyId = null) {
  const item = findItem(tweetId, replyId);
  const url = item && findFirstUrl(item.text);
  if (!item || (item.link?.url ?? null) === url) return;

  const link = url ? await fetchLinkPreview(url) : null;
  const current = findItem(tweetId, replyId);
  if (!current || findFirstUrl(current.text) !== url) return;
  current.link = link;
  save();
  refresh(tweetId);
}

async function fetchLinkPreview(url) {
  try {
    const res = await fetch(`api/ogp?url=${encodeURIComponent(url)}`, {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return normalizeLink({ url, title: data.title, siteName: data.siteName || new URL(url).hostname, image: data.image });
  } catch (err) {
    return null;
  }
}
