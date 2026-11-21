// 화면과 서버가 같이 쓰는 정리 결과 모양과 도우미 함수

export type Decision = { text: string; quote: string; verified: boolean };
export type Todo = { task: string; owner: string; due: string; quote: string; verified: boolean };
export type Question = { text: string; quote: string; verified: boolean };

export type SummaryResult = {
  title: string;
  summary: string[];
  decisions: Decision[];
  todos: Todo[];
  open_questions: Question[];
};

export type SummarizeResponse = SummaryResult & { model: string; saved?: boolean };

export const MAX_LENGTH = 3000;
export const UNKNOWN = "미정";

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

// F3: 카톡용·메일용 글 모양 (AI를 다시 부르지 않음)
export function toKakao(r: SummaryResult) {
  const lines = [`[${r.title}] 회의 정리`, "", "📌 요약", ...r.summary.map((s) => `· ${s}`), "", "✅ 결정"];
  lines.push(...(r.decisions.length ? r.decisions.map((d) => `· ${d.text}`) : ["· 결정된 사항 없음"]));
  lines.push("", "📝 할 일");
  lines.push(...(r.todos.length ? r.todos.map((t) => `· ${t.task} (${t.owner} / ${t.due})`) : ["· 없음"]));
  lines.push("", "❓ 남은 질문");
  lines.push(...(r.open_questions.length ? r.open_questions.map((q) => `· ${q.text}`) : ["· 없음"]));
  return lines.join("\n");
}

export function toMail(r: SummaryResult) {
  const numbered = (items: string[], empty: string) =>
    items.length ? items.map((s, i) => `  ${i + 1}. ${s}`) : [`  - ${empty}`];
  return [
    `제목: [회의록] ${r.title}`,
    "",
    "안녕하세요. 오늘 회의 내용을 정리해 공유드립니다.",
    "",
    "■ 핵심 요약",
    ...numbered(r.summary, "없음"),
    "",
    "■ 결정 사항",
    ...numbered(r.decisions.map((d) => d.text), "결정된 사항 없음"),
    "",
    "■ 할 일",
    ...numbered(r.todos.map((t) => `${t.task} — 담당: ${t.owner} / 기한: ${t.due}`), "없음"),
    "",
    "■ 남은 질문",
    ...numbered(r.open_questions.map((q) => q.text), "없음"),
    "",
    "수정하거나 빠진 내용이 있으면 알려 주세요.",
    "감사합니다.",
  ].join("\n");
}
