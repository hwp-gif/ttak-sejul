"use client";

// ☕ 킴대리 (본명 Morak Kim) — 딱세줄 회의록팀 · 입사 1일차
// 1930년대 고무호스 팔다리 만화 화풍을 참고해 직접 그린 넥타이 맨 머그잔.
// 머리 위 세 줄 '김'이 표정처럼 바뀐다: 기쁨(꼬불꼬불) · 고민(?) · 하트 · 지침(식어 감)

import { useCallback, useEffect, useId, useState } from "react";

export type Mood = "happy" | "wave" | "think" | "love" | "tired";

const INK = "#2b2620";
const CREAM = "#fbf3e4";
const STEAM = "#b9ab97";

function Steam({ mood }: { mood: Mood }) {
  const common = { fill: "none", stroke: STEAM, strokeWidth: 3.2, strokeLinecap: "round" as const };
  if (mood === "love") {
    return (
      <g className="kim-steam">
        <path {...common} d="M42 36 q-5 -5 0 -10" />
        <path d="M60 33 C 48 22 52 10 60 18 C 68 10 72 22 60 33 Z" fill="#e0785a" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
        <path {...common} d="M78 36 q5 -5 0 -10" />
      </g>
    );
  }
  if (mood === "think") {
    return (
      <g className="kim-steam">
        <path {...common} d="M42 37 q-5 -5 0 -10" />
        <path {...common} d="M53 16 q0 -8 7 -8 q7 0 7 7 q0 5 -7 8 v5" />
        <circle cx="60" cy="35" r="2" fill={STEAM} />
        <path {...common} d="M78 37 q5 -5 0 -10" />
      </g>
    );
  }
  if (mood === "tired") {
    return (
      <g className="kim-steam" opacity="0.35">
        <path {...common} d="M44 38 q-3 -3 0 -6" />
        <path {...common} d="M60 38 q3 -3 0 -6" />
        <path {...common} d="M76 38 q-3 -3 0 -6" />
      </g>
    );
  }
  // happy · wave: 꼬불꼬불 세 줄
  return (
    <g className="kim-steam">
      <path {...common} d="M44 38 q-6 -6 0 -12 q6 -6 0 -12" />
      <path {...common} d="M60 36 q6 -6 0 -12 q-6 -6 0 -12 q6 -5 0 -9" />
      <path {...common} d="M76 38 q-6 -6 0 -12 q6 -6 0 -12" />
    </g>
  );
}

// 1940년대 고전 만화 눈: 길쭉한 흰자 + 까만 타원 눈동자(작은 빛 한 점) + 굵은 윗선
// cute(평소): 두 눈이 맞붙고 눈동자가 가운데로 살짝 모인 귀여운 눈
// lid = 눈꺼풀이 덮는 비율 (0 = 다 뜸, 0.5 = 반 감김) — 고민 · 하트 표정에서 표정 변화용
function Eyes({ lid, up, cute }: { lid: number; up: boolean; cute: boolean }) {
  const id = useId().replace(/:/g, "");
  const rx = cute ? 8.2 : 7.5;
  const ry = cute ? 11 : 10;
  const cy = cute ? 61 : 61;
  const top = cy - ry, h = ry * 2;
  const lidY = top + h * lid;
  const xs = cute ? [52, 68] : [51, 69]; // cute면 두 눈이 맞닿음
  const py = up ? 57 : cute ? 63.5 : 65;
  const pr = cute ? { rx: 4.6, ry: 6.8 } : { rx: 4.2, ry: 6 };
  return (
    <g>
      {xs.map((cx) => {
        const px = cx + (cx < 60 ? 1.2 : -1.2); // 가운데로 살짝 모인 눈동자
        return (
          <g key={cx}>
            <clipPath id={`${id}-${cx}`}>
              <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
            </clipPath>
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" />
            <g clipPath={`url(#${id}-${cx})`}>
              <ellipse cx={px} cy={py} rx={pr.rx} ry={pr.ry} fill={INK} />
              {/* 작은 빛 한 점 (반짝이 없이 눈에 생기만) */}
              <circle cx={px + pr.rx * 0.35} cy={py - pr.ry * 0.45} r={cute ? 1.6 : 1.3} fill="#fff" />
              {lid > 0 && <path d={`M${cx - 10} ${top - 2} H${cx + 10} V${lidY} Q${cx} ${lidY + 3.5} ${cx - 10} ${lidY} Z`} fill="#efe1c9" />}
            </g>
            {lid > 0 && <path d={`M${cx - rx + 0.4} ${lidY} Q${cx} ${lidY + 3.5} ${cx + rx - 0.4} ${lidY}`} fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />}
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={INK} strokeWidth="2.2" />
            {/* 굵은 윗선: 표정이 또렷해지는 고전 만화 눈매 */}
            {lid === 0 && (
              <path d={`M${cx - rx * 0.92} ${cy - ry * 0.35} Q${cx - rx * 0.5} ${top - 0.6} ${cx} ${top - 0.6} Q${cx + rx * 0.5} ${top - 0.6} ${cx + rx * 0.92} ${cy - ry * 0.35}`} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
            )}
          </g>
        );
      })}
    </g>
  );
}

export function KimDaeri({ mood = "happy", size = 72, className = "" }: { mood?: Mood; size?: number; className?: string }) {
  const tired = mood === "tired";
  return (
    <svg
      className={`kim kim-${mood} ${className}`}
      width={size}
      height={size * (140 / 120)}
      viewBox="0 0 120 140"
      aria-hidden
      focusable="false"
    >
      <Steam mood={mood} />
      <g className="kim-body">
        {/* 다리 + 구두 */}
        <path d="M49 103 C 47 112 45 118 44 124" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        <path d="M71 103 C 73 112 75 118 76 124" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        <ellipse cx="40" cy="127" rx="8.5" ry="4.6" fill={INK} />
        <ellipse cx="80" cy="127" rx="8.5" ry="4.6" fill={INK} />

        {/* 손잡이 (왼쪽) */}
        <path d="M30 54 C 12 54 12 82 30 82" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />

        {/* 팔: 고무호스처럼 휘어짐. wave면 오른팔을 들고 흔든다 */}
        <path d="M30 88 C 20 92 17 99 21 106" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="21" cy="108" r="5" fill={CREAM} stroke={INK} strokeWidth="2.5" />
        <g className={mood === "wave" ? "kim-wave-arm" : ""}>
          {mood === "wave" ? (
            <>
              <path d="M90 86 C 104 84 108 70 104 58" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
              <circle cx="104" cy="55" r="5" fill={CREAM} stroke={INK} strokeWidth="2.5" />
            </>
          ) : (
            <>
              <path d="M90 88 C 100 92 103 99 99 106" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
              <circle cx="99" cy="108" r="5" fill={CREAM} stroke={INK} strokeWidth="2.5" />
            </>
          )}
        </g>

        {/* 몸통 (머그) + 커피 */}
        <rect x="28" y="42" width="64" height="62" rx="11" fill={CREAM} stroke={INK} strokeWidth="3" />
        <ellipse cx="60" cy="45" rx="29" ry="5" fill="#6b4428" stroke={INK} strokeWidth="2.4" />

        {/* 얼굴 */}
        {tired ? (
          <>
            <path d="M44 66 q5 4 10 0" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
            <path d="M66 66 q5 4 10 0" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
            <path d="M52 81 q4 -3 8 0 q4 3 8 0" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
            <path d="M83 58 q3 5 0 7 q-3 -2 0 -7 Z" fill="#8fc0e0" stroke={INK} strokeWidth="1.2" />
          </>
        ) : (
          <>
            <Eyes up={mood === "think"} cute={mood === "happy" || mood === "wave"} lid={mood === "love" ? 0.22 : mood === "think" ? 0.12 : 0} />
            <g transform="translate(0 -1)">
            {mood === "think" ? (
              <path d="M54 81 q6 -2 12 1" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
            ) : mood === "happy" || mood === "wave" ? (
              // 고전 만화식 입 벌린 웃음 + 혀
              <g>
                <clipPath id="kim-mouth"><path d="M50 77 Q60 92 70 77 Z" /></clipPath>
                <path d="M50 77 Q60 92 70 77 Z" fill="#5a2a1f" />
                <ellipse cx="60" cy="87" rx="6" ry="4" fill="#e0785a" clipPath="url(#kim-mouth)" />
                <path d="M50 77 Q60 92 70 77 Z" fill="none" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
              </g>
            ) : (
              <path d="M50 78 q10 10 20 0" fill={mood === "love" ? "#8a3b2a" : "none"} stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            )}
            </g>
            <circle cx="41" cy="76" r="4" fill="#e0785a" opacity="0.45" />
            <circle cx="79" cy="76" r="4" fill="#e0785a" opacity="0.45" />
          </>
        )}

        {/* 넥타이 (오피스!) */}
        <path d="M55 88 L65 88 L62.5 92 L57.5 92 Z" fill="#b0532d" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M57.5 92 L62.5 92 L65 101 L60 104.5 L55 101 Z" fill="#c2643c" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

// 말풍선 한 줄: 킴대리 + 만화 말풍선
export function KimSays({ mood = "happy", size = 56, children, className = "" }: {
  mood?: Mood; size?: number; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`kim-says ${className}`}>
      <KimDaeri mood={mood} size={size} />
      <div className="bubble">{children}</div>
    </div>
  );
}

// (?) 도움말 대사창: 화면 아래에서 킴대리가 고개를 내밀고 말한다
export function KimDialog({ title, body, mood, onClose }: {
  title: string; body: string; mood: Mood; onClose: () => void;
}) {
  const [leaving, setLeaving] = useState(false);

  // 닫을 때도 스르륵 사라진 뒤에 없앤다 (움직임 줄이기 설정이면 바로)
  const close = useCallback(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return onClose();
    setLeaving(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className={`kim-layer${leaving ? " leaving" : ""}`}>
      <button type="button" className="help-backdrop" aria-label="설명 닫기" onClick={close} />
      <div className="kim-dialog" role="dialog" aria-modal="true" aria-labelledby="kim-dialog-title">
        <KimDaeri mood={mood} size={84} className="kim-peek" />
        <div className="bubble big">
          <span className="nameplate">킴대리</span>
          <h3 id="kim-dialog-title">{title}</h3>
          <p className="typed">{body}</p>
          <button type="button" className="btn-primary" onClick={close} autoFocus>알겠어요</button>
        </div>
      </div>
    </div>
  );
}
