// F4 기록 저장 — 서버(app/api)에서만 쓰는 DB 연결. 브라우저 코드(page.tsx)에서 import하지 않는다.
// 접속 주소는 .env의 DATABASE_URL에서만 읽고, 코드 · 로그에 쓰지 않는다.
//
// 회의록은 민감하므로 "모두의 최근 5개"가 아니라 "이 브라우저가 저장한 최근 5개"만 돌려준다.
// 브라우저마다 추측할 수 없는 무작위 번호(client_id, UUID)를 붙여 저장하고, 그 번호로만 읽는다.
import { Pool } from "pg";
import type { Decision, Lang, Question, SummarizeResponse, Todo } from "./summary";

export type MeetingLog = {
  id: number;
  title: string;
  original: string;
  summary: string[];
  decisions: Decision[];
  todos: Todo[];
  open_questions: Question[];
  people: string[];
  lang: Lang;
  model: string;
  minutes: number;
  createdAt: string;
};

let pool: Pool | null = null;
let tableReady: Promise<void> | null = null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isClientId = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

// 로그에는 오류 종류 코드만 남긴다 (메시지에는 접속 주소가 섞일 수 있음).
// 예: 28P01 = 비밀번호 틀림, ENOTFOUND = 주소 틀림, NO_DATABASE_URL = 환경변수 없음
export function errorCode(e: unknown): string {
  const code = (e as { code?: unknown })?.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,40}$/i.test(code) ? code : "UNKNOWN";
}

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw Object.assign(new Error("DATABASE_URL 없음"), { code: "NO_DATABASE_URL" });
  pool ??= new Pool({ connectionString, max: 3, connectionTimeoutMillis: 5000 });
  return pool;
}

// 처음 쓸 때 한 번만 테이블을 만든다 (이미 있으면 그대로 둔다). RLS를 켜서 Supabase 공개 API로는 못 읽게 한다.
function ensureTable(): Promise<void> {
  tableReady ??= getPool()
    .query(
      `CREATE TABLE IF NOT EXISTS meeting_logs (
        id             SERIAL PRIMARY KEY,
        client_id      TEXT NOT NULL,
        title          TEXT NOT NULL,
        original       TEXT NOT NULL,
        summary        JSONB NOT NULL,
        decisions      JSONB NOT NULL,
        todos          JSONB NOT NULL,
        open_questions JSONB NOT NULL,
        people         JSONB NOT NULL DEFAULT '[]',
        lang           TEXT NOT NULL DEFAULT 'ko',
        model          TEXT NOT NULL,
        minutes        INTEGER NOT NULL DEFAULT 0,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS meeting_logs_client_recent ON meeting_logs (client_id, created_at DESC);
      ALTER TABLE meeting_logs ENABLE ROW LEVEL SECURITY;`,
    )
    .then(() => undefined)
    .catch((e) => {
      tableReady = null; // 실패하면 다음 요청에서 다시 시도
      throw e;
    });
  return tableReady;
}

// 값은 $1~ 자리에 따로 넘긴다 (문장을 SQL 문자열에 이어 붙이지 않음).
export async function saveMeeting(clientId: string, original: string, minutes: number, r: SummarizeResponse) {
  await ensureTable();
  await getPool().query(
    `INSERT INTO meeting_logs (client_id, title, original, summary, decisions, todos, open_questions, people, lang, model, minutes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      clientId,
      r.title,
      original,
      JSON.stringify(r.summary),
      JSON.stringify(r.decisions),
      JSON.stringify(r.todos),
      JSON.stringify(r.open_questions),
      JSON.stringify(r.people),
      r.lang ?? "ko",
      r.model,
      minutes,
    ],
  );
}

export async function recentMeetings(clientId: string, limit = 5): Promise<MeetingLog[]> {
  await ensureTable();
  const { rows } = await getPool().query(
    `SELECT id, title, original, summary, decisions, todos, open_questions, people, lang, model, minutes, created_at
       FROM meeting_logs
      WHERE client_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [clientId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    original: r.original,
    summary: r.summary,
    decisions: r.decisions,
    todos: r.todos,
    open_questions: r.open_questions,
    people: r.people,
    lang: r.lang,
    model: r.model,
    minutes: r.minutes,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

// ───── 사용 횟수 제한 (팀 OpenRouter 키 보호) ─────
// 서버가 여러 대로 나뉘어 떠도 정확히 세도록 DB에 기록한다. IP는 그대로 저장하지 않고 해시로만 저장.
export const LIMITS = { perMinute: 5, perDay: 30, sitePerDay: 300 } as const;
export type RateResult = { ok: true } | { ok: false; reason: "minute" | "day" | "site" };

let hitsReady: Promise<void> | null = null;
function ensureHitsTable(): Promise<void> {
  hitsReady ??= getPool()
    .query(
      `CREATE TABLE IF NOT EXISTS api_hits (
        id  BIGSERIAL PRIMARY KEY,
        key TEXT NOT NULL,
        at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS api_hits_at ON api_hits (at);
      ALTER TABLE api_hits ENABLE ROW LEVEL SECURITY;`,
    )
    .then(() => undefined)
    .catch((e) => {
      hitsReady = null;
      throw e;
    });
  return hitsReady;
}

export async function checkRateLimit(key: string): Promise<RateResult> {
  await ensureHitsTable();
  const db = getPool();
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE key = $1 AND at > now() - interval '1 minute')::int AS minute,
            count(*) FILTER (WHERE key = $1)::int AS day,
            count(*)::int AS site
       FROM api_hits
      WHERE at > now() - interval '1 day'`,
    [key],
  );
  const { minute, day, site } = rows[0];
  if (minute >= LIMITS.perMinute) return { ok: false, reason: "minute" };
  if (day >= LIMITS.perDay) return { ok: false, reason: "day" };
  if (site >= LIMITS.sitePerDay) return { ok: false, reason: "site" };
  await db.query("INSERT INTO api_hits (key) VALUES ($1)", [key]);
  // 가끔 이틀 지난 기록을 지운다 (표가 계속 커지지 않게)
  if (Math.random() < 0.05) db.query("DELETE FROM api_hits WHERE at < now() - interval '2 days'").catch(() => {});
  return { ok: true };
}
