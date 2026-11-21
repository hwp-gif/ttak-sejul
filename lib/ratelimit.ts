// 사용 횟수 제한: 요청한 사람(IP)을 알아볼 수 없게 해시로 바꿔서 센다.
// DB가 잠깐 안 되면 이 서버 메모리로라도 1분 제한만 지킨다 (정확하진 않지만 무제한보다 안전).
import { createHash } from "node:crypto";
import { checkRateLimit, errorCode, LIMITS, type RateResult } from "./db";

function clientKey(request: Request): string {
  const h = request.headers;
  const ip =
    h.get("x-nf-client-connection-ip") ?? // Netlify가 붙여 주는 실제 접속 IP
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local";
  return createHash("sha256").update(`ttak-sejul:${ip}`).digest("hex").slice(0, 32);
}

const memory = new Map<string, number[]>();
function memoryLimit(key: string): RateResult {
  const now = Date.now();
  const recent = (memory.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= LIMITS.perMinute) return { ok: false, reason: "minute" };
  recent.push(now);
  memory.set(key, recent);
  return { ok: true };
}

export async function rateLimit(request: Request): Promise<RateResult> {
  const key = clientKey(request);
  try {
    return await checkRateLimit(key);
  } catch (e) {
    console.error(`[ratelimit] DB로 세지 못해 메모리로 대신함 (코드: ${errorCode(e)})`);
    return memoryLimit(key);
  }
}

export const RATE_MESSAGES = {
  minute: `잠깐만요! 1분에 ${LIMITS.perMinute}번까지 정리할 수 있어요. 조금 뒤에 다시 맡겨 주세요 ☕`,
  day: `오늘은 정리 횟수(${LIMITS.perDay}번)를 다 썼어요. 내일 다시 만나요!`,
  site: "오늘 딱세줄을 찾는 분이 많아서 잠시 쉬고 있어요. 내일 다시 시도해 주세요.",
} as const;
