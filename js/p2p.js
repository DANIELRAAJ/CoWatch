/**
 * CoWatch — P2P Mesh Network Manager (WebRTC via PeerJS)
 * Handles data channels for chat, playback sync, reactions, and VoIP voice audio streams.
 */

class P2PManager {
  constructor() {
    this.peer = null;
    this.peerId = null;
    this.roomId = null;
    this.isHost = false;
    this.connections = new Map(); // peerId -> DataConnection
    this.voiceCalls = new Map();   // peerId -> MediaConnection
    this.remoteAudioElements = new Map(); // peerId -> HTMLAudioElement

    // User metadata
    this.username = localStorage.getItem('cowatch_username') || `User_${Math.floor(1000 + Math.random() * 9000)}`;
    this.members = new Map(); // peerId -> { username, isHost, inVoice, isSpeaking }

    // Audio & Voice state
    this.localAudioStream = null;
    this.isVoiceConnected = false;
    this.isMuted = false;
    this.audioContext = null;
    this.localAnalyser = null;
    this.voiceActivityInterval = null;

    // Callbacks
    this.onStateSync = null;       // (syncData) => void
    this.onChatMessage = null;     // (chatData) => void
    this.onReaction = null;        // (reactionData) => void
    this.onMembersChange = null;   // (membersList) => void
    this.onVoiceStateChange = null;// (inVoice, isMuted) => void
    this.onUserSpeaking = null;    // (peerId, isSpeaking) => void
    this.onStatusToast = null;     // (msg, type) => void
  }

  /**
   * Initialize PeerJS connection and join or host room
   */
  async init(onReady) {
    const hash = window.location.hash;
    const match = hash.match(/room=([a-zA-Z0-9_-]+)/);

    if (match && match[1]) {
      this.roomId = match[1];
      this.isHost = false;
    } else {
      this.roomId = 'cw-' + Math.random().toString(36).substring(2, 8);
      this.isHost = true;
      window.location.hash = `room=${this.roomId}`;
    }

    // Determine target peer ID for host vs guest
    const targetPeerId = this.isHost ? `cowatch-room-${this.roomId}` : null;

    // Connect to PeerJS cloud broker (free public signaling server)
    this.peer = new Peer(targetPeerId, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ]
      }
    });

    this.peer.on('open', (id) => {
      this.peerId = id;
      this.members.set(this.peerId, {
        peerId: this.peerId,
        username: this.username,
        isHost: this.isHost,
        inVoice: false,
        isSpeaking: false
      });

      if (!this.isHost) {
        // Guest connects to Host
        this.connectToHost();
      }

      if (onReady) onReady(this.roomId, this.isHost);
      this.notifyMembersChange();
    });

    this.peer.on('error', (err) => {
      console.warn('[P2P] PeerJS error:', err.type, err.message);
      if (err.type === 'unavailable-id') {
        // If room host ID is already taken, become a guest in that room
        this.isHost = false;
        this.peer = new Peer(null);
        this.peer.on('open', (id) => {
          this.peerId = id;
          this.connectToHost();
          if (onReady) onReady(this.roomId, false);
        });
      } else if (this.onStatusToast) {
        this.onStatusToast(`Connection notice: ${err.type}`, 'warning');
      }
    });

    // Handle incoming Data Connections (Host gets connections from guests; Guests get connections from host)
    this.peer.on('connection', (conn) => {
      this.setupConnection(conn);
    });

    // Handle incoming WebRTC Media Streams (Voice Chat Calls)
    this.peer.on('call', (call) => {
      this.handleIncomingCall(call);
    });
  }

  /**
   * Connect guest to room host
   */
  connectToHost() {
    const hostPeerId = `cowatch-room-${this.roomId}`;
    const conn = this.peer.connect(hostPeerId, {
      reliable: true,
      metadata: { username: this.username }
    });

    this.setupConnection(conn);
  }

  /**
   * Setup event listeners on a DataConnection
   */
  setupConnection(conn) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);

      // Send greeting / handshake with username
      conn.send({
        type: 'HANDSHAKE',
        username: this.username,
        isHost: this.isHost,
        inVoice: this.isVoiceConnected
      });

      if (this.isHost) {
        // Request playback state from player to send to the newly joined peer
        if (this.onStateSyncRequest) {
          const syncState = this.onStateSyncRequest();
          if (syncState) {
            conn.send({ type: 'SYNC_STATE', ...syncState });
          }
        }
        this.broadcastMembers();
      }
    });

    conn.on('data', (data) => {
      this.handleIncomingData(data, conn);
    });

    conn.on('close', () => {
      this.cleanupPeer(conn.peer);
    });

    conn.on('error', (err) => {
      console.warn(`[P2P] Connection error with ${conn.peer}:`, err);
      this.cleanupPeer(conn.peer);
    });
  }

  /**
   * Dispatch incoming message packets
   */
  handleIncomingData(data, conn) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'HANDSHAKE':
        this.members.set(conn.peer, {
          peerId: conn.peer,
          username: data.username || 'Friend',
          isHost: data.isHost || false,
          inVoice: !!data.inVoice,
          isSpeaking: false
        });
        this.notifyMembersChange();
        if (this.onStatusToast) {
          this.onStatusToast(`${data.username || 'Friend'} joined the room!`, 'info');
        }
        if (this.isHost) {
          this.broadcastMembers();
        }
        break;

      case 'MEMBERS_LIST':
        if (!this.isHost && Array.isArray(data.members)) {
          this.members.clear();
          data.members.forEach(m => this.members.set(m.peerId, m));
          this.notifyMembersChange();
        }
        break;

      case 'CHAT':
        if (this.onChatMessage) {
          this.onChatMessage(data);
        }
        // Host relays chat messages to other connected peers
        if (this.isHost) {
          this.broadcastExcept(data, conn.peer);
        }
        break;

      case 'REACTION':
        if (this.onReaction) {
          this.onReaction(data);
        }
        if (this.isHost) {
          this.broadcastExcept(data, conn.peer);
        }
        break;

      case 'SYNC_STATE':
        if (this.onStateSync) {
          this.onStateSync(data);
        }
        if (this.isHost) {
          // If guest sent a control action (allowed in free-for-all mode), host relays to others
          this.broadcastExcept(data, conn.peer);
        }
        break;

      case 'VOICE_STATE':
        const member = this.members.get(conn.peer);
        if (member) {
          member.inVoice = !!data.inVoice;
          member.isSpeaking = !!data.isSpeaking;
          this.notifyMembersChange();
        }
        if (this.isHost) {
          this.broadcastExcept(data, conn.peer);
        }
        break;

      case 'USER_SPEAKING':
        if (this.onUserSpeaking) {
          this.onUserSpeaking(conn.peer, data.isSpeaking);
        }
        const m = this.members.get(conn.peer);
        if (m) m.isSpeaking = data.isSpeaking;
        if (this.isHost) {
          this.broadcastExcept(data, conn.peer);
        }
        break;
    }
  }

  /**
   * Send chat message to room
   */
  sendChatMessage(text) {
    const packet = {
      type: 'CHAT',
      id: Math.random().toString(36).substring(2, 9),
      senderId: this.peerId,
      sender: this.username,
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isHost: this.isHost
    };

    this.broadcast(packet);
    if (this.onChatMessage) {
      this.onChatMessage({ ...packet, isMe: true });
    }
  }

  /**
   * Broadcast floating emoji reaction
   */
  sendReaction(emoji) {
    const packet = {
      type: 'REACTION',
      emoji: emoji,
      sender: this.username,
      senderId: this.peerId
    };
    this.broadcast(packet);
    if (this.onReaction) {
      this.onReaction(packet);
    }
  }

  /**
   * Broadcast player state sync packet
   */
  broadcastSyncState(stateData) {
    const packet = {
      type: 'SYNC_STATE',
      ...stateData,
      senderId: this.peerId,
      senderName: this.username,
      timestamp: Date.now()
    };
    this.broadcast(packet);
  }

  /**
   * Send packet to all peers
   */
  broadcast(data) {
    for (const [_, conn] of this.connections) {
      if (conn.open) {
        conn.send(data);
      }
    }
  }

  /**
   * Send packet to all peers except one
   */
  broadcastExcept(data, excludedPeerId) {
    for (const [peerId, conn] of this.connections) {
      if (peerId !== excludedPeerId && conn.open) {
        conn.send(data);
      }
    }
  }

  /**
   * Broadcast updated room members list
   */
  broadcastMembers() {
    const membersList = Array.from(this.members.values());
    this.broadcast({
      type: 'MEMBERS_LIST',
      members: membersList
    });
    this.notifyMembersChange();
  }

  notifyMembersChange() {
    if (this.onMembersChange) {
      this.onMembersChange(Array.from(this.members.values()));
    }
  }

  /**
   * ==========================================================================
   * Voice Chat (WebRTC Audio Stream Mesh)
   * ==========================================================================
   */

  /**
   * Toggle Voice Chat on or off
   */
  async toggleVoice() {
    if (this.isVoiceConnected) {
      this.leaveVoice();
      return false;
    } else {
      return await this.joinVoice();
    }
  }

  /**
   * Join Voice Chat: get microphone stream and call peers
   */
  async joinVoice() {
    try {
      const echoCanc = document.getElementById('local-echo-cancellation')?.checked ?? true;
      const noiseSupp = document.getElementById('local-noise-suppression')?.checked ?? true;

      this.localAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: echoCanc,
          noiseSuppression: noiseSupp,
          autoGainControl: true
        },
        video: false
      });

      this.isVoiceConnected = true;
      this.isMuted = false;

      // Setup audio analyzer for speaking detection
      this.setupSpeakingDetector();

      // Call all active data connection peers
      for (const [peerId, _] of this.connections) {
        this.callPeerAudio(peerId);
      }

      // Update my member entry
      const me = this.members.get(this.peerId);
      if (me) me.inVoice = true;

      this.broadcast({
        type: 'VOICE_STATE',
        peerId: this.peerId,
        inVoice: true,
        isSpeaking: false
      });

      this.notifyMembersChange();
      if (this.onVoiceStateChange) this.onVoiceStateChange(true, false);
      if (this.onStatusToast) this.onStatusToast('Microphone connected to voice room', 'success');

      return true;
    } catch (err) {
      console.error('[P2P Voice] Microphone access error:', err);
      if (this.onStatusToast) {
        this.onStatusToast('Microphone permission denied or not found', 'warning');
      }
      return false;
    }
  }

  /**
   * Leave Voice Chat: stop tracks and close calls
   */
  leaveVoice() {
    if (this.localAudioStream) {
      this.localAudioStream.getTracks().forEach(t => t.stop());
      this.localAudioStream = null;
    }

    if (this.voiceActivityInterval) {
      clearInterval(this.voiceActivityInterval);
      this.voiceActivityInterval = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    // Close all audio calls
    for (const [_, call] of this.voiceCalls) {
      call.close();
    }
    this.voiceCalls.clear();

    this.isVoiceConnected = false;
    this.isMuted = false;

    const me = this.members.get(this.peerId);
    if (me) {
      me.inVoice = false;
      me.isSpeaking = false;
    }

    this.broadcast({
      type: 'VOICE_STATE',
      peerId: this.peerId,
      inVoice: false,
      isSpeaking: false
    });

    this.notifyMembersChange();
    if (this.onVoiceStateChange) this.onVoiceStateChange(false, false);
    if (this.onStatusToast) this.onStatusToast('Disconnected from voice chat', 'info');
  }

  /**
   * Mute or Unmute microphone
   */
  toggleMute() {
    if (!this.localAudioStream) return false;
    this.isMuted = !this.isMuted;
    this.localAudioStream.getAudioTracks().forEach(track => {
      track.enabled = !this.isMuted;
    });

    if (this.onVoiceStateChange) {
      this.onVoiceStateChange(this.isVoiceConnected, this.isMuted);
    }
    return this.isMuted;
  }

  /**
   * Call a peer's audio
   */
  callPeerAudio(peerId) {
    if (!this.localAudioStream || this.voiceCalls.has(peerId)) return;

    const call = this.peer.call(peerId, this.localAudioStream);
    if (!call) return;

    this.voiceCalls.set(peerId, call);

    call.on('stream', (remoteStream) => {
      this.attachRemoteAudio(peerId, remoteStream);
    });

    call.on('close', () => {
      this.removeRemoteAudio(peerId);
      this.voiceCalls.delete(peerId);
    });

    call.on('error', (err) => {
      console.warn(`[P2P Voice] Call error with ${peerId}:`, err);
      this.removeRemoteAudio(peerId);
      this.voiceCalls.delete(peerId);
    });
  }

  /**
   * Handle incoming audio call
   */
  handleIncomingCall(call) {
    this.voiceCalls.set(call.peer, call);

    if (this.localAudioStream) {
      call.answer(this.localAudioStream);
    } else {
      // Answer without sending our stream so we can still hear them
      call.answer();
    }

    call.on('stream', (remoteStream) => {
      this.attachRemoteAudio(call.peer, remoteStream);
    });

    call.on('close', () => {
      this.removeRemoteAudio(call.peer);
      this.voiceCalls.delete(call.peer);
    });
  }

  /**
   * Attach remote audio stream to a hidden <audio> tag
   */
  attachRemoteAudio(peerId, remoteStream) {
    let audioEl = this.remoteAudioElements.get(peerId);
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.id = `remote-audio-${peerId}`;
      document.getElementById('remote-audios')?.appendChild(audioEl);
      this.remoteAudioElements.set(peerId, audioEl);
    }

    audioEl.srcObject = remoteStream;
    audioEl.play().catch(err => {
      console.log('[P2P Voice] Autoplay waiting for user gesture:', err);
    });
  }

  /**
   * Set volume for a specific remote peer
   */
  setPeerVolume(peerId, vol) {
    const audioEl = this.remoteAudioElements.get(peerId);
    if (audioEl) {
      audioEl.volume = Math.max(0, Math.min(1, vol));
    }
  }

  removeRemoteAudio(peerId) {
    const audioEl = this.remoteAudioElements.get(peerId);
    if (audioEl) {
      audioEl.srcObject = null;
      audioEl.remove();
      this.remoteAudioElements.delete(peerId);
    }
  }

  /**
   * Setup Web Audio API speaking detector for glowing avatar ring
   */
  setupSpeakingDetector() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(this.localAudioStream);
      this.localAnalyser = this.audioContext.createAnalyser();
      this.localAnalyser.fftSize = 512;
      this.localAnalyser.smoothingTimeConstant = 0.4;
      source.connect(this.localAnalyser);

      const dataArray = new Uint8Array(this.localAnalyser.frequencyBinCount);
      let wasSpeaking = false;

      this.voiceActivityInterval = setInterval(() => {
        if (!this.localAudioStream || this.isMuted) {
          if (wasSpeaking) {
            wasSpeaking = false;
            this.broadcastSpeakingState(false);
          }
          return;
        }

        this.localAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const isSpeaking = average > 18; // Threshold

        if (isSpeaking !== wasSpeaking) {
          wasSpeaking = isSpeaking;
          this.broadcastSpeakingState(isSpeaking);
        }
      }, 150);
    } catch (e) {
      console.warn('[P2P Voice] AudioContext analyser unsupported:', e);
    }
  }

  broadcastSpeakingState(isSpeaking) {
    const me = this.members.get(this.peerId);
    if (me) me.isSpeaking = isSpeaking;

    if (this.onUserSpeaking) {
      this.onUserSpeaking(this.peerId, isSpeaking);
    }

    this.broadcast({
      type: 'USER_SPEAKING',
      peerId: this.peerId,
      isSpeaking: isSpeaking
    });
  }

  /**
   * Update display username
   */
  setUsername(newName) {
    if (!newName) return;
    this.username = newName.trim();
    localStorage.setItem('cowatch_username', this.username);

    const me = this.members.get(this.peerId);
    if (me) me.username = this.username;

    this.broadcast({
      type: 'HANDSHAKE',
      username: this.username,
      isHost: this.isHost,
      inVoice: this.isVoiceConnected
    });
    this.notifyMembersChange();
  }

  cleanupPeer(peerId) {
    const member = this.members.get(peerId);
    const username = member ? member.username : 'A friend';

    this.connections.delete(peerId);
    this.removeRemoteAudio(peerId);
    const call = this.voiceCalls.get(peerId);
    if (call) {
      call.close();
      this.voiceCalls.delete(peerId);
    }
    this.members.delete(peerId);

    this.notifyMembersChange();
    if (this.onStatusToast) {
      this.onStatusToast(`${username} left the room`, 'info');
    }
  }
}

// Export singleton instance
window.p2p = new P2PManager();
