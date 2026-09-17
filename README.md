# 🍿 CoWatch — Serverless Ad-Free Watch Party & Voice Chat

**CoWatch** is a modern, privacy-focused, 100% serverless watch party web application designed to run completely free on **GitHub Pages**.

Host synchronized movie and video nights with your friends across mobile and desktop devices featuring **free peer-to-peer text chat**, **free WebRTC voice chat**, and **zero pop-up ads**.

---

## ✨ Features

- 🎬 **Multi-Source Video Engine**:
  - **YouTube Sync**: Synchronized play, pause, seek, and playback rate using `youtube-nocookie.com` with recommendation clutter disabled.
  - **Sandboxed Webpage & YTS Embed**: Directly embed movie catalog websites like `https://en.yts.lu/` inside the cinema stage with a dedicated web address bar. The browser sandbox **completely blocks pop-up tabs and scam redirects**!
  - **Direct Stream Player (MP4 / HLS .m3u8)**: Custom HTML5 player that plays raw video streams. **Bypasses all pop-up ads, redirect malware, and scam banners** found on free movie and anime streaming websites!
  - **Screen / Tab Sharing**: Anyone on PC can broadcast any browser tab or window (with tab audio) directly to mobile and desktop viewers.
  - **Local File Sync**: Both you and a friend select the same movie file on your devices; CoWatch synchronizes playback timestamps with **zero bandwidth upload** and zero lag.
- 🎙️ **Free WebRTC Voice Chat**:
  - Peer-to-peer audio mesh network with microphone mute/unmute.
  - Glowing speaking indicators (Discord-style) powered by Web Audio API frequency analysis.
  - Individual friend volume sliders.
- 💬 **Real-Time Live Chat**:
  - Instant messaging over WebRTC DataChannels.
  - System activity notifications (*"Host paused the video"*).
- 🍿 **Floating Live Reactions**:
  - Tap emojis (🍿, ❤️, 😂, 🔥, 😱, 👏, 💀) to drift across everyone's screens in real-time.
- 🛡️ **Brave-Style Ad-Free Experience**:
  - Zero third-party trackers, zero banner ads, and no database or account required.
- 📱 **Mobile & Desktop Responsive**:
  - Dark cinema aesthetic with glassmorphism overlays.
  - Slide-out touch drawer for chat & voice on smartphones.
  - Cinema theater mode and native fullscreen support.

---

## 🚀 How to Host on GitHub Pages (1-Minute Setup)

You can host CoWatch for **100% free forever** on your GitHub account with zero server costs:

### Step 1: Create a GitHub Repository
1. Go to [github.com/new](https://github.com/new).
2. Name your repository (e.g., `cowatch`).
3. Set it to **Public** and click **Create repository**.

### Step 2: Push the Files
In this folder (`d:\Antigravity\cowatch`), open a terminal and run:
```bash
git init
git add .
git commit -m "Initial release of CoWatch Cinema"
git branch -M main
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/cowatch.git
git push -u origin main
```

### Step 3: Enable GitHub Pages
1. Go to your repository on GitHub.
2. Click **Settings** (gear icon) ➔ **Pages** (in the left sidebar).
3. Under **Build and deployment** ➔ **Source**, select **Deploy from a branch**.
4. Set the branch to `main` and folder to `/ (root)`, then click **Save**.

🎉 Within 60 seconds, your watch party site will be live at:
```
https://<YOUR_GITHUB_USERNAME>.github.io/cowatch/
```

---

## 💡 How to Watch Movies Together

### Method A: Direct Movie Streams (Recommended for Mobile Host)
1. Find the direct `.mp4` or `.m3u8` stream of your favorite movie or anime.
2. Click **"Change Video"** ➔ **Direct URL**.
3. Paste the URL and click **Load Stream**.
4. All pop-ups and scam ads on the original website are completely stripped—your friends only see the clean video stream!

### Method B: YouTube Videos
1. Click **"Change Video"** ➔ **YouTube**.
2. Paste any YouTube video link or Shorts URL.
3. Play, pause, and scrubber positions are automatically synchronized across all participants.

### Method C: Stream Netflix / Prime from PC to Mobile Friends
*If someone in your group has a PC with Netflix or Prime:*
1. In Google Chrome or Edge on PC, go to **Settings** ➔ search for **"Hardware Acceleration"** ➔ toggle it **OFF** and restart the browser (this prevents DRM black screens).
2. Open Netflix in a browser tab.
3. In CoWatch, click **"Change Video"** ➔ **Screen / Tab Share**.
4. Select the Netflix tab and make sure **"Share tab audio"** is checked.
5. All your friends on mobile and desktop can watch your Netflix stream and talk on voice chat with zero login required!

### Method D: Local Movie Files
1. You and your friend download the same movie file to your devices.
2. Click **"Change Video"** ➔ **Local File** and choose the file.
3. CoWatch syncs the video timestamps without uploading gigabytes of data!

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Space` | Play / Pause Video |
| `F` | Toggle Fullscreen Mode |
| `M` | Mute / Unmute Microphone |

---

## 🔒 Privacy & Architecture
- **Signaling**: Uses public STUN & PeerJS broker (`0.peerjs.com`) only for initial WebRTC handshakes.
- **Data & Media**: All video sync packets, text messages, and VoIP audio streams flow directly from device to device (Peer-to-Peer). No chat logs or viewing habits are stored on any server.
