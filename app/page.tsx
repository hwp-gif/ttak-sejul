"use client";

import { useState } from "react";
import { EXAMPLES } from "@/lib/examples";

const MAX_LENGTH = 3000;

export default function Home() {
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const tooLong = memo.length > MAX_LENGTH;

  // F6: 예시 2~3개 중 무작위로 하나 (지금 입력칸과 같은 예시는 피함)
  function loadExample() {
    const others = EXAMPLES.filter((ex) => ex.memo !== memo);
    const pick = others[Math.floor(Math.random() * others.length)];
    setTitle(pick.title);
    setMemo(pick.memo);
    setError("");
    setNotice("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotice("");
    if (memo.trim() === "") {
      setError("메모를 입력해 주세요.");
      return;
    }
    if (tooLong) {
      setError(`메모가 너무 길어요. ${MAX_LENGTH.toLocaleString()}자 이하로 줄여 주세요.`);
      return;
    }
    setError("");
    // TODO(F2): /api/summarize 호출 — 다음 단계에서 연결
    setNotice("입력 확인 완료! AI 정리 기능은 다음 단계에서 연결합니다.");
  }

  return (
    <main className="container">
      <h1>
        <span className="brand">딱세줄</span> · 회의록 3줄 요약기
      </h1>
      <p className="subtitle">
        회의 메모를 붙여 넣으면 핵심 요약 3줄 · 결정 사항 · 할 일 · 남은 질문으로 정리해 드려요.
      </p>

      <form className="panel" onSubmit={handleSubmit}>
        <label className="label" htmlFor="title">
          회의 제목 <span style={{ fontWeight: 400, color: "#8c959f" }}>(선택)</span>
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
          <button type="button" className="secondary" onClick={loadExample}>
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

        <button type="submit" className="primary">정리하기</button>

        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        <p className="privacy">※ 무료 AI로 보내지므로 실제 회사 기밀·개인정보는 넣지 마세요.</p>
      </form>
    </main>
  );
}
