import { io, type Socket } from "socket.io-client";

import {
  getSession,
  refreshAccessToken,
} from "../auth/session";

import type {
  CallAnswerPayload,
  CallEndPayload,
  CallOfferPayload,
  IceCandidatePayload,
  IncomingCall,
} from "./call.types";

export interface StartedCall {
  callId: string;
  callerId: string;
  receiverId: string;
  type: "audio" | "video";
  status: "ringing";
}

export interface AcceptedCall {
  callId: string;
  userId: string;
}

export interface RejectedCall {
  callId: string;
  userId: string;
}

export interface CallSocketEvents {
  started: (call: StartedCall) => void;
  incoming: (call: IncomingCall) => void;
  accepted: (payload: AcceptedCall) => void;
  rejected: (payload: RejectedCall) => void;
  answer: (payload: CallAnswerPayload) => void;
  offer: (payload: CallOfferPayload) => void;
  iceCandidate: (
    payload: IceCandidatePayload,
  ) => void;
  end: (payload: CallEndPayload) => void;
  connect: () => void;
  disconnect: () => void;
  error: (message: string) => void;
}

export class CallSocket {
  private socket: Socket | null = null;

  private serverUrl: string | null = null;

  private token: string | null = null;

  private reconnecting = false;

  connect(
    serverUrl: string,
    token: string,
  ): void {
    this.disconnect();

    this.serverUrl = serverUrl;
    this.token = token;

    this.createSocket();
  }

  private createSocket(): void {
    if (
      !this.serverUrl ||
      !this.token
    ) {
      return;
    }

    this.socket = io(
      this.serverUrl,
      {
        transports: ["websocket"],
        auth: {
          token: this.token,
        },
      },
    );

    this.socket.on(
      "connect",
      () => {
        this.reconnecting = false;
        this.emitEvent("connect");
      },
    );

    this.socket.on(
      "disconnect",
      () => {
        this.emitEvent("disconnect");
      },
    );

    this.socket.on(
      "connect_error",
      async (error: Error) => {
        const message =
          error.message ||
          "تعذر الاتصال بالخادم";

        if (
          this.isInvalidTokenError(
            message,
          ) &&
          !this.reconnecting
        ) {
          await this.reconnectWithRefresh();
          return;
        }

        this.emitEvent(
          "error",
          message,
        );
      },
    );

    this.socket.on(
      "call:started",
      (
        payload: StartedCall,
      ) => {
        this.emitEvent(
          "started",
          payload,
        );
      },
    );

    this.socket.on(
      "call:incoming",
      (
        payload: IncomingCall,
      ) => {
        this.emitEvent(
          "incoming",
          payload,
        );
      },
    );

    this.socket.on(
      "call:accept",
      (
        payload: AcceptedCall,
      ) => {
        this.emitEvent(
          "accepted",
          payload,
        );
      },
    );

    this.socket.on(
      "call:reject",
      (
        payload: RejectedCall,
      ) => {
        this.emitEvent(
          "rejected",
          payload,
        );
      },
    );

    this.socket.on(
      "call:offer",
      (
        payload: CallOfferPayload,
      ) => {
        this.emitEvent(
          "offer",
          payload,
        );
      },
    );

    this.socket.on(
      "call:answer",
      (
        payload: CallAnswerPayload,
      ) => {
        this.emitEvent(
          "answer",
          payload,
        );
      },
    );

    this.socket.on(
      "call:ice-candidate",
      (
        payload: IceCandidatePayload,
      ) => {
        this.emitEvent(
          "iceCandidate",
          payload,
        );
      },
    );

    this.socket.on(
      "call:end",
      (
        payload: CallEndPayload,
      ) => {
        this.emitEvent(
          "end",
          payload,
        );
      },
    );
  }

  private async reconnectWithRefresh(): Promise<void> {
    if (
      this.reconnecting ||
      !this.serverUrl
    ) {
      return;
    }

    this.reconnecting = true;

    const newToken =
      await refreshAccessToken(
        this.serverUrl,
      );

    if (!newToken) {
      this.reconnecting = false;

      this.emitEvent(
        "error",
        "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى",
      );

      this.disconnect();

      return;
    }

    this.token = newToken;

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.createSocket();
  }

  private isInvalidTokenError(
    message: string,
  ): boolean {
    const normalized =
      message.toUpperCase();

    return (
      normalized.includes(
        "INVALID_TOKEN",
      ) ||
      normalized.includes(
        "INVALID_OR_EXPIRED_TOKEN",
      ) ||
      normalized.includes(
        "TOKEN",
      )
    );
  }

  disconnect(): void {
    if (!this.socket) {
      return;
    }

    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
  }

  startCall(
    receiverId: string,
    type: "audio" | "video",
  ): void {
    this.requireSocket();

    this.socket!.emit(
      "call:start",
      {
        receiverId,
        type,
      },
    );
  }

  acceptCall(
    callId: string,
  ): void {
    this.requireSocket();

    this.socket!.emit(
      "call:accept",
      callId,
    );
  }

  rejectCall(
    callId: string,
  ): void {
    this.requireSocket();

    this.socket!.emit(
      "call:reject",
      callId,
    );
  }

  endCall(
    callId: string,
  ): void {
    this.requireSocket();

    this.socket!.emit(
      "call:end",
      callId,
    );
  }

  sendOffer(
    callId: string,
    payload: CallOfferPayload,
  ): void {
    this.requireSocket();

    this.socket!.emit(
      "call:offer",
      payload,
    );
  }

  sendAnswer(
    callId: string,
    answer: RTCSessionDescriptionInit,
  ): void {
    this.requireSocket();

    this.socket!.emit(
      "call:answer",
      {
        callId,
        answer,
      },
    );
  }

  sendIceCandidate(
    callId: string,
    candidate: RTCIceCandidateInit,
  ): void {
    this.requireSocket();

    this.socket!.emit(
      "call:ice-candidate",
      {
        callId,
        candidate,
      },
    );
  }

  on<K extends keyof CallSocketEvents>(
    event: K,
    listener: CallSocketEvents[K],
  ): void {
    this.events[event].push(
      listener as (
        ...args: unknown[]
      ) => void,
    );
  }

  private readonly events: Record<
    keyof CallSocketEvents,
    Array<
      (...args: unknown[]) => void
    >
  > = {
    started: [],
    incoming: [],
    accepted: [],
    rejected: [],
    answer: [],
    offer: [],
    iceCandidate: [],
    end: [],
    connect: [],
    disconnect: [],
    error: [],
  };

  private emitEvent<
    K extends keyof CallSocketEvents,
  >(
    event: K,
    ...args: Parameters<
      CallSocketEvents[K]
    >
  ): void {
    for (
      const listener of
        this.events[event]
    ) {
      listener(
        ...(args as unknown[]),
      );
    }
  }

  private requireSocket(): void {
    if (!this.socket) {
      throw new Error(
        "CALL_SOCKET_NOT_CONNECTED",
      );
    }
  }
}
