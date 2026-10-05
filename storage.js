// =============================================================
// botchitter — 永続化・マイグレーション・バックアップ (storage.js)
// =============================================================

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
      // localStorage は容量上限（約5MB）があるため、容量超過時は直近の最新データのみを保存
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tweets));
      } catch (err) {
        try {
          const recentFallback = tweets.slice(0, 50);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(recentFallback));
        } catch (fallbackErr) {
          // IndexedDB に保存できているため、localStorage の容量超過は許容して継続
        }
      }
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
const isHttpUrl = (v) => typeof v === "string" && /^https?:\/\//i.test(v);

// href に入れるので http/https 以外の URL は捨てる
function normalizeLink(link) {
  if (!link || !isHttpUrl(link.url) || typeof link.title !== "string") return null;
  return {
    url: link.url,
    title: link.title.slice(0, 200),
    siteName: typeof link.siteName === "string" ? link.siteName.slice(0, 100) : "",
    image: isHttpUrl(link.image) ? link.image : null
  };
}

function normalizeEntry(item) {
  const history = (Array.isArray(item.history) ? item.history : [])
    .filter((v) => typeof v?.text === "string" && Number.isFinite(v.createdAt))
    .map((v) => ({ text: v.text, createdAt: v.createdAt }));
  const createdAt = toTimestamp(item);
  const editedAt = Number.isFinite(item.editedAt) ? item.editedAt : null;
  return {
    id: item.id,
    createdAt,
    editedAt,
    // 最後に変えた時刻（同期で新しい方を選ぶ）。旧形式には無いので作成・編集の新しい方で補う
    updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : Math.max(createdAt, editedAt || 0),
    text: item.text,
    history,
    link: normalizeLink(item.link)
  };
}

function normalizeTweets(raw) {
  if (!Array.isArray(raw)) return [];
  const list = raw
    .filter((tw) => tw && isValidId(tw.id) && typeof tw.text === "string")
    .map((tw) => ({
      ...normalizeEntry(tw),
      mood: isMood(tw.mood) ? tw.mood : null,
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

// 読み込み・同期で受け取ったポストを混ぜる。変わった件数を返す
//   ・ポスト・コメントごとに updatedAt が新しい方を採用する（負けた方の文は編集履歴に残し、消さない）
//   ・deletedIds（相手が前回送ってから消したもの）は消す
//   ・こちらで消してまだ送っていないもの（loadSyncState().deleted）は、相手から来ても戻さない
function mergeTweets(incoming, deletedIds = []) {
  const deletedHere = new Set(loadSyncState().deleted);
  let changed = 0;
  for (const tw of incoming) {
    if (deletedHere.has(tw.id)) continue;
    const existing = findTweet(tw.id);
    if (!existing) {
      tw.replies = tw.replies.filter((rep) => !deletedHere.has(rep.id));
      tweets.push(tw);
      changed += 1 + tw.replies.length;
      continue;
    }
    if (mergeEntry(existing, tw)) changed++;
    for (const rep of tw.replies) {
      if (deletedHere.has(rep.id)) continue;
      const local = existing.replies.find((r) => r.id === rep.id);
      if (!local) {
        existing.replies.push(rep);
        changed++;
      } else if (mergeEntry(local, rep)) {
        changed++;
      }
    }
    existing.replies.sort((a, b) => a.createdAt - b.createdAt);
  }

  const toDelete = new Set(deletedIds);
  const before = tweets.length;
  tweets = tweets.filter((tw) => !toDelete.has(tw.id));
  changed += before - tweets.length;
  for (const tw of tweets) {
    const count = tw.replies.length;
    tw.replies = tw.replies.filter((rep) => !toDelete.has(rep.id));
    changed += count - tw.replies.length;
  }

  tweets.sort((a, b) => b.createdAt - a.createdAt);
  return changed;
}

// 同じポスト（コメント）を混ぜる。両方の履歴を合わせ、新しい方の内容にする。手元が変わったら true
function mergeEntry(local, incoming) {
  const history = [...local.history];
  for (const v of incoming.history) {
    if (!history.some((h) => h.createdAt === v.createdAt && h.text === v.text)) history.push(v);
  }
  const incomingWins = incoming.updatedAt > local.updatedAt;
  const [winner, loser] = incomingWins ? [incoming, local] : [local, incoming];
  // 両方の端末で別々に編集していた場合、負けた方の文を履歴に残す
  if (loser.text !== winner.text && !history.some((h) => h.text === loser.text)) {
    history.push({ text: loser.text, createdAt: loser.editedAt || loser.createdAt });
  }
  history.sort((a, b) => a.createdAt - b.createdAt);
  const changed = incomingWins || history.length !== local.history.length;

  local.history = history;
  if (incomingWins) {
    local.text = incoming.text;
    local.editedAt = incoming.editedAt;
    local.updatedAt = incoming.updatedAt;
    local.link = incoming.link ?? (local.link?.url === findFirstUrl(incoming.text) ? local.link : null);
    if ("mood" in incoming) local.mood = incoming.mood;
  }
  return changed;
}

// -------------------------------------------------------------
// バックアップ（書き出し / 読み込み）
// -------------------------------------------------------------
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
