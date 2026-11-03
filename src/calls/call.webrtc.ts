import type { CallType } from "./call.types";
import { CallSocket } from "./call.socket";
import { FALLBACK_ICE_SERVERS } from "./ice.config";

export class CallWebRTC {
  private peerConnection: RTCPeerConnection | null = null;

  private localStream: MediaStream | null = null;

  private remoteStream: MediaStream | null = null;

  private currentCallId: string | null = null;

  private currentType: CallType | null = null;

  private currentCallerId: string | null = null;

  private currentReceiverId: string | null = null;

  private iceServers: RTCIceServer[] = FALLBACK_ICE_SERVERS;

  private readonly socket: CallSocket;

  private readonly onRemoteStream: (
    stream: MediaStream,
  ) => void;

  private readonly onConnectionStateChange: (
    state: RTCPeerConnectionState,
  ) => void;

  constructor(
    socket: CallSocket,
    onRemoteStream: (stream: MediaStream) => void,
    onConnectionStateChange: (
      state: RTCPeerConnectionState,
    ) => void,
  ) {
    this.socket = socket;
    this.onRemoteStream = onRemoteStream;
    this.onConnectionStateChange =
      onConnectionStateChange;
  }

  async startCaller(
    callId: string,
    type: CallType,
    callerId: string,
    receiverId: string,
  ): Promise<MediaStream> {
    await this.prepare(
      callId,
      type,
      callerId,
      receiverId,
    );

    const offer =
      await this.peerConnection!.createOffer();

    await this.peerConnection!.setLocalDescription(
      offer,
    );

    this.socket.sendOffer(callId, {
      callId,
      callerId,
      receiverId,
      type,
      offer,
    });

    return this.localStream!;
  }

  async acceptIncomingCall(
    callId: string,
    type: CallType,
    callerId: string,
    receiverId: string,
  ): Promise<MediaStream> {
    await this.prepare(
      callId,
      type,
      callerId,
      receiverId,
    );

    return this.localStream!;
  }

  async handleOffer(
    callId: string,
    offer: RTCSessionDescriptionInit,
  ): Promise<void> {
    if (!this.peerConnection) {
      throw new Error("WEBRTC_NOT_READY");
    }

    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(offer),
    );

    const answer =
      await this.peerConnection.createAnswer();

    await this.peerConnection.setLocalDescription(
      answer,
    );

    this.socket.sendAnswer(callId, answer);
  }

  async handleAnswer(
    answer: RTCSessionDescriptionInit,
  ): Promise<void> {
    if (!this.peerConnection) {
      throw new Error("WEBRTC_NOT_READY");
    }

    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer),
    );
  }

  async handleIceCandidate(
    candidate: RTCIceCandidateInit,
  ): Promise<void> {
    if (!this.peerConnection) {
      return;
    }

    await this.peerConnection.addIceCandidate(
      new RTCIceCandidate(candidate),
    );
  }

  toggleMicrophone(): boolean {
    const track =
      this.localStream?.getAudioTracks()[0];

    if (!track) {
      return false;
    }

    track.enabled = !track.enabled;

    return track.enabled;
  }

  toggleCamera(): boolean {
    const track =
      this.localStream?.getVideoTracks()[0];

    if (!track) {
      return false;
    }

    track.enabled = !track.enabled;

    return track.enabled;
  }

  /** قائمة STUN/TURN التي يجلبها العميل من الخادم قبل كل مكالمة. */
  setIceServers(servers: RTCIceServer[]): void {
    this.iceServers =
      servers && servers.length > 0
        ? servers
        : FALLBACK_ICE_SERVERS;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  close(): void {
    if (this.peerConnection) {
      this.peerConnection.onicecandidate = null;
      this.peerConnection.ontrack = null;
      this.peerConnection.onconnectionstatechange =
        null;

      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }

      this.localStream = null;
    }

    if (this.remoteStream) {
      for (const track of this.remoteStream.getTracks()) {
        track.stop();
      }

      this.remoteStream = null;
    }

    this.currentCallId = null;
    this.currentType = null;
    this.currentCallerId = null;
    this.currentReceiverId = null;
  }

  private async prepare(
    callId: string,
    type: CallType,
    callerId: string,
    receiverId: string,
  ): Promise<void> {
    this.close();

    this.currentCallId = callId;
    this.currentType = type;
    this.currentCallerId = callerId;
    this.currentReceiverId = receiverId;

    const constraints: MediaStreamConstraints =
      type === "video"
        ? {
            audio: true,
            video: {
              width: {
                ideal: 1280,
              },
              height: {
                ideal: 720,
              },
              facingMode: "user",
            },
          }
        : {
            audio: true,
            video: false,
          };

    this.localStream =
      await navigator.mediaDevices.getUserMedia(
        constraints,
      );

    this.remoteStream = new MediaStream();

    this.peerConnection =
      new RTCPeerConnection({
        iceServers: this.iceServers,
      });

    for (const track of this.localStream.getTracks()) {
      this.peerConnection.addTrack(
        track,
        this.localStream,
      );
    }

    this.peerConnection.ontrack = (event) => {
      for (const track of event.streams[0].getTracks()) {
        if (
          !this.remoteStream!.getTracks().some(
            (existingTrack) =>
              existingTrack.id === track.id,
          )
        ) {
          this.remoteStream!.addTrack(track);
        }
      }

      this.onRemoteStream(this.remoteStream!);
    };

    this.peerConnection.onicecandidate = (event) => {
      if (!event.candidate || !this.currentCallId) {
        return;
      }

      this.socket.sendIceCandidate(
        this.currentCallId,
        event.candidate.toJSON(),
      );
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (!this.peerConnection) {
        return;
      }

      this.onConnectionStateChange(
        this.peerConnection.connectionState,
      );
    };
  }
}
