import { NextResponse } from "next/server";
import { errorCode, isClientId, recentMeetings } from "@/lib/db";

// GET /api/logs?client=<브라우저 번호> — 이 브라우저가 저장한 최근 회의 5개
export async function GET(request: Request) {
  const client = new URL(request.url).searchParams.get("client");
  if (!isClientId(client)) {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  try {
    const logs = await recentMeetings(client, 5);
    return NextResponse.json({ logs }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(`[logs] 기록을 읽지 못함 (코드: ${errorCode(e)})`);
    return NextResponse.json({ error: "기록을 불러오지 못했어요." }, { status: 503 });
  }
}
