/**
 * نداءات ICE (STUN/TURN) من الخادم.
 *
 * كانت القائمة ثابتة (STUN فقط) في الكود، فتفشل المكالمات خلف شبكات
 * الموبايل المقيّدة (CGNAT) لأنها تحتاج خادم TURN. الآن تُجلب من
 * /api/calls/ice-servers مع بيانات اعتماد TURN قصيرة الأجل، ويبقى
 * STUN كاحتياط عند تعذر الطلب.
 */

export const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
    ],
  },
];

interface IceConfigResponse {
  iceServers?: RTCIceServer[];
  ttlSeconds?: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000;

let cached:
  | { servers: RTCIceServer[]; expiresAt: number }
  | null = null;

export async function fetchIceServers(
  serverUrl: string,
  token: string,
): Promise<RTCIceServer[]> {
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.servers;
  }

  const base = String(serverUrl || "").replace(/\/+$/, "");

  if (!base) {
    return FALLBACK_ICE_SERVERS;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      6000,
    );

    let response: Response;

    try {
      response = await fetch(
        `${base}/api/calls/ice-servers`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return FALLBACK_ICE_SERVERS;
    }

    const body =
      (await response.json()) as IceConfigResponse;

    const servers = Array.isArray(body.iceServers)
      ? body.iceServers.filter(
          (server) =>
            server &&
            (typeof server.urls === "string" ||
              Array.isArray(server.urls)),
        )
      : [];

    if (servers.length === 0) {
      return FALLBACK_ICE_SERVERS;
    }

    // TURN ببيانات اعتماد مؤقتة: نُخزّن مدة أقصر من انتهاء صلاحيتها.
    cached = {
      servers,
      expiresAt: now + CACHE_TTL_MS,
    };

    return servers;
  } catch {
    return FALLBACK_ICE_SERVERS;
  }
}

export function clearIceCache(): void {
  cached = null;
}
