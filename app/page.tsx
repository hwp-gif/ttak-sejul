"use client";

import { useEffect, useRef, useState } from "react";
import { EXAMPLES } from "@/lib/examples";
import {
  MAX_LENGTH,
  countMissing,
  findUncoveredLines,
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

const DRAFT_KEY = "ttak-sejul:draft";

export default function Home() {
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<(SummarizeResponse & { memo: string }) | null>(null);
  const [copied, setCopied] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [restored, setRestored] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const tooLong = memo.length > MAX_LENGTH;

  // 메모 자동 보관: 새로고침해도 쓰던 메모가 남게 (이 브라우저에만 저장)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
      if (saved?.memo) {
        setTitle(saved.title ?? "");
        setMemo(saved.memo);
        setRestored(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (memo || title) localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, memo }));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }, [title, memo]);

  // 기다림 안내: 정리 중에는 1초마다 경과 시간을 올린다.
  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [loading]);

  // 결과가 나오면 결과로 자동 이동 (폰에서 결과가 아래에 숨지 않게)
  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  function clearInput() {
    setTitle("");
    setMemo("");
    setError("");
    setRestored(false);
  }

  // F6: 예시 2~3개 중 무작위로 하나 (지금 입력칸과 같은 예시는 피함)
  function loadExample() {
    const others = EXAMPLES.filter((ex) => ex.memo !== memo);
    const pick = others[Math.floor(Math.random() * others.length)];
    setTitle(pick.title);
    setMemo(pick.memo);
    setError("");
    setRestored(false);
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
      setResult({ ...(data as SummarizeResponse), memo });
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
      setCopied(kind);
      setTimeout(() => setCopied((c) => (c === kind ? "" : c)), 2000);
    } catch {
      setCopied("fail");
    }
  }

  const missing = result ? countMissing(result.todos) : null;
  const checked = result ? [...result.decisions, ...result.todos] : [];
  const verifiedCount = checked.filter((x) => x.verified).length;
  const uncovered = result ? findUncoveredLines(result.memo, result) : [];

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

      <form ref={formRef} className="panel" onSubmit={handleSubmit}>
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
          <span className="actions">
            {memo && (
              <button type="button" className="secondary ghost" onClick={clearInput} disabled={loading}>
                지우기
              </button>
            )}
            <button type="button" className="secondary" onClick={loadExample} disabled={loading}>
              예시로 해 보기
            </button>
          </span>
        </div>
        <textarea
          id="memo"
          rows={12}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl+Enter (맥은 Cmd+Enter)로 바로 정리
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          placeholder="회의 중에 적은 메모를 그대로 붙여 넣으세요. 대충 적어도 괜찮아요."
        />
        <div className="under-memo">
          <span className="hint">
            {restored ? "💾 쓰던 메모를 불러왔어요." : "🎤 폰에서는 키보드의 마이크 버튼으로 말해도 돼요 · PC는 Ctrl+Enter"}
          </span>
          <span className={`counter${tooLong ? " over" : ""}`}>
            {memo.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}자
          </span>
        </div>

        <button type="submit" className="primary" disabled={loading}>
          {loading ? `정리 중... ${elapsed}초` : "정리하기"}
        </button>
        {loading && (
          <div className="waiting" role="status">
            <div className="bar"><span /></div>
            <p>
              {elapsed < 30
                ? "AI가 요약 · 결정 · 할 일을 찾고, 근거를 원문과 맞춰 보고 있어요. 보통 10~30초 걸려요."
                : "무료 AI가 붐벼서 조금 더 걸리고 있어요. 1분까지 걸릴 수 있어요."}
            </p>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        <p className="privacy">※ 무료 AI로 보내지므로 실제 회사 기밀·개인정보는 넣지 마세요.</p>
      </form>

      {result && (
        <section ref={resultRef} className="result" aria-live="polite">
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
                {result.open_questions.map((q, i) => <li key={i}>{q.text}</li>)}
              </ul>
            )}
          </div>

          {uncovered.length > 0 && (
            <details className="block uncovered">
              <summary>🔍 정리에 안 들어간 메모 {uncovered.length}줄 — 빠뜨린 게 없는지 확인해 보세요</summary>
              <ul className="plain">
                {uncovered.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
              <p className="empty">참석자 · 잡담처럼 빠져도 되는 줄도 있어요. 중요한 내용이면 메모를 다듬어 다시 정리해 보세요.</p>
            </details>
          )}

          <div className="copy-row">
            <button type="button" className={copied === "kakao" ? "done" : ""} onClick={() => copy("kakao")}>
              {copied === "kakao" ? "복사됨 ✓" : "카톡용 복사"}
            </button>
            <button type="button" className={copied === "mail" ? "done" : ""} onClick={() => copy("mail")}>
              {copied === "mail" ? "복사됨 ✓" : "메일용 복사"}
            </button>
          </div>
          {copied === "fail" && <p className="error">복사하지 못했어요. 글자를 직접 선택해 복사해 주세요.</p>}
          <p className="model">답한 모델: {result.model}</p>
        </section>
      )}
    </main>
  );
}
