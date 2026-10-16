export interface WasalSession {
  accessToken: string;
  refreshToken: string;
}

const STORAGE_KEY = "wasal_session";

let refreshPromise: Promise<string | null> | null = null;

export function getSession(): WasalSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const session = JSON.parse(raw) as Partial<WasalSession>;

    if (
      typeof session.accessToken !== "string" ||
      typeof session.refreshToken !== "string"
    ) {
      return null;
    }

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  } catch {
    return null;
  }
}

export function saveSession(
  session: WasalSession,
): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(session),
  );
}

export function setAccessToken(
  accessToken: string,
): void {
  const session = getSession();

  if (!session) {
    return;
  }

  saveSession({
    accessToken,
    refreshToken: session.refreshToken,
  });
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function decodeJwtPayload(
  token: string,
): Record<string, unknown> | null {
  try {
    const parts = token.split(".");

    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const json = decodeURIComponent(
      atob(payload)
        .split("")
        .map(
          (char) =>
            `%${char
              .charCodeAt(0)
              .toString(16)
              .padStart(2, "0")}`,
        )
        .join(""),
    );

    const result = JSON.parse(json);

    if (
      typeof result !== "object" ||
      result === null
    ) {
      return null;
    }

    return result as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getAccessTokenExpiry(
  token: string,
): number | null {
  const payload = decodeJwtPayload(token);

  if (!payload) {
    return null;
  }

  if (typeof payload.exp !== "number") {
    return null;
  }

  return payload.exp * 1000;
}

export function isAccessTokenExpired(
  token: string,
  bufferMs = 60_000,
): boolean {
  const expiresAt =
    getAccessTokenExpiry(token);

  if (expiresAt === null) {
    return false;
  }

  return (
    Date.now() + bufferMs >= expiresAt
  );
}

export async function refreshAccessToken(
  serverUrl: string,
): Promise<string | null> {
  const session = getSession();

  if (!session) {
    return null;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(
        `${serverUrl}/api/auth/refresh`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            refreshToken:
              session.refreshToken,
          }),
        },
      );

      if (!response.ok) {
        clearSession();
        return null;
      }

      const result = await response.json();

      if (
        !result ||
        typeof result.accessToken !==
          "string"
      ) {
        clearSession();
        return null;
      }

      setAccessToken(
        result.accessToken,
      );

      return result.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function getValidAccessToken(
  serverUrl: string,
): Promise<string | null> {
  const session = getSession();

  if (!session) {
    return null;
  }

  if (
    !isAccessTokenExpired(
      session.accessToken,
    )
  ) {
    return session.accessToken;
  }

  return refreshAccessToken(serverUrl);
}

export function startTokenRefreshTimer(
  serverUrl: string,
): () => void {
  let stopped = false;
  let timer: number | null = null;

  const schedule = (): void => {
    if (stopped) {
      return;
    }

    const session = getSession();

    if (!session) {
      return;
    }

    const expiresAt =
      getAccessTokenExpiry(
        session.accessToken,
      );

    if (expiresAt === null) {
      timer = window.setTimeout(
        schedule,
        60_000,
      );
      return;
    }

    const delay = Math.max(
      5_000,
      expiresAt -
        Date.now() -
        60_000,
    );

    timer = window.setTimeout(
      async () => {
        if (stopped) {
          return;
        }

        await refreshAccessToken(
          serverUrl,
        );

        schedule();
      },
      delay,
    );
  };

  schedule();

  return () => {
    stopped = true;

    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
}
