"use client";

import { useState } from "react";
import { EXAMPLES } from "@/lib/examples";
import {
  MAX_LENGTH,
  countMissing,
  toKakao,
  toMail,
  type SummarizeResponse,
} from "@/lib/summary";

function Evidence({ quote, verified }: { quote: string; verified: boolean }) {
  if (!quote) return <p className="evidence warn">⚠ 근거 문장이 없어요</p>;
  return (
    <p className={`evidence${verified ? "" : " warn"}`}>
      <span className="badge">{verified ? "✓ 원문 확인" : "⚠ 원문에서 못 찾음"}</span>
      <span className="quote">“{quote}”</span>
    </p>
  );
}

export default function Home() {
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SummarizeResponse | null>(null);
  const [copied, setCopied] = useState("");

  const tooLong = memo.length > MAX_LENGTH;

  // F6: 예시 2~3개 중 무작위로 하나 (지금 입력칸과 같은 예시는 피함)
  function loadExample() {
    const others = EXAMPLES.filter((ex) => ex.memo !== memo);
    const pick = others[Math.floor(Math.random() * others.length)];
    setTitle(pick.title);
    setMemo(pick.memo);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (memo.trim() === "") return setError("메모를 입력해 주세요.");
    if (tooLong) return setError(`메모가 너무 길어요. ${MAX_LENGTH.toLocaleString()}자 이하로 줄여 주세요.`);

    setError("");
    setCopied("");
    setLoading(true);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, memo }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(data?.error ?? "정리하지 못했어요. 다시 시도해 주세요.");
        return;
      }
      setResult(data as SummarizeResponse);
    } catch {
      setError("서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(kind: "kakao" | "mail") {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(kind === "kakao" ? toKakao(result) : toMail(result));
      setCopied(kind === "kakao" ? "카톡용으로 복사했어요." : "메일용으로 복사했어요.");
    } catch {
      setCopied("복사하지 못했어요. 글자를 직접 선택해 복사해 주세요.");
    }
  }

  const missing = result ? countMissing(result.todos) : null;
  const checked = result ? [...result.decisions, ...result.todos] : [];
  const verifiedCount = checked.filter((x) => x.verified).length;

  return (
    <main className="container">
      <h1>
        <span className="brand">딱세줄</span> · 회의록 3줄 요약기
      </h1>
      <p className="subtitle">
        회의 메모를 붙여 넣으면 핵심 요약 3줄 · 결정 사항 · 할 일 · 남은 질문으로 정리해 드려요.
        <br />
        결정과 할 일마다 <strong>메모 원문 근거</strong>를 붙여서, AI가 지어낸 내용이 없는지 바로 확인할 수 있어요.
      </p>

      <form className="panel" onSubmit={handleSubmit}>
        <label className="label" htmlFor="title">
          회의 제목 <span className="optional">(선택 · 비우면 AI가 붙여요)</span>
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 동아리 축제 준비 회의"
          maxLength={100}
        />

        <div className="label-row">
          <label className="label" htmlFor="memo">회의 메모</label>
          <button type="button" className="secondary" onClick={loadExample} disabled={loading}>
            예시로 해 보기
          </button>
        </div>
        <textarea
          id="memo"
          rows={12}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="회의 중에 적은 메모를 그대로 붙여 넣으세요. 대충 적어도 괜찮아요."
        />
        <p className={`counter${tooLong ? " over" : ""}`}>
          {memo.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}자
        </p>

        <button type="submit" className="primary" disabled={loading}>
          {loading ? "정리 중... (10~30초)" : "정리하기"}
        </button>

        {error && <p className="error">{error}</p>}
        <p className="privacy">※ 무료 AI로 보내지므로 실제 회사 기밀·개인정보는 넣지 마세요.</p>
      </form>

      {result && (
        <section className="result" aria-live="polite">
          <h2 className="result-title">{result.title}</h2>

          {checked.length > 0 && (
            <p className={`trust${verifiedCount === checked.length ? "" : " warn"}`}>
              {verifiedCount === checked.length
                ? `✓ 결정·할 일 ${checked.length}개 모두 메모 원문에서 근거를 찾았어요.`
                : `⚠ ${checked.length}개 중 ${checked.length - verifiedCount}개는 원문에서 근거를 찾지 못했어요. 확인해 주세요.`}
            </p>
          )}

          <div className="block">
            <h3>📌 핵심 요약</h3>
            <ol className="summary">
              {result.summary.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>

          <div className="block">
            <h3>✅ 결정 사항</h3>
            {result.decisions.length === 0 ? (
              <p className="empty">결정된 사항 없음</p>
            ) : (
              <ul className="items">
                {result.decisions.map((d, i) => (
                  <li key={i}>
                    <p className="item-text">{d.text}</p>
                    <Evidence quote={d.quote} verified={d.verified} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="block">
            <h3>📝 할 일</h3>
            {missing && (missing.owner > 0 || missing.due > 0) && (
              <p className="alert">
                ⚠{" "}
                {[
                  missing.owner > 0 && `담당자가 정해지지 않은 할 일 ${missing.owner}개`,
                  missing.due > 0 && `기한이 없는 할 일 ${missing.due}개`,
                ].filter(Boolean).join(" · ")}
                {" — 회의 끝나기 전에 정해 보세요."}
              </p>
            )}
            {result.todos.length === 0 ? (
              <p className="empty">없음</p>
            ) : (
              <ul className="items">
                {result.todos.map((t, i) => (
                  <li key={i}>
                    <p className="item-text">{t.task}</p>
                    <p className="meta">
                      <span className={t.owner === "미정" ? "unknown" : ""}>담당: {t.owner}</span>
                      <span className={t.due === "미정" ? "unknown" : ""}>기한: {t.due}</span>
                    </p>
                    <Evidence quote={t.quote} verified={t.verified} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="block">
            <h3>❓ 남은 질문</h3>
            {result.open_questions.length === 0 ? (
              <p className="empty">없음</p>
            ) : (
              <ul className="plain">
                {result.open_questions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            )}
          </div>

          <div className="copy-row">
            <button type="button" onClick={() => copy("kakao")}>카톡용 복사</button>
            <button type="button" onClick={() => copy("mail")}>메일용 복사</button>
          </div>
          {copied && <p className="notice">{copied}</p>}
          <p className="model">답한 모델: {result.model}</p>
        </section>
      )}
    </main>
  );
}
