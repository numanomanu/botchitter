// =============================================================
// botchitter — タイムライン・HTMLジェネレーター (timeline.js)
// =============================================================

// 作成直後（新規投稿・新規コメント）の要素だけフェードインさせる
const enterClass = (createdAt) => (Date.now() - createdAt < 2000 ? "enter" : "");
document.addEventListener("animationend", (e) => e.target.classList.remove("enter"));

// 投稿の日付の横の小さな顔
const buildMoodMarkHtml = (tweet) =>
  tweet.mood ? `<span class="mood-mark m${tweet.mood}" title="${t("mood_label", tweet.mood)}">${faceSvg(tweet.mood)}</span>` : "";

// タイムラインでは日付の横に小さな印だけ出す（履歴は詳細画面で見る）
const buildEditedMarkHtml = (item) =>
  item.editedAt ? `<span class="edited-mark" title="${t("edited")}">${ICONS.edit}</span>` : "";

// 表示用に短くする（https:// と www. を省き、長ければ末尾を切る）
function displayUrl(url) {
  const short = url.replace(/^https?:\/\/(www\.)?/, "");
  return short.length > 40 ? `${short.slice(0, 39)}…` : short;
}

// 本文を HTML にする。#タグはタップで絞り込み、URL はリンク、検索語はハイライト
function formatText(text) {
  return [...textTokens(text)].map((tk) => {
    if (tk.type === "tag") {
      return `<span class="tag" data-tag="${escapeHtml(tk.value)}" onclick="openTag(event, this.dataset.tag)">${highlightSearch(tk.text, searchFilter)}</span>`;
    }
    if (tk.type === "link") {
      return `<a class="link" href="${escapeHtml(tk.value)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${highlightSearch(displayUrl(tk.value), searchFilter)}</a>`;
    }
    return highlightSearch(tk.text, searchFilter);
  }).join("");
}

// リンクカード（タイトルとサイト名だけ）
function buildLinkCardHtml(item) {
  if (!item.link) return "";
  return `
    <a class="link-card" href="${escapeHtml(item.link.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">
      <div class="link-card-title">${highlightSearch(item.link.title, searchFilter)}</div>
      <div class="link-card-site">${escapeHtml(item.link.siteName)}</div>
    </a>
  `;
}

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
      <div class="highlight-field">
        <div class="highlight-backdrop" aria-hidden="true"></div>
        <textarea
          id="edit-input"
          class="detail-composer-textarea"
          rows="2"
          oninput="handleEditInput(this)"
          onkeydown="submitOnCmdEnter(event, saveEdit)"
        >${escapeHtml(editingTarget.text)}</textarea>
      </div>
      <div class="edit-actions">
        ${editingTarget.replyId ? "" : moodControlHtml("editMood", editingTarget.mood, "pickEditMood")}
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
      ${buildLinkCardHtml(rep)}
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
        <span class="tweet-date-link" onclick="goToTweet('${id}')">${formatTimestamp(tweet.createdAt)}${buildMoodMarkHtml(tweet)}${buildEditedMarkHtml(tweet)}</span>
      </div>
      <div class="tweet-content" onclick="goToTweet('${id}')">${formatText(tweet.text)}</div>
      ${buildLinkCardHtml(tweet)}
      ${buildQuotedCardHtml(tweet)}
      ${buildRepliesThreadHtml(tweet)}
      <div class="reply-input-box ${activeReplyBoxId === id ? "open" : ""}" id="reply-box-${id}">
        <div class="highlight-field">
          <div class="highlight-backdrop" aria-hidden="true"></div>
          <textarea
            id="reply-input-${id}"
            class="reply-input"
            placeholder="…"
            rows="1"
            oninput="handleTimelineReplyInput(this, '${id}')"
            onkeydown="submitOnCmdEnter(event, () => addReply('${id}'))"
          ></textarea>
        </div>
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
// タイムライン描画
// -------------------------------------------------------------
function isVisibleInTimeline(tweet) {
  return (
    (!monthFilter || monthKey(new Date(tweet.createdAt)) === monthFilter) &&
    (!tagFilter || matchesTag(tweet, tagFilter)) &&
    (!searchFilter || matchesSearch(tweet, searchFilter))
  );
}

// 絞り込み中の条件（月・タグ・検索）を、それぞれ ✕ で外せるチップで出す
function updateFilterBar() {
  filterBar.classList.toggle("show", !!(tagFilter || monthFilter || searchFilter));
  if (!tagFilter && !monthFilter && !searchFilter) return;
  filterBar.innerHTML = `
    ${monthFilter ? `<button class="filter-chip" onclick="removeFilter('month')">${formatMonth(monthFilter)}<span class="filter-chip-x">✕</span></button>` : ""}
    ${tagFilter ? `<button class="filter-chip is-tag" onclick="removeFilter('tag')">#${escapeHtml(tagFilter)}<span class="filter-chip-x">✕</span></button>` : ""}
    ${searchFilter ? `<button class="filter-chip is-search" onclick="removeFilter('search')">"${escapeHtml(searchFilter)}"<span class="filter-chip-x">✕</span></button>` : ""}
    <span class="tag-count">${tweets.filter(isVisibleInTimeline).length}</span>
  `;
}

function renderTimeline() {
  const visible = tweets.filter(isVisibleInTimeline);
  timelineStream.innerHTML = visible.length || !searchFilter
    ? visible.map(buildTweetItemHtml).join("")
    : `
      <div class="timeline-empty-state">
        <div class="empty-state-text">${t("search_empty")}</div>
        <button class="btn-clear-empty" onclick="clearSearch()">${t("btn_clear_search")}</button>
      </div>
    `;
  syncDayDividers();
  updateFilterBar();
  renderedDayKey = dayKey(new Date());
}

// 日付の区切りを、表示中のポストの並びから付け直す
function syncDayDividers() {
  timelineStream.querySelectorAll(".timeline-day-divider").forEach((el) => el.remove());
  let lastDay = null;
  for (const el of timelineStream.querySelectorAll(".tweet-item:not(.leaving)")) {
    const tweet = findTweet(el.id);
    if (!tweet) continue;
    const date = new Date(tweet.createdAt);
    if (dayKey(date) === lastDay) continue;
    lastDay = dayKey(date);
    el.insertAdjacentHTML("beforebegin", `<div class="timeline-day-divider"><span>${formatDateDivider(date)}</span></div>`);
  }
}

function renderAll() {
  renderTodayDate();
  renderTimeline();
  const detailId = currentDetailId();
  if (detailId) renderDetailView(detailId);
  renderTagList();
}

// 状態を変えた後に呼ぶ唯一の描画入口
function refresh(tweetId) {
  const quotingIds = tweets.filter((tw) => tw.targetQuoteId === tweetId).map((tw) => tw.id);
  for (const id of [tweetId, ...quotingIds]) patchTimelineItem(id);
  syncDayDividers();
  updateFilterBar();
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
    setTimeout(() => {
      el.remove();
      syncDayDividers();
    }, 150);
  } else if (visible) {
    const olderShown = tweets.slice(tweets.indexOf(tweet) + 1).find((tw) => $(tw.id));
    if (olderShown) {
      $(olderShown.id).insertAdjacentHTML("beforebegin", buildTweetItemHtml(tweet));
    } else {
      timelineStream.insertAdjacentHTML("beforeend", buildTweetItemHtml(tweet));
    }
  }
}
