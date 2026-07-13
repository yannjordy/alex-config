"use strict";
const electron = require("electron");
const node_crypto = require("node:crypto");
const IPC = {
  chatStart: "chat:start",
  chatCancel: "chat:cancel",
  // Per-request reply channels are suffixed with the requestId:
  //   chat:delta:<id> · chat:tool:<id> · chat:tool-result:<id> · chat:done:<id> · chat:error:<id>
  chatDelta: (id) => `chat:delta:${id}`,
  chatTool: (id) => `chat:tool:${id}`,
  chatToolResult: (id) => `chat:tool-result:${id}`,
  chatDone: (id) => `chat:done:${id}`,
  chatError: (id) => `chat:error:${id}`,
  ttsSynthesize: "tts:synthesize",
  // Realtime voice sessions (speech-to-speech). The WebSocket lives in MAIN —
  // the gateway authenticates the upgrade with the raw AI_GATEWAY_API_KEY (no
  // ephemeral secret is minted), so the renderer can never host the socket
  // without seeing the key. The renderer owns only the audio I/O: it streams
  // mic PCM frames up via `realtimeClient` and receives audio + transcript +
  // tool notices back on the per-session `realtime:event:<id>` channel.
  realtimeStart: "realtime:start",
  realtimeClient: "realtime:client",
  realtimeEvent: (id) => `realtime:event:${id}`,
  realtimeEnd: "realtime:end",
  // Config
  configGet: "config:get",
  configSet: "config:set",
  secretSet: "secret:set",
  configReset: "config:reset",
  onboardingComplete: "onboarding:complete",
  // main → renderer event: config changed (broadcast to all windows)
  configChanged: "config:changed",
  // renderer → main: open the dedicated settings window
  settingsOpen: "settings:open",
  // STT
  transcribe: "stt:transcribe",
  // LLM: probe Apple on-device model availability (for the provider picker)
  llmAppleAvailability: "llm:apple-availability",
  // main → renderer event: global push-to-talk hotkey pressed
  pushToTalk: "push-to-talk",
  // main → renderer event: global emergency-stop hotkey pressed
  interrupt: "interrupt",
  // Session-state relay: the main window pushes a snapshot of the live voice
  // session (what the assistant is doing right now) to main, which re-broadcasts
  // it to the overlay HUD and any other view-only surface.
  sessionUpdate: "session:update",
  sessionChanged: "session:changed",
  // Window mode (full ↔ notch) + Spotlight-style summon:
  // renderer → main: request a window mode; main → renderer: mode applied
  windowSetMode: "window:set-mode",
  windowMode: "window:mode",
  // A view-only surface (the notch window) asks main to run a session action;
  // main relays it to the main window which owns the voice session.
  viewCommand: "view:command",
  // main → main window: a relayed command to execute against `useDex`.
  remoteCommand: "remote:command",
  // main → renderer event: the summon hotkey brought the window forward
  windowSummoned: "window:summoned",
  // notch renderer → main: set the notch window size (px). The renderer measures
  // its own content and drives both width and height — compact at rest, wider for
  // a caption, taller for the type field or a tool-result card. Main keeps it
  // centered on the top edge.
  notchSetSize: "notch:set-size",
  // notch renderer → main: give the notch window OS keyboard focus (it's shown
  // with showInactive, so typing needs an explicit focus first).
  notchFocus: "notch:focus",
  // Overlay HUD: renderer → main, toggle click-through so the Stop button is
  // clickable while the rest of the overlay stays pass-through.
  overlaySetInteractive: "overlay:set-interactive",
  // Overlay HUD → main: emergency stop pressed in the floating HUD (relayed to
  // the main window's interrupt path).
  overlayInterrupt: "overlay:interrupt",
  // Permission gate: main → permission popup prompt, popup → main answer.
  // `permissionDismiss` tells the popup to drop a prompt that settled without an
  // answer (timed out, or the requesting window died).
  permissionRequest: "permission:request",
  permissionRespond: "permission:respond",
  permissionDismiss: "permission:dismiss",
  // main → renderer event: auto-update lifecycle (download progress, errors)
  updateStatus: "update:status",
  // Orb desktop: renderer → main, user requested the native context menu
  orbContextMenu: "orb:context-menu",
  // main → orb renderer: result of a context-menu action
  orbMenuAction: "orb:menu-action",
  // main → orb renderer: a captured screen frame (base64 image)
  orbScreenFrame: "orb:screen-frame",
  // orb renderer → main: camera on/off status
  orbCameraToggle: "orb:camera-toggle",
  // orb renderer ↔ main: manual window drag (Linux-safe, avoids OS context menu)
  orbDragStart: "orb:drag-start",
  orbDragMove: "orb:drag-move",
  orbDragEnd: "orb:drag-end",
  // main → orb renderer: play audio from a test (buffer)
  orbPlayAudio: "orb:play-audio"
};
const alex = {
  /** The host OS platform (e.g. "darwin"), so the renderer can adapt its chrome
   *  to the frameless title bar (traffic-light clearance, drag regions). */
  platform: process.platform,
  /**
   * Stream a chat reply. Text deltas arrive via `onDelta`; the returned promise
   * resolves with the generated messages (or rejects on error). `cancel()`
   * aborts the main-process stream (used for barge-in / stop).
   */
  chat({ messages, mode, onDelta, onToolCall, onToolResult }) {
    const requestId = node_crypto.randomUUID();
    const deltaCh = IPC.chatDelta(requestId);
    const toolCh = IPC.chatTool(requestId);
    const toolResultCh = IPC.chatToolResult(requestId);
    const doneCh = IPC.chatDone(requestId);
    const errorCh = IPC.chatError(requestId);
    let settled = false;
    let resolveDone;
    let rejectDone;
    const done = new Promise((res, rej) => {
      resolveDone = res;
      rejectDone = rej;
    });
    const onDeltaEvt = (_e, text) => onDelta(text);
    const onToolEvt = (_e, call) => onToolCall?.(call);
    const onToolResultEvt = (_e, result) => onToolResult?.(result);
    const onDoneEvt = (_e, msgs) => finish(null, msgs);
    const onErrorEvt = (_e, message) => finish(new Error(message));
    function finish(err, msgs = []) {
      if (settled) return;
      settled = true;
      electron.ipcRenderer.removeListener(deltaCh, onDeltaEvt);
      electron.ipcRenderer.removeListener(toolCh, onToolEvt);
      electron.ipcRenderer.removeListener(toolResultCh, onToolResultEvt);
      electron.ipcRenderer.removeListener(doneCh, onDoneEvt);
      electron.ipcRenderer.removeListener(errorCh, onErrorEvt);
      if (err) rejectDone(err);
      else resolveDone(msgs);
    }
    electron.ipcRenderer.on(deltaCh, onDeltaEvt);
    electron.ipcRenderer.on(toolCh, onToolEvt);
    electron.ipcRenderer.on(toolResultCh, onToolResultEvt);
    electron.ipcRenderer.once(doneCh, onDoneEvt);
    electron.ipcRenderer.once(errorCh, onErrorEvt);
    electron.ipcRenderer.send(IPC.chatStart, { requestId, messages, mode });
    return {
      cancel: () => {
        if (settled) return;
        electron.ipcRenderer.send(IPC.chatCancel, requestId);
        finish(null);
      },
      done
    };
  },
  /** Synthesise a sentence to MP3 bytes for playback in the renderer. */
  async synthesize(text) {
    return electron.ipcRenderer.invoke(IPC.ttsSynthesize, text);
  },
  // ── Realtime voice sessions ───────────────────────────────────────────────
  // The WebSocket lives in main (the gateway key authenticates the upgrade);
  // the renderer streams mic PCM up and plays the audio notices coming back.
  /** Open a realtime session in main. `briefing` opens it with the proactive
   *  greeting. Rejects with a user-facing reason (unset key, failed connect). */
  realtimeStart(opts) {
    return electron.ipcRenderer.invoke(IPC.realtimeStart, opts);
  },
  /** Drive an open session: mic audio frames, typed text, task-progress
   *  context, run_task results, response control. */
  realtimeSend(sessionId, msg) {
    electron.ipcRenderer.send(IPC.realtimeClient, sessionId, msg);
  },
  /** Subscribe to a session's notices (audio, transcripts, tool calls,
   *  disconnect). Returns an unsubscribe fn. */
  onRealtimeEvent(sessionId, handler) {
    const channel = IPC.realtimeEvent(sessionId);
    const listener = (_e, notice) => handler(notice);
    electron.ipcRenderer.on(channel, listener);
    return () => electron.ipcRenderer.removeListener(channel, listener);
  },
  /** Close a session (idle disconnect, mute, mode switch). Safe to call twice. */
  realtimeEnd(sessionId) {
    electron.ipcRenderer.send(IPC.realtimeEnd, sessionId);
  },
  /** Read the full (non-secret) config plus which secrets are present. */
  getConfig() {
    return electron.ipcRenderer.invoke(IPC.configGet);
  },
  /** Patch non-secret config; returns the updated public config. */
  setConfig(patch) {
    return electron.ipcRenderer.invoke(IPC.configSet, patch);
  },
  /** Store (or clear, if empty) an API key. Values never come back out. */
  setSecret(name, value) {
    return electron.ipcRenderer.invoke(IPC.secretSet, name, value);
  },
  /** Mark first-run onboarding complete. */
  completeOnboarding() {
    return electron.ipcRenderer.invoke(IPC.onboardingComplete);
  },
  /** Factory reset: wipe stored prefs + secrets and re-run onboarding. */
  resetConfig() {
    return electron.ipcRenderer.invoke(IPC.configReset);
  },
  /** Open the dedicated settings window (creates it, or focuses if already open). */
  openSettings() {
    return electron.ipcRenderer.invoke(IPC.settingsOpen);
  },
  /** Subscribe to config changes broadcast from the main process (so windows
   *  stay in sync when either one edits config). Returns an unsubscribe fn. */
  onConfigChanged(handler) {
    const listener = (_e, config) => handler(config);
    electron.ipcRenderer.on(IPC.configChanged, listener);
    return () => electron.ipcRenderer.removeListener(IPC.configChanged, listener);
  },
  /** Transcribe a captured utterance (WAV bytes) via a cloud STT provider. */
  transcribe(provider, wav) {
    return electron.ipcRenderer.invoke(IPC.transcribe, provider, wav);
  },
  /** Probe whether the Apple on-device model can run (provider picker gate). */
  appleAvailability() {
    return electron.ipcRenderer.invoke(IPC.llmAppleAvailability);
  },
  /** Subscribe to the global push-to-talk hotkey. Returns an unsubscribe fn. */
  onPushToTalk(handler) {
    const listener = () => handler();
    electron.ipcRenderer.on(IPC.pushToTalk, listener);
    return () => electron.ipcRenderer.removeListener(IPC.pushToTalk, listener);
  },
  /** Subscribe to the global emergency-stop hotkey. Returns an unsubscribe fn. */
  onInterrupt(handler) {
    const listener = () => handler();
    electron.ipcRenderer.on(IPC.interrupt, listener);
    return () => electron.ipcRenderer.removeListener(IPC.interrupt, listener);
  },
  // ── Session state relay (main window → view surfaces) ─────────────────────
  /** Main window: publish a fresh snapshot of the live voice session. */
  publishSessionState(state) {
    electron.ipcRenderer.send(IPC.sessionUpdate, state);
  },
  /** View surfaces (overlay/notch): subscribe to session-state snapshots. The
   *  handler fires immediately with the last-known state on (re)subscribe. */
  onSessionState(handler) {
    const listener = (_e, state) => handler(state);
    electron.ipcRenderer.on(IPC.sessionChanged, listener);
    return () => electron.ipcRenderer.removeListener(IPC.sessionChanged, listener);
  },
  // ── Window mode + summon ──────────────────────────────────────────────────
  /** Request a window layout (full themed experience ↔ slim notch bar). */
  setWindowMode(mode) {
    electron.ipcRenderer.send(IPC.windowSetMode, mode);
  },
  /** Notch only: set the notch window size (px) — the renderer measures its own
   *  content and drives width + height (compact at rest, wider/taller for a
   *  caption, type field, or result card). */
  setNotchSize(width, height) {
    electron.ipcRenderer.send(IPC.notchSetSize, { width, height });
  },
  /** Notch only: give the notch window OS keyboard focus so its type field can
   *  receive keystrokes (it's shown unfocused via showInactive). */
  focusNotch() {
    electron.ipcRenderer.send(IPC.notchFocus);
  },
  /** Subscribe to window-mode changes applied by main. Returns an unsubscribe fn. */
  onWindowMode(handler) {
    const listener = (_e, mode) => handler(mode);
    electron.ipcRenderer.on(IPC.windowMode, listener);
    return () => electron.ipcRenderer.removeListener(IPC.windowMode, listener);
  },
  /** View-only surface (notch) → run a session action on the main window. */
  sendViewCommand(cmd) {
    electron.ipcRenderer.send(IPC.viewCommand, cmd);
  },
  /** Main window: receive a relayed session action (submitText / toggleMute). */
  onRemoteCommand(handler) {
    const listener = (_e, cmd) => handler(cmd);
    electron.ipcRenderer.on(IPC.remoteCommand, listener);
    return () => electron.ipcRenderer.removeListener(IPC.remoteCommand, listener);
  },
  /** Subscribe to the summon hotkey bringing the window forward (focus input). */
  onSummoned(handler) {
    const listener = () => handler();
    electron.ipcRenderer.on(IPC.windowSummoned, listener);
    return () => electron.ipcRenderer.removeListener(IPC.windowSummoned, listener);
  },
  // ── Overlay HUD ───────────────────────────────────────────────────────────
  /** Overlay: toggle click-through so the Stop button is clickable on hover. */
  setOverlayInteractive(interactive) {
    electron.ipcRenderer.send(IPC.overlaySetInteractive, interactive);
  },
  /** Overlay: trigger the emergency stop (relayed to the main window). */
  overlayInterrupt() {
    electron.ipcRenderer.send(IPC.overlayInterrupt);
  },
  /** Subscribe to permission prompts for sensitive tool calls. */
  onPermissionRequest(handler) {
    const listener = (_e, req) => handler(req);
    electron.ipcRenderer.on(IPC.permissionRequest, listener);
    return () => electron.ipcRenderer.removeListener(IPC.permissionRequest, listener);
  },
  /** Subscribe to prompt dismissals (a prompt settled without an answer). */
  onPermissionDismiss(handler) {
    const listener = (_e, id) => handler(id);
    electron.ipcRenderer.on(IPC.permissionDismiss, listener);
    return () => electron.ipcRenderer.removeListener(IPC.permissionDismiss, listener);
  },
  /** Subscribe to auto-update lifecycle events (download progress, errors,
   *  ready-to-install). Returns an unsubscribe fn. */
  onUpdateStatus(handler) {
    const listener = (_e, status) => handler(status);
    electron.ipcRenderer.on(IPC.updateStatus, listener);
    return () => electron.ipcRenderer.removeListener(IPC.updateStatus, listener);
  },
  /** Answer a permission prompt. */
  respondPermission(id, skillId, decision) {
    electron.ipcRenderer.send(IPC.permissionRespond, { id, skillId, decision });
  },
  // ── Orb desktop ────────────────────────────────────────────────────────────
  /** Orb: ask main to show the native context menu. */
  showOrbContextMenu() {
    electron.ipcRenderer.send(IPC.orbContextMenu);
  },
  /** Orb: subscribe to context-menu action results. Returns an unsubscribe fn. */
  onOrbMenuAction(handler) {
    const listener = (_e, action) => handler(action);
    electron.ipcRenderer.on(IPC.orbMenuAction, listener);
    return () => electron.ipcRenderer.removeListener(IPC.orbMenuAction, listener);
  },
  /** Orb: subscribe to screen-capture frames from main. Returns an unsubscribe fn. */
  onOrbScreenFrame(handler) {
    const listener = (_e, data) => handler(data);
    electron.ipcRenderer.on(IPC.orbScreenFrame, listener);
    return () => electron.ipcRenderer.removeListener(IPC.orbScreenFrame, listener);
  },
  /** Orb: tell main whether the camera is on or off. */
  sendOrbCameraStatus(status) {
    electron.ipcRenderer.send(IPC.orbCameraToggle, status);
  },
  /** Orb: start manual window drag (mousedown). */
  startOrbDrag() {
    electron.ipcRenderer.send(IPC.orbDragStart);
  },
  /** Orb: continue window drag (mousemove). Main uses getCursorScreenPoint. */
  moveOrbDrag() {
    electron.ipcRenderer.send(IPC.orbDragMove);
  },
  /** Orb: end window drag (mouseup). */
  endOrbDrag() {
    electron.ipcRenderer.send(IPC.orbDragEnd);
  },
  /** Orb: listen for audio to play (ArrayBuffer from TTS test). */
  onOrbPlayAudio(handler) {
    const listener = (_e, buffer) => handler(buffer);
    electron.ipcRenderer.on(IPC.orbPlayAudio, listener);
    return () => electron.ipcRenderer.removeListener(IPC.orbPlayAudio, listener);
  }
};
electron.contextBridge.exposeInMainWorld("alex", alex);
