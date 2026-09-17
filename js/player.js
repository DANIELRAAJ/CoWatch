/**
 * CoWatch — Unified Player Engine & Anti-Desync Synchronizer
 * Seamlessly manages YouTube (youtube-nocookie), HTML5 Direct Streams (MP4/HLS),
 * WebRTC Screen Sharing, and Local File Playback with millisecond-accurate sync.
 */

class UnifiedPlayer {
  constructor() {
    this.currentSourceType = null; // 'youtube' | 'stream' | 'screen' | 'local'
    this.currentSourceUrl = '';
    this.isPlaying = false;
    this.isSeeking = false;
    this.playbackRate = 1.0;
    this.isApplyingRemoteState = false;

    // Elements
    this.videoContainer = document.getElementById('video-container');
    this.html5Player = document.getElementById('html5-player');
    this.ytContainer = document.getElementById('youtube-player');
    this.webIframe = document.getElementById('web-embed-iframe');
    this.webNavBar = document.getElementById('web-nav-bar');
    this.webNavUrl = document.getElementById('web-nav-url');
    this.emptyState = document.getElementById('empty-player-state');
    this.loadingSpinner = document.getElementById('player-loading-spinner');
    this.sourceTitleText = document.getElementById('source-title-text');
    this.timeCurrent = document.getElementById('time-current');
    this.timeTotal = document.getElementById('time-total');
    this.progressFilled = document.getElementById('progress-filled');
    this.progressBuffer = document.getElementById('progress-buffer');
    this.progressThumb = document.getElementById('progress-thumb');
    this.syncStatusText = document.getElementById('sync-status-text');
    this.syncDot = document.querySelector('.sync-dot');

    // External engines
    this.ytPlayer = null;
    this.ytApiReady = false;
    this.hlsInstance = null;
    this.screenStream = null;

    // Update ticker
    this.progressInterval = null;

    // Host permission lock
    this.hostOnlyControl = false;

    // Callbacks
    this.onBroadcastState = null; // (statePacket) => void
    this.onToast = null;

    this.init();
  }

  init() {
    this.initYouTubeApi();
    this.setupHtml5Events();
    this.startProgressTicker();
    if (this.videoContainer) {
      this.videoContainer.classList.add('hub-mode');
    }
  }

  /**
   * Load the YouTube IFrame API using the privacy-enhanced domain
   */
  initYouTubeApi() {
    if (window.YT && window.YT.Player) {
      this.ytApiReady = true;
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube-nocookie.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      this.ytApiReady = true;
      console.log('[Player] YouTube IFrame API Ready (No-Cookie Mode)');
    };
  }

  setupHtml5Events() {
    this.html5Player.addEventListener('play', () => {
      if (this.currentSourceType !== 'youtube') {
        this.isPlaying = true;
        this.updatePlayPauseIcons(true);
        if (!this.isApplyingRemoteState && this.canUserControl()) {
          this.broadcastCurrentState('play');
        }
      }
    });

    this.html5Player.addEventListener('pause', () => {
      if (this.currentSourceType !== 'youtube') {
        this.isPlaying = false;
        this.updatePlayPauseIcons(false);
        if (!this.isApplyingRemoteState && this.canUserControl()) {
          this.broadcastCurrentState('pause');
        }
      }
    });

    this.html5Player.addEventListener('seeked', () => {
      if (this.currentSourceType !== 'youtube' && !this.isApplyingRemoteState && this.canUserControl()) {
        this.broadcastCurrentState('seek');
      }
    });

    this.html5Player.addEventListener('waiting', () => {
      this.showLoading(true, 'Buffering Video...');
    });

    this.html5Player.addEventListener('canplay', () => {
      this.showLoading(false);
    });

    this.html5Player.addEventListener('error', (e) => {
      console.warn('[Player] HTML5 video error:', e);
      this.showLoading(false);
    });
  }

  /**
   * ==========================================================================
   * Source Loaders
   * ==========================================================================
   */

  /**
   * 1. Load YouTube Video
   */
  loadYouTube(urlOrId) {
    const videoId = this.extractYouTubeId(urlOrId);
    if (!videoId) {
      if (this.onToast) this.onToast('Invalid YouTube URL or ID', 'warning');
      return false;
    }

    this.cleanupCurrentSource();
    this.currentSourceType = 'youtube';
    this.currentSourceUrl = urlOrId;

    this.emptyState.classList.add('hidden');
    this.html5Player.classList.add('hidden');
    this.ytContainer.classList.remove('hidden');
    if (this.webIframe) this.webIframe.classList.add('hidden');
    if (this.webNavBar) this.webNavBar.classList.add('hidden');

    if (this.videoContainer) {
      this.videoContainer.classList.remove('hub-mode');
      this.videoContainer.classList.remove('web-mode');
    }

    this.sourceTitleText.textContent = `YouTube: ${videoId}`;

    const createPlayer = () => {
      this.showLoading(true, 'Loading YouTube Video...');

      if (this.ytPlayer && typeof this.ytPlayer.destroy === 'function') {
        this.ytPlayer.destroy();
      }

      this.ytPlayer = new YT.Player('youtube-player', {
        videoId: videoId,
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          autoplay: 1,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          playsinline: 1,
          enablejsapi: 1
        },
        events: {
          onReady: (event) => {
            this.showLoading(false);
            event.target.playVideo();
            this.isPlaying = true;
            this.updatePlayPauseIcons(true);
            if (this.canUserControl()) {
              this.broadcastCurrentState('play');
            }
          },
          onStateChange: (event) => {
            this.handleYouTubeStateChange(event);
          },
          onError: (event) => {
            this.showLoading(false);
            console.warn('[Player] YouTube error code:', event.data);
            if (this.onToast) this.onToast('YouTube playback error or video restricted', 'warning');
          }
        }
      });
    };

    if (this.ytApiReady) {
      createPlayer();
    } else {
      const waitInterval = setInterval(() => {
        if (this.ytApiReady) {
          clearInterval(waitInterval);
          createPlayer();
        }
      }, 100);
    }

    return true;
  }

  handleYouTubeStateChange(event) {
    // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
    if (event.data === YT.PlayerState.PLAYING) {
      this.isPlaying = true;
      this.updatePlayPauseIcons(true);
      this.showLoading(false);
      if (!this.isApplyingRemoteState && this.canUserControl()) {
        this.broadcastCurrentState('play');
      }
    } else if (event.data === YT.PlayerState.PAUSED) {
      this.isPlaying = false;
      this.updatePlayPauseIcons(false);
      if (!this.isApplyingRemoteState && this.canUserControl()) {
        this.broadcastCurrentState('pause');
      }
    } else if (event.data === YT.PlayerState.BUFFERING) {
      this.showLoading(true, 'Buffering YouTube...');
    }
  }

  /**
   * 2. Load Direct Stream URL (.mp4 / .webm / .m3u8)
   */
  loadDirectStream(url) {
    if (!url) return false;

    this.cleanupCurrentSource();
    this.currentSourceType = 'stream';
    this.currentSourceUrl = url;

    this.emptyState.classList.add('hidden');
    this.ytContainer.classList.add('hidden');
    this.html5Player.classList.remove('hidden');
    if (this.webIframe) this.webIframe.classList.add('hidden');
    if (this.webNavBar) this.webNavBar.classList.add('hidden');

    if (this.videoContainer) {
      this.videoContainer.classList.remove('hub-mode');
      this.videoContainer.classList.remove('web-mode');
    }

    const filename = url.split('/').pop().split('?')[0] || 'Stream';
    this.sourceTitleText.textContent = filename.substring(0, 24);
    this.showLoading(true, 'Connecting Direct Stream...');

    const isHls = url.includes('.m3u8');

    if (isHls && window.Hls && Hls.isSupported()) {
      this.hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: true
      });
      this.hlsInstance.loadSource(url);
      this.hlsInstance.attachMedia(this.html5Player);
      this.hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        this.showLoading(false);
        this.html5Player.play().catch(() => {});
      });
      this.hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.warn('[Player] HLS fatal error:', data.type);
          this.showLoading(false);
        }
      });
    } else {
      // Native MP4 / WebM / Safari native HLS
      this.html5Player.src = url;
      this.html5Player.load();
      this.html5Player.play().catch(() => {});
    }

    if (this.canUserControl()) {
      this.broadcastCurrentState('load');
    }
    return true;
  }

  /**
   * 3. Start Screen / Browser Tab Share (Broadcaster)
   */
  async startScreenShare() {
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'browser'
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      this.cleanupCurrentSource();
      this.currentSourceType = 'screen';
      this.currentSourceUrl = 'screenshare';

      this.emptyState.classList.add('hidden');
      this.ytContainer.classList.add('hidden');
      this.html5Player.classList.remove('hidden');
      this.html5Player.srcObject = this.screenStream;
      this.html5Player.muted = true; // Broadcaster mutes local monitor to avoid echo
      this.html5Player.play();

      this.sourceTitleText.textContent = '🖥️ Screen / Tab Broadcast';
      if (this.onToast) this.onToast('Broadcasting screen & audio to room', 'success');

      // Listen for when host stops sharing via browser banner
      this.screenStream.getVideoTracks()[0].onended = () => {
        this.stopScreenShare();
      };

      // Broadcast screen share stream to all peers via PeerJS
      if (window.p2p && window.p2p.connections) {
        for (const [peerId, _] of window.p2p.connections) {
          window.p2p.peer.call(peerId, this.screenStream, {
            metadata: { type: 'SCREEN_SHARE' }
          });
        }
      }

      return true;
    } catch (err) {
      console.warn('[Player] Screen share cancelled or rejected:', err);
      if (this.onToast) this.onToast('Screen sharing was cancelled', 'info');
      return false;
    }
  }

  stopScreenShare() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }
    this.html5Player.srcObject = null;
    this.html5Player.muted = false;
    this.cleanupCurrentSource();
    this.showEmptyState();
  }

  /**
   * 4. Load Local File (Zero Bandwidth Sync)
   */
  loadLocalFile(file) {
    if (!file) return false;

    this.cleanupCurrentSource();
    this.currentSourceType = 'local';
    this.currentSourceUrl = file.name;

    this.emptyState.classList.add('hidden');
    this.ytContainer.classList.add('hidden');
    this.html5Player.classList.remove('hidden');

    const fileUrl = URL.createObjectURL(file);
    this.html5Player.src = fileUrl;
    this.html5Player.load();
    this.html5Player.play().catch(() => {});

    this.sourceTitleText.textContent = `📁 ${file.name.substring(0, 22)}`;

    if (this.canUserControl()) {
      this.broadcastCurrentState('load');
    }
    return true;
  }

  /**
   * 5. Load Sandboxed Webpage / Movie Site (e.g. https://en.yts.lu/)
   */
  loadWebEmbed(url) {
    if (!url) return false;

    let normalizedUrl = url.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    this.cleanupCurrentSource();
    this.currentSourceType = 'web';
    this.currentSourceUrl = normalizedUrl;

    this.emptyState.classList.add('hidden');
    this.ytContainer.classList.add('hidden');
    this.html5Player.classList.add('hidden');

    if (this.webIframe) {
      this.webIframe.classList.remove('hidden');
      this.webIframe.src = normalizedUrl;
    }
    if (this.webNavBar) {
      this.webNavBar.classList.remove('hidden');
    }
    if (this.webNavUrl) {
      this.webNavUrl.value = normalizedUrl;
    }

    const hostname = normalizedUrl.replace(/^https?:\/\//i, '').split('/')[0];
    this.sourceTitleText.textContent = `🌐 ${hostname || 'Web'}`;

    if (this.videoContainer) {
      this.videoContainer.classList.remove('hub-mode');
      this.videoContainer.classList.add('web-mode');
    }

    if (this.canUserControl()) {
      this.broadcastCurrentState('load');
    }
    return true;
  }

  /**
   * Cleanup current player instances
   */
  cleanupCurrentSource() {
    if (this.ytPlayer && typeof this.ytPlayer.stopVideo === 'function') {
      try { this.ytPlayer.stopVideo(); } catch (e) {}
    }
    if (this.hlsInstance) {
      this.hlsInstance.destroy();
      this.hlsInstance = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }
    if (this.webIframe) {
      this.webIframe.classList.add('hidden');
      this.webIframe.src = 'about:blank';
    }
    if (this.webNavBar) {
      this.webNavBar.classList.add('hidden');
    }
    this.html5Player.pause();
    this.html5Player.removeAttribute('src');
    this.html5Player.srcObject = null;
  }

  showEmptyState() {
    this.emptyState.classList.remove('hidden');
    this.ytContainer.classList.add('hidden');
    this.html5Player.classList.add('hidden');
    if (this.webIframe) this.webIframe.classList.add('hidden');
    if (this.webNavBar) this.webNavBar.classList.add('hidden');

    if (this.videoContainer) {
      this.videoContainer.classList.add('hub-mode');
      this.videoContainer.classList.remove('web-mode');
    }

    this.sourceTitleText.textContent = 'Waiting for Video';
    this.isPlaying = false;
    this.updatePlayPauseIcons(false);
  }

  /**
   * ==========================================================================
   * Control Actions: Play, Pause, Seek, Speed, Volume
   * ==========================================================================
   */

  togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    if (this.currentSourceType === 'youtube' && this.ytPlayer && this.ytPlayer.playVideo) {
      this.ytPlayer.playVideo();
    } else if (this.html5Player) {
      this.html5Player.play().catch(() => {});
    }
    this.isPlaying = true;
    this.updatePlayPauseIcons(true);
  }

  pause() {
    if (this.currentSourceType === 'youtube' && this.ytPlayer && this.ytPlayer.pauseVideo) {
      this.ytPlayer.pauseVideo();
    } else if (this.html5Player) {
      this.html5Player.pause();
    }
    this.isPlaying = false;
    this.updatePlayPauseIcons(false);
  }

  seekTo(seconds) {
    if (this.currentSourceType === 'youtube' && this.ytPlayer && this.ytPlayer.seekTo) {
      this.ytPlayer.seekTo(seconds, true);
    } else if (this.html5Player) {
      this.html5Player.currentTime = seconds;
    }
    if (this.canUserControl()) {
      this.broadcastCurrentState('seek');
    }
  }

  setPlaybackRate(rate) {
    this.playbackRate = rate;
    if (this.currentSourceType === 'youtube' && this.ytPlayer && this.ytPlayer.setPlaybackRate) {
      this.ytPlayer.setPlaybackRate(rate);
    } else if (this.html5Player) {
      this.html5Player.playbackRate = rate;
    }
  }

  setVolume(vol) {
    const clamped = Math.max(0, Math.min(1, vol));
    if (this.currentSourceType === 'youtube' && this.ytPlayer && this.ytPlayer.setVolume) {
      this.ytPlayer.setVolume(clamped * 100);
    }
    this.html5Player.volume = clamped;
  }

  getCurrentTime() {
    if (this.currentSourceType === 'youtube' && this.ytPlayer && this.ytPlayer.getCurrentTime) {
      return this.ytPlayer.getCurrentTime() || 0;
    }
    return this.html5Player.currentTime || 0;
  }

  getDuration() {
    if (this.currentSourceType === 'youtube' && this.ytPlayer && this.ytPlayer.getDuration) {
      return this.ytPlayer.getDuration() || 0;
    }
    return this.html5Player.duration || 0;
  }

  /**
   * ==========================================================================
   * Synchronization Engine (P2P State Application & Drift Catch-Up)
   * ==========================================================================
   */

  /**
   * Apply incoming remote sync state from Host / Peer
   */
  applyRemoteSync(syncPacket) {
    if (!syncPacket) return;

    this.isApplyingRemoteState = true;

    // 1. If source differs, load the new source
    if (syncPacket.sourceType && (syncPacket.sourceType !== this.currentSourceType || syncPacket.sourceUrl !== this.currentSourceUrl)) {
      if (syncPacket.sourceType === 'youtube') {
        this.loadYouTube(syncPacket.sourceUrl);
      } else if (syncPacket.sourceType === 'stream') {
        this.loadDirectStream(syncPacket.sourceUrl);
      } else if (syncPacket.sourceType === 'web') {
        this.loadWebEmbed(syncPacket.sourceUrl);
      }
    }

    // 2. Calculate network latency & expected playback position
    const networkLatencySec = syncPacket.timestamp ? (Date.now() - syncPacket.timestamp) / 1000 : 0;
    const targetTime = syncPacket.time + (syncPacket.state === 'playing' ? networkLatencySec : 0);
    const localTime = this.getCurrentTime();
    const drift = Math.abs(localTime - targetTime);

    // 3. Smart Catch-Up Algorithm
    if (drift > 1.5) {
      // Large drift: Hard seek
      this.seekTo(targetTime);
      this.setSyncIndicator(false, 'Catching Up...');
    } else if (drift > 0.35) {
      // Subtle drift: Gentle rate adjustment (catches up smoothly without audio pop)
      const adjustedRate = localTime < targetTime ? 1.05 : 0.95;
      this.setPlaybackRate(adjustedRate);
      setTimeout(() => this.setPlaybackRate(1.0), 1200);
      this.setSyncIndicator(true, 'In Sync');
    } else {
      this.setSyncIndicator(true, 'In Sync');
    }

    // 4. Match Play / Pause state
    if (syncPacket.state === 'playing' && !this.isPlaying) {
      this.play();
    } else if (syncPacket.state === 'paused' && this.isPlaying) {
      this.pause();
    }

    setTimeout(() => {
      this.isApplyingRemoteState = false;
    }, 400);
  }

  /**
   * Build current sync state snapshot for export or broadcast
   */
  getCurrentSyncState() {
    return {
      sourceType: this.currentSourceType,
      sourceUrl: this.currentSourceUrl,
      time: this.getCurrentTime(),
      state: this.isPlaying ? 'playing' : 'paused',
      rate: this.playbackRate
    };
  }

  broadcastCurrentState(actionType) {
    if (this.onBroadcastState) {
      this.onBroadcastState({
        ...this.getCurrentSyncState(),
        action: actionType
      });
    }
  }

  canUserControl() {
    if (!this.hostOnlyControl) return true;
    return window.p2p && window.p2p.isHost;
  }

  setSyncIndicator(inSync, text) {
    if (this.syncDot) {
      this.syncDot.className = inSync ? 'sync-dot in-sync' : 'sync-dot syncing';
    }
    if (this.syncStatusText) {
      this.syncStatusText.textContent = text;
    }
  }

  /**
   * Progress scrubber ticker
   */
  startProgressTicker() {
    if (this.progressInterval) clearInterval(this.progressInterval);

    this.progressInterval = setInterval(() => {
      const cur = this.getCurrentTime();
      const dur = this.getDuration();

      if (dur > 0 && !this.isSeeking) {
        const pct = (cur / dur) * 100;
        this.progressFilled.style.width = `${pct}%`;
        this.progressThumb.style.left = `${pct}%`;
      }

      this.timeCurrent.textContent = this.formatTime(cur);
      this.timeTotal.textContent = this.formatTime(dur);
    }, 250);
  }

  formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const m = mins < 10 ? '0' + mins : mins;
    const s = secs < 10 ? '0' + secs : secs;

    if (hrs > 0) {
      const h = hrs < 10 ? '0' + hrs : hrs;
      return `${h}:${m}:${s}`;
    }
    return `${m}:${s}`;
  }

  updatePlayPauseIcons(isPlaying) {
    const playIcon = document.getElementById('icon-play');
    const pauseIcon = document.getElementById('icon-pause');
    if (isPlaying) {
      playIcon?.classList.add('hidden');
      pauseIcon?.classList.remove('hidden');
    } else {
      playIcon?.classList.remove('hidden');
      pauseIcon?.classList.add('hidden');
    }
  }

  showLoading(show, message = 'Loading...') {
    if (show) {
      document.getElementById('loading-text').textContent = message;
      this.loadingSpinner.classList.remove('hidden');
    } else {
      this.loadingSpinner.classList.add('hidden');
    }
  }

  extractYouTubeId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : (url.length === 11 ? url : null);
  }
}

// Export singleton instance
window.player = new UnifiedPlayer();
