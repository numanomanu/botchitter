// =============================================================
// botchitter — 自分にしか見えないタイムライン: 保存キーおよび初期シードデータ
// =============================================================

// 保存キー。変えると既存ユーザーのデータが読めなくなるので変更しないこと
const DB_NAME = "botchitter_db_v3";
const STORE_NAME = "tweets_store";
const STORAGE_KEY = "botchitter_tweets_v3";
const THEME_KEY = "botchitter_theme_mode";
const INSTALL_HINT_KEY = "botchitter_install_hint_dismissed";
const DRAFT_KEY = "botchitter_composer_draft";
const REPLY_DRAFT_PREFIX = "botchitter_reply_draft_";

// 初めて訪れた人が鬱陶しく感じない、静かでシンプルなコンセプト説明
const SEED_TEXT = {
  ja: {
    today: "誰にも見られない、自分だけのタイムライン。\n\n頭に浮かんだことを好きなように書き留めておく場所です。投稿はすべてこの端末の中にだけ保存されます。\n\n（能動的にシェアボタンを押した時だけ、任意のSNSへ投稿できます）",
    past: "自分自身が振り返るための記録。 #はじめに",
    reply: "過去の呟きにコメントを重ねたり、引用して思考を繋げられます。",
    replyTag: "#はじめに のようにタグを付けておくと、タップで同じタグの投稿だけを見返せます。",
    replyMood: "残すときに入力欄の顔のマークを押すと、そのときの気分も残せます。上の日付をタップすると、量や気分を草で振り返れます。"
  },
  en: {
    today: "A private timeline for your thoughts, seen by no one else.\n\nEverything is saved locally on this device.\n\n(Only when you actively tap the share button, you can post to any SNS of your choice.)",
    past: "A personal space to reflect over time. #welcome",
    reply: "Add comments or quote past notes to follow how your thoughts evolve.",
    replyTag: "Add a tag like #welcome, then tap it to see only the posts with that tag.",
    replyMood: "Tap the face icon when posting to record how you felt. Tap the date at the top to look back at your posts and moods."
  }
};

function getDefaultTweets(locale) {
  const text = SEED_TEXT[locale];
  const now = Date.now();
  const past = now - 14 * 24 * 60 * 60 * 1000;
  return [
    {
      id: "tw-intro-today",
      createdAt: now,
      text: text.today,
      mood: 4,
      targetQuoteId: "tw-intro-past",
      quoted: { createdAt: past, text: text.past },
      replies: [
        { id: "rep-intro-1", createdAt: now, text: text.reply },
        { id: "rep-intro-2", createdAt: now, text: text.replyTag },
        { id: "rep-intro-3", createdAt: now, text: text.replyMood }
      ]
    },
    {
      id: "tw-intro-past",
      createdAt: past,
      text: text.past,
      mood: 3,
      targetQuoteId: null,
      quoted: null,
      replies: []
    }
  ];
}
