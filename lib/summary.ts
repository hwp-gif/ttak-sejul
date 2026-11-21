// 화면과 서버가 같이 쓰는 정리 결과 모양과 도우미 함수

export type Decision = { text: string; quote: string; verified: boolean };
export type Todo = { task: string; owner: string; due: string; quote: string; verified: boolean; edited?: boolean };
export type Question = { text: string; quote: string; verified: boolean };

export type SummaryResult = {
  title: string;
  summary: string[];
  decisions: Decision[];
  todos: Todo[];
  open_questions: Question[];
  people: string[];
  lang?: Lang;
};

export type SummarizeResponse = SummaryResult & { model: string; saved?: boolean };

export const MAX_LENGTH = 3000;
export const UNKNOWN = "미정"; // AI와 코드가 쓰는 '모름' 표시 (언어와 상관없이 같음)

// 결과 언어: 요약·결정·할 일·남은 질문만 번역하고, 근거(quote)는 원문 그대로 둔다 (✓ 확인을 위해)
export const LANGS = {
  ko: { label: "한국어", prompt: "한국어", unknown: "미정", summary: "요약", decisions: "결정", todos: "할 일", questions: "남은 질문", none: "없음", noDecision: "결정된 사항 없음", owner: "담당", due: "기한", minutes: "회의 정리", mailSubject: "회의록", hello: "안녕하세요. 오늘 회의 내용을 정리해 공유드립니다.", bye: "수정하거나 빠진 내용이 있으면 알려 주세요.\n감사합니다." },
  en: { label: "English", prompt: "English", unknown: "TBD", summary: "Summary", decisions: "Decisions", todos: "Action items", questions: "Open questions", none: "None", noDecision: "No decisions made", owner: "Owner", due: "Due", minutes: "Meeting notes", mailSubject: "Minutes", hello: "Hello, here is a summary of today's meeting.", bye: "Please let me know if anything is missing or needs correction.\nThank you." },
  ja: { label: "日本語", prompt: "日本語", unknown: "未定", summary: "要約", decisions: "決定事項", todos: "ToDo", questions: "未解決の課題", none: "なし", noDecision: "決定事項なし", owner: "担当", due: "期限", minutes: "会議まとめ", mailSubject: "議事録", hello: "お疲れさまです。本日の会議内容をまとめて共有します。", bye: "修正や漏れがあればお知らせください。\nよろしくお願いいたします。" },
  zh: { label: "中文", prompt: "简体中文", unknown: "待定", summary: "摘要", decisions: "决定事项", todos: "待办事项", questions: "待讨论问题", none: "无", noDecision: "暂无决定事项", owner: "负责人", due: "截止", minutes: "会议纪要", mailSubject: "会议纪要", hello: "大家好，现将今天的会议内容整理如下。", bye: "如有遗漏或需要修改，请告诉我。\n谢谢。" },
  vi: { label: "Tiếng Việt", prompt: "tiếng Việt", unknown: "Chưa rõ", summary: "Tóm tắt", decisions: "Quyết định", todos: "Việc cần làm", questions: "Câu hỏi còn lại", none: "Không có", noDecision: "Chưa có quyết định", owner: "Phụ trách", due: "Hạn", minutes: "Tóm tắt cuộc họp", mailSubject: "Biên bản họp", hello: "Xin chào, dưới đây là tóm tắt cuộc họp hôm nay.", bye: "Nếu có thiếu sót hoặc cần sửa, vui lòng cho tôi biết.\nXin cảm ơn." },
} as const;
export type Lang = keyof typeof LANGS;
export const isLang = (v: unknown): v is Lang => typeof v === "string" && v in LANGS;

// 공백·문장부호·따옴표 차이는 무시하고 비교한다.
function normalize(text: string) {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

// F7: AI가 붙인 근거 문장이 메모 원문에 실제로 있는지 코드로 확인한다.
export function isQuoteInOriginal(quote: string, original: string) {
  const q = normalize(quote);
  return q.length >= 4 && normalize(original).includes(q);
}

// F10: 정리에서 빠진 메모 줄 — 어떤 근거(quote)와도 겹치지 않는 줄을 찾는다 (AI 없이 코드로)
export function findUncoveredLines(memo: string, r: SummaryResult) {
  const quotes = [...r.decisions, ...r.todos, ...r.open_questions]
    .map((x) => normalize(x.quote))
    .filter((q) => q.length >= 4);
  return memo
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      const n = normalize(line);
      if (n.length < 4) return false; // 너무 짧은 줄은 건너뜀
      return !quotes.some((q) => q.includes(n) || n.includes(q));
    });
}

// F8: 담당자·기한이 "미정"인 할 일 개수 (AI 없이 코드로)
export function countMissing(todos: Todo[]) {
  return {
    owner: todos.filter((t) => t.owner === UNKNOWN).length,
    due: todos.filter((t) => t.due === UNKNOWN).length,
  };
}

// F3: 카톡용·메일용 글 모양 (AI를 다시 부르지 않음). 결과 언어에 맞춰 머리말도 바꾼다.
const shown = (v: string, lang: Lang) => (v === UNKNOWN ? LANGS[lang].unknown : v);

export function toKakao(r: SummaryResult) {
  const lang = r.lang ?? "ko";
  const L = LANGS[lang];
  const lines = [`[${r.title}] ${L.minutes}`, "", `📌 ${L.summary}`, ...r.summary.map((s) => `· ${s}`), "", `✅ ${L.decisions}`];
  lines.push(...(r.decisions.length ? r.decisions.map((d) => `· ${d.text}`) : [`· ${L.noDecision}`]));
  lines.push("", `📝 ${L.todos}`);
  lines.push(...(r.todos.length ? r.todos.map((t) => `· ${t.task} (${shown(t.owner, lang)} / ${shown(t.due, lang)})`) : [`· ${L.none}`]));
  lines.push("", `❓ ${L.questions}`);
  lines.push(...(r.open_questions.length ? r.open_questions.map((q) => `· ${q.text}`) : [`· ${L.none}`]));
  return lines.join("\n");
}

export function toMail(r: SummaryResult) {
  const lang = r.lang ?? "ko";
  const L = LANGS[lang];
  const numbered = (items: string[], empty: string) =>
    items.length ? items.map((s, i) => `  ${i + 1}. ${s}`) : [`  - ${empty}`];
  return [
    `${lang === "ko" ? "제목" : "Subject"}: [${L.mailSubject}] ${r.title}`,
    "",
    L.hello,
    "",
    `■ ${L.summary}`,
    ...numbered(r.summary, L.none),
    "",
    `■ ${L.decisions}`,
    ...numbered(r.decisions.map((d) => d.text), L.noDecision),
    "",
    `■ ${L.todos}`,
    ...numbered(r.todos.map((t) => `${t.task} — ${L.owner}: ${shown(t.owner, lang)} / ${L.due}: ${shown(t.due, lang)}`), L.none),
    "",
    `■ ${L.questions}`,
    ...numbered(r.open_questions.map((q) => q.text), L.none),
    "",
    L.bye,
  ].join("\n");
}
