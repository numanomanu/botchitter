// =============================================================
// botchitter — 一人Twitter: 定数および初期シードデータ
// =============================================================

const STORAGE_KEY = "botchitter_tweets_v2";
const THEME_KEY = "botchitter_theme_mode";

// 初期シードデータ（日本語）
// 初めて訪れた人が鬱陶しく感じない、静かでシンプルなコンセプト説明
const DEFAULT_TWEETS_JA = [
  {
    id: "tw-intro-today",
    dateLabel: "20:30",
    isToday: true,
    text: "誰にも見られない、自分だけのタイムライン。\n\n頭に浮かんだことを好きなように書き留めておく場所です。投稿はすべてこの端末の中にだけ保存されます。",
    targetQuoteId: "tw-intro-past",
    quoted: {
      dateLabel: "14日前",
      text: "自分自身が振り返るための記録。"
    },
    replies: [
      {
        id: "rep-intro-1",
        dateLabel: "20:30",
        text: "過去の呟きにコメントを重ねたり、引用して思考を繋げられます。"
      }
    ]
  },
  {
    id: "tw-intro-past",
    dateLabel: "14日前",
    isToday: false,
    text: "自分自身が振り返るための記録。",
    targetQuoteId: null,
    quoted: null,
    replies: []
  }
];

// 初期シードデータ（英語）
const DEFAULT_TWEETS_EN = [
  {
    id: "tw-intro-today",
    dateLabel: "20:30",
    isToday: true,
    text: "A private timeline for your thoughts, seen by no one else.\n\nEverything is saved locally on this device.",
    targetQuoteId: "tw-intro-past",
    quoted: {
      dateLabel: "14d ago",
      text: "A personal space to reflect over time."
    },
    replies: [
      {
        id: "rep-intro-1",
        dateLabel: "20:30",
        text: "Add comments or quote past notes to follow how your thoughts evolve."
      }
    ]
  },
  {
    id: "tw-intro-past",
    dateLabel: "14d ago",
    isToday: false,
    text: "A personal space to reflect over time.",
    targetQuoteId: null,
    quoted: null,
    replies: []
  }
];

function getDefaultTweets(locale = "ja") {
  return locale === "ja" ? DEFAULT_TWEETS_JA : DEFAULT_TWEETS_EN;
}

const DEFAULT_TWEETS = DEFAULT_TWEETS_JA;
