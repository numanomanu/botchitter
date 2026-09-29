// =============================================================
// botchitter — 一人Twitter: 定数および初期シードデータ
// =============================================================

const STORAGE_KEY = "botchitter_tweets_v1";
const THEME_KEY = "botchitter_theme_mode";

// 初期シードデータ（「今日」のポストは時間表記のみ）
const DEFAULT_TWEETS = [
  {
    id: "tw-sample-1",
    dateLabel: "20:30",
    isToday: true,
    text: "自分の仕事そのものが変わり始めていることに気づいた。",
    targetQuoteId: "tw-sample-4",
    quoted: {
      dateLabel: "168日前（4月12日）",
      text: "最近、仕事でAIを使う時間が増えている。"
    },
    replies: [
      {
        id: "rep-today-1",
        dateLabel: "20:30",
        text: "指示役としての役割が定着してきた。"
      }
    ]
  },
  {
    id: "tw-sample-2",
    dateLabel: "87日前（7月3日）",
    isToday: false,
    text: "今まで追っていたガジェットのニュースに、あまりワクワクしなくなった。",
    targetQuoteId: null,
    quoted: null,
    replies: []
  },
  {
    id: "tw-sample-3",
    dateLabel: "103日前（6月17日）",
    isToday: false,
    text: "最近、娘が寝る前によく学校の話をする。",
    targetQuoteId: null,
    quoted: null,
    replies: [
      {
        id: "rep-1",
        dateLabel: "100日前",
        text: "クラス替えのあとの不安が落ち着いてきたらしい。"
      },
      {
        id: "rep-2",
        dateLabel: "95日前",
        text: "新しい友達の名前が自然と出てくるようになった。"
      }
    ]
  },
  {
    id: "tw-sample-4",
    dateLabel: "168日前（4月12日）",
    isToday: false,
    text: "最近、仕事でAIを使う時間が増えている。",
    targetQuoteId: null,
    quoted: null,
    replies: [
      {
        id: "rep-3",
        dateLabel: "160日前",
        text: "プロンプトの工夫でコード生成の精度が上がった。"
      }
    ]
  }
];
