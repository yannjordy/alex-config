"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const node_path = require("node:path");
const node_crypto = require("node:crypto");
const dotenv = require("dotenv");
const electron = require("electron");
const ai = require("ai");
const openai = require("@ai-sdk/openai");
const anthropic = require("@ai-sdk/anthropic");
const xai = require("@ai-sdk/xai");
const gateway = require("@ai-sdk/gateway");
const zod = require("zod");
const node_child_process = require("node:child_process");
const nutJs = require("@nut-tree-fork/nut-js");
const node_fs = require("node:fs");
const elevenlabsJs = require("@elevenlabs/elevenlabs-js");
const log = require("electron-log");
const electronUpdater = require("electron-updater");
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
  updateStatus: "update:status"
};
const RUN_TASK_TOOL = "run_task";
const KEEP_SCREENSHOTS = 2;
const MAX_STEPS = 40;
function hasImage(output) {
  return !!output && typeof output === "object" && output.type === "content" && Array.isArray(output.value) && output.value.some(
    (c) => c.type === "media" || c.type === "file-data"
  );
}
function pruneOldScreenshots(messages) {
  const imageParts = [];
  for (const m of messages) {
    if (m.role !== "tool" || !Array.isArray(m.content)) continue;
    for (const part of m.content) {
      if (part?.type === "tool-result" && hasImage(part.output)) imageParts.push(part);
    }
  }
  if (imageParts.length <= KEEP_SCREENSHOTS) return messages;
  const strip = new Set(imageParts.slice(0, imageParts.length - KEEP_SCREENSHOTS));
  return messages.map((m) => {
    if (m.role !== "tool" || !Array.isArray(m.content)) return m;
    let changed = false;
    const content = m.content.map((part) => {
      if (strip.has(part)) {
        changed = true;
        return {
          ...part,
          output: {
            type: "text",
            value: "[earlier screenshot omitted to save context]"
          }
        };
      }
      return part;
    });
    return changed ? { ...m, content } : m;
  });
}
function loggable(value) {
  return JSON.parse(
    JSON.stringify(
      value,
      (_key, v) => typeof v === "string" && v.length > 600 ? `${v.slice(0, 600)}…[${v.length} chars]` : v
    )
  );
}
function sanitiseError(raw) {
  const noAnsi = raw.replace(/\[[0-9;]*m/g, "");
  const firstLine = noAnsi.split(/\n/)[0]?.trim() || "an unknown error occurred";
  return firstLine.replace(/\.$/, "") + ".";
}
async function streamChat({
  messages,
  system,
  model,
  tools: tools2,
  briefing,
  signal,
  onDelta,
  onToolCall,
  onToolResult
}) {
  let capturedError = null;
  console.log("[alex chat] → request", {
    briefing: !!briefing,
    tools: briefing ? [] : Object.keys(tools2 ?? {}),
    system,
    messages: loggable(messages)
  });
  const result = ai.streamText({
    model,
    system,
    messages,
    tools: briefing ? void 0 : tools2,
    stopWhen: ai.stepCountIs(MAX_STEPS),
    // Trim stale screenshots from the context before each step (no-op when
    // there are none, e.g. ordinary turns).
    prepareStep: ({ messages: stepMessages }) => ({
      messages: pruneOldScreenshots(stepMessages)
    }),
    abortSignal: signal,
    onError: ({ error }) => {
      capturedError = error;
      console.error("[alex chat] streamText error", error);
    }
  });
  let emittedAny = false;
  let fullText = "";
  const toolCallsLog = [];
  try {
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        if (part.text.length === 0) continue;
        emittedAny = true;
        fullText += part.text;
        onDelta(part.text);
      } else if (part.type === "tool-call") {
        toolCallsLog.push({ toolName: part.toolName, input: part.input });
        onToolCall?.({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input
        });
      } else if (part.type === "tool-result") {
        onToolResult?.({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: part.output
        });
      }
    }
  } catch (err) {
    if (err?.name === "AbortError") return [];
    capturedError = err;
  }
  console.log("[alex chat] ← response", {
    finishReason: await Promise.resolve(result.finishReason).catch(() => "unknown"),
    text: fullText,
    toolCalls: loggable(toolCallsLog),
    error: capturedError ? String(capturedError) : void 0
  });
  if (signal?.aborted) return [];
  if (!emittedAny && capturedError) {
    const err = capturedError;
    const apology = `Apologies, sir — ${sanitiseError(err.message ?? String(err))}`;
    onDelta(apology);
    return [{ role: "assistant", content: apology }];
  }
  return (await result.response).messages;
}
async function resolveModel(config) {
  const { provider, model } = config.llm;
  switch (provider) {
    case "openai":
      if (!process.env.OPENAI_API_KEY) throw new Error("no OpenAI API key is set");
      return openai.createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(model);
    case "anthropic":
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("no Anthropic API key is set");
      return anthropic.createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(model);
    case "xai":
      if (!process.env.XAI_API_KEY) throw new Error("no xAI API key is set");
      return xai.createXai({ apiKey: process.env.XAI_API_KEY })(model);
    case "apple": {
      const { appleAI, appleAISDK } = await import("@meridius-labs/apple-on-device-ai");
      const { available, reason } = await appleAISDK.checkAvailability();
      if (!available) throw new Error(reason || "Apple Intelligence is unavailable");
      return appleAI("apple-on-device");
    }
    case "alex":
      throw new Error("the Alex subscription isn't available yet");
    case "openrouter":
      if (!process.env.OPENROUTER_API_KEY) throw new Error("no OpenRouter API key is set");
      return openai.createOpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://alex.openclaw.ai",
          "X-Title": "Alex"
        }
      })(model);
    case "gateway":
    default:
      return model;
  }
}
async function checkAppleAvailability() {
  if (process.platform !== "darwin") {
    return { available: false, reason: "Requires macOS on Apple Silicon" };
  }
  try {
    const { appleAISDK } = await import("@meridius-labs/apple-on-device-ai");
    return await appleAISDK.checkAvailability();
  } catch (err) {
    return {
      available: false,
      reason: err instanceof Error ? err.message : "Apple Intelligence is unavailable"
    };
  }
}
const BRIEFING_FACTS = `# Your app — current metrics

## Stripe (revenue, last 12 months)
- Gross volume: $26,114.50 (up from $16,114.00 in the previous period — strong acceleration)
- Net volume: $23,013.30
- MRR (monthly recurring revenue): $1,248.00, trending steadily upward all year
- Payments succeeded: $24,924.80
- Payments failed: $1,462.41 (roughly 5.6% of gross volume — notable leakage)
- Payments refunded: $689.70
- Payments blocked: $339.90
- New customers: 3,937
- Recent failed payments were $15.00 charges (the standard plan price)

## Product analytics
- Total registered users: 3,577
- Monthly signups: December 220, January 390, February 340, March 270, April 310, May 360
- Signups dipped in March then recovered; May is the second-strongest month
- Daily growth in May averaged roughly 8 to 18 new users, with a spike to ~39 on May 20th

## Google Analytics (acquisition & engagement)
- Active users: 4,100
- New users: 8,100
- Average engagement time: 1 minute 19 seconds
- Event count: 56,000
- Traffic by first-touch source/medium:
  - direct: 1,400
  - google / cpc (paid search): 1,100
  - reddit.com / referral: 546
  - google / organic: 529
  - instagram / paid: 118
  - threads / referral: 116
  - twitter (t.co) / referral: 92
- Top pages by views and bounce rate:
  - Main app: 7,700 views, 13.3% bounce — healthy
  - Organize: 5,600 views, 66.6% bounce — high
  - "Not Available in Your Region": 2,100 views, 84.8% bounce — a large slice of traffic is being geo-blocked and lost
  - Welcome page: 732 views, 4.3% bounce — excellent
  - 2D to 3D Floor Plan: 776 views, 38.3% bounce
  - AI Image Similarity Tool: 708 views, 36.0% bounce

## Notable signals worth surfacing
- "Not Available in Your Region" is the third most-viewed page with an 84.8% bounce rate — meaningful demand is being turned away at the door.
- Paid search (google/cpc, 1,100) outweighs organic search (529) — acquisition leans heavily on ad spend.
- Reddit referral (546) is a strong, free community channel performing nearly as well as paid.
- MRR is only $148 against 3,577 users — monetisation/conversion is the clear lever.
- ~5.6% of payment volume is failing — recoverable revenue with retries/dunning.`;
const DEFAULT_PERSONA = "a sophisticated voice-first assistant with the poise of a seasoned chief of staff. You speak with refined British formality, dry wit, and unflappable composure.";
function addressInstruction(gender) {
  switch (gender) {
    case "male":
      return 'Address the user as "sir".';
    case "female":
      return `Address the user as "ma'am".`;
    default:
      return `Do not presume the user's gender — never use "sir", "ma'am", or other gendered honorifics. Address them politely and neutrally, by name if you know it.`;
  }
}
function vocative(gender) {
  return gender === "male" ? ", sir" : gender === "female" ? ", ma'am" : "";
}
function spokenRules(displayName) {
  return `Your replies are spoken aloud through a text-to-speech engine, so you MUST:
- Keep replies short. Aim for one to three sentences. Long-winded answers are unwelcome.
- Never use markdown, bullet points, code blocks, headings, asterisks, or emoji.
- Write numbers, dates, and times the way one would say them ("twenty-three degrees", "half past four").
- Pronounce acronyms naturally (say "N. A. S. A." or expand it; don't write "NASA").
- Avoid stage directions, parentheticals, or asides that wouldn't be spoken.
- Never describe yourself as an AI, language model, or assistant. You are ${displayName}.

When calling a tool, briefly acknowledge before invoking it ("One moment.", "Checking now."). After receiving tool output, summarise it conversationally — do not read raw data back.

If a request is ambiguous, ask one short clarifying question rather than guessing.`;
}
function buildPersona(config) {
  const displayName = config.assistant.name.trim() || "Alex";
  const custom = config.assistant.persona?.trim();
  const character = custom || `You are ${displayName}, ${DEFAULT_PERSONA}`;
  return `${character}

${addressInstruction(config.assistant.userGender)}

${spokenRules(displayName)}

IMPORTANT : Tu dois TOUJOURS répondre en français. Quelle que soit la langue utilisée par l'utilisateur, réponds exclusivement en français. Sois concis : une à deux phrases suffisent. Ne réponds JAMAIS dans une autre langue que le français.`;
}
function greetingShape(gender) {
  return `C'est la première fois que l'utilisateur te parle aujourd'hui. Avant même qu'il ne demande, fais un briefing oral proactif.

Prononce-le comme un monologue fluide : un bref salut, puis les points de statut les plus importants (commence par ce qui va bien), puis une ou deux choses qui nécessitent attention, puis deux ou trois suggestions concrètes et priorisées pour la journée, formulées comme des recommandations.

Reste concis et conversationnel — pas de listes, pas de markdown. Arrondis les nombres naturellement. Vise environ trente à quarante-cinq secondes de parole. Sois confiant et un brin d'esprit, jamais robotique.`;
}
function exampleGreeting(gender) {
  return `${greetingShape(gender)}

You are briefing the operator on their app. Refer to it generically as "your app" — do not invent or use a brand name.

Here are the metrics you are working from. Use them for accuracy but speak them naturally — do not recite every figure:

${BRIEFING_FACTS}`;
}
function buildSystemPrompt({
  config,
  briefing,
  skillPrompts = [],
  hasScreenShare = false
}) {
  const persona = buildPersona(config);
  const screenNote = hasScreenShare ? "\n\nL'écran de l'utilisateur est actuellement partagé — tu le vois comme la dernière image dans la conversation. Utilise-le pour répondre aux questions sur ce qui est affiché à l'écran." : "";
  const gender = config.assistant.userGender;
  if (!briefing) {
    return [persona + screenNote, ...skillPrompts].join("\n\n---\n\n");
  }
  if (config.greeting.mode === "none") return persona;
  if (config.greeting.mode === "custom") {
    const custom = config.greeting.customPrompt.trim();
    const body = custom || greetingShape(gender);
    return `${persona}

---

${body}`;
  }
  return `${persona}

---

${exampleGreeting(gender)}`;
}
const REALTIME_ADDENDUM = `You are speaking live over a realtime voice connection.

- Be extra brief. One or two sentences is the norm; only go longer when the user asks for detail.
- When the user's intent is clear, call tools immediately without asking for confirmation.
- For anything that involves looking at the screen, operating apps or files, or multi-step desktop work, call run_task with complete, self-contained instructions — do not attempt it yourself.
- While a delegated task runs you will receive notes prefixed "[task progress]" or "[task action]". When asked to respond mid-task, give ONE short sentence about what concretely changed since your last update — name the specific thing ("Found the invoice, filling in the amounts now."). Never say generic filler like "still working on it", and never read the notes verbatim.
- When a tool returns a result, summarise the outcome in a sentence or two.
- If a tool reports the user denied permission, say so and move on — do not retry.

IMPORTANT : You MUST ALWAYS speak in French. Always respond in French, no matter what language the user uses. Respond exclusively in French.`;
function buildRealtimeInstructions({
  config,
  briefing,
  skillPrompts = [],
  hasScreenShare = false
}) {
  const parts = [buildPersona(config), ...skillPrompts, REALTIME_ADDENDUM];
  if (hasScreenShare) {
    parts.push("L'écran de l'utilisateur est partagé — la dernière capture est dans la conversation. Utilise-la pour répondre aux questions sur ce qui est à l'écran.");
  }
  const gender = config.assistant.userGender;
  if (briefing && config.greeting.mode !== "none") {
    const custom = config.greeting.customPrompt.trim();
    parts.push(
      config.greeting.mode === "custom" && custom ? custom : exampleGreeting(gender)
    );
  }
  return parts.join("\n\n---\n\n");
}
async function mintRealtimeToken(model) {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error(
      "I need a Vercel AI Gateway key for realtime voice. Please add one in Settings under Voice mode."
    );
  }
  const { token, url } = await gateway.gateway.experimental_realtime.getToken({ model });
  return { token, url };
}
const sessions = /* @__PURE__ */ new Map();
async function startRealtimeSession(opts) {
  const { token, url } = await mintRealtimeToken(opts.model);
  const codec = gateway.gateway.experimental_realtime(opts.model);
  const wsConfig = codec.getWebSocketConfig({ token, url });
  const ws = new WebSocket(wsConfig.url, wsConfig.protocols);
  const { sessionId: sessionId2 } = opts;
  const host = {
    ws,
    codec,
    tools: opts.tools,
    notify: opts.notify,
    endedByUs: false,
    sawSocketError: false
  };
  sessions.set(sessionId2, host);
  const send = async (event) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(await codec.serializeClientEvent(event)));
  };
  ws.addEventListener("message", (msg) => {
    void handleServerMessage(host, send, String(msg.data));
  });
  ws.addEventListener("error", () => {
    host.sawSocketError = true;
  });
  ws.addEventListener("close", () => {
    sessions.delete(sessionId2);
    host.notify({
      type: "closed",
      reason: host.endedByUs ? "ended" : host.sawSocketError ? "error" : "server"
    });
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener(
      "close",
      () => reject(new Error("Realtime connection failed — please try again.")),
      { once: true }
    );
  });
  await send({
    type: "session-update",
    config: {
      instructions: opts.instructions,
      ...opts.voice ? { voice: opts.voice } : {},
      turnDetection: { type: "server-vad" },
      inputAudioFormat: { type: "audio/pcm", rate: 24e3 },
      outputAudioFormat: { type: "audio/pcm", rate: 24e3 },
      // Opt into user-speech transcription where the model supports it, so the
      // transcript UI gets the user's turns (final text, no deltas).
      ...opts.transcribesInput ? { inputAudioTranscription: {} } : {},
      tools: opts.toolDefs.map((d) => ({
        type: "function",
        name: d.name,
        description: d.description,
        parameters: d.parameters
      }))
    }
  });
  opts.notify({ type: "open" });
}
function sendRealtimeClientMessage(sessionId2, msg) {
  const host = sessions.get(sessionId2);
  if (!host) return;
  const send = async (event) => {
    if (host.ws.readyState !== WebSocket.OPEN) return;
    host.ws.send(JSON.stringify(await host.codec.serializeClientEvent(event)));
  };
  switch (msg.type) {
    case "audio":
      void send({
        type: "input-audio-append",
        audio: Buffer.from(msg.chunk).toString("base64")
      });
      break;
    case "user-text":
      void (async () => {
        await send({
          type: "conversation-item-create",
          item: { type: "text-message", role: "user", text: msg.text }
        });
        await send({ type: "response-create" });
      })();
      break;
    case "inject-context":
      void send({
        type: "conversation-item-create",
        item: { type: "text-message", role: "user", text: msg.text }
      });
      break;
    case "request-response":
      void send({ type: "response-create" });
      break;
    case "tool-result":
      void (async () => {
        await send({
          type: "conversation-item-create",
          item: {
            type: "function-call-output",
            callId: msg.toolCallId,
            name: msg.name,
            output: JSON.stringify(msg.output ?? null)
          }
        });
        await send({ type: "response-create" });
      })();
      break;
    case "cancel-response":
      void send({ type: "response-cancel" });
      break;
  }
}
function endRealtimeSession(sessionId2) {
  const host = sessions.get(sessionId2);
  if (!host) return;
  host.endedByUs = true;
  try {
    host.ws.close();
  } catch {
  }
}
async function handleServerMessage(host, send, data) {
  let raw;
  try {
    raw = JSON.parse(data);
  } catch {
    return;
  }
  const keepalive = host.codec.getHealthCheckResponse?.(raw);
  if (keepalive) {
    host.ws.send(JSON.stringify(keepalive));
    return;
  }
  const parsed = host.codec.parseServerEvent(raw);
  for (const event of Array.isArray(parsed) ? parsed : [parsed]) {
    switch (event.type) {
      case "speech-started":
        host.notify({ type: "speech-started" });
        break;
      case "speech-stopped":
        host.notify({ type: "speech-stopped" });
        break;
      case "input-transcription-completed":
        if (event.transcript.trim()) {
          host.notify({ type: "user-transcript", text: event.transcript });
        }
        break;
      case "audio-delta": {
        const buf = Buffer.from(event.delta, "base64");
        host.notify({
          type: "audio",
          chunk: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
        });
        break;
      }
      case "audio-transcript-delta":
      case "text-delta":
        host.notify({ type: "assistant-delta", text: event.delta });
        break;
      case "response-done":
        host.notify({ type: "turn-done" });
        break;
      case "function-call-arguments-done": {
        let input = {};
        try {
          input = JSON.parse(event.arguments || "{}");
        } catch {
        }
        const call = { toolCallId: event.callId, toolName: event.name, input };
        host.notify({ type: "tool-call", call });
        if (event.name === RUN_TASK_TOOL) {
          const task = typeof input.task === "string" ? input.task : "";
          host.notify({ type: "run-task", toolCallId: event.callId, task });
          break;
        }
        void (async () => {
          let output;
          try {
            const toolFn = host.tools[event.name];
            output = toolFn?.execute ? await toolFn.execute(input, {
              toolCallId: event.callId,
              messages: []
            }) : { error: `Unknown tool: ${event.name}` };
          } catch (err) {
            output = { error: err instanceof Error ? err.message : String(err) };
          }
          host.notify({
            type: "tool-result",
            result: { toolCallId: event.callId, toolName: event.name, output }
          });
          await send({
            type: "conversation-item-create",
            item: {
              type: "function-call-output",
              callId: event.callId,
              name: event.name,
              output: JSON.stringify(output ?? null)
            }
          });
          await send({ type: "response-create" });
        })();
        break;
      }
      case "error":
        host.notify({ type: "error", message: event.message });
        break;
    }
  }
}
const TOOLS$4 = {
  getCurrentTime: "getCurrentTime"
};
const meta$4 = {
  id: "clock",
  label: "Clock",
  description: "Tell the current date and time in any timezone.",
  sensitive: false
};
const clockSkill = {
  ...meta$4,
  tools: [
    {
      name: TOOLS$4.getCurrentTime,
      description: "Get the current date and time. Optionally pass an IANA timezone (e.g. 'Europe/London', 'America/New_York'). Defaults to UTC.",
      inputSchema: zod.z.object({
        timezone: zod.z.string().optional().describe("IANA timezone, e.g. 'Europe/London'. Defaults to UTC.")
      }),
      execute: async ({ timezone }) => {
        const tz = timezone ?? "UTC";
        try {
          const now = /* @__PURE__ */ new Date();
          const formatted = new Intl.DateTimeFormat("en-GB", {
            timeZone: tz,
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true
          }).format(now);
          return { timezone: tz, formatted, iso: now.toISOString() };
        } catch {
          return { error: `Unknown timezone: ${tz}` };
        }
      }
    }
  ]
};
const TOOLS$3 = {
  getWeather: "getWeather"
};
const meta$3 = {
  id: "weather",
  label: "Weather",
  description: "Look up the current weather and a brief forecast for a place.",
  sensitive: false
};
const weatherSkill = {
  ...meta$3,
  tools: [
    {
      name: TOOLS$3.getWeather,
      description: "Get the current weather and a brief forecast for a given location (city name or place). Uses Open-Meteo (no API key required).",
      inputSchema: zod.z.object({
        location: zod.z.string().describe("City name or place, e.g. 'London' or 'Tokyo'.")
      }),
      execute: async ({ location }) => {
        const geo = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`
        ).then(
          (r) => r.json()
        );
        const place = geo.results?.[0];
        if (!place) return { error: `I couldn't find a place called "${location}".` };
        const forecast = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2`
        ).then(
          (r) => r.json()
        );
        return {
          place: `${place.name}, ${place.country}`,
          now: {
            temperatureC: forecast.current.temperature_2m,
            feelsLikeC: forecast.current.apparent_temperature,
            humidity: forecast.current.relative_humidity_2m,
            windKph: forecast.current.wind_speed_10m,
            weatherCode: forecast.current.weather_code,
            isDay: forecast.current.is_day === 1
          },
          today: {
            highC: forecast.daily.temperature_2m_max[0],
            lowC: forecast.daily.temperature_2m_min[0],
            weatherCode: forecast.daily.weather_code[0]
          },
          tomorrow: {
            highC: forecast.daily.temperature_2m_max[1],
            lowC: forecast.daily.temperature_2m_min[1],
            weatherCode: forecast.daily.weather_code[1]
          },
          note: "weather_code follows WMO codes (0=clear, 1-3=mainly clear/partly/overcast, 45-48=fog, 51-67=drizzle/rain, 71-77=snow, 80-82=showers, 95-99=thunderstorm)."
        };
      }
    }
  ]
};
const TOOLS$2 = {
  webSearch: "webSearch"
};
const meta$2 = {
  id: "web-search",
  label: "Web search",
  description: "Search the live web for current information, news, and facts.",
  sensitive: false
};
const webSearchSkill = {
  ...meta$2,
  tools: [
    {
      name: TOOLS$2.webSearch,
      description: "Search the live web for current information, news, facts, or anything that may have changed since training. Returns a list of relevant results with titles, URLs, and snippets.",
      inputSchema: zod.z.object({
        query: zod.z.string().describe("The search query.")
      }),
      execute: async ({ query }) => {
        const apiKey = process.env.TAVILY_API_KEY;
        if (!apiKey) {
          return {
            error: "Web search is unavailable — the operator has not configured a TAVILY_API_KEY."
          };
        }
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            search_depth: "basic",
            max_results: 5,
            include_answer: true
          })
        });
        if (!res.ok) {
          return { error: `Search failed: ${res.status} ${res.statusText}` };
        }
        const data = await res.json();
        return {
          answer: data.answer,
          results: data.results.slice(0, 5).map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.content.slice(0, 400)
          }))
        };
      }
    }
  ]
};
const TOOLS$1 = {
  openUrl: "openUrl",
  openApp: "openApp",
  openPath: "openPath"
};
const meta$1 = {
  id: "open",
  label: "Open apps & URLs",
  description: "Open URLs in the browser, launch apps, and open files/folders.",
  sensitive: true
};
function launchApp(name) {
  return new Promise((resolve) => {
    let cmd;
    let args;
    if (process.platform === "darwin") {
      cmd = "open";
      args = ["-a", name];
    } else if (process.platform === "win32") {
      cmd = "cmd";
      args = ["/c", "start", "", name];
    } else {
      cmd = "gtk-launch";
      args = [name];
    }
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      const child = node_child_process.spawn(cmd, args, { stdio: "ignore", detached: true });
      child.on("error", (err) => settle({ error: err.message }));
      child.unref();
      setTimeout(() => settle({ ok: true }), 150);
    } catch (err) {
      settle({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
const openSkill = {
  ...meta$1,
  tools: [
    {
      name: TOOLS$1.openUrl,
      description: "Open a URL in the user's default web browser.",
      inputSchema: zod.z.object({
        url: zod.z.string().describe("An http(s) or mailto URL.")
      }),
      summarize: (i) => `Open URL: ${i.url}`,
      execute: async ({ url }) => {
        if (!/^(https?:|mailto:)/i.test(url)) {
          return { error: "Only http(s) and mailto URLs are allowed." };
        }
        await electron.shell.openExternal(url);
        return { ok: true, opened: url };
      }
    },
    {
      name: TOOLS$1.openApp,
      description: "Launch an installed application by name (e.g. 'Safari', 'Notes').",
      inputSchema: zod.z.object({
        name: zod.z.string().describe("Application name.")
      }),
      summarize: (i) => `Launch app: ${i.name}`,
      execute: async ({ name }) => {
        const result = await launchApp(name);
        return "ok" in result ? { ok: true, launched: name } : result;
      }
    },
    {
      name: TOOLS$1.openPath,
      description: "Open a file or folder in its default application / the file manager.",
      inputSchema: zod.z.object({
        path: zod.z.string().describe("Absolute path to a file or folder.")
      }),
      summarize: (i) => `Open path: ${i.path}`,
      execute: async ({ path }) => {
        const err = await electron.shell.openPath(path);
        return err ? { error: err } : { ok: true, opened: path };
      }
    }
  ]
};
const DEFAULT_CONFIG = {
  version: 1,
  assistant: { name: "Dex", wakeWord: "dex", userGender: "unspecified", persona: "" },
  // Defaults to the gateway so configs written before the provider field
  // (which only had `llm.model`) keep working after upgrade. First-run
  // onboarding forces an explicit choice regardless.
  llm: { provider: "gateway", model: "anthropic/claude-sonnet-4-6" },
  tts: {
    engine: "elevenlabs",
    elevenLabs: { voiceId: "JBFqnCBsd6RMkjVDRZzb", modelId: "eleven_turbo_v2_5" },
    system: { voiceURI: null, rate: 1, pitch: 1 }
  },
  greeting: { mode: "none", customPrompt: "" },
  // Pipeline by default — realtime is an explicit choice (it needs a gateway
  // key and bills per session). mergeConfig back-fills these sections into
  // configs written before they existed.
  voice: { mode: "pipeline" },
  realtime: {
    provider: "gateway",
    model: "openai/gpt-realtime-2",
    voice: "marin",
    // Short follow-up window: sessions bill by the minute, so hang up quickly
    // once nobody is talking (the timer never counts mid-speech or during
    // playback — see realtime-session.ts resetIdle).
    idleDisconnectSec: 10
  },
  voiceInput: {
    // Free, offline defaults: Vosk wake word + local Whisper transcription.
    wakeMode: "vosk",
    sttProvider: "whisper-local",
    whisperModel: "Xenova/whisper-base.en"
  },
  appearance: { theme: "editorial", showToolActivity: true },
  // `Alt+Space` reads as ⌥Space on macOS (low-conflict). On Windows Alt+Space
  // opens the system window menu and won't register; the registrar falls back to
  // a secondary accelerator in that case (see registerSummonHotkey in index.ts).
  hotkeys: { summon: "Alt+Space" },
  skills: {
    // `computer` is opt-in (off until the user enables it in Settings).
    enabled: { open: true, computer: false },
    permissions: { open: "ask", computer: "ask" }
  },
  computer: { animateCursor: true },
  // Anonymous usage analytics, on by default (opt-out in onboarding/Settings).
  analytics: { enabled: true },
  onboarding: { completed: false }
};
const SECRET_NAMES = [
  "AI_GATEWAY_API_KEY",
  "ELEVENLABS_API_KEY",
  "TAVILY_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "XAI_API_KEY",
  "OPENROUTER_API_KEY"
];
function mergeConfig(base, patch) {
  const out = structuredClone(base);
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = { ...out[key], ...value };
    } else if (value !== void 0) {
      out[key] = value;
    }
  }
  return out;
}
let configPath = "";
let secretsPath = "";
let cachedConfig = null;
let cachedSecrets = {};
function ensurePaths() {
  if (configPath) return;
  const dir = electron.app.getPath("userData");
  node_fs.mkdirSync(dir, { recursive: true });
  configPath = node_path.join(dir, "config.json");
  secretsPath = node_path.join(dir, "secrets.json");
}
function encryptionAvailable() {
  try {
    return electron.safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}
function loadConfigFile() {
  ensurePaths();
  if (!node_fs.existsSync(configPath)) return structuredClone(DEFAULT_CONFIG);
  try {
    const raw = JSON.parse(node_fs.readFileSync(configPath, "utf8"));
    return mergeConfig(DEFAULT_CONFIG, raw);
  } catch (err) {
    console.error("[alex config] failed to read config.json, using defaults", err);
    return structuredClone(DEFAULT_CONFIG);
  }
}
function loadSecretsFile() {
  ensurePaths();
  if (!node_fs.existsSync(secretsPath)) return {};
  try {
    const stored = JSON.parse(node_fs.readFileSync(secretsPath, "utf8"));
    const out = {};
    for (const [name, blob] of Object.entries(stored.values)) {
      if (stored.enc && encryptionAvailable()) {
        try {
          out[name] = electron.safeStorage.decryptString(Buffer.from(blob, "base64"));
        } catch (err) {
          console.error(`[alex config] failed to decrypt ${name}`, err);
        }
      } else {
        out[name] = Buffer.from(blob, "base64").toString("utf8");
      }
    }
    return out;
  } catch (err) {
    console.error("[alex config] failed to read secrets.json", err);
    return {};
  }
}
function persistSecrets() {
  ensurePaths();
  const enc = encryptionAvailable();
  const values = {};
  for (const [name, value] of Object.entries(cachedSecrets)) {
    if (!value) continue;
    if (enc) {
      values[name] = electron.safeStorage.encryptString(value).toString("base64");
    } else {
      values[name] = Buffer.from(value, "utf8").toString("base64");
    }
  }
  node_fs.writeFileSync(secretsPath, JSON.stringify({ enc, values }, null, 2), "utf8");
}
function persistConfig() {
  ensurePaths();
  node_fs.writeFileSync(configPath, JSON.stringify(cachedConfig, null, 2), "utf8");
}
function applyToEnv() {
  if (!cachedConfig) return;
  process.env.OPENDEX_MODEL = cachedConfig.llm.model;
  process.env.ELEVENLABS_VOICE_ID = cachedConfig.tts.elevenLabs.voiceId;
  process.env.ELEVENLABS_MODEL_ID = cachedConfig.tts.elevenLabs.modelId;
  for (const name of SECRET_NAMES) {
    const value = cachedSecrets[name];
    if (value) process.env[name] = value;
  }
}
function initConfig() {
  cachedConfig = loadConfigFile();
  cachedSecrets = loadSecretsFile();
  applyToEnv();
}
function getConfig() {
  if (!cachedConfig) initConfig();
  return cachedConfig;
}
function hasSecret(name) {
  return Boolean(cachedSecrets[name] || process.env[name]);
}
function secretsPresence() {
  return {
    AI_GATEWAY_API_KEY: hasSecret("AI_GATEWAY_API_KEY"),
    ELEVENLABS_API_KEY: hasSecret("ELEVENLABS_API_KEY"),
    TAVILY_API_KEY: hasSecret("TAVILY_API_KEY"),
    OPENAI_API_KEY: hasSecret("OPENAI_API_KEY"),
    ANTHROPIC_API_KEY: hasSecret("ANTHROPIC_API_KEY"),
    XAI_API_KEY: hasSecret("XAI_API_KEY")
  };
}
function getPublicConfig() {
  return {
    config: getConfig(),
    secrets: secretsPresence(),
    encryptionAvailable: encryptionAvailable()
  };
}
function updateConfig(patch) {
  cachedConfig = mergeConfig(getConfig(), patch);
  persistConfig();
  applyToEnv();
  return getPublicConfig();
}
function setSecret(name, value) {
  if (value.trim()) {
    cachedSecrets[name] = value.trim();
  } else {
    delete cachedSecrets[name];
    delete process.env[name];
  }
  persistSecrets();
  applyToEnv();
  return getPublicConfig();
}
function completeOnboarding() {
  return updateConfig({ onboarding: { completed: true } });
}
function resetConfig() {
  ensurePaths();
  for (const path of [configPath, secretsPath]) {
    try {
      if (node_fs.existsSync(path)) node_fs.rmSync(path);
    } catch (err) {
      console.error(`[alex config] failed to delete ${path}`, err);
    }
  }
  cachedSecrets = {};
  cachedConfig = structuredClone(DEFAULT_CONFIG);
  applyToEnv();
  return getPublicConfig();
}
const MAX_WIDTH = 1280;
const JPEG_QUALITY = 80;
const delay$1 = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function buildSignature(image) {
  const small = image.resize({ width: 32, height: 32 });
  const bmp = small.toBitmap();
  const sig = new Uint8Array(32 * 32);
  for (let i = 0; i < sig.length; i++) {
    const o = i * 4;
    sig[i] = (bmp[o] + bmp[o + 1] + bmp[o + 2]) / 3 | 0;
  }
  return sig;
}
function framesDiffer(a, b, threshold = 6) {
  if (a.length !== b.length) return true;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length > threshold;
}
function pickDisplay(displayId) {
  if (displayId != null) {
    const found = electron.screen.getAllDisplays().find((d) => d.id === displayId);
    if (found) return found;
  }
  return electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint());
}
async function captureScreen(opts = {}) {
  if (process.platform === "darwin" && electron.systemPreferences.getMediaAccessStatus("screen") !== "granted") {
    return {
      error: "I don't have Screen Recording permission, so I can't see the screen yet. Please enable Alex (in dev, the Electron app) under System Settings, Privacy and Security, Screen Recording, then restart me and try again."
    };
  }
  const display = pickDisplay(opts.displayId);
  const scale = display.scaleFactor || 1;
  const { width: logW, height: logH } = display.size;
  const sources = await electron.desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: Math.round(logW * scale),
      height: Math.round(logH * scale)
    }
  });
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  if (!source) return { error: "No screen source is available to capture." };
  let image = source.thumbnail;
  if (image.isEmpty()) {
    return {
      error: "Screen capture came back empty. On macOS, grant Alex Screen Recording permission in System Settings → Privacy & Security, then try again."
    };
  }
  const native = image.getSize();
  const nScaleX = native.width / logW;
  const nScaleY = native.height / logH;
  let regionLogX = display.bounds.x;
  let regionLogY = display.bounds.y;
  let regionLogW = logW;
  let regionLogH = logH;
  if (opts.region && opts.regionRef) {
    const ref = opts.regionRef;
    const gx = ref.offsetX + opts.region.x * ref.scaleX;
    const gy = ref.offsetY + opts.region.y * ref.scaleY;
    const gw = opts.region.w * ref.scaleX;
    const gh = opts.region.h * ref.scaleY;
    regionLogX = clamp(gx, display.bounds.x, display.bounds.x + logW);
    regionLogY = clamp(gy, display.bounds.y, display.bounds.y + logH);
    regionLogW = clamp(gw, 1, display.bounds.x + logW - regionLogX);
    regionLogH = clamp(gh, 1, display.bounds.y + logH - regionLogY);
    image = image.crop({
      x: Math.round((regionLogX - display.bounds.x) * nScaleX),
      y: Math.round((regionLogY - display.bounds.y) * nScaleY),
      width: Math.max(1, Math.round(regionLogW * nScaleX)),
      height: Math.max(1, Math.round(regionLogH * nScaleY))
    });
  }
  if (image.getSize().width > MAX_WIDTH) {
    image = image.resize({ width: MAX_WIDTH });
  }
  const out = image.getSize();
  return {
    base64: image.toJPEG(JPEG_QUALITY).toString("base64"),
    mediaType: "image/jpeg",
    width: out.width,
    height: out.height,
    offsetX: regionLogX,
    offsetY: regionLogY,
    scaleX: regionLogW / out.width,
    scaleY: regionLogH / out.height,
    signature: buildSignature(image)
  };
}
async function captureStable(opts = {}) {
  let prev = await captureScreen(opts);
  if ("error" in prev) return prev;
  const STEP = 120;
  const CAP_MS = 1e3;
  const start = Date.now();
  for (let i = 0; i < 8; i++) {
    await delay$1(STEP);
    const next = await captureScreen(opts);
    if ("error" in next) return prev;
    if (!framesDiffer(prev.signature, next.signature)) return next;
    prev = next;
    if (Date.now() - start > CAP_MS) return next;
  }
  return prev;
}
function toScreenPoint(x, y, shot) {
  return {
    x: Math.round(shot.offsetX + x * shot.scaleX),
    y: Math.round(shot.offsetY + y * shot.scaleY)
  };
}
const TOOLS = {
  captureScreen: "captureScreen",
  click: "click",
  moveMouse: "moveMouse",
  drag: "drag",
  typeText: "typeText",
  pressKeys: "pressKeys",
  scroll: "scroll",
  wait: "wait"
};
const meta = {
  id: "computer",
  label: "Control the computer",
  description: "Let the assistant see the screen and control the mouse & keyboard to operate apps. Needs Screen Recording + Accessibility permissions.",
  sensitive: true,
  optIn: true,
  // Screenshots flow back to the model as images — realtime sessions can't take
  // those, so this skill is only reachable there via run_task delegation.
  imageResults: true
};
let configured = false;
function ensureConfigured() {
  if (configured) return;
  nutJs.mouse.config.mouseSpeed = 3e3;
  nutJs.mouse.config.autoDelayMs = 25;
  nutJs.keyboard.config.autoDelayMs = 4;
  configured = true;
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let accessibilityPrompted = false;
function ensureInputAccess() {
  if (process.platform !== "darwin") return { ok: true };
  if (electron.systemPreferences.isTrustedAccessibilityClient(false)) return { ok: true };
  if (!accessibilityPrompted) {
    accessibilityPrompted = true;
    electron.systemPreferences.isTrustedAccessibilityClient(true);
  }
  return {
    error: "I don't have Accessibility permission, so I can't control the mouse or keyboard yet. I've opened the request — please enable Alex (in dev, the Electron app) under System Settings, Privacy and Security, Accessibility, then restart me and try again."
  };
}
let lastShot = null;
let lastSentSig = null;
async function moveTo(x, y) {
  const ref = lastShot;
  const p = ref ? toScreenPoint(x, y, ref) : { x, y };
  const animate = getConfig().computer?.animateCursor ?? true;
  if (animate) await nutJs.mouse.move(nutJs.straightTo(new nutJs.Point(p.x, p.y)));
  else await nutJs.mouse.setPosition(new nutJs.Point(p.x, p.y));
}
async function pasteText(text) {
  const prev = electron.clipboard.readText();
  electron.clipboard.writeText(text);
  const mod = process.platform === "darwin" ? nutJs.Key.LeftCmd : nutJs.Key.LeftControl;
  await nutJs.keyboard.pressKey(mod, nutJs.Key.V);
  await nutJs.keyboard.releaseKey(nutJs.Key.V, mod);
  await delay(120);
  electron.clipboard.writeText(prev);
}
const withScreenshot = ({ output }) => {
  const o = output;
  if ("error" in o) return { type: "error-text", value: o.error };
  const parts = [{ type: "text", text: o.message }];
  if (o.shot) parts.push({ type: "media", data: o.shot.base64, mediaType: o.shot.mediaType });
  return { type: "content", value: parts };
};
async function shoot() {
  const shot = await captureStable();
  if ("error" in shot) return null;
  lastShot = shot;
  return shot;
}
async function finishAction(message, wantShot) {
  if (!wantShot) return { ok: true, message };
  const shot = await shoot();
  if (!shot) {
    return {
      ok: true,
      message: `${message} (couldn't capture a screenshot — check Screen Recording permission)`
    };
  }
  if (lastSentSig && !framesDiffer(lastSentSig, shot.signature)) {
    return { ok: true, message: `${message} (no visible change on screen)` };
  }
  lastSentSig = shot.signature;
  return { ok: true, message, shot };
}
const SHOT_ARG = "Whether to return a fresh screenshot so you can see the result. Omit to use the action's default; set false to chain another action without a screenshot, or true to force a look.";
function keyFromToken(token) {
  const t = token.trim().toLowerCase();
  const map = {
    enter: nutJs.Key.Enter,
    return: nutJs.Key.Enter,
    tab: nutJs.Key.Tab,
    esc: nutJs.Key.Escape,
    escape: nutJs.Key.Escape,
    space: nutJs.Key.Space,
    spacebar: nutJs.Key.Space,
    backspace: nutJs.Key.Backspace,
    delete: nutJs.Key.Delete,
    del: nutJs.Key.Delete,
    up: nutJs.Key.Up,
    arrowup: nutJs.Key.Up,
    down: nutJs.Key.Down,
    arrowdown: nutJs.Key.Down,
    left: nutJs.Key.Left,
    arrowleft: nutJs.Key.Left,
    right: nutJs.Key.Right,
    arrowright: nutJs.Key.Right,
    home: nutJs.Key.Home,
    end: nutJs.Key.End,
    pageup: nutJs.Key.PageUp,
    pgup: nutJs.Key.PageUp,
    pagedown: nutJs.Key.PageDown,
    pgdn: nutJs.Key.PageDown,
    cmd: nutJs.Key.LeftCmd,
    command: nutJs.Key.LeftCmd,
    meta: nutJs.Key.LeftSuper,
    win: nutJs.Key.LeftSuper,
    windows: nutJs.Key.LeftSuper,
    super: nutJs.Key.LeftSuper,
    ctrl: nutJs.Key.LeftControl,
    control: nutJs.Key.LeftControl,
    alt: nutJs.Key.LeftAlt,
    option: nutJs.Key.LeftAlt,
    opt: nutJs.Key.LeftAlt,
    shift: nutJs.Key.LeftShift
  };
  if (t in map) return map[t];
  if (/^[a-z]$/.test(t)) return nutJs.Key[t.toUpperCase()];
  if (/^[0-9]$/.test(t)) return nutJs.Key[`Num${t}`];
  if (/^f([1-9]|1[0-2])$/.test(t)) return nutJs.Key[`F${t.slice(1)}`];
  return null;
}
function buttonOf(button) {
  return button === "right" ? nutJs.Button.RIGHT : button === "middle" ? nutJs.Button.MIDDLE : nutJs.Button.LEFT;
}
const tools = [
  {
    name: TOOLS.captureScreen,
    description: "Take a screenshot and look at it. Coordinates in the returned image are what you pass to moveMouse/click/drag. Use this first to see what's on screen. To read or precisely click something small, pass a `region` to zoom in — it renders that area at full detail (coordinates then refer to the zoomed image). Pass `displayId` to look at another monitor.",
    inputSchema: zod.z.object({
      region: zod.z.object({ x: zod.z.number(), y: zod.z.number(), w: zod.z.number(), h: zod.z.number() }).optional().describe(
        "Zoom into this rectangle of the most recent screenshot (its pixel space). Renders that area at higher detail; returned coordinates are in the zoomed image."
      ),
      displayId: zod.z.number().optional().describe("Capture a specific display. Omit to use the display under the cursor.")
    }),
    summarize: (i) => i.region ? "Zoom into a region of the screen" : "Take a screenshot of the screen",
    toModelOutput: withScreenshot,
    execute: async ({
      region,
      displayId
    }) => {
      const ref = lastShot ?? void 0;
      const shot = await captureScreen({
        displayId,
        region: region && ref ? region : void 0,
        regionRef: region && ref ? ref : void 0
      });
      if ("error" in shot) return { error: shot.error };
      lastShot = shot;
      lastSentSig = shot.signature;
      return {
        ok: true,
        message: `Screenshot taken (${shot.width}×${shot.height}). Coordinates are in this image's pixel space; (0,0) is top-left.`,
        shot
      };
    }
  },
  {
    name: TOOLS.click,
    description: "Click the mouse at a point (in screenshot pixel coordinates). Pass x and y together to click a specific spot; omit both to click wherever the cursor already is (e.g. right after moveMouse). Optionally double-click or use the right/middle button. Returns a fresh screenshot by default.",
    inputSchema: zod.z.object({
      x: zod.z.number().optional().describe("X coordinate in the most recent screenshot's pixel space. Omit to click at the current cursor position."),
      y: zod.z.number().optional().describe("Y coordinate in the most recent screenshot's pixel space. Omit to click at the current cursor position."),
      button: zod.z.enum(["left", "right", "middle"]).optional().describe("Defaults to left."),
      double: zod.z.boolean().optional().describe("Double-click when true."),
      screenshot: zod.z.boolean().optional().describe(SHOT_ARG)
    }),
    summarize: (i) => {
      const { x, y, button, double } = i;
      const where = x != null && y != null ? ` at (${x}, ${y})` : "";
      return `${double ? "Double-" : ""}${button ?? "left"}-click${where}`;
    },
    toModelOutput: withScreenshot,
    execute: async ({
      x,
      y,
      button,
      double,
      screenshot
    }) => {
      const access = ensureInputAccess();
      if ("error" in access) return access;
      ensureConfigured();
      const hasPoint = x != null && y != null;
      if (hasPoint) await moveTo(x, y);
      const btn = buttonOf(button);
      if (double) await nutJs.mouse.doubleClick(btn);
      else await nutJs.mouse.click(btn);
      const where = hasPoint ? ` at (${x}, ${y})` : " at the current cursor position";
      return finishAction(`Clicked${where}.`, screenshot ?? true);
    }
  },
  {
    name: TOOLS.moveMouse,
    description: "Move the mouse pointer to a point (screenshot pixel coordinates) without clicking.",
    inputSchema: zod.z.object({
      x: zod.z.number(),
      y: zod.z.number()
    }),
    summarize: (i) => {
      const { x, y } = i;
      return `Move mouse to (${x}, ${y})`;
    },
    execute: async ({ x, y }) => {
      const access = ensureInputAccess();
      if ("error" in access) return access;
      ensureConfigured();
      await moveTo(x, y);
      return { ok: true, message: `Moved mouse to (${x}, ${y}).` };
    }
  },
  {
    name: TOOLS.drag,
    description: "Press and hold the mouse button at a start point, move to an end point, and release — for sliders, drag-and-drop, marquee selection, or moving windows. Coordinates are in screenshot pixel space. Omit from* to start the drag at the current cursor position. Returns a fresh screenshot by default.",
    inputSchema: zod.z.object({
      fromX: zod.z.number().optional(),
      fromY: zod.z.number().optional(),
      toX: zod.z.number(),
      toY: zod.z.number(),
      button: zod.z.enum(["left", "right", "middle"]).optional().describe("Defaults to left."),
      screenshot: zod.z.boolean().optional().describe(SHOT_ARG)
    }),
    summarize: (i) => {
      const { toX, toY } = i;
      return `Drag to (${toX}, ${toY})`;
    },
    toModelOutput: withScreenshot,
    execute: async ({
      fromX,
      fromY,
      toX,
      toY,
      button,
      screenshot
    }) => {
      const access = ensureInputAccess();
      if ("error" in access) return access;
      ensureConfigured();
      const btn = buttonOf(button);
      if (fromX != null && fromY != null) await moveTo(fromX, fromY);
      const ref = lastShot;
      const target = ref ? toScreenPoint(toX, toY, ref) : { x: toX, y: toY };
      await nutJs.mouse.pressButton(btn);
      await nutJs.mouse.move(nutJs.straightTo(new nutJs.Point(target.x, target.y)));
      await nutJs.mouse.releaseButton(btn);
      return finishAction(`Dragged to (${toX}, ${toY}).`, screenshot ?? true);
    }
  },
  {
    name: TOOLS.typeText,
    description: "Type a string of text at the current focus. Long text is pasted via the clipboard for speed and reliability; short text is typed key-by-key. Does not press Enter unless the text contains a newline. By default returns NO screenshot, so you can chain typing/keys; pass screenshot:true when you want to see the result.",
    inputSchema: zod.z.object({
      text: zod.z.string().describe("The literal text to type."),
      method: zod.z.enum(["type", "paste"]).optional().describe("Force key-by-key typing or clipboard paste. Omit to auto-choose (paste for long text)."),
      screenshot: zod.z.boolean().optional().describe(SHOT_ARG)
    }),
    summarize: (i) => {
      const t = i.text;
      return `Type: "${t.length > 60 ? t.slice(0, 57) + "…" : t}"`;
    },
    toModelOutput: withScreenshot,
    execute: async ({
      text,
      method,
      screenshot
    }) => {
      const access = ensureInputAccess();
      if ("error" in access) return access;
      ensureConfigured();
      const usePaste = method === "paste" || method !== "type" && text.length > 25;
      if (usePaste) await pasteText(text);
      else await nutJs.keyboard.type(text);
      return finishAction(`Typed ${text.length} character(s).`, screenshot ?? false);
    }
  },
  {
    name: TOOLS.pressKeys,
    description: "Press a key or keyboard shortcut. Pass the keys of a chord together, e.g. ['cmd','c'] to copy, ['ctrl','shift','t'], or ['enter']. Modifiers: cmd, ctrl, alt/option, shift, meta/super. Use the platform-appropriate modifier. By default returns NO screenshot, so you can chain keys/typing; pass screenshot:true when you want to see the result (e.g. after Enter submits something).",
    inputSchema: zod.z.object({
      keys: zod.z.array(zod.z.string()).min(1).describe("Keys pressed together as one chord."),
      screenshot: zod.z.boolean().optional().describe(SHOT_ARG)
    }),
    summarize: (i) => `Press ${i.keys.join(" + ")}`,
    toModelOutput: withScreenshot,
    execute: async ({ keys, screenshot }) => {
      const access = ensureInputAccess();
      if ("error" in access) return access;
      ensureConfigured();
      const resolved = keys.map(keyFromToken);
      const bad = keys.find((_, idx) => resolved[idx] === null);
      if (bad) return { error: `Unrecognised key: "${bad}".` };
      const ks = resolved;
      await nutJs.keyboard.pressKey(...ks);
      await nutJs.keyboard.releaseKey(...[...ks].reverse());
      return finishAction(`Pressed ${keys.join(" + ")}.`, screenshot ?? false);
    }
  },
  {
    name: TOOLS.scroll,
    description: "Scroll the screen in a direction by an amount (in scroll steps). Pass x and y to scroll the pane under that point (the cursor moves there first); omit them to scroll wherever the cursor is. Returns a fresh screenshot by default.",
    inputSchema: zod.z.object({
      direction: zod.z.enum(["up", "down", "left", "right"]),
      amount: zod.z.number().min(1).max(50).optional().describe("Scroll steps (default 5)."),
      x: zod.z.number().optional().describe("X coordinate to scroll at (screenshot pixel space)."),
      y: zod.z.number().optional().describe("Y coordinate to scroll at (screenshot pixel space)."),
      screenshot: zod.z.boolean().optional().describe(SHOT_ARG)
    }),
    summarize: (i) => {
      const { direction, amount } = i;
      return `Scroll ${direction} by ${amount ?? 5}`;
    },
    toModelOutput: withScreenshot,
    execute: async ({
      direction,
      amount,
      x,
      y,
      screenshot
    }) => {
      const access = ensureInputAccess();
      if ("error" in access) return access;
      ensureConfigured();
      if (x != null && y != null) await moveTo(x, y);
      const n = amount ?? 5;
      if (direction === "up") await nutJs.mouse.scrollUp(n);
      else if (direction === "down") await nutJs.mouse.scrollDown(n);
      else if (direction === "left") await nutJs.mouse.scrollLeft(n);
      else await nutJs.mouse.scrollRight(n);
      return finishAction(`Scrolled ${direction}.`, screenshot ?? true);
    }
  },
  {
    name: TOOLS.wait,
    description: "Pause briefly to let the screen finish loading or animating, then look. Cheaper and clearer than repeatedly screenshotting while you wait.",
    inputSchema: zod.z.object({
      ms: zod.z.number().min(0).max(3e3).optional().describe("Milliseconds to wait (default 500, max 3000)."),
      screenshot: zod.z.boolean().optional().describe(SHOT_ARG)
    }),
    summarize: (i) => `Wait ${i.ms ?? 500}ms`,
    toModelOutput: withScreenshot,
    execute: async ({ ms, screenshot }) => {
      const d = Math.min(ms ?? 500, 3e3);
      await delay(d);
      return finishAction(`Waited ${d}ms.`, screenshot ?? true);
    }
  }
];
const platform = process.platform === "darwin" ? "macOS (use the Cmd key for shortcuts, not Ctrl)" : process.platform === "win32" ? "Windows (use the Ctrl key for shortcuts)" : "Linux (use the Ctrl key for shortcuts)";
const SYSTEM_PROMPT = `You can see and control this computer. The operating system is ${platform}.

To operate it: first call captureScreen to see the screen, then act with click, moveMouse, drag, typeText, pressKeys, scroll, and wait. Coordinates are in the pixel space of the most recent screenshot, with (0,0) at the top-left.

To read or precisely click something small, call captureScreen with a region to zoom into that area rather than guessing on the full frame — the zoomed image is sharper and the coordinates you get back refer to it. Use drag for sliders, drag-and-drop, selecting, or moving windows. To scroll a specific pane, pass x and y to scroll. Long text you pass to typeText is pasted instantly via the clipboard; short text is typed key-by-key. If something is still loading, use wait rather than screenshotting repeatedly.

Don't take a screenshot after every action — it's slow. typeText and pressKeys return no screenshot by default, so chain related keystrokes (e.g. type a field, press Tab, type the next, press Enter) without looking in between. click, drag, and scroll do return a screenshot since they change what's on screen. When you want to verify the result of a keystroke sequence, either pass screenshot:true on the last action or call captureScreen. Screenshots are settled before you see them, so you won't catch a half-loaded frame. If an action reports "no visible change on screen", your click probably missed — re-aim (zoom in to be sure) instead of repeating the same click.

The user can see a live list of every action, so keep spoken narration brief — don't give a play-by-play of each click; a short sentence to begin and a one-line summary at the end is enough.

Work in small, deliberate steps and stop once the task is done or if something looks wrong. If a screenshot is empty or a click has no effect, the operator may need to grant Screen Recording and Accessibility permissions in their system settings — say so rather than retrying blindly.`;
const computerSkill = {
  ...meta,
  systemPrompt: SYSTEM_PROMPT,
  tools
};
const BUILTIN_SKILLS = [
  clockSkill,
  weatherSkill,
  webSearchSkill,
  openSkill,
  computerSkill
];
BUILTIN_SKILLS.map((s) => ({
  id: s.id,
  label: s.label,
  description: s.description,
  sensitive: s.sensitive,
  optIn: s.optIn,
  imageResults: s.imageResults
}));
function isSkillEnabled(skill, config) {
  return skill.optIn ? config.skills.enabled[skill.id] === true : config.skills.enabled[skill.id] !== false;
}
function skillSystemPrompts(config) {
  return BUILTIN_SKILLS.filter((s) => isSkillEnabled(s, config)).map((s) => s.systemPrompt).filter((p) => Boolean(p));
}
function buildToolSet({
  config,
  requestPermission,
  include
}) {
  const set = {};
  for (const skill of BUILTIN_SKILLS) {
    if (!isSkillEnabled(skill, config)) continue;
    if (include && !include(skill)) continue;
    for (const t of skill.tools) {
      set[t.name] = ai.tool({
        description: t.description,
        inputSchema: t.inputSchema,
        toModelOutput: t.toModelOutput,
        execute: skill.sensitive ? async (input) => {
          const detail = t.summarize ? t.summarize(input) : t.name;
          const allowed = await requestPermission(skill.id, skill.label, detail);
          if (!allowed) return { error: "Permission denied by the user." };
          return t.execute(input);
        } : async (input) => t.execute(input)
      });
    }
  }
  return set;
}
const runTaskInputSchema = zod.z.object({
  task: zod.z.string().describe("Complete, self-contained task instructions for the desktop agent.")
});
const RUN_TASK_DEF = {
  name: RUN_TASK_TOOL,
  description: "Delegate a task to the desktop agent, which can see the screen, control the mouse and keyboard, and work through multi-step jobs. Use it for anything involving looking at or operating the computer, apps, or files — or any request you cannot complete with your other tools. Describe the task fully and self-containedly; the agent shares none of this conversation. While it runs you will receive progress notes; give the user brief spoken updates. It returns a final report when done.",
  parameters: zod.z.toJSONSchema(runTaskInputSchema)
};
function directRealtimeSkills(config) {
  return BUILTIN_SKILLS.filter((s) => isSkillEnabled(s, config) && !s.imageResults);
}
function buildRealtimeToolDefs(config) {
  const defs = directRealtimeSkills(config).flatMap(
    (skill) => skill.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: zod.z.toJSONSchema(t.inputSchema)
    }))
  );
  const delegatable = BUILTIN_SKILLS.some(
    (s) => isSkillEnabled(s, config) && s.imageResults
  );
  if (delegatable) defs.push(RUN_TASK_DEF);
  return defs;
}
const REALTIME_MODELS = [
  {
    id: "openai/gpt-realtime-2",
    label: "OpenAI GPT Realtime 2",
    blurb: "OpenAI's flagship speech-to-speech model. Natural voices, tool calling.",
    voices: [
      { id: "marin", label: "Marin" },
      { id: "cedar", label: "Cedar" },
      { id: "alloy", label: "Alloy" },
      { id: "echo", label: "Echo" },
      { id: "sage", label: "Sage" },
      { id: "verse", label: "Verse" }
    ],
    transcribes: true
  },
  {
    id: "xai/grok-voice-think-fast-1.0",
    label: "xAI Grok Voice (think fast)",
    blurb: "xAI's realtime voice model. Speech-to-speech only — no transcripts, so the conversation won't show as text.",
    voices: [],
    transcribes: false
  }
];
function getRealtimeModelMeta(id) {
  return REALTIME_MODELS.find((m) => m.id === id);
}
const PERMISSION_TIMEOUT_MS = 12e4;
const pending = /* @__PURE__ */ new Map();
let permissionUi = null;
function setPermissionUi(ui) {
  permissionUi = ui;
}
function pendingPermissions() {
  return pending.size;
}
function resolvePermission(id, decision) {
  const resolve = pending.get(id);
  if (!resolve) return;
  pending.delete(id);
  resolve(decision);
}
function makePermissionRequester(sender) {
  const sessionAllow = /* @__PURE__ */ new Set();
  return (skillId, label, detail) => new Promise((resolve) => {
    const standing = getConfig().skills.permissions[skillId];
    if (standing === "always") return resolve(true);
    if (standing === "never") return resolve(false);
    if (sessionAllow.has(skillId)) return resolve(true);
    if (sender.isDestroyed()) return resolve(false);
    const id = node_crypto.randomUUID();
    let settled = false;
    let timer;
    const onDestroyed = () => settle("deny");
    const settle = (decision) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pending.delete(id);
      if (!sender.isDestroyed()) sender.off("destroyed", onDestroyed);
      permissionUi?.dismiss(id);
      const allowed = decision === "allow_once" || decision === "always";
      if (allowed) sessionAllow.add(skillId);
      resolve(allowed);
    };
    pending.set(id, settle);
    sender.once("destroyed", onDestroyed);
    timer = setTimeout(() => {
      console.warn(
        `[alex] permission prompt for "${skillId}" auto-denied after ${PERMISSION_TIMEOUT_MS}ms with no answer`
      );
      settle("deny");
    }, PERMISSION_TIMEOUT_MS);
    permissionUi?.present({ id, skillId, label, detail });
  });
}
function recordAndResolve(id, skillId, decision) {
  if (decision === "always" || decision === "never") {
    const permissions = { ...getConfig().skills.permissions, [skillId]: decision };
    updateConfig({ skills: { permissions } });
  }
  resolvePermission(id, decision);
}
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
let cachedClient = null;
let cachedKey = null;
function client() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new elevenlabsJs.ElevenLabsClient({ apiKey });
    cachedKey = apiKey;
  }
  return cachedClient;
}
async function synthesizeSpeech(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Missing text for synthesis.");
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID ?? "eleven_turbo_v2_5";
  const stream = await client().textToSpeech.stream(voiceId, {
    text: trimmed,
    modelId,
    outputFormat: "mp3_44100_128",
    optimizeStreamingLatency: 3
  });
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}
async function transcribeOpenAI(wav) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const model = process.env.OPENDEX_STT_MODEL ?? "gpt-4o-transcribe";
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(wav)], { type: "audio/wav" }),
    "command.wav"
  );
  form.append("model", model);
  form.append("response_format", "text");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`OpenAI transcription failed: ${res.status} ${detail.slice(0, 200)}`);
  }
  return (await res.text()).trim();
}
async function transcribe(provider, wav) {
  switch (provider) {
    case "openai":
      return transcribeOpenAI(wav);
    default:
      throw new Error(`Provider "${provider}" is not a cloud STT provider.`);
  }
}
const devSkip = () => !electron.app.isPackaged && process.env.GA_DEBUG !== "1";
const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID ?? "G-HBB5QNHS90";
const GA_API_SECRET = process.env.GA_API_SECRET ?? "ShIZno_5RQavnZFZ6UjU_w";
const ENDPOINT = "https://www.google-analytics.com/mp/collect";
let clientId = "";
let sessionId = "";
let userAgent = "";
function buildUserAgent() {
  const chrome = process.versions.chrome ?? "120.0.0.0";
  const webkit = "AppleWebKit/537.36 (KHTML, like Gecko)";
  switch (process.platform) {
    case "win32":
      return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${webkit} Chrome/${chrome} Safari/537.36`;
    case "linux":
      return `Mozilla/5.0 (X11; Linux ${process.arch === "arm64" ? "aarch64" : "x86_64"}) ${webkit} Chrome/${chrome} Safari/537.36`;
    default:
      return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${webkit} Chrome/${chrome} Safari/537.36`;
  }
}
function loadClientId() {
  const file = node_path.join(electron.app.getPath("userData"), "analytics-client-id");
  try {
    if (node_fs.existsSync(file)) {
      const existing = node_fs.readFileSync(file, "utf8").trim();
      if (existing) return existing;
    }
  } catch {
  }
  const id = node_crypto.randomUUID();
  try {
    node_fs.writeFileSync(file, id, "utf8");
  } catch {
  }
  return id;
}
function initAnalytics() {
  clientId = loadClientId();
  sessionId = String(Date.now());
  userAgent = buildUserAgent();
}
function credsConfigured() {
  return GA_MEASUREMENT_ID.startsWith("G-") && GA_MEASUREMENT_ID !== "G-XXXXXXXXXX" && GA_API_SECRET.length > 0;
}
function analyticsEnabled() {
  try {
    return getConfig().analytics.enabled;
  } catch {
    return false;
  }
}
function baseParams() {
  return {
    app_version: electron.app.getVersion(),
    os: process.platform,
    arch: process.arch,
    // GA4 needs these for the event to count toward sessions/engagement.
    session_id: sessionId,
    engagement_time_msec: 100
  };
}
function track(name, params = {}) {
  if (devSkip() || !clientId || !credsConfigured() || !analyticsEnabled()) return;
  const url = `${ENDPOINT}?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;
  const body = JSON.stringify({
    client_id: clientId,
    events: [{ name, params: { ...baseParams(), ...params } }]
  });
  try {
    void fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Lets GA4 derive the built-in Device / OS / Browser dimensions.
        "user-agent": userAgent || buildUserAgent()
      },
      body
    }).catch(() => {
    });
  } catch {
  }
}
const { autoUpdater } = electronUpdater;
const CHECK_INTERVAL_MS = 60 * 60 * 1e3;
function broadcast(payload) {
  for (const win of electron.BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.updateStatus, payload);
  }
}
function initAutoUpdater() {
  if (!electron.app.isPackaged) return;
  autoUpdater.logger = log;
  log.transports.file.level = "info";
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("error", (err) => {
    log.error("[updater] error", err);
    broadcast({ state: "error", message: err?.message ?? String(err) });
  });
  autoUpdater.on("checking-for-update", () => {
    log.info("[updater] checking for update");
  });
  autoUpdater.on("update-available", (info) => {
    log.info("[updater] update available", info.version);
    broadcast({ state: "available", version: info.version });
  });
  autoUpdater.on("update-not-available", () => {
    log.info("[updater] up to date");
  });
  autoUpdater.on("download-progress", (progress) => {
    broadcast({ state: "downloading", percent: Math.round(progress.percent) });
  });
  autoUpdater.on("update-downloaded", (info) => {
    log.info("[updater] update downloaded", info.version);
    track("update_downloaded", { update_version: info.version });
    broadcast({ state: "downloaded", version: info.version });
    void electron.dialog.showMessageBox({
      type: "info",
      buttons: ["Restart", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update available",
      message: `Alex ${info.version} is ready to install.`,
      detail: "Restart now to apply the update."
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });
  void autoUpdater.checkForUpdates();
  setInterval(() => {
    void autoUpdater.checkForUpdates();
  }, CHECK_INTERVAL_MS);
}
dotenv.config();
const isDev = !electron.app.isPackaged;
let mainWindow = null;
let overlayWindow = null;
let permissionWindow = null;
let notchWindow = null;
let tray = null;
let isQuitting = false;
let windowMode = "full";
let oriWindow = null;
let screenShareInterval = null;
let screenShareActive = false;
let screenShareLatestFrame = null;
let latestSessionState = null;
const NOTCH_SIZE = { width: 320, height: 44 };
const NOTCH_MIN_WIDTH = 280;
const NOTCH_MAX_WIDTH = 640;
const NOTCH_MAX_HEIGHT = 260;
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 480,
    height: 480,
    minWidth: 360,
    minHeight: 420,
    backgroundColor: "#0a0a0a",
    title: "Alex",
    show: false,
    // Frameless, native-feeling chrome on macOS: hide the title bar and let the
    // renderer fill to the top edge, keeping the traffic lights inset over it.
    ...process.platform === "darwin" ? { titleBarStyle: "hidden", trafficLightPosition: { x: 16, y: 18 } } : {},
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // The window is often hidden/occluded while the agent works; without this,
      // the OS throttles its timers + rAF to ~1fps, stalling wake-word polling,
      // the amplitude meter, and STT endpointing. Keep the voice loop full-speed.
      backgroundThrottling: false
    }
  });
  mainWindow = win;
  win.once("ready-to-show", () => win.show());
  win.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    if (getConfig().onboarding.completed) applyWindowMode("notch");
    else win.hide();
  });
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  attachAutoModeListeners(win);
  win.webContents.setWindowOpenHandler(({ url }) => {
    void electron.shell.openExternal(url);
    return { action: "deny" };
  });
  loadRenderer(win);
}
function loadRenderer(win, hash) {
  const onLoadError = (err) => console.error("[alex] failed to load renderer", { hash }, err);
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    const base = process.env.ELECTRON_RENDERER_URL;
    win.loadURL(hash ? `${base}#${hash}` : base).catch(onLoadError);
  } else {
    win.loadFile(node_path.join(__dirname, "../renderer/index.html"), { hash }).catch(onLoadError);
  }
}
function createOverlayWindow() {
  const overlay = new electron.BrowserWindow({
    // Spans the work area of the primary display as a thin top strip; the
    // renderer centers its content and stays otherwise empty/transparent.
    width: 100,
    height: 100,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    // Keep it off mission-control / app-switcher; it's pure chrome.
    type: process.platform === "darwin" ? "panel" : void 0,
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });
  overlayWindow = overlay;
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (process.platform === "darwin") overlay.setHiddenInMissionControl(true);
  positionOverlay(overlay);
  overlay.on("closed", () => {
    if (overlayWindow === overlay) overlayWindow = null;
  });
  overlay.webContents.on("did-finish-load", () => {
    if (latestSessionState) overlay.webContents.send(IPC.sessionChanged, latestSessionState);
  });
  loadRenderer(overlay, "overlay");
}
function positionOverlay(overlay) {
  const display = electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  const h = 260;
  overlay.setBounds({ x, y: y + height - h, width, height: h });
}
const PERMISSION_SIZE = { width: 460, height: 360 };
function createPermissionWindow() {
  const win = new electron.BrowserWindow({
    ...PERMISSION_SIZE,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  permissionWindow = win;
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (process.platform === "darwin") win.setHiddenInMissionControl(true);
  win.on("closed", () => {
    if (permissionWindow === win) permissionWindow = null;
  });
  loadRenderer(win, "permission");
  return win;
}
function showPermissionWindow() {
  const win = permissionWindow && !permissionWindow.isDestroyed() ? permissionWindow : createPermissionWindow();
  const display = electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;
  win.setBounds({
    x: Math.round(x + (width - PERMISSION_SIZE.width) / 2),
    y: Math.round(y + (height - PERMISSION_SIZE.height) / 2),
    ...PERMISSION_SIZE
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.show();
  win.focus();
}
function createNotchWindow() {
  const win = new electron.BrowserWindow({
    ...NOTCH_SIZE,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: false,
    // we draw our own (square top, rounded bottom)
    backgroundColor: "#00000000",
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });
  notchWindow = win;
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, "screen-saver");
  if (process.platform === "darwin") win.setHiddenInMissionControl(true);
  win.on("closed", () => {
    if (notchWindow === win) notchWindow = null;
  });
  win.webContents.on("did-finish-load", () => {
    if (latestSessionState) win.webContents.send(IPC.sessionChanged, latestSessionState);
  });
  loadRenderer(win, "notch");
  return win;
}
function placeNotch(win) {
  const display = electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint());
  const b = win.getBounds();
  win.setBounds({
    x: Math.round(display.bounds.x + (display.bounds.width - b.width) / 2),
    y: display.bounds.y,
    width: b.width,
    height: b.height
  });
}
function setNotchSize(width, height) {
  if (!notchWindow || notchWindow.isDestroyed()) return;
  const b = notchWindow.getBounds();
  const w = Math.max(NOTCH_MIN_WIDTH, Math.min(Math.round(width), NOTCH_MAX_WIDTH));
  const h = Math.max(NOTCH_SIZE.height, Math.min(Math.round(height), NOTCH_MAX_HEIGHT));
  const display = electron.screen.getDisplayNearestPoint({ x: Math.round(b.x + b.width / 2), y: b.y });
  const x = Math.round(display.bounds.x + (display.bounds.width - w) / 2);
  if (b.width === w && b.height === h && b.x === x) return;
  notchWindow.setBounds({ x, y: display.bounds.y, width: w, height: h }, true);
}
function applyWindowMode(mode) {
  if (mode === windowMode) return;
  windowMode = mode;
  if (mode === "notch") {
    const notch = notchWindow && !notchWindow.isDestroyed() ? notchWindow : createNotchWindow();
    placeNotch(notch);
    notch.showInactive();
    mainWindow?.hide();
  } else {
    notchWindow?.hide();
    if (process.platform === "darwin") electron.app.dock?.show();
    mainWindow?.show();
    mainWindow?.focus();
  }
  mainWindow?.webContents.send(IPC.windowMode, mode);
}
function attachAutoModeListeners(win) {
  win.on("blur", () => {
    if (getConfig().onboarding.completed && win.isVisible() && pendingPermissions() === 0) {
      applyWindowMode("notch");
    }
  });
}
function summonWindow({ toggle = true } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (windowMode === "notch") {
    const notch = notchWindow && !notchWindow.isDestroyed() ? notchWindow : createNotchWindow();
    if (toggle && notch.isVisible() && notch.isFocused()) {
      notch.hide();
      return;
    }
    placeNotch(notch);
    notch.show();
    notch.focus();
    notch.webContents.send(IPC.windowSummoned);
    return;
  }
  const win = mainWindow;
  if (!win) return;
  if (toggle && win.isVisible() && win.isFocused()) {
    win.hide();
    return;
  }
  if (process.platform === "darwin") electron.app.dock?.show();
  win.show();
  win.focus();
  win.webContents.send(IPC.windowSummoned);
}
let settingsWindow = null;
function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new electron.BrowserWindow({
    width: 820,
    height: 720,
    minWidth: 560,
    minHeight: 480,
    backgroundColor: "#0a0a0a",
    title: "Alex Settings",
    show: false,
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  settingsWindow.once("ready-to-show", () => settingsWindow?.show());
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    void electron.shell.openExternal(url);
    return { action: "deny" };
  });
  loadRenderer(settingsWindow, "settings");
}
function broadcastConfig() {
  const cfg = getPublicConfig();
  for (const win of electron.BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.configChanged, cfg);
  }
}
function broadcastSessionState(state) {
  latestSessionState = state;
  const busy = state.status === "thinking" || state.status === "speaking" || state.activity.length > 0;
  const overlay = overlayWindow;
  if (overlay && !overlay.isDestroyed()) {
    overlay.webContents.send(IPC.sessionChanged, state);
    if (busy && !overlay.isVisible()) {
      positionOverlay(overlay);
      overlay.showInactive();
    } else if (!busy && overlay.isVisible()) {
      overlay.hide();
    }
  }
  if (notchWindow && !notchWindow.isDestroyed()) {
    notchWindow.webContents.send(IPC.sessionChanged, state);
  }
  const orb = oriWindow;
  if (orb && !orb.isDestroyed()) {
    orb.webContents.send(IPC.sessionChanged, state);
  }
}
function stripImageOutput(output) {
  if (output && typeof output === "object" && output.type === "content" && Array.isArray(output.value) && output.value.some(
    (c) => c.type === "media" || c.type === "file-data"
  )) {
    return { type: "content", value: [{ type: "text", value: "[screenshot]" }] };
  }
  return output;
}
function stopScreenShare() {
  if (screenShareInterval) {
    clearInterval(screenShareInterval);
    screenShareInterval = null;
  }
  screenShareActive = false;
}
function startScreenShare(sender) {
  stopScreenShare();
  screenShareActive = true;
  const capture = async () => {
    if (!screenShareActive || sender.isDestroyed()) {
      stopScreenShare();
      return;
    }
    try {
      const sources = await electron.desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 640, height: 480 } });
      const source = sources[0];
      if (!source) return;
      const base64 = source.thumbnail.toDataURL();
      screenShareLatestFrame = { base64, mediaType: "image/jpeg" };
      if (!sender.isDestroyed()) sender.send(IPC.orbScreenFrame, screenShareLatestFrame);
    } catch (err) {
      console.error("[alex] screen capture error:", err);
    }
  };
  capture();
  screenShareInterval = setInterval(capture, 2000);
}
function createOrbWindow() {
  const win = new electron.BrowserWindow({
    width: 250,
    height: 250,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });
  oriWindow = win;
  loadRenderer(win, "orb");
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.on("closed", () => {
    if (oriWindow === win) oriWindow = null;
  });
  win.webContents.on("did-finish-load", () => {
    if (latestSessionState) win.webContents.send(IPC.sessionChanged, latestSessionState);
  });
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.remoteCommand, { type: "toggleMute" });
    }
  }, 1500);
  return win;
}
function toggleDesktopOrb(menuItem) {
  if (oriWindow && !oriWindow.isDestroyed()) {
    if (menuItem) menuItem.checked = false;
    oriWindow.close();
  } else {
    const win = createOrbWindow();
    const display = electron.screen.getPrimaryDisplay();
    const { x, y, width } = display.workArea;
    win.setPosition(x + width - 340, y + 40);
    win.show();
    if (menuItem) menuItem.checked = true;
  }
}
function registerIpc() {
  const inFlight = /* @__PURE__ */ new Map();
  electron.ipcMain.on(IPC.chatStart, async (event, payload) => {
    const { requestId, messages, mode } = payload;
    const ac = new AbortController();
    inFlight.set(requestId, ac);
    const sender = event.sender;
    const config = getConfig();
    const briefing = mode === "briefing";
    track("command_run", { mode: briefing ? "briefing" : "command" });
    if (screenShareActive && screenShareLatestFrame) {
      messages.unshift({
        role: "user",
        content: [
          { type: "text", text: "[Alex is sharing the screen — this is what's currently visible.]" },
          { type: "media", data: screenShareLatestFrame.base64, mediaType: screenShareLatestFrame.mediaType }
        ]
      });
    }
    const system = buildSystemPrompt({
      config,
      briefing,
      skillPrompts: briefing ? [] : skillSystemPrompts(config),
      hasScreenShare: screenShareActive
    });
    const tools2 = buildToolSet({
      config,
      requestPermission: makePermissionRequester(sender)
    });
    try {
      const model = await resolveModel(config);
      const responseMessages = await streamChat({
        messages,
        system,
        model,
        tools: tools2,
        briefing,
        signal: ac.signal,
        onDelta: (delta) => {
          if (!ac.signal.aborted && !sender.isDestroyed()) {
            sender.send(IPC.chatDelta(requestId), delta);
          }
        },
        onToolCall: (call) => {
          track("tool_used", { tool_name: call.toolName });
          if (!ac.signal.aborted && !sender.isDestroyed()) {
            sender.send(IPC.chatTool(requestId), call);
          }
        },
        onToolResult: (result) => {
          if (!ac.signal.aborted && !sender.isDestroyed()) {
            sender.send(IPC.chatToolResult(requestId), {
              ...result,
              // Computer-use returns full screenshots; don't ship megabytes of
              // base64 to the activity UI (which never renders them as cards).
              output: stripImageOutput(result.output)
            });
          }
        }
      });
      if (!sender.isDestroyed()) {
        sender.send(IPC.chatDone(requestId), responseMessages);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!sender.isDestroyed()) sender.send(IPC.chatError(requestId), message);
    } finally {
      inFlight.delete(requestId);
    }
  });
  electron.ipcMain.on(IPC.chatCancel, (_event, requestId) => {
    inFlight.get(requestId)?.abort();
    inFlight.delete(requestId);
  });
  electron.ipcMain.handle(IPC.ttsSynthesize, async (_event, text) => {
    const buffer = await synthesizeSpeech(text);
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
  });
  const realtimeSessionBySender = /* @__PURE__ */ new Map();
  electron.ipcMain.handle(
    IPC.realtimeStart,
    async (event, opts) => {
      const config = getConfig();
      if (config.voice.mode !== "realtime") {
        throw new Error("Realtime voice is not enabled in Settings.");
      }
      const briefing = Boolean(opts?.briefing);
      const modelMeta = getRealtimeModelMeta(config.realtime.model);
      track("realtime_session", { model: config.realtime.model });
      const sender = event.sender;
      const previousSession = realtimeSessionBySender.get(sender.id);
      if (previousSession) endRealtimeSession(previousSession);
      const skillPrompts = directRealtimeSkills(config).map((s) => s.systemPrompt).filter((p) => Boolean(p));
      const directIds = new Set(directRealtimeSkills(config).map((s) => s.id));
      const tools2 = buildToolSet({
        config,
        requestPermission: makePermissionRequester(sender),
        include: (skill) => directIds.has(skill.id)
      });
      const sessionId2 = node_crypto.randomUUID();
      await startRealtimeSession({
        sessionId: sessionId2,
        model: config.realtime.model,
        voice: config.realtime.voice,
        instructions: buildRealtimeInstructions({ config, briefing, skillPrompts, hasScreenShare: screenShareActive }),
        toolDefs: buildRealtimeToolDefs(config),
        tools: tools2,
        transcribesInput: modelMeta?.transcribes ?? true,
        notify: (notice) => {
          if (notice.type === "tool-call") {
            track("tool_used", { tool_name: notice.call.toolName });
          }
          if (!sender.isDestroyed()) {
            sender.send(IPC.realtimeEvent(sessionId2), notice);
          }
        }
      });
      realtimeSessionBySender.set(sender.id, sessionId2);
      sender.once("destroyed", () => {
        endRealtimeSession(sessionId2);
        if (realtimeSessionBySender.get(sender.id) === sessionId2) {
          realtimeSessionBySender.delete(sender.id);
        }
      });
      return {
        sessionId: sessionId2,
        greetingPrompt: briefing ? "Give me my briefing." : null
      };
    }
  );
  electron.ipcMain.on(
    IPC.realtimeClient,
    (_event, sessionId2, msg) => {
      sendRealtimeClientMessage(sessionId2, msg);
    }
  );
  electron.ipcMain.on(IPC.realtimeEnd, (_event, sessionId2) => {
    endRealtimeSession(sessionId2);
  });
  electron.ipcMain.handle(IPC.configGet, () => getPublicConfig());
  electron.ipcMain.handle(IPC.configSet, (_event, patch) => {
    const result = updateConfig(patch);
    broadcastConfig();
    if (patch.hotkeys?.summon) registerSummonHotkey();
    return result;
  });
  electron.ipcMain.handle(IPC.secretSet, (_event, name, value) => {
    const result = setSecret(name, value);
    broadcastConfig();
    return result;
  });
  electron.ipcMain.handle(IPC.configReset, () => {
    const result = resetConfig();
    broadcastConfig();
    track("config_reset");
    return result;
  });
  electron.ipcMain.handle(IPC.settingsOpen, () => openSettingsWindow());
  electron.ipcMain.handle(IPC.onboardingComplete, () => {
    const result = completeOnboarding();
    broadcastConfig();
    const c = result.config;
    track("onboarding_completed", {
      theme: c.appearance.theme,
      voice_mode: c.voice.mode,
      ...c.voice.mode === "realtime" ? { realtime_model: c.realtime.model } : {},
      wake_mode: c.voiceInput.wakeMode,
      stt_provider: c.voiceInput.sttProvider,
      tts_engine: c.tts.engine,
      greeting_mode: c.greeting.mode
    });
    return result;
  });
  electron.ipcMain.handle(
    IPC.transcribe,
    async (_event, provider, wav) => {
      return transcribe(provider, Buffer.from(wav));
    }
  );
  electron.ipcMain.handle(IPC.llmAppleAvailability, () => checkAppleAvailability());
  electron.ipcMain.on(
    IPC.permissionRespond,
    (_event, payload) => {
      recordAndResolve(payload.id, payload.skillId, payload.decision);
    }
  );
  electron.ipcMain.on(IPC.sessionUpdate, (_event, state) => {
    broadcastSessionState(state);
  });
  electron.ipcMain.on(IPC.windowSetMode, (_event, mode) => {
    applyWindowMode(mode);
  });
  electron.ipcMain.on(IPC.notchSetSize, (_event, size) => {
    setNotchSize(size?.width ?? NOTCH_SIZE.width, size?.height ?? NOTCH_SIZE.height);
  });
  electron.ipcMain.on(IPC.notchFocus, () => {
    if (windowMode === "notch" && notchWindow && !notchWindow.isDestroyed()) {
      notchWindow.focus();
    }
  });
  electron.ipcMain.on(IPC.viewCommand, (_event, cmd) => {
    if (cmd.type === "expand") {
      applyWindowMode("full");
    } else {
      mainWindow?.webContents.send(IPC.remoteCommand, cmd);
    }
  });
  electron.ipcMain.on(IPC.overlaySetInteractive, (_event, interactive) => {
    overlayWindow?.setIgnoreMouseEvents(!interactive, { forward: true });
  });
  electron.ipcMain.on(IPC.overlayInterrupt, () => {
    mainWindow?.webContents.send(IPC.interrupt);
  });
  let orbCameraActive = false;
  function showOrbContextMenu(sender) {
    try {
      const browserWin = electron.BrowserWindow.fromWebContents(sender);
      if (!browserWin) { console.error("[alex] orb menu: no browser window"); return; }
      const menu = electron.Menu.buildFromTemplate([
        {
          label: "Parler à Alex",
          click: () => {
            mainWindow?.webContents.send(IPC.remoteCommand, { type: "toggleMute" });
          }
        },
        { type: "separator" },
        {
          label: screenShareActive ? "Arrêter le partage d'écran" : "Partager l'écran",
          click: () => {
            if (screenShareActive) {
              stopScreenShare();
            } else {
              startScreenShare(sender);
            }
            sender.send(IPC.orbMenuAction, "screen-share");
          }
        },
        { type: "separator" },
        {
          label: orbCameraActive ? "Éteindre la caméra" : "Caméra",
          click: () => {
            sender.send(IPC.orbMenuAction, "camera");
          }
        },
        { type: "separator" },
        {
          label: "Tester le son",
          click: async () => {
            try {
              const audioBuffer = await synthesizeSpeech("Bonjour, ceci est un test audio. Si vous entendez ce message, le son fonctionne correctement.");
              if (!sender.isDestroyed()) {
                const buf = new Uint8Array(audioBuffer);
                sender.send(IPC.orbPlayAudio, buf.buffer);
              }
            } catch (err) {
              console.error("[alex] audio test error:", err);
            }
          }
        }
      ]);
      menu.popup({ browserWindow: browserWin });
    } catch (err) {
      console.error("[alex] orb context menu error:", err);
    }
  }
  electron.ipcMain.on(IPC.orbContextMenu, (event) => {
    showOrbContextMenu(event.sender);
  });
  electron.ipcMain.on(IPC.orbCameraToggle, (_event, status) => {
    orbCameraActive = status === "on";
  });
  let orbDragState = null;
  electron.ipcMain.on(IPC.orbDragStart, (event) => {
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const cursor = electron.screen.getCursorScreenPoint();
    const wPos = win.getPosition();
    orbDragState = { cursorStart: cursor, winStart: wPos };
  });
  electron.ipcMain.on(IPC.orbDragMove, (event) => {
    if (!orbDragState) return;
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const cursor = electron.screen.getCursorScreenPoint();
    const dx = cursor.x - orbDragState.cursorStart.x;
    const dy = cursor.y - orbDragState.cursorStart.y;
    win.setPosition(orbDragState.winStart[0] + dx, orbDragState.winStart[1] + dy);
  });
  electron.ipcMain.on(IPC.orbDragEnd, () => {
    orbDragState = null;
  });
}
function registerPushToTalkHotkey() {
  const accelerator = "CommandOrControl+Shift+Space";
  try {
    electron.globalShortcut.register(accelerator, () => {
      mainWindow?.webContents.send(IPC.pushToTalk);
    });
  } catch (err) {
    console.error("[alex] failed to register push-to-talk hotkey", err);
  }
}
function registerInterruptHotkey() {
  const accelerator = "CommandOrControl+Escape";
  try {
    electron.globalShortcut.register(accelerator, () => {
      mainWindow?.webContents.send(IPC.interrupt);
    });
  } catch (err) {
    console.error("[alex] failed to register interrupt hotkey", err);
  }
}
let summonAccelerator = "";
function registerSummonHotkey() {
  if (summonAccelerator) {
    electron.globalShortcut.unregister(summonAccelerator);
    summonAccelerator = "";
  }
  const configured2 = getConfig().hotkeys.summon;
  const candidates = [configured2, "Control+Alt+Space", "Control+Shift+Space"];
  for (const accelerator of candidates) {
    if (!accelerator || electron.globalShortcut.isRegistered(accelerator)) continue;
    try {
      const ok = electron.globalShortcut.register(accelerator, () => summonWindow());
      if (ok) {
        summonAccelerator = accelerator;
        return;
      }
    } catch {
    }
  }
  console.error("[alex] failed to register a summon hotkey");
}
function createTray() {
  if (tray) return;
  const icon = electron.nativeImage.createEmpty();
  try {
    tray = new electron.Tray(icon);
  } catch (err) {
    console.error("[alex] failed to create tray", err);
    return;
  }
  tray.setToolTip("Alex");
  const menu = electron.Menu.buildFromTemplate([
    { label: "Show Alex", click: () => summonWindow({ toggle: false }) },
    { type: "separator" },
    { label: "Orb de bureau", type: "checkbox", checked: true, click: (item) => toggleDesktopOrb(item) },
    { type: "separator" },
    { label: "Settings…", click: () => openSettingsWindow() },
    { type: "separator" },
    {
      label: "Quit Alex",
      click: () => {
        isQuitting = true;
        electron.app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
  tray.on("click", () => summonWindow());
}
electron.app.whenReady().then(() => {
  initConfig();
  initAnalytics();
  track("app_started");
  if (!getConfig().onboarding.completed) track("onboarding_started");
  registerIpc();
  createWindow();
  createOverlayWindow();
  createNotchWindow();
  createOrbWindow();
  if (oriWindow) {
    const w = oriWindow;
    const display = electron.screen.getPrimaryDisplay();
    const { x, y, width } = display.workArea;
    w.setPosition(x + width - 340, y + 40);
    w.show();
    w.moveTop();
    w.setIgnoreMouseEvents(false);
  }
  createPermissionWindow();
  createTray();
  setPermissionUi({
    present: (req) => {
      showPermissionWindow();
      const win = permissionWindow;
      if (!win) return;
      const send = () => {
        if (!win.isDestroyed()) win.webContents.send(IPC.permissionRequest, req);
      };
      if (win.webContents.isLoading()) win.webContents.once("did-finish-load", send);
      else send();
    },
    dismiss: (id) => {
      permissionWindow?.webContents.send(IPC.permissionDismiss, id);
      if (pendingPermissions() === 0) permissionWindow?.hide();
    }
  });
  registerPushToTalkHotkey();
  registerInterruptHotkey();
  registerSummonHotkey();
  initAutoUpdater();
  electron.app.on("activate", () => {
    summonWindow({ toggle: false });
  });
});
electron.app.on("before-quit", () => {
  isQuitting = true;
  track("app_quit");
});
electron.app.on("will-quit", () => {
  electron.globalShortcut.unregisterAll();
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
