// =============================================================
// botchitter — 端末間の同期 (sync.js)
// サーバーを使わず、画面に出した QR を、もう一方の端末のアプリ内カメラで読んで運ぶ。
//   送る側:     前回送ってから書いた・直した・消した分を圧縮して QR にする（多ければ数枚を切り替えて出す）
//   受け取る側: QR を全部読んだら mergeTweets() で混ぜる（新しい方が勝ち、消された ID は消す）
// 消した ID は「次に送れたら捨てる」ので、削除の記録が積み上がることはない（上限 SYNC_MAX_DELETED）。
// QR を作る・読むライブラリ（vendor/）は、この画面を開いたときだけ読み込む。
// =============================================================

// QR 1枚に入れる量（圧縮後）と誤り訂正レベル。ぼけ・傾き・縮小を混ぜた試験で、400B（81マス）は 8/18、
// 200B・L（53マス）は 18/18 読めた。増やすと枚数は減るが、カメラで読みにくくなる
const SYNC_CHUNK_BYTES = 200;
const SYNC_QR_ECC = "L";
const SYNC_FRAME_MS = 450; // 複数枚のときの切り替え間隔
const SYNC_MAX_FRAMES = 200;
const SYNC_MAX_DELETED = 500;
const SYNC_SCAN_MAX_SIDE = 800; // カメラ映像を縮めてから読む（速さと読み取りやすさの兼ね合い）

let syncTimer = null;
let syncStream = null;
let syncSent = null; // 表示中の QR に入れたもの: { at, deleted }（「送れた」で使う）

// -------------------------------------------------------------
// 状態：前回送った時刻と、それから消した ID（localStorage）
// -------------------------------------------------------------
function loadSyncState() {
  try {
    const state = JSON.parse(localStorage.getItem(SYNC_STATE_KEY));
    return {
      lastSentAt: Number(state?.lastSentAt) || 0,
      deleted: Array.isArray(state?.deleted) ? state.deleted.filter(isValidId) : []
    };
  } catch (e) {
    return { lastSentAt: 0, deleted: [] };
  }
}

function saveSyncState(state) {
  try {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state));
  } catch (e) {}
}

// 削除したときに呼ぶ。次に送れたら捨てる
function recordDeletion(id) {
  const state = loadSyncState();
  state.deleted = [...state.deleted.filter((d) => d !== id), id].slice(-SYNC_MAX_DELETED);
  saveSyncState(state);
}

// -------------------------------------------------------------
// 送るデータ：前回送ってから変わったポスト（スレッドごと）と、消した ID
// -------------------------------------------------------------
function buildSyncPayload(sendAll) {
  const state = loadSyncState();
  const since = sendAll ? 0 : state.lastSentAt;
  const changed = tweets.filter((tw) => tw.updatedAt > since || tw.replies.some((rep) => rep.updatedAt > since));
  return { v: 1, at: Date.now(), tweets: changed, deleted: state.deleted };
}

// QR に入る量を減らすため、null と空の配列は省く（受け取った側で normalizeTweets() が補う）
const compactJson = (value) =>
  JSON.stringify(value, (key, v) => (v === null || (Array.isArray(v) && !v.length) ? undefined : v));

async function deflateText(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

// -------------------------------------------------------------
// QR の中身：英数字モードに収まる Base45（RFC 9285）で、1枚ごとに「BC1/<回>/<番号>/<枚数>/<データ>」
// -------------------------------------------------------------
const BASE45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

function base45Encode(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      let x = bytes[i] * 256 + bytes[i + 1];
      for (let k = 0; k < 3; k++) {
        out += BASE45[x % 45];
        x = Math.floor(x / 45);
      }
    } else {
      out += BASE45[bytes[i] % 45] + BASE45[Math.floor(bytes[i] / 45)];
    }
  }
  return out;
}

function base45Decode(text) {
  const bytes = [];
  const digit = (ch) => {
    const d = BASE45.indexOf(ch);
    if (d < 0) throw new Error("invalid base45");
    return d;
  };
  for (let i = 0; i < text.length; i += 3) {
    if (i + 2 < text.length) {
      const x = digit(text[i]) + digit(text[i + 1]) * 45 + digit(text[i + 2]) * 2025;
      if (x > 0xffff) throw new Error("invalid base45");
      bytes.push(x >> 8, x & 0xff);
    } else {
      bytes.push(digit(text[i]) + digit(text[i + 1]) * 45);
    }
  }
  return new Uint8Array(bytes);
}

async function encodeSyncFrames(payload) {
  const bytes = await deflateText(compactJson(payload));
  const total = Math.ceil(bytes.length / SYNC_CHUNK_BYTES);
  if (total > SYNC_MAX_FRAMES) throw new Error("too large");
  const session = Array.from({ length: 4 }, () => BASE45[Math.floor(Math.random() * 36)]).join("");
  return Array.from({ length: total }, (_, i) =>
    `BC1/${session}/${i + 1}/${total}/${base45Encode(bytes.subarray(i * SYNC_CHUNK_BYTES, (i + 1) * SYNC_CHUNK_BYTES))}`
  );
}

function parseSyncFrame(text) {
  const m = /^BC1\/([0-9A-Z]{4})\/(\d+)\/(\d+)\/(.+)$/s.exec(text);
  if (!m) return null;
  const index = Number(m[2]);
  const total = Number(m[3]);
  if (index < 1 || index > total || total > SYNC_MAX_FRAMES) return null;
  return { session: m[1], index, total, chunk: m[4] };
}

async function decodeSyncFrames(chunks, total) {
  const parts = [];
  for (let i = 1; i <= total; i++) parts.push(base45Decode(chunks.get(i)));
  const bytes = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    bytes.set(p, offset);
    offset += p.length;
  }
  const payload = JSON.parse(await inflateBytes(bytes));
  if (payload?.v !== 1) throw new Error("unknown format");
  return payload;
}

// -------------------------------------------------------------
// ライブラリ（vendor/）を必要なときだけ読む
// -------------------------------------------------------------
const loadedScripts = {};
function loadScript(src) {
  loadedScripts[src] ??= new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = resolve;
    el.onerror = () => {
      delete loadedScripts[src];
      reject(new Error(`failed to load ${src}`));
    };
    document.head.appendChild(el);
  });
  return loadedScripts[src];
}

// -------------------------------------------------------------
// ダイアログ
// -------------------------------------------------------------
function showSyncDialog(html) {
  $("syncContent").innerHTML = html;
  $("syncOverlay").classList.add("open");
}

function stopSyncCamera() {
  syncStream?.getTracks().forEach((track) => track.stop());
  syncStream = null;
}

function closeSync() {
  clearInterval(syncTimer);
  clearTimeout(syncTimer);
  syncTimer = null;
  stopSyncCamera();
  syncSent = null;
  $("syncOverlay").classList.remove("open");
}

const syncSupported = () => "CompressionStream" in window && "DecompressionStream" in window;

// -------------------------------------------------------------
// 送る
// -------------------------------------------------------------
async function openSyncSend(sendAll = false) {
  closeMenu();
  closeSync();
  if (!syncSupported()) return showSyncDialog(syncMessageHtml(t("sync_unsupported")));
  showSyncDialog(syncMessageHtml("…"));
  try {
    await loadScript("vendor/qrcode.js");
    const payload = buildSyncPayload(sendAll);
    if (!payload.tweets.length && !payload.deleted.length) {
      showSyncDialog(`
        <p class="sync-status">${t("sync_nothing")}</p>
        <div class="sync-actions">
          <button class="btn-confirm-cancel" onclick="closeSync()">${t("btn_close")}</button>
          <button class="btn-post" onclick="openSyncSend(true)">${t("sync_send_all")}</button>
        </div>
      `);
      return;
    }

    const frames = await encodeSyncFrames(payload);
    const svgs = frames.map((frame) => {
      const qr = qrcode(0, SYNC_QR_ECC);
      qr.addData(frame, "Alphanumeric");
      qr.make();
      return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
    });
    syncSent = { at: payload.at, deleted: payload.deleted };

    showSyncDialog(`
      <p class="sync-status">${t("sync_send_hint")}</p>
      <div class="sync-qr" id="syncQr">${svgs[0]}</div>
      <p class="sync-meta">
        ${t("sync_summary", payload.tweets.length, payload.deleted.length)}
        ${svgs.length > 1 ? `<span id="syncFrameNo">1 / ${svgs.length}</span>` : ""}
      </p>
      <div class="sync-actions">
        <button class="btn-confirm-cancel" onclick="closeSync()">${t("btn_close")}</button>
        <button class="btn-post" onclick="markSyncSent()">${t("sync_done")}</button>
      </div>
      ${sendAll ? "" : `<button class="sync-link" onclick="openSyncSend(true)">${t("sync_send_all")}</button>`}
    `);

    // 複数枚なら切り替え続ける（受け取る側は全部そろうまで読み続ける）
    if (svgs.length > 1) {
      let i = 0;
      syncTimer = setInterval(() => {
        i = (i + 1) % svgs.length;
        $("syncQr").innerHTML = svgs[i];
        $("syncFrameNo").textContent = `${i + 1} / ${svgs.length}`;
      }, SYNC_FRAME_MS);
    }
  } catch (err) {
    console.warn("Sync send failed:", err);
    showSyncDialog(syncMessageHtml(t(err.message === "too large" ? "sync_too_large" : "sync_failed")));
  }
}

// 受け取った側が読み終えたら押す。次からはこれより後の変更だけを送る
function markSyncSent() {
  if (syncSent) {
    const state = loadSyncState();
    state.lastSentAt = syncSent.at;
    state.deleted = state.deleted.filter((id) => !syncSent.deleted.includes(id));
    saveSyncState(state);
  }
  closeSync();
  showToast(t("toast_sync_sent"));
}

// -------------------------------------------------------------
// 受け取る
// -------------------------------------------------------------
async function openSyncReceive() {
  closeMenu();
  closeSync();
  if (!syncSupported()) return showSyncDialog(syncMessageHtml(t("sync_unsupported")));
  showSyncDialog(`
    <div class="sync-camera"><video id="syncVideo" playsinline muted></video></div>
    <p class="sync-status" id="syncStatus">${t("sync_scan_hint")}</p>
    <div class="sync-actions">
      <button class="btn-confirm-cancel" onclick="closeSync()">${t("btn_cancel")}</button>
    </div>
  `);
  try {
    await loadScript("vendor/jsQR.js");
    syncStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    const video = $("syncVideo");
    video.srcObject = syncStream;
    await video.play();
    scanSyncFrames(video);
  } catch (err) {
    console.warn("Camera failed:", err);
    stopSyncCamera();
    if ($("syncStatus")) $("syncStatus").textContent = t("sync_camera_failed");
  }
}

function scanSyncFrames(video) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const received = { session: null, total: 0, chunks: new Map() };

  const tick = async () => {
    if (!syncStream) return; // 閉じられた
    if (video.videoWidth) {
      const scale = Math.min(1, SYNC_SCAN_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const frame = parseSyncFrame(jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data || "");
      if (frame) {
        // 送る側が作り直したら（回が変わったら）最初から集め直す
        if (frame.session !== received.session) {
          received.session = frame.session;
          received.total = frame.total;
          received.chunks.clear();
        }
        received.chunks.set(frame.index, frame.chunk);
        $("syncStatus").textContent = t("sync_scan_progress", received.chunks.size, received.total);
        if (received.chunks.size === received.total) {
          stopSyncCamera();
          await finishSyncReceive(received);
          return;
        }
      }
    }
    syncTimer = setTimeout(tick, 120);
  };
  tick();
}

async function finishSyncReceive(received) {
  try {
    const payload = await decodeSyncFrames(received.chunks, received.total);
    const incoming = normalizeTweets(payload.tweets);
    const deleted = (Array.isArray(payload.deleted) ? payload.deleted : []).filter(isValidId);
    const changed = mergeTweets(incoming, deleted);
    save();
    renderAll();
    const route = parseRoute();
    if (route.view === "archive") renderArchive(route.tag);
    closeSync();
    showToast(t("toast_synced", changed));
  } catch (err) {
    console.warn("Sync receive failed:", err);
    if ($("syncStatus")) $("syncStatus").textContent = t("sync_failed");
  }
}

const syncMessageHtml = (message) => `
  <p class="sync-status">${message}</p>
  <div class="sync-actions">
    <button class="btn-confirm-cancel" onclick="closeSync()">${t("btn_close")}</button>
  </div>
`;
