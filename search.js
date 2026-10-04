// =============================================================
// botchitter — 検索 (search.js)
// =============================================================

let searchInputTimer = null;
let isSearchComposing = false; // 日本語の変換中は絞り込まない（確定で絞り込む）

function toggleSearch() {
  if (isSearchOpen && document.activeElement === searchInput) closeSearch();
  else openSearch();
}

function openSearch() {
  isSearchOpen = true;
  searchBar.classList.add("show");
  btnSearch.classList.add("active");
  if (parseRoute().view === "timeline") {
    searchInput.focus();
  } else {
    // 詳細・振り返りからはタイムラインに戻り、表示されてから（handleRouting の後に）フォーカスする
    window.addEventListener("hashchange", () => searchInput.focus(), { once: true });
    navigate({ tag: tagFilter, month: monthFilter, search: searchFilter });
  }
}

function closeSearch() {
  isSearchOpen = false;
  clearSearch();
}

function clearSearch() {
  searchInput.value = "";
  applySearch(null);
}

function applySearch(val) {
  const q = (val || "").trim() || null;
  if (q !== searchFilter) {
    searchFilter = q;
    renderTimeline();
    navigate({ tag: tagFilter, month: monthFilter, search: searchFilter, replace: true });
  }
  syncSearchUi();
}

function handleSearchCompositionStart() {
  isSearchComposing = true;
}

function handleSearchCompositionEnd() {
  isSearchComposing = false;
  applySearch(searchInput.value);
}

function handleSearchInput(val) {
  btnClearSearch.classList.toggle("show", !!val);
  if (isSearchComposing) return;
  clearTimeout(searchInputTimer);
  searchInputTimer = setTimeout(() => applySearch(val), 100);
}

function handleSearchKeydown(e) {
  if (e.key === "Enter") {
    if (e.isComposing || e.keyCode === 229 || isSearchComposing) return; // 変換確定の Enter
    e.preventDefault();
    clearTimeout(searchInputTimer);
    applySearch(searchInput.value);
    searchInput.blur();
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeSearch();
  }
}

// 検索バーの開閉・入力欄・✕ を searchFilter に合わせる（入力中は value を上書きしない：IME が壊れる）
function syncSearchUi() {
  const open = isSearchOpen || !!searchFilter;
  isSearchOpen = open;
  searchBar.classList.toggle("show", open);
  btnSearch.classList.toggle("active", open);
  if (document.activeElement !== searchInput) searchInput.value = searchFilter || "";
  btnClearSearch.classList.toggle("show", !!searchInput.value);
}

// 投稿が検索語に一致するか（本文・引用・コメント・リンク）
function matchesSearch(tweet, q) {
  if (!q) return true;
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;

  const haystack = [
    tweet.text,
    tweet.link?.title || "",
    tweet.link?.url || "",
    tweet.quoted?.text || "",
    ...(tweet.replies || []).map((r) => r.text),
    ...(tweet.history || []).map((h) => h.text)
  ].join(" ").toLowerCase();

  return terms.every((t) => haystack.includes(t));
}

// 検索キーワードの一致ハイライト（安全にエスケープした後に mark タグで包む）
function highlightSearch(text, query) {
  if (!query || !text) return escapeHtml(text);
  const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedSource = escapeHtml(text);
  return escapedSource.replace(
    new RegExp(escapedQuery, "gi"),
    (match) => `<mark class="search-highlight">${match}</mark>`
  );
}
