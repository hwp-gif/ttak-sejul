"use client";

import { useEffect, useRef, useState } from "react";
import { EXAMPLES } from "@/lib/examples";
import { findPrivate, maskPrivate } from "@/lib/privacy";
import {
  MAX_LENGTH,
  countMissing,
  findUncoveredLines,
  LANGS,
  type Lang,
  toKakao,
  toMail,
  UNKNOWN,
  type SummarizeResponse,
  type Todo,
} from "@/lib/summary";

const DUE_CHOICES = ["오늘", "내일", "이번 주", "다음 주"];
const DRAFT_KEY = "ttak-sejul:draft";
const COACH_KEY = "ttak-sejul:coach-seen";

// (?) 도움말: 처음 쓰는 사람이 막히는 그 자리에서 바로 설명
const HELP = {
  verify: {
    title: "✓ 원문 확인이 뭔가요?",
    body: "AI가 붙인 근거 문장이 메모에 실제로 있는지 코드로 한 글자씩 맞춰 봤어요. ✓면 메모에 있는 내용, ⚠면 AI가 바꿔 썼거나 지어냈을 수 있으니 한 번 확인해 주세요.",
  },
  unknown: {
    title: "‘미정’은 왜 생기나요?",
    body: "메모에 담당자나 기한이 없으면 AI가 지어내지 않고 ‘미정’으로 둬요. ‘정하기 ✎’를 누르면 메모에 나온 이름이나 기한 보기가 떠서 바로 고를 수 있어요. 복사할 때도 반영돼요.",
  },
  uncovered: {
    title: "정리에 안 들어간 메모",
    body: "AI 요약은 지어내기보다 빼먹는 실수가 더 많아요. 그래서 어떤 근거에도 쓰이지 않은 메모 줄을 모아 보여 드려요. 중요한 내용이 있으면 메모를 고쳐 다시 정리해 보세요.",
  },
  lang: {
    title: "결과 언어",
    body: "요약 · 결정 · 할 일을 고른 언어로 정리해요. 근거 문장과 이름은 원문 그대로 둬서 ✓ 원문 확인은 그대로 유지돼요.",
  },
  timer: {
    title: "회의 타이머",
    body: "회의 시작부터 시간을 재요. 정리하면 결과에 ‘32분 회의’처럼 남아요. 회의 중에는 화면이 꺼지지 않게 해 둬요 (지원하는 폰만).",
  },
} as const;
type HelpKey = keyof typeof HELP;

type Result = SummarizeResponse & { memo: string; minutes: number; date: string };

// 미정 바로 채우기: 메모에 나온 이름(또는 기한 보기)을 버튼으로 고르거나 직접 입력
function Picker({ choices, placeholder, onPick, onClose }: {
  choices: string[]; placeholder: string; onPick: (v: string) => void; onClose: () => void;
}) {
  const [custom, setCustom] = useState("");
  return (
    <div className="picker">
      {choices.map((c) => (
        <button key={c} type="button" className="chip" onClick={() => onPick(c)}>{c}</button>
      ))}
      <form
        className="custom"
        onSubmit={(e) => { e.preventDefault(); if (custom.trim()) onPick(custom.trim().slice(0, 20)); }}
      >
        <input type="text" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        <button type="submit" className="chip">확인</button>
      </form>
      <button type="button" className="chip ghost" onClick={onClose}>닫기</button>
    </div>
  );
}

function Evidence({ quote, verified }: { quote: string; verified: boolean }) {
  if (!quote) return <p className="evidence warn"><span className="badge">⚠ 근거 문장 없음</span></p>;
  return (
    <p className={`evidence${verified ? "" : " warn"}`}>
      <span className="badge">{verified ? "✓ 원문 확인" : "⚠ 원문에서 못 찾음"}</span>
      <span className="quote">“{quote}”</span>
    </p>
  );
}

function Wordmark() {
  return (
    <span className="wordmark">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={24} height={24} />
      딱세줄
    </span>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
function formatTimer(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  return `${h > 0 ? `${h}:` : ""}${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
function greetingFor(hour: number) {
  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  return "Good evening.";
}

export default function Home() {
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [restored, setRestored] = useState(false);
  const [lang, setLang] = useState<Lang>("ko");
  const [privacyAsk, setPrivacyAsk] = useState<{ phones: number; emails: number } | null>(null);
  const [picking, setPicking] = useState<{ index: number; field: "owner" | "due" } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null); // 회의 시작 시각 (null = 첫 화면)
  const [now, setNow] = useState<number | null>(null); // 화면 시계 (서버 렌더와 어긋나지 않게 브라우저에서만 채움)
  const [doneTodos, setDoneTodos] = useState<Set<number>>(new Set());
  const [help, setHelp] = useState<HelpKey | null>(null);
  const [showCoach, setShowCoach] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const memoRef = useRef<HTMLTextAreaElement>(null);

  const stage = result ? "result" : startedAt ? "meeting" : "home";
  const tooLong = memo.length > MAX_LENGTH;

  // 메모 자동 보관: 새로고침해도 쓰던 메모와 회의 시간이 남게 (이 브라우저에만 저장)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
      if (saved?.memo) {
        setTitle(saved.title ?? "");
        setMemo(saved.memo);
        setStartedAt(typeof saved.startedAt === "number" ? saved.startedAt : Date.now());
        setRestored(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (memo || title) localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, memo, startedAt }));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }, [title, memo, startedAt]);

  // 시계: 회의 중에는 1초마다, 첫 화면에서는 30초마다
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), stage === "meeting" ? 1000 : 30_000);
    return () => clearInterval(timer);
  }, [stage]);

  // 회의 중에는 화면이 꺼지지 않게 (지원하는 폰·브라우저만)
  useEffect(() => {
    if (stage !== "meeting" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, [stage]);

  // 도움말은 Esc로 닫기
  useEffect(() => {
    if (!help) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setHelp(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [help]);

  // 처음 결과를 본 사람에게만 짧은 안내 카드 (이 브라우저에 한 번만)
  useEffect(() => {
    if (stage !== "result") return;
    try { setShowCoach(!localStorage.getItem(COACH_KEY)); } catch { setShowCoach(true); }
  }, [stage]);

  function closeCoach() {
    setShowCoach(false);
    try { localStorage.setItem(COACH_KEY, "1"); } catch {}
  }

  const helpBtn = (k: HelpKey) => (
    <button
      type="button"
      className="help-btn"
      aria-label={`${HELP[k].title} 설명 보기`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setHelp(k); }}
    >
      ?
    </button>
  );

  const helpSheet = help && (
    <>
      <button type="button" className="help-backdrop" aria-label="설명 닫기" onClick={() => setHelp(null)} />
      <div className="help-sheet" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <h3 id="help-title">{HELP[help].title}</h3>
        <p>{HELP[help].body}</p>
        <button type="button" className="btn-primary" onClick={() => setHelp(null)}>알겠어요</button>
      </div>
    </>
  );

  // 기다림 안내: 정리 중에는 1초마다 경과 시간을 올린다.
  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [loading]);

  // 화면이 바뀌면 맨 위로
  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (stage === "meeting") memoRef.current?.focus({ preventScroll: true });
  }, [stage]);

  function clearInput() {
    setTitle("");
    setMemo("");
    setError("");
    setRestored(false);
    setPrivacyAsk(null);
  }

  function startMeeting() {
    setError("");
    setStartedAt(Date.now());
  }

  function backHome() {
    if (memo.trim() && !window.confirm("적은 메모를 지우고 처음 화면으로 갈까요?")) return;
    clearInput();
    setStartedAt(null);
  }

  function newMeeting() {
    setResult(null);
    clearInput();
    setStartedAt(null);
  }

  // F6: 예시 2~3개 중 무작위로 하나 (지금 입력칸과 같은 예시는 피함)
  function loadExample() {
    const others = EXAMPLES.filter((ex) => ex.memo !== memo);
    const pick = others[Math.floor(Math.random() * others.length)];
    setTitle(pick.title);
    setMemo(pick.memo);
    setError("");
    setRestored(false);
    if (!startedAt) setStartedAt(Date.now());
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (memo.trim() === "") return setError("메모를 입력해 주세요.");
    if (tooLong) return setError(`메모가 너무 길어요. ${MAX_LENGTH.toLocaleString()}자 이하로 줄여 주세요.`);

    // 개인정보 경고: 전화번호·이메일이 있으면 보내기 전에 먼저 묻는다.
    const found = findPrivate(memo);
    if (found.phones + found.emails > 0) {
      setError("");
      setPrivacyAsk(found);
      return;
    }
    summarize(memo);
  }

  function answerPrivacy(mask: boolean) {
    const text = mask ? maskPrivate(memo) : memo;
    if (mask) setMemo(text);
    setPrivacyAsk(null);
    summarize(text);
  }

  async function summarize(memo: string) {
    setError("");
    setPicking(null);
    setCopied("");
    setLoading(true);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, memo, lang }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(data?.error ?? "정리하지 못했어요. 다시 시도해 주세요.");
        return;
      }
      const d = new Date();
      setDoneTodos(new Set());
      setResult({
        ...(data as SummarizeResponse),
        memo,
        minutes: startedAt ? Math.round((Date.now() - startedAt) / 60_000) : 0,
        date: `${d.getMonth() + 1}월 ${d.getDate()}일 (${"일월화수목금토"[d.getDay()]})`,
      });
    } catch {
      setError("서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  function fillTodo(index: number, field: "owner" | "due", value: string) {
    setResult((r) => r && {
      ...r,
      todos: r.todos.map((t, i): Todo => (i === index ? { ...t, [field]: value, edited: true } : t)),
    });
    setPicking(null);
  }

  function toggleDone(index: number) {
    setDoneTodos((s) => {
      const next = new Set(s);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
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

  // ───────────── 1. 첫 화면: 회의 시작 ─────────────
  if (stage === "home") {
    const clock = now ? new Date(now) : null;
    return (
      <main className="shell home">
        <header className="topbar">
          <Wordmark />
          {clock && (
            <span className="clock">
              {clock.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </header>

        <section className="hero">
          <p className="greeting">{clock ? greetingFor(clock.getHours()) : " "}</p>
          <h1>오늘 회의,<br />세 줄로 끝내요.</h1>
          <p className="lede">
            회의를 시작할 때 켜 두고 편하게 적으세요. 끝나면 요약 · 결정 · 할 일로 정리하고,
            하나하나 <strong>메모 원문에서 근거</strong>를 찾아 보여 드려요.
          </p>
        </section>

        <form
          className="card start-card"
          onSubmit={(e) => { e.preventDefault(); startMeeting(); }}
        >
          <label className="label" htmlFor="title-home">
            회의 제목 <span className="optional">선택 · 비우면 AI가 붙여요</span>
          </label>
          <input
            id="title-home"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 주간 팀 회의"
            maxLength={100}
          />
          <button type="submit" className="btn-start">
            <span className="rec-dot" aria-hidden /> 회의 시작
          </button>
          <button type="button" className="btn-link" onClick={loadExample}>
            예시 회의로 둘러보기 →
          </button>
        </form>

        <ol className="how">
          <li><b>1</b><span>회의 시작을 누르고</span></li>
          <li><b>2</b><span>대충 편하게 적다가</span></li>
          <li><b>3</b><span>끝나면 딱 세 줄로</span></li>
        </ol>

        <p className="footnote">무료 AI로 정리해요 · 회사 기밀이나 개인정보는 넣지 마세요</p>
      </main>
    );
  }

  // ───────────── 2. 회의 중: 메모 ─────────────
  if (stage === "meeting") {
    return (
      <main className="shell meeting">
        <header className="meeting-bar">
          <button type="button" className="icon-btn" onClick={backHome} disabled={loading} aria-label="처음 화면으로">
            ←
          </button>
          <span className="live"><span className="rec-dot" aria-hidden />회의 중</span>
          <span className="timer" aria-label="회의 시간">
            {now && startedAt ? formatTimer(now - startedAt) : "00:00"}
          </span>
          {helpBtn("timer")}
        </header>

        <form ref={formRef} className="meeting-form" onSubmit={handleSubmit}>
          <input
            className="title-inline"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="회의 제목 (비우면 AI가 붙여요)"
            aria-label="회의 제목"
            maxLength={100}
          />

          <div className="paper">
            <textarea
              ref={memoRef}
              id="memo"
              aria-label="회의 메모"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              onKeyDown={(e) => {
                // Ctrl+Enter (맥은 Cmd+Enter)로 바로 정리
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
              placeholder={"회의하면서 들리는 대로 적어 보세요.\n\n- 누가 무엇을 언제까지\n- 정한 것, 못 정한 것\n\n대충 적어도 괜찮아요."}
            />
          </div>

          <div className="under-memo">
            <span className="hint">
              {restored ? "💾 쓰던 메모를 불러왔어요" : "🎤 폰에서는 키보드 마이크로 말해도 돼요 · PC는 Ctrl+Enter"}
            </span>
            <span className={`counter${tooLong ? " over" : ""}`}>
              {memo.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}
            </span>
          </div>

          <div className="tools">
            <button type="button" className="chip" onClick={loadExample} disabled={loading}>예시 넣기</button>
            {memo && (
              <button type="button" className="chip ghost" onClick={clearInput} disabled={loading}>지우기</button>
            )}
            <label className="lang">
              <span>결과 언어</span>
              <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} disabled={loading}>
                {(Object.keys(LANGS) as Lang[]).map((code) => (
                  <option key={code} value={code}>{LANGS[code].label}</option>
                ))}
              </select>
            </label>
            {helpBtn("lang")}
          </div>
          {lang !== "ko" && <p className="hint">근거 문장은 원문 그대로 보여 줘요 (✓ 확인용)</p>}

          {error && <p className="error">{error}</p>}
          {privacyAsk && (
            <div className="privacy-ask" role="alertdialog" aria-label="개인정보 확인">
              <p>
                🔒 메모에{" "}
                {[privacyAsk.phones > 0 && `전화번호 ${privacyAsk.phones}개`, privacyAsk.emails > 0 && `이메일 ${privacyAsk.emails}개`]
                  .filter(Boolean).join(", ")}
                가 있어요. 무료 AI로 보내기 전에 가릴까요?
              </p>
              <div className="row">
                <button type="button" className="btn-primary" onClick={() => answerPrivacy(true)}>가리고 정리하기</button>
                <button type="button" className="btn-soft" onClick={() => answerPrivacy(false)}>그대로 정리하기</button>
              </div>
            </div>
          )}

          <div className="dock">
            {loading && (
              <div className="waiting" role="status">
                <div className="bar"><span /></div>
                <p>
                  {elapsed < 10
                    ? "요약 · 결정 · 할 일을 찾고, 근거를 원문과 맞춰 보고 있어요. 보통 2~5초 걸려요."
                    : "무료 AI가 붐벼서 다른 모델로 다시 시도하고 있어요. 1분까지 걸릴 수 있어요."}
                </p>
              </div>
            )}
            <button type="submit" className="btn-end" disabled={loading}>
              {loading ? `정리하는 중… ${elapsed}초` : <><span className="stop-sq" aria-hidden /> 회의 끝 · 딱세줄로 정리</>}
            </button>
          </div>
        </form>
        {helpSheet}
      </main>
    );
  }

  // ───────────── 3. 정리 결과 ─────────────
  const r = result!;
  const missing = countMissing(r.todos);
  const checked = [...r.decisions, ...r.todos];
  const verifiedCount = checked.filter((x) => x.verified).length;
  const uncovered = findUncoveredLines(r.memo, r);

  return (
    <main className="shell result" aria-live="polite">
      <header className="topbar">
        <button type="button" className="icon-btn text" onClick={() => setResult(null)}>← 메모 고치기</button>
        <Wordmark />
      </header>

      <section className="result-head">
        <p className="kicker">{r.date}{r.minutes > 0 ? ` · ${r.minutes}분 회의` : ""}</p>
        <h1>{r.title}</h1>
        {checked.length > 0 && (
          <p className={`trust${verifiedCount === checked.length ? "" : " warn"}`}>
            {verifiedCount === checked.length
              ? `✓ 결정·할 일 ${checked.length}개 모두 메모 원문에서 근거를 찾았어요`
              : `⚠ ${checked.length}개 중 ${checked.length - verifiedCount}개는 원문에서 근거를 못 찾았어요. 확인해 주세요`}
            {helpBtn("verify")}
          </p>
        )}
      </section>

      {showCoach && (
        <aside className="coach" aria-label="처음 쓰는 분께">
          <p className="coach-title">처음이시죠? 👋</p>
          <ul>
            <li><b>✓ 원문 확인</b> — AI가 쓴 근거가 메모에 실제로 있다는 뜻이에요</li>
            <li><b>미정 · 정하기 ✎</b> — 빠진 담당자 · 기한을 눌러서 바로 정해요</li>
            <li>궁금한 곳은 옆의 <span className="help-btn static" aria-hidden>?</span> 를 눌러 보세요</li>
          </ul>
          <button type="button" className="btn-soft" onClick={closeCoach}>알겠어요</button>
        </aside>
      )}

      <section className="card">
        <h2>핵심 요약</h2>
        <ol className="summary">
          {r.summary.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      </section>

      <section className="card">
        <h2>결정 사항</h2>
        {r.decisions.length === 0 ? (
          <p className="empty">결정된 사항 없음</p>
        ) : (
          <ul className="items">
            {r.decisions.map((d, i) => (
              <li key={i}>
                <p className="item-text">{d.text}</p>
                <Evidence quote={d.quote} verified={d.verified} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>할 일 {helpBtn("unknown")}</h2>
        {(missing.owner > 0 || missing.due > 0) && (
          <p className="alert">
            {[
              missing.owner > 0 && `담당자 없는 할 일 ${missing.owner}개`,
              missing.due > 0 && `기한 없는 할 일 ${missing.due}개`,
            ].filter(Boolean).join(" · ")}
            {" — '정하기 ✎'로 바로 정해 보세요"}
          </p>
        )}
        {r.todos.length === 0 ? (
          <p className="empty">없음</p>
        ) : (
          <ul className="items todos">
            {r.todos.map((t, i) => (
              <li key={i} className={doneTodos.has(i) ? "done" : ""}>
                <label className="todo-head">
                  <input type="checkbox" checked={doneTodos.has(i)} onChange={() => toggleDone(i)} />
                  <span className="item-text">{t.task}</span>
                </label>
                <p className="meta">
                  {(["owner", "due"] as const).map((field) => {
                    const value = t[field];
                    const label = field === "owner" ? "담당" : "기한";
                    return value === UNKNOWN ? (
                      <button key={field} type="button" className="fill" onClick={() => setPicking({ index: i, field })}>
                        {label}: 미정 · 정하기 ✎
                      </button>
                    ) : (
                      <span key={field} className="tag">{label} · {value}</span>
                    );
                  })}
                  {t.edited && <span className="edited">✎ 직접 정함</span>}
                </p>
                {picking?.index === i && (
                  <Picker
                    choices={picking.field === "owner" ? r.people : DUE_CHOICES}
                    placeholder={picking.field === "owner" ? "이름 직접 입력" : "예: 11/27(금)"}
                    onPick={(v) => fillTodo(i, picking.field, v)}
                    onClose={() => setPicking(null)}
                  />
                )}
                <Evidence quote={t.quote} verified={t.verified} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>남은 질문</h2>
        {r.open_questions.length === 0 ? (
          <p className="empty">없음</p>
        ) : (
          <ul className="plain">
            {r.open_questions.map((q, i) => <li key={i}>{q.text}</li>)}
          </ul>
        )}
      </section>

      {uncovered.length > 0 && (
        <details className="card uncovered">
          <summary>정리에 안 들어간 메모 {uncovered.length}줄 — 빠진 게 없는지 확인해 보세요 {helpBtn("uncovered")}</summary>
          <ul className="plain">
            {uncovered.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
          <p className="empty">참석자 · 잡담처럼 빠져도 되는 줄도 있어요. 중요한 내용이면 메모를 고쳐 다시 정리해 보세요.</p>
        </details>
      )}

      <div className="row copy-row">
        <button type="button" className={`btn-primary${copied === "kakao" ? " copied" : ""}`} onClick={() => copy("kakao")}>
          {copied === "kakao" ? "복사됨 ✓" : "카톡용 복사"}
        </button>
        <button type="button" className={`btn-primary${copied === "mail" ? " copied" : ""}`} onClick={() => copy("mail")}>
          {copied === "mail" ? "복사됨 ✓" : "메일용 복사"}
        </button>
      </div>
      {copied === "fail" && <p className="error">복사하지 못했어요. 글자를 직접 선택해 복사해 주세요.</p>}

      <button type="button" className="btn-soft wide" onClick={newMeeting}>
        <span className="rec-dot" aria-hidden /> 새 회의 시작
      </button>
      <p className="model">답한 모델: {r.model}</p>
      {helpSheet}
    </main>
  );
}
