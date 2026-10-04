// =============================================================
// botchitter — リンクのタイトル取得 API（Vercel Function）
//
// URL を含む投稿をした時に、アプリから GET /api/ogp?url=... で呼ばれる。
// 返すのは { title, siteName, image } だけ。本文や端末のデータは受け取らない。
// セキュリティ & コスト対策:
// 1. 同一ドメイン（Same-Origin）からのみ受付（外部の踏み台・無断利用を403で拒否。フォーク先でも無設定で動作）
// 2. Vercel エッジキャッシュ（s-maxage）により、同一URLの再取得をCDNで即時返却（Function実行回数を激減）
// 3. SSRF対策: 内部・プライベートIP宛て拒否、時間・サイズ・リダイレクト制限
// =============================================================

const dns = require("node:dns").promises;
const net = require("node:net");

const TIMEOUT_MS = 5000;
const MAX_BYTES = 2 * 1024 * 1024; // OGP は <head> にあるので </head> まで読めば足りる（YouTube は 700KB 付近）
const MAX_REDIRECTS = 3;
const USER_AGENT = "Mozilla/5.0 (compatible; botchitter-link-preview/1.0)";

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).end();

  // ドメイン制限: 外部からの不正呼び出し・踏み台利用を403で拒否
  if (!isAllowedRequest(req)) {
    return res.status(403).json({ error: "forbidden" });
  }

  const rawUrl = req.method === "GET"
    ? (req.query?.url || new URL(req.url, "http://localhost").searchParams.get("url"))
    : req.body?.url;

  if (!rawUrl || typeof rawUrl !== "string") {
    return res.status(400).json({ error: "missing url" });
  }

  try {
    const page = await fetchPage(rawUrl);
    const meta = extractMeta(page.html, page.url);

    // Vercel Edge キャッシュ: 24時間CDNキャッシュ、裏で非同期更新 (stale-while-revalidate)
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");

    res.status(200).json(meta);
  } catch (err) {
    res.status(422).json({ error: "unavailable" });
  }
};

// 特定のドメインに完全固定したい場合は環境変数や定数で指定（未指定時は自身が稼働するホストと動的一致）
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || null;

function isAllowedRequest(req) {
  // 1. モダンブラウザの Same-Origin リクエスト
  if (req.headers["sec-fetch-site"] === "same-origin") {
    return true;
  }

  // 2. 稼働先ホスト名を取得（フォーク先の Vercel ドメインや独自ドメインにも自動適応）
  const currentHost = (req.headers["x-forwarded-host"] || req.headers.host || "").split(":")[0].toLowerCase();
  if (!currentHost && !ALLOWED_ORIGIN) return false;

  const isMatch = (val) => {
    if (!val) return false;
    try {
      const u = new URL(val);
      if (ALLOWED_ORIGIN && (val === ALLOWED_ORIGIN || u.hostname === ALLOWED_ORIGIN)) return true;
      return currentHost && u.hostname.toLowerCase() === currentHost;
    } catch {
      return false;
    }
  };

  if (req.headers.origin && isMatch(req.headers.origin)) return true;
  if (req.headers.referer && isMatch(req.headers.referer)) return true;

  return false;
}

// リダイレクトは自分でたどり、行き先ごとに内部ネットワークでないことを確かめる
async function fetchPage(rawUrl) {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url = await assertPublicUrl(rawUrl);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" }
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = await assertPublicUrl(new URL(location, url).href);
      continue;
    }
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok || !contentType.includes("html")) throw new Error("not an html page");
    const bytes = await readHead(res.body, MAX_BYTES);
    return { url: url.href, html: decodeHtml(bytes, contentType) };
  }
  throw new Error("too many redirects");
}

async function assertPublicUrl(rawUrl) {
  if (typeof rawUrl !== "string") throw new Error("no url");
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error("private address");
  return url;
}

// localhost・プライベート・リンクローカル・CGNAT・マルチキャストなど、公開されていないアドレス
function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168);
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) {
    const v4 = v6.slice("::ffff:".length);
    return net.isIPv4(v4) ? isPrivateAddress(v4) : true;
  }
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

// </head> が来るか limit バイトに達したところで読むのをやめる
async function readHead(body, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of body) {
    const buf = Buffer.from(chunk);
    chunks.push(buf);
    size += buf.length;
    if (size >= limit || buf.toString("latin1").toLowerCase().includes("</head>")) break;
  }
  return Buffer.concat(chunks).subarray(0, limit);
}

// Content-Type か <meta charset> の文字コードで読む（Shift_JIS や EUC-JP のサイトもあるため）
function decodeHtml(bytes, contentType) {
  const head = bytes.subarray(0, 4096).toString("latin1");
  const charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1]
    || head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1]
    || "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch (err) {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function extractMeta(html, pageUrl) {
  const metas = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (getAttr(tag, "property") || getAttr(tag, "name") || "").toLowerCase();
    const content = getAttr(tag, "content");
    if (key && content && !(key in metas)) metas[key] = decodeEntities(content);
  }
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const image = metas["og:image"] || metas["twitter:image"];
  return {
    title: clean(metas["og:title"] || metas["twitter:title"] || (titleTag && decodeEntities(titleTag)), 200),
    siteName: clean(metas["og:site_name"], 100),
    image: image ? toHttpUrl(image, pageUrl) : null
  };
}

function getAttr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(str) {
  return str.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
    const e = entity.toLowerCase();
    if (e[0] !== "#") return ENTITIES[e];
    const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

const clean = (str, max) => (str ? str.replace(/\s+/g, " ").trim().slice(0, max) || null : null);

function toHttpUrl(raw, base) {
  try {
    const url = new URL(raw, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch (err) {
    return null;
  }
}
