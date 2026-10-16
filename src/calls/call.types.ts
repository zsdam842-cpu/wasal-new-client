export type CallType = "audio" | "video";

export interface IncomingCall {
  callId: string;
  callerId: string;
  receiverId: string;
  type: CallType;
  status: "ringing";
}

export interface CallEndPayload {
  callId: string;
  userId: string;
  reason: "ended" | "missed";
}

export interface CallOfferPayload {
  callId: string;
  callerId: string;
  receiverId: string;
  type: CallType;
  offer: RTCSessionDescriptionInit;
}

export interface CallAnswerPayload {
  callId: string;
  answer: RTCSessionDescriptionInit;
}

export interface IceCandidatePayload {
  callId: string;
  candidate: RTCIceCandidateInit;
}

export interface StartCallPayload {
  receiverId: string;
  type: CallType;
}
