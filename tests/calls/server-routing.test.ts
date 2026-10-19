import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  io: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock("socket.io-client", () => ({ io: mocks.io }));
vi.mock("../../src/auth/session", () => ({
  getSession: vi.fn(),
  refreshAccessToken: mocks.refreshAccessToken,
}));

import { CallSocket } from "../../src/calls/call.socket";
import { CORE_SERVER_URL, MEDIA_SERVER_URL } from "../../src/config/servers";

describe("service routing", () => {
  let handlers: Map<string, (...args: any[]) => unknown>;
  let transport: { on: ReturnType<typeof vi.fn>; removeAllListeners: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = new Map();
    transport = {
      on: vi.fn((event, callback) => { handlers.set(event, callback); }),
      removeAllListeners: vi.fn(),
      disconnect: vi.fn(),
    };
    mocks.io.mockReturnValue(transport);
  });

  afterEach(() => vi.restoreAllMocks());

  it("uses the approved separate production servers", () => {
    expect(CORE_SERVER_URL).toBe("https://az-wasal-server-production.up.railway.app");
    expect(MEDIA_SERVER_URL).toBe("https://az-wasal-media-server-production.up.railway.app");
    expect(CORE_SERVER_URL).not.toBe(MEDIA_SERVER_URL);
  });

  it("connects call signaling to the media server", () => {
    const socket = new CallSocket();
    socket.connect(MEDIA_SERVER_URL, "test-access-token");
    expect(mocks.io).toHaveBeenCalledWith(MEDIA_SERVER_URL, {
      transports: ["websocket"], auth: { token: "test-access-token" },
    });
    socket.disconnect();
  });

  it("refreshes at the account server and reconnects to the media server", async () => {
    const socket = new CallSocket();
    mocks.refreshAccessToken.mockResolvedValue("test-refreshed-token");
    socket.connect(MEDIA_SERVER_URL, "test-expired-token");
    await handlers.get("connect_error")!(new Error("INVALID_TOKEN"));
    expect(mocks.refreshAccessToken).toHaveBeenCalledWith(CORE_SERVER_URL);
    expect(mocks.io).toHaveBeenLastCalledWith(MEDIA_SERVER_URL, {
      transports: ["websocket"], auth: { token: "test-refreshed-token" },
    });
    socket.disconnect();
  });
});
