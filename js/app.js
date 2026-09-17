/**
 * CoWatch — Main UI Controller
 * Bridges the user interface, video playback engine, and WebRTC mesh network.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Elements References
  const roomIdDisplay = document.getElementById('room-id-display');
  const btnCopyInvite = document.getElementById('btn-copy-invite');
  const btnOpenSourceModal = document.getElementById('btn-open-source-modal');
  const btnEmptyLoad = document.getElementById('btn-empty-load');
  const btnShieldInfo = document.getElementById('btn-shield-info');
  const btnRoomSettings = document.getElementById('btn-room-settings');
  const btnToggleDrawer = document.getElementById('btn-toggle-drawer');
  const btnCloseDock = document.getElementById('btn-close-dock');
  const sideDock = document.getElementById('side-dock');
  const unreadDot = document.getElementById('unread-dot');
  const myUsernameDisplay = document.getElementById('my-username-display');
  const myAvatarLetter = document.getElementById('my-avatar-letter');
  const myAvatarRing = document.getElementById('my-avatar-ring');
  const settingsRoomCode = document.getElementById('settings-room-code');

  // Video Controls
  const ctrlPlayPause = document.getElementById('ctrl-play-pause');
  const ctrlSyncCatchup = document.getElementById('ctrl-sync-catchup');
  const ctrlVolBtn = document.getElementById('ctrl-volume-btn');
  const ctrlVolSlider = document.getElementById('ctrl-volume-slider');
  const ctrlSpeedBtn = document.getElementById('ctrl-speed-btn');
  const speedMenu = document.getElementById('speed-menu');
  const ctrlTheaterBtn = document.getElementById('ctrl-theater-btn');
  const ctrlFullscreenBtn = document.getElementById('ctrl-fullscreen-btn');
  const progressContainer = document.getElementById('progress-container');
  const cinemaStage = document.getElementById('cinema-stage');
  const reactionsOverlay = document.getElementById('reactions-overlay');

  // Chat & Voice
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const chatMessages = document.getElementById('chat-messages');
  const tabBtnChat = document.getElementById('tab-btn-chat');
  const tabBtnVoice = document.getElementById('tab-btn-voice');
  const panelChat = document.getElementById('panel-chat');
  const panelVoice = document.getElementById('panel-voice');
  const btnToggleMic = document.getElementById('btn-toggle-mic');
  const textMicBtn = document.getElementById('text-mic-btn');
  const iconMicOff = document.getElementById('icon-mic-off');
  const iconMicOn = document.getElementById('icon-mic-on');
  const voiceSignalIcon = document.getElementById('voice-signal-icon');
  const voiceStatusDesc = document.getElementById('voice-status-desc');
  const membersList = document.getElementById('members-list');
  const memberCount = document.getElementById('member-count');
  const voiceCountBadge = document.getElementById('voice-count-badge');

  // Source Modal Elements
  const modalSource = document.getElementById('modal-source');
  const modalShield = document.getElementById('modal-shield');
  const modalSettings = document.getElementById('modal-settings');
  const inputYtUrl = document.getElementById('input-yt-url');
  const btnLoadYt = document.getElementById('btn-load-yt');
  const inputStreamUrl = document.getElementById('input-stream-url');
  const btnLoadStream = document.getElementById('btn-load-stream');
  const btnStartScreenshare = document.getElementById('btn-start-screenshare');
  const localFileDropzone = document.getElementById('local-file-dropzone');
  const inputLocalFile = document.getElementById('input-local-file');
  const btnBrowseFile = document.getElementById('btn-browse-file');
  const inputWebUrl = document.getElementById('input-web-url');
  const btnLoadWeb = document.getElementById('btn-load-web');
  const btnWebRefresh = document.getElementById('btn-web-refresh');
  const btnWebExternal = document.getElementById('btn-web-external');

  // Settings Elements
  const settingHostOnlyCtrl = document.getElementById('setting-host-only-ctrl');
  const settingUsername = document.getElementById('setting-username');
  const btnSaveUsername = document.getElementById('btn-save-username');

  // Update User Profile Badge
  function updateMyProfileBadge() {
    const name = window.p2p.username;
    myUsernameDisplay.textContent = name;
    myAvatarLetter.textContent = name.charAt(0).toUpperCase();
    if (settingUsername) settingUsername.value = name;
  }

  // ==========================================================================
  // Initialize P2P Network
  // ==========================================================================
  window.p2p.init((roomId, isHost) => {
    roomIdDisplay.textContent = roomId;
    if (settingsRoomCode) settingsRoomCode.textContent = roomId;
    updateMyProfileBadge();

    showToast(isHost ? 'Created new watch room as Host' : 'Joined watch room!', 'success');

    // Announce in chat
    appendSystemMessage(isHost 
      ? `Room created (${roomId}). Share the link to invite friends!` 
      : `Connected to room ${roomId}. Synchronizing with host...`
    );
  });

  // Supply state snapshot when a new peer connects to Host
  window.p2p.onStateSyncRequest = () => {
    return window.player.getCurrentSyncState();
  };

  // Handle incoming playback sync from Host/Peer
  window.p2p.onStateSync = (syncData) => {
    window.player.applyRemoteSync(syncData);

    if (syncData.action && syncData.senderName) {
      if (syncData.action === 'play') {
        showVideoToast(`▶ ${syncData.senderName} started playback`);
      } else if (syncData.action === 'pause') {
        showVideoToast(`⏸ ${syncData.senderName} paused the video`);
      } else if (syncData.action === 'seek') {
        showVideoToast(`⏩ ${syncData.senderName} scrubbed the video`);
      }
    }
  };

  // When local player triggers a state change, broadcast to room
  window.player.onBroadcastState = (stateData) => {
    window.p2p.broadcastSyncState(stateData);
  };

  window.player.onToast = (msg, type) => {
    showToast(msg, type);
  };

  // ==========================================================================
  // Live Chat Handling
  // ==========================================================================
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    window.p2p.sendChatMessage(text);
    chatInput.value = '';
  });

  window.p2p.onChatMessage = (msg) => {
    appendChatMessage(msg);

    // If chat drawer is closed on mobile, show unread badge
    if (window.innerWidth <= 960 && !sideDock.classList.contains('drawer-open')) {
      unreadDot.classList.remove('hidden');
    }
  };

  function appendChatMessage(msg) {
    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.className = `chat-bubble-wrapper ${msg.isMe ? 'is-me' : ''}`;

    const meta = document.createElement('div');
    meta.className = 'chat-meta';

    const sender = document.createElement('span');
    sender.className = `chat-sender-name ${msg.isMe ? 'is-me' : ''} ${msg.isHost ? 'is-host' : ''}`;
    sender.textContent = msg.sender || 'Friend';

    const time = document.createElement('span');
    time.className = 'chat-timestamp';
    time.textContent = msg.timestamp || '';

    meta.appendChild(sender);
    meta.appendChild(time);

    const textEl = document.createElement('div');
    textEl.className = 'chat-text';
    textEl.textContent = msg.text;

    bubbleWrapper.appendChild(meta);
    bubbleWrapper.appendChild(textEl);

    chatMessages.appendChild(bubbleWrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function appendSystemMessage(text) {
    const sysEl = document.createElement('div');
    sysEl.className = 'system-message';
    sysEl.innerHTML = `
      <div class="sys-icon"><i data-lucide="info"></i></div>
      <div class="sys-content"><p>${text}</p></div>
    `;
    chatMessages.appendChild(sysEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (window.lucide) window.lucide.createIcons();
  }

  // ==========================================================================
  // Floating Reactions
  // ==========================================================================
  document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.dataset.emoji;
      if (!emoji) return;

      window.p2p.sendReaction(emoji);
    });
  });

  window.p2p.onReaction = (data) => {
    spawnFloatingEmoji(data.emoji);
  };

  function spawnFloatingEmoji(emoji) {
    const emojiEl = document.createElement('div');
    emojiEl.className = 'floating-emoji';
    emojiEl.textContent = emoji;

    // Random horizontal starting point (10% to 90%)
    const randomLeft = 10 + Math.random() * 80;
    // Slight random rotation (-20deg to 20deg)
    const randomRot = (Math.random() * 40 - 20) + 'deg';

    emojiEl.style.left = `${randomLeft}%`;
    emojiEl.style.setProperty('--rot', randomRot);

    reactionsOverlay.appendChild(emojiEl);

    setTimeout(() => {
      emojiEl.remove();
    }, 3400);
  }

  // ==========================================================================
  // Voice Chat Controls & Indicators
  // ==========================================================================
  btnToggleMic.addEventListener('click', async () => {
    const connected = await window.p2p.toggleVoice();
    updateVoiceUI(connected, window.p2p.isMuted);
  });

  window.p2p.onVoiceStateChange = (inVoice, isMuted) => {
    updateVoiceUI(inVoice, isMuted);
  };

  function updateVoiceUI(inVoice, isMuted) {
    if (inVoice) {
      btnToggleMic.className = `btn-mic-toggle ${isMuted ? 'muted' : 'active'}`;
      textMicBtn.textContent = isMuted ? 'Unmute Mic' : 'Leave Voice';
      iconMicOff.classList.toggle('hidden', !isMuted);
      iconMicOn.classList.toggle('hidden', isMuted);
      voiceSignalIcon.classList.add('connected');
      voiceStatusDesc.textContent = isMuted ? 'Muted (Click to talk)' : 'Connected — Voice Active';
    } else {
      btnToggleMic.className = 'btn-mic-toggle';
      textMicBtn.textContent = 'Join Voice';
      iconMicOff.classList.remove('hidden');
      iconMicOn.classList.add('hidden');
      voiceSignalIcon.classList.remove('connected');
      voiceStatusDesc.textContent = 'Microphone is off';
    }
  }

  window.p2p.onUserSpeaking = (peerId, isSpeaking) => {
    if (peerId === window.p2p.peerId) {
      myAvatarRing.classList.toggle('speaking', isSpeaking);
    }
    const memberAvatar = document.getElementById(`avatar-${peerId}`);
    if (memberAvatar) {
      memberAvatar.classList.toggle('speaking', isSpeaking);
    }
  };

  // ==========================================================================
  // Members List Render
  // ==========================================================================
  window.p2p.onMembersChange = (members) => {
    memberCount.textContent = members.length;
    let inVoiceCount = 0;
    membersList.innerHTML = '';

    members.forEach(m => {
      if (m.inVoice) inVoiceCount++;

      const row = document.createElement('div');
      row.className = 'member-row';

      const isMe = m.peerId === window.p2p.peerId;

      row.innerHTML = `
        <div class="member-info">
          <div class="member-avatar ${m.isSpeaking ? 'speaking' : ''}" id="avatar-${m.peerId}">
            ${(m.username || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <span class="member-name">${m.username || 'Friend'} ${isMe ? '(You)' : ''}</span>
            ${m.isHost ? '<span class="member-role-tag">HOST</span>' : ''}
            ${m.inVoice ? '<span class="member-role-tag" style="color:var(--accent-green)">MIC ON</span>' : ''}
          </div>
        </div>
        ${!isMe ? `
          <input type="range" class="member-vol-slider" min="0" max="1" step="0.05" value="1" title="Friend Volume" data-peer="${m.peerId}">
        ` : ''}
      `;

      membersList.appendChild(row);
    });

    voiceCountBadge.textContent = inVoiceCount;

    // Attach volume listeners to friend volume sliders
    document.querySelectorAll('.member-vol-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const peerId = e.target.dataset.peer;
        window.p2p.setPeerVolume(peerId, parseFloat(e.target.value));
      });
    });
  };

  // ==========================================================================
  // Video Controls Bar Events
  // ==========================================================================
  ctrlPlayPause.addEventListener('click', () => {
    window.player.togglePlayPause();
  });

  ctrlSyncCatchup.addEventListener('click', () => {
    showToast('Resynchronizing with room...', 'info');
    if (window.p2p && !window.p2p.isHost) {
      // Re-request sync
      window.p2p.broadcast({ type: 'REQUEST_SYNC' });
    }
  });

  ctrlVolBtn.addEventListener('click', () => {
    const isMuted = window.player.html5Player.muted;
    window.player.html5Player.muted = !isMuted;
    document.getElementById('icon-vol-high').classList.toggle('hidden', !isMuted);
    document.getElementById('icon-vol-mute').classList.toggle('hidden', isMuted);
  });

  ctrlVolSlider.addEventListener('input', (e) => {
    const vol = parseFloat(e.target.value);
    window.player.setVolume(vol);
  });

  // Playback speed dropdown
  ctrlSpeedBtn.addEventListener('click', () => {
    speedMenu.classList.toggle('hidden');
  });

  document.querySelectorAll('.speed-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const speed = parseFloat(opt.dataset.speed);
      window.player.setPlaybackRate(speed);
      ctrlSpeedBtn.textContent = `${speed}x`;
      document.querySelectorAll('.speed-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      speedMenu.classList.add('hidden');
    });
  });

  // Theater Mode
  ctrlTheaterBtn.addEventListener('click', () => {
    cinemaStage.classList.toggle('theater-mode');
  });

  // Fullscreen
  ctrlFullscreenBtn.addEventListener('click', () => {
    const videoContainer = document.getElementById('video-container');
    if (!document.fullscreenElement) {
      videoContainer.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const isFull = !!document.fullscreenElement;
    document.getElementById('icon-fullscreen').classList.toggle('hidden', isFull);
    document.getElementById('icon-exit-fullscreen').classList.toggle('hidden', !isFull);
  });

  // Scrubber Seeking
  progressContainer.addEventListener('click', (e) => {
    const rect = progressContainer.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const dur = window.player.getDuration();
    if (dur > 0) {
      window.player.seekTo(pos * dur);
    }
  });

  // ==========================================================================
  // Dock Tabs & Mobile Drawer
  // ==========================================================================
  tabBtnChat.addEventListener('click', () => {
    tabBtnChat.classList.add('active');
    tabBtnVoice.classList.remove('active');
    panelChat.classList.add('active');
    panelVoice.classList.remove('active');
  });

  tabBtnVoice.addEventListener('click', () => {
    tabBtnVoice.classList.add('active');
    tabBtnChat.classList.remove('active');
    panelVoice.classList.add('active');
    panelChat.classList.remove('active');
  });

  btnToggleDrawer.addEventListener('click', () => {
    sideDock.classList.toggle('drawer-open');
    unreadDot.classList.add('hidden');
  });

  btnCloseDock.addEventListener('click', () => {
    sideDock.classList.remove('drawer-open');
  });

  // ==========================================================================
  // Modals & Triggers
  // ==========================================================================
  function openModal(modalEl) {
    modalEl.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  function closeModal(modalEl) {
    modalEl.classList.add('hidden');
  }

  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.close;
      const modal = document.getElementById(modalId);
      if (modal) closeModal(modal);
    });
  });

  if (btnOpenSourceModal) btnOpenSourceModal.addEventListener('click', () => openModal(modalSource));
  if (btnEmptyLoad) btnEmptyLoad.addEventListener('click', () => openModal(modalSource));
  if (btnShieldInfo) btnShieldInfo.addEventListener('click', () => openModal(modalShield));
  if (btnRoomSettings) btnRoomSettings.addEventListener('click', () => openModal(modalSettings));
  document.getElementById('btn-profile')?.addEventListener('click', () => openModal(modalSettings));

  // Source Modal Tabs
  document.querySelectorAll('.source-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.source-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.source-tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const tabId = `tab-src-${btn.dataset.source}`;
      document.getElementById(tabId)?.classList.add('active');
    });
  });

  // Load YouTube Video
  btnLoadYt.addEventListener('click', () => {
    const url = inputYtUrl.value.trim();
    if (url) {
      window.player.loadYouTube(url);
      closeModal(modalSource);
    }
  });

  document.querySelectorAll('.tag-sample').forEach(tag => {
    tag.addEventListener('click', () => {
      inputYtUrl.value = tag.dataset.url;
      window.player.loadYouTube(tag.dataset.url);
      closeModal(modalSource);
    });
  });

  // Load Direct Stream
  btnLoadStream.addEventListener('click', () => {
    const url = inputStreamUrl.value.trim();
    if (url) {
      window.player.loadDirectStream(url);
      closeModal(modalSource);
    }
  });

  document.querySelectorAll('.tag-sample-stream').forEach(tag => {
    tag.addEventListener('click', () => {
      inputStreamUrl.value = tag.dataset.url;
      window.player.loadDirectStream(tag.dataset.url);
      closeModal(modalSource);
    });
  });

  // Screen Share
  btnStartScreenshare.addEventListener('click', async () => {
    closeModal(modalSource);
    await window.player.startScreenShare();
  });

  // Local File Drop / Browse
  btnBrowseFile.addEventListener('click', () => inputLocalFile.click());
  localFileDropzone.addEventListener('click', () => inputLocalFile.click());

  inputLocalFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      window.player.loadLocalFile(file);
      closeModal(modalSource);
    }
  });

  // Load Web Embed (e.g. YTS en.yts.lu)
  if (btnLoadWeb) {
    btnLoadWeb.addEventListener('click', () => {
      const url = inputWebUrl ? inputWebUrl.value.trim() : '';
      if (url) {
        window.player.loadWebEmbed(url);
        closeModal(modalSource);
      }
    });
  }

  document.querySelectorAll('.tag-sample-web').forEach(tag => {
    tag.addEventListener('click', () => {
      if (inputWebUrl) inputWebUrl.value = tag.dataset.url;
      window.player.loadWebEmbed(tag.dataset.url);
      closeModal(modalSource);
    });
  });

  // Web Nav Bar Buttons
  if (btnWebRefresh) {
    btnWebRefresh.addEventListener('click', () => {
      if (window.player.webIframe && window.player.currentSourceUrl) {
        window.player.webIframe.src = window.player.currentSourceUrl;
        showToast('Reloaded embedded webpage', 'info');
      }
    });
  }

  if (btnWebExternal) {
    btnWebExternal.addEventListener('click', () => {
      if (window.player.currentSourceUrl) {
        window.open(window.player.currentSourceUrl, '_blank', 'noopener,noreferrer');
      }
    });
  }

  // Copy Room Invite Link
  btnCopyInvite.addEventListener('click', () => {
    const shareUrl = window.location.href;
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('Invite link copied to clipboard! Send to friends.', 'success');
    }).catch(() => {
      showToast('Failed to copy. Share: ' + shareUrl, 'warning');
    });
  });

  // Settings: Change Username
  btnSaveUsername.addEventListener('click', () => {
    const newName = settingUsername.value.trim();
    if (newName) {
      window.p2p.setUsername(newName);
      updateMyProfileBadge();
      showToast(`Username changed to ${newName}`, 'success');
      closeModal(modalSettings);
    }
  });

  // Settings: Host Only Control
  settingHostOnlyCtrl.addEventListener('change', (e) => {
    window.player.hostOnlyControl = e.target.checked;
    showToast(e.target.checked ? 'Host Lock enabled: Only Host can control playback' : 'Free-for-All: Anyone can control video', 'info');
  });

  // ==========================================================================
  // Cinema Hub & Stage Quick Switcher Pills
  // ==========================================================================
  const stagePillYts = document.getElementById('stage-pill-yts');
  const stagePillYt = document.getElementById('stage-pill-yt');
  const stagePillStream = document.getElementById('stage-pill-stream');
  const stagePillScreen = document.getElementById('stage-pill-screen');
  const stagePillLocal = document.getElementById('stage-pill-local');

  const btnQuickYts = document.getElementById('btn-quick-yts');
  const btnQuickYt = document.getElementById('btn-quick-yt');
  const hubQuickUrlForm = document.getElementById('hub-quick-url-form');
  const hubUrlInput = document.getElementById('hub-url-input');

  // Stage Pills Handlers
  if (stagePillYts) {
    stagePillYts.addEventListener('click', () => {
      window.player.loadWebEmbed('https://en.yts.lu/');
    });
  }

  if (stagePillYt) {
    stagePillYt.addEventListener('click', () => {
      const modal = document.getElementById('modal-source');
      openModal(modal);
      document.querySelector('.source-tab-btn[data-source="youtube"]')?.click();
    });
  }

  if (stagePillStream) {
    stagePillStream.addEventListener('click', () => {
      const modal = document.getElementById('modal-source');
      openModal(modal);
      document.querySelector('.source-tab-btn[data-source="stream"]')?.click();
    });
  }

  if (stagePillScreen) {
    stagePillScreen.addEventListener('click', async () => {
      await window.player.startScreenShare();
    });
  }

  if (stagePillLocal) {
    stagePillLocal.addEventListener('click', () => {
      inputLocalFile.click();
    });
  }

  // Quick Hub Launchers
  if (btnQuickYts) {
    btnQuickYts.addEventListener('click', () => {
      window.player.loadWebEmbed('https://en.yts.lu/');
    });
  }

  if (btnQuickYt) {
    btnQuickYt.addEventListener('click', () => {
      window.player.loadYouTube('https://www.youtube.com/watch?v=L_LUpnjgPso');
    });
  }

  // Home Screen Quick URL Bar (Intelligently detects YouTube, Stream, or Website)
  if (hubQuickUrlForm) {
    hubQuickUrlForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = hubUrlInput.value.trim();
      if (!url) return;

      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        window.player.loadYouTube(url);
      } else if (url.includes('.mp4') || url.includes('.m3u8') || url.includes('.webm')) {
        window.player.loadDirectStream(url);
      } else {
        window.player.loadWebEmbed(url);
      }
    });
  }

  // Quick Picks Chips
  document.querySelectorAll('.pick-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const type = chip.dataset.type;
      const val = chip.dataset.val;

      if (type === 'yts') {
        window.player.loadWebEmbed(val || 'https://en.yts.lu/');
      } else if (type === 'yt') {
        window.player.loadYouTube(val);
      } else if (type === 'stream') {
        window.player.loadDirectStream(val);
      } else if (type === 'screen') {
        window.player.startScreenShare();
      }
    });
  });

  // ==========================================================================
  // Keyboard Shortcuts
  // ==========================================================================
  document.addEventListener('keydown', (e) => {
    // Ignore if typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'Space') {
      e.preventDefault();
      window.player.togglePlayPause();
    } else if (e.code === 'KeyF') {
      e.preventDefault();
      ctrlFullscreenBtn.click();
    } else if (e.code === 'KeyM') {
      e.preventDefault();
      window.p2p.toggleMute();
    }
  });

  // ==========================================================================
  // Toast Notification Helper
  // ==========================================================================
  function showToast(message, type = 'info') {
    const stack = document.getElementById('toast-stack');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle-2';
    if (type === 'warning') iconName = 'alert-triangle';

    toast.innerHTML = `
      <i data-lucide="${iconName}"></i>
      <span>${message}</span>
    `;
    stack.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, 3200);
  }

  function showVideoToast(message) {
    const container = document.getElementById('video-toast-container');
    const toast = document.createElement('div');
    toast.className = 'video-toast';
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 320);
    }, 2500);
  }

  window.showToast = showToast;
});
