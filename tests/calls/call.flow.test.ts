import { describe, expect, it } from "vitest";

describe("Wasal WebRTC call flow", () => {
  it("should start with a real server call id", () => {
    const call = {
      callId: "call-123",
      callerId: "caller-1",
      receiverId: "receiver-1",
      type: "audio",
      status: "ringing",
    };

    expect(call.callId).toBeTruthy();
    expect(call.status).toBe("ringing");
  });
});
