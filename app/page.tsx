"use client";

import { useEffect, useRef, useState } from "react";
import { EXAMPLES } from "@/lib/examples";
import { KimDialog, KimSays, type Mood } from "./Kim";
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
import type { MeetingLog } from "@/lib/db";

const DUE_CHOICES = ["오늘", "내일", "이번 주", "다음 주"];
const DRAFT_KEY = "ttak-sejul:draft";
const CLIENT_KEY = "ttak-sejul:client";

// 이 브라우저의 무작위 번호: 내 기록만 불러오는 데 쓴다 (로그인 대신, 추측할 수 없는 UUID)
function getClientId(): string | null {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return null; // 저장소를 못 쓰는 브라우저(사생활 보호 모드 등)는 기록 없이 사용
  }
}

const formatDate = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${"일월화수목금토"[d.getDay()]})`;
const COACH_KEY = "ttak-sejul:coach-seen";

// (?) 도움말: 처음 쓰는 사람이 막히는 그 자리에서 바로 설명
const HELP = {
  verify: {
    title: "✓ 원문 확인이 뭔가요?",
    mood: "think",
    body: "제가 근거 문장을 메모랑 한 글자씩 대조해 봤어요! ✓면 메모에 진짜 있는 말이고요, ⚠면… 제가 살짝 바꿔 썼거나 지어냈을 수도 있어요 💦 그것만 한 번 봐 주세요.",
  },
  unknown: {
    title: "‘미정’은 왜 생기나요?",
    mood: "happy",
    body: "메모에 담당자나 기한이 없으면, 저는 절대 지어내지 않고 ‘미정’으로 둬요. ‘정하기 ✎’를 누르면 메모에 나온 이름이 버튼으로 떠요. 카톡·메일 복사에도 반영됩니다!",
  },
  uncovered: {
    title: "정리에 안 들어간 메모",
    mood: "think",
    body: "솔직히 말씀드리면… AI는 지어내는 것보다 빼먹는 실수를 더 많이 해요. 그래서 제가 정리에 안 쓴 메모 줄을 따로 모아 놨어요. 중요한 게 있으면 메모를 고쳐서 다시 맡겨 주세요!",
  },
  lang: {
    title: "결과 언어",
    mood: "wave",
    body: "English, 日本語, 中文, Tiếng Việt로도 정리해 드려요! 근거 문장이랑 이름은 원문 그대로 둬서 ✓ 원문 확인은 그대로예요.",
  },
  timer: {
    title: "회의 타이머",
    mood: "happy",
    body: "회의 시간을 재고 있어요. 결과에 ‘32분 회의’처럼 남겨 둘게요. 회의 중엔 화면이 안 꺼지게 꼭 붙잡고 있을게요! (30분이 넘으면… 제 김이 식어요.)",
  },
} as const satisfies Record<string, { title: string; mood: Mood; body: string }>;

// 정리 기다리는 동안 킴대리 혼잣말
const WAIT_LINES = ["할 일 줍는 중…", "누가 뭘 하기로 했더라…", "근거 맞춰 보는 중…", "세 줄로 꾹꾹 누르는 중…"];
const TIRED_MINUTES = 30;
type HelpKey = keyof typeof HELP;

type Result = SummarizeResponse & { memo: string; minutes: number; date: string; fromLog?: boolean };

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
  const [recent, setRecent] = useState<MeetingLog[]>([]);
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
  const [tiredHidden, setTiredHidden] = useState(false);
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

  // F4: 첫 화면에 올 때마다 이 브라우저의 최근 회의를 불러온다 (실패하면 목록만 안 보임)
  useEffect(() => {
    if (stage !== "home") return;
    const client = getClientId();
    if (!client) return;
    let cancelled = false;
    fetch(`/api/logs?client=${client}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && Array.isArray(data?.logs)) setRecent(data.logs); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [stage]);

  // 회의 중에는 화면이 꺼지지 않게 (지원하는 폰·브라우저만)
  useEffect(() => {
    if (stage !== "meeting" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release().catch(() => {}); };
  }, [stage]);

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
    <KimDialog key={help} title={HELP[help].title} body={HELP[help].body} mood={HELP[help].mood} onClose={() => setHelp(null)} />
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
    setTiredHidden(false);
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
        body: JSON.stringify({
          title, memo, lang,
          clientId: getClientId(),
          minutes: startedAt ? (Date.now() - startedAt) / 60_000 : 0,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(data?.error ?? "정리하지 못했어요. 다시 시도해 주세요.");
        return;
      }
      setDoneTodos(new Set());
      setResult({
        ...(data as SummarizeResponse),
        memo,
        minutes: startedAt ? Math.round((Date.now() - startedAt) / 60_000) : 0,
        date: formatDate(new Date()),
      });
    } catch {
      setError("서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  // 최근 회의를 누르면 저장된 결과를 다시 연다
  function openLog(log: MeetingLog) {
    setDoneTodos(new Set());
    setPicking(null);
    setCopied("");
    setResult({
      title: log.title,
      summary: log.summary,
      decisions: log.decisions,
      todos: log.todos,
      open_questions: log.open_questions,
      people: log.people,
      lang: log.lang,
      model: log.model,
      memo: log.original,
      minutes: log.minutes,
      date: formatDate(new Date(log.createdAt)),
      fromLog: true,
    });
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
          <KimSays mood="wave" size={72} className="hero-kim">
            <span className="greeting">{clock ? greetingFor(clock.getHours()).replace(".", "!") : "Hello!"}</span>{" "}
            킴대리예요. 오늘 회의도 딱 세 줄로 끝내 봐요 ☕
          </KimSays>
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

        {recent.length > 0 && (
          <section className="recent" aria-labelledby="recent-title">
            <h2 id="recent-title">최근 회의</h2>
            <ul>
              {recent.map((log) => (
                <li key={log.id}>
                  <button type="button" className="recent-item" onClick={() => openLog(log)}>
                    <span className="recent-top">
                      <span className="recent-name">{log.title}</span>
                      <span className="recent-date">{formatDate(new Date(log.createdAt))}</span>
                    </span>
                    <span className="recent-sub">{log.summary[0]}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="hint">이 브라우저에서 정리한 회의만 보여요</p>
          </section>
        )}

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

        {now && startedAt && now - startedAt >= TIRED_MINUTES * 60_000 && !tiredHidden && (
          <div className="tired-note">
            <KimSays mood="tired" size={40}>
              부장님… 제 김이 식어 가고 있어요. 정할 건 정해졌나요?
            </KimSays>
            <button type="button" className="icon-btn" aria-label="알림 닫기" onClick={() => setTiredHidden(true)}>×</button>
          </div>
        )}

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
                <KimSays mood="think" size={44}>
                  {elapsed < 10
                    ? WAIT_LINES[Math.floor(elapsed / 2) % WAIT_LINES.length]
                    : "무료 AI가 붐벼서 다른 모델한테 부탁하는 중이에요… 최대 50초쯤 걸려요."}
                </KimSays>
                <div className="bar"><span /></div>
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
  const allVerified = checked.length > 0 && verifiedCount === checked.length;
  const allDone = r.todos.length > 0 && doneTodos.size === r.todos.length;

  return (
    <main className="shell result iris" aria-live="polite">
      <header className="topbar">
        {r.fromLog ? (
          <button type="button" className="icon-btn text" onClick={newMeeting}>← 처음으로</button>
        ) : (
          <button type="button" className="icon-btn text" onClick={() => setResult(null)}>← 메모 고치기</button>
        )}
        <Wordmark />
      </header>

      <section className="result-head">
        <p className="kicker">{r.date}{r.minutes > 0 ? ` · ${r.minutes}분 회의` : ""}</p>
        <h1>{r.title}</h1>
        {allVerified && <div className="stamp" aria-hidden>근거<br />100%</div>}
        {checked.length > 0 && (
          <KimSays mood={allVerified ? "love" : "think"} size={52} className={`trust${allVerified ? "" : " warn"}`}>
            {allVerified
              ? `결정·할 일 ${checked.length}개, 전부 원문에 있습니다! 오늘은 칼퇴각이에요 ☕`
              : `앗… ${checked.length}개 중 ${checked.length - verifiedCount}개는 원문에서 못 찾았어요. 제가 좀 지어낸 것 같아요. 한 번만 봐 주세요 💦`}
            {helpBtn("verify")}
          </KimSays>
        )}
      </section>

      {showCoach && (
        <aside className="coach" aria-label="처음 쓰는 분께">
          <KimSays mood="wave" size={56}>
            <p className="coach-title">처음이시죠? 킴대리입니다 👋</p>
            <ul>
              <li><b>✓ 원문 확인</b> — 제가 쓴 근거가 메모에 진짜 있다는 뜻이에요</li>
              <li><b>미정 · 정하기 ✎</b> — 빠진 담당자 · 기한을 눌러서 바로 정해요</li>
              <li>궁금한 곳은 옆의 <span className="help-btn static" aria-hidden>?</span> 를 눌러 주세요. 제가 설명해 드릴게요!</li>
            </ul>
            <button type="button" className="btn-soft" onClick={closeCoach}>알겠어요</button>
          </KimSays>
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
          <p className="empty">결정된 사항 없음 <span className="quip">— 오늘은 이야기만 나눈 날이네요. 그것도 회의죠, 뭐.</span></p>
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
        {allDone && (
          <KimSays mood="love" size={40} className="all-done">오늘 회의, 완벽 마무리! 수고하셨어요 ☕</KimSays>
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
      <p className="model">
        {!r.fromLog && (r.saved ? "💾 이 브라우저의 최근 회의에 저장했어요 · " : "기록 저장은 못 했어요 (정리 결과는 그대로예요) · ")}
        답한 모델: {r.model}
      </p>
      {helpSheet}
    </main>
  );
}
