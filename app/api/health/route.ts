import { NextResponse } from "next/server";
import { Pool } from "pg";

// 임시 점검용: 환경 변수 "모양"만 알려 준다 (값은 절대 돌려주지 않음). 배포 문제를 찾은 뒤 지운다.
function shape(v: string | undefined) {
  if (v === undefined) return { present: false };
  return {
    present: true,
    length: v.length,
    quoted: /^["']|["']$/.test(v),
    whitespace: /\s/.test(v),
    namePrefix: /^[A-Z_]+=/.test(v), // "OPENROUTER_API_KEY=..."처럼 이름까지 붙여 넣었는지
  };
}

export async function GET() {
  const key = process.env.OPENROUTER_API_KEY;
  const db = process.env.DATABASE_URL;
  let dbInfo: Record<string, unknown> = shape(db);
  if (db) {
    try {
      const u = new URL(db.replace(/^["']|["']$/g, ""));
      dbInfo = { ...dbInfo, protocol: u.protocol, port: u.port, pooler: u.hostname.endsWith("pooler.supabase.com") };
    } catch {
      dbInfo = { ...dbInfo, parses: false };
    }
    try {
      const pool = new Pool({ connectionString: db, max: 1, connectionTimeoutMillis: 5000 });
      await pool.query("select 1");
      await pool.end();
      dbInfo.connect = "ok";
    } catch (e) {
      dbInfo.connect = String((e as { code?: unknown })?.code ?? "error");
    }
  }
  let keyCheck = "skipped";
  if (key) {
    const res = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` } }).catch(() => null);
    keyCheck = res ? `HTTP ${res.status}` : "network";
  }
  return NextResponse.json(
    { key: { ...shape(key), sk: key?.startsWith("sk-or-") ?? false, openrouter: keyCheck }, db: dbInfo },
    { headers: { "Cache-Control": "no-store" } },
  );
}
