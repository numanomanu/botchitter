// =============================================================
// botchitter — 振り返り・草 (archive.js)
// =============================================================

function openArchive(tag = tagFilter) {
  closeMenu();
  navigate({ view: "archive", tag: tag || null });
}

function openMonth(month, day = null) {
  pendingScroll = day ? `${month}-${day}` : "top";
  navigate({ month, tag: parseRoute().tag });
}

// "YYYY-MM-DD" の日を、その月のタイムラインのその日の位置で開く
const openDay = (key) => openMonth(key.slice(0, 7), key.slice(8));

// 月の行のタップ。マスは小さいので、押した位置に一番近い日を選ぶ
function openHeatRow(event, month) {
  let nearest = null;
  for (const cell of event.currentTarget.querySelectorAll(".heat-day[data-day]")) {
    const rect = cell.getBoundingClientRect();
    const distance = Math.abs(event.clientX - (rect.left + rect.width / 2));
    if (!nearest || distance < nearest.distance) nearest = { day: cell.dataset.day, distance };
  }
  openMonth(month, nearest && nearest.distance < 12 ? nearest.day : null);
}

// その日（投稿がなければ、それより前で一番近い日）の最初のポストまでスクロールし、一瞬ハイライトする
function scrollToDay(key) {
  const items = [...timelineStream.querySelectorAll(".tweet-item")];
  const target = items.find((el) => dayKey(new Date(findTweet(el.id).createdAt)) <= key) || items[items.length - 1];
  if (!target) return;
  target.scrollIntoView({ block: "start" });
  requestAnimationFrame(() => requestAnimationFrame(() => target.scrollIntoView({ block: "start" })));
  target.classList.add("is-target");
  target.addEventListener("animationend", () => target.classList.remove("is-target"), { once: true });
}

// これ以上の件数の日は棒の高さが上限のまま、1件ずつの帯が細くなる
const BAR_MAX_POSTS = 6;

function renderArchive(tag) {
  const days = new Map(); // "YYYY-MM-DD" → その日のポスト（古い順）
  for (const tweet of [...tweets].reverse()) {
    if (tag && !matchesTag(tweet, tag)) continue;
    const key = dayKey(new Date(tweet.createdAt));
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(tweet);
  }

  const now = new Date();
  const firstYear = tweets.length ? new Date(Math.min(...tweets.map((tw) => tw.createdAt))).getFullYear() : now.getFullYear();
  const years = [];
  for (let year = now.getFullYear(); year >= firstYear; year--) years.push(buildHeatYearHtml(year, days, now));

  const chips = [[null, tweets.length], ...tagCounts()].map(([chipTag, count]) => `
    <button class="tag-chip ${chipTag === tag ? "is-active" : ""}" data-tag="${escapeHtml(chipTag || "")}" onclick="openArchive(this.dataset.tag)">
      ${chipTag ? `#${escapeHtml(chipTag)}` : t("archive_all")}<span class="tag-count">${count}</span>
    </button>
  `).join("");
  const swatches = [1, 2, 3, 4, 5].map((m) => `<span class="heat-swatch m${m}"></span>`).join("");

  archiveContent.innerHTML = `
    <div class="archive-tags">${chips}</div>
    ${buildRecentHtml(days, now)}
    <div class="archive-section-head">
      <b>${t("archive_past")}</b>
      <div class="heat-legend">
        ${t("mood_low")}${swatches}${t("mood_high")}
        <span class="heat-swatch no-mood"></span>${t("mood_none")}
      </div>
    </div>
    ${years.join("")}
  `;

  const activeChip = archiveContent.querySelector(".archive-tags .tag-chip.is-active");
  if (activeChip) {
    activeChip.scrollIntoView({ inline: "nearest", block: "nearest" });
  }
}

const RECENT_DAYS = 14;

// 直近2週間：大きめの棒を、日付と曜日付きで横一列に。上からポコポコ落ちてくるアニメーション
function buildRecentHtml(days, now) {
  let daysWritten = 0;
  let posts = 0;
  const columns = [];
  for (let i = RECENT_DAYS - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dayKey(date);
    const list = days.get(key) || [];
    if (list.length) {
      daysWritten++;
      posts += list.length;
    }
    // 左（14日前）から右（今日）へ順番にポコポコ落ちてくるディレイ（35ms刻み）
    const colIndex = RECENT_DAYS - 1 - i;
    const delay = colIndex * 35;
    columns.push(`
      <button class="recent-day ${i === 0 ? "is-today" : ""}" ${list.length ? `onclick="openDay('${key}')"` : "disabled"} title="${t("heat_cell_title", monthDayFormat.format(date), list.length)}">
        <span class="heat-day">${buildDayBarHtml(list.map((tw) => tw.mood), delay)}</span>
        <span class="recent-date">${date.getDate()}</span>
        <span class="recent-week">${weekdayFormat.format(date)}</span>
      </button>
    `);
  }
  return `
    <div class="archive-section-head">
      <b>${t("archive_recent")}</b>
      <span class="archive-summary">${t("archive_recent_summary", daysWritten, posts)}</span>
    </div>
    <div class="recent-strip">${columns.join("")}</div>
    ${buildMemoryCardHtml(days, now)}
  `;
}

// 1年前の今日（なければ1か月前の今日）に書いたものへの入口
function buildMemoryCardHtml(days, now) {
  const candidates = [
    [t("memory_year"), new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())],
    [t("memory_month"), new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())]
  ];
  for (const [label, date] of candidates) {
    if (date.getDate() !== now.getDate()) continue;
    const list = days.get(dayKey(date));
    if (!list) continue;
    return `
      <button class="memory-card" onclick="openDay('${dayKey(date)}')">
        <span class="memory-label">${label}・${t("count_posts", list.length)}</span>
        <span class="memory-text">${escapeHtml(list[0].text)}</span>
      </button>
    `;
  }
  return "";
}

// その日の棒：高さがポスト数、帯の色が1件ずつの気分（下から古い順）
function buildDayBarHtml(moods, delayMs = null) {
  if (!moods.length) return "";
  const height = (Math.min(moods.length, BAR_MAX_POSTS) / BAR_MAX_POSTS) * 100;
  const segments = moods.map((mood) => `<span class="${mood ? `m${mood}` : "no-mood"}"></span>`).join("");
  const animStyle = delayMs !== null ? `style="height: ${height}%; animation-delay: ${delayMs}ms;"` : `style="height: ${height}%"`;
  return `<span class="heat-bar ${moods.length > BAR_MAX_POSTS ? "is-dense" : ""}" ${animStyle}>${segments}</span>`;
}

function buildHeatYearHtml(year, days, now) {
  let yearTotal = 0;
  const rows = [];
  for (let month = 0; month < 12; month++) {
    const key = `${year}-${pad2(month + 1)}`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const isFutureMonth = new Date(year, month, 1) > now;
    let monthTotal = 0;
    const cells = [];
    for (let day = 1; day <= 31; day++) {
      if (day > daysInMonth) {
        cells.push(`<span class="heat-day is-void"></span>`);
        continue;
      }
      const date = new Date(year, month, day);
      const moods = (days.get(dayKey(date)) || []).map((tw) => tw.mood);
      monthTotal += moods.length;
      const classes = [date > now ? "is-future" : "", dayKey(date) === dayKey(now) ? "is-today" : ""].join(" ");
      cells.push(`<span class="heat-day ${classes}" data-day="${pad2(day)}" title="${t("heat_cell_title", monthDayFormat.format(date), moods.length)}">${buildDayBarHtml(moods)}</span>`);
    }
    yearTotal += monthTotal;
    const clickable = monthTotal > 0 && !isFutureMonth;
    rows.push(`
      <div class="heat-row ${clickable ? "is-clickable" : ""}" ${clickable ? `onclick="openHeatRow(event, '${key}')"` : ""}>
        <span class="heat-month">${monthLabelFormat.format(new Date(year, month, 1))}</span>
        ${cells.join("")}
        <span class="heat-count">${monthTotal || ""}</span>
      </div>
    `);
  }
  return `
    <section class="heat-year">
      <div class="heat-year-head">${year}<span class="tag-count">${yearTotal}</span></div>
      ${rows.join("")}
    </section>
  `;
}
