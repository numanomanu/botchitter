// =============================================================
// botchitter — 詳細画面 (detail.js)
// =============================================================

function goToTweet(tweetId) {
  window.location.hash = `#tweet-${tweetId}`;
}

// 詳細画面：ポスト本体 → コメント → コメント入力 → このポストを引用した未来のポスト → 前 / 次
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
  const curIdx = tweets.findIndex((tw) => tw.id === id);
  const newerTweet = curIdx > 0 ? tweets[curIdx - 1] : null;
  const olderTweet = curIdx !== -1 && curIdx < tweets.length - 1 ? tweets[curIdx + 1] : null;

  detailContent.innerHTML = `
    <article class="detail-focus-card">
      <div class="detail-meta">${formatTimestamp(tweet.createdAt, true)}${buildMoodMarkHtml(tweet)}</div>
      ${isEditingPost ? buildEditBoxHtml() : `
        <div class="detail-text">${formatText(tweet.text)}</div>
        ${buildLinkCardHtml(tweet)}
        ${buildHistoryHtml(tweet)}
      `}
      ${buildQuotedCardHtml(tweet)}
      ${isEditingPost ? "" : `<div class="tweet-footer">${buildPostActionsHtml(id, true)}</div>`}
    </article>

    ${replyCount ? `<div class="detail-section-title">${ICONS.comment}<span>${replyCount}</span></div>` : ""}
    ${buildRepliesThreadHtml(tweet, true)}

    <section class="detail-composer">
      <div class="highlight-field">
        <div class="highlight-backdrop" aria-hidden="true"></div>
        <textarea
          id="detail-reply-input"
          class="detail-composer-textarea"
          placeholder="${t("placeholder_comment")}"
          rows="2"
          oninput="handleDetailReplyInput(this, '${id}')"
          onkeydown="submitOnCmdEnter(event, () => addReply('${id}', 'detail-reply-input'))"
        ></textarea>
      </div>
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

    <nav class="detail-nav" aria-label="Post navigation">
      ${olderTweet ? `
        <button class="btn-detail-nav prev" onclick="goToTweet('${olderTweet.id}')" title="${t("nav_prev")}">
          ${ICONS.arrowLeft}<span>${t("nav_prev")}</span>
        </button>
      ` : `<span class="detail-nav-placeholder"></span>`}
      ${newerTweet ? `
        <button class="btn-detail-nav next" onclick="goToTweet('${newerTweet.id}')" title="${t("nav_next")}">
          <span>${t("nav_next")}</span>${ICONS.arrowRight}
        </button>
      ` : `<span class="detail-nav-placeholder"></span>`}
    </nav>
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
  detailContent.querySelectorAll("textarea").forEach(syncHighlight);
}
