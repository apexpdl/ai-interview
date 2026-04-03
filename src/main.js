import { ACTIVE_MODEL, GENERATED_CORPUS_SUMMARY } from "./data/generatedModel.js";
import { MediaMonitor } from "./simulator/analyzers.js";
import {
  OFFICER_APPEARANCES,
  buildReport,
  createSession,
  finalizeSession,
  issueNextQuestion,
  processAnswer
} from "./simulator/engine.js";
import { formatElapsed } from "./simulator/analysis.js";

const OFFICER_CHOICES = [
  {
    id: "auto",
    label: "Auto (random)",
    kind: "auto",
    features: OFFICER_APPEARANCES[0].features
  },
  ...OFFICER_APPEARANCES
];

const state = {
  selectedOfficerId: "auto",
  activeOfficerId: null,
  session: null,
  phase: "intro",
  mediaMonitor: null,
  stream: null,
  voices: [],
  ambient: null,
  recognition: null,
  recognitionActive: false,
  recognitionPrimed: false,
  shouldAutoListen: false,
  awaitingResponse: false,
  responseStartedAt: 0,
  speechSubmitTimer: null
};

const els = {
  introScreen: document.querySelector("#introScreen"),
  interviewScreen: document.querySelector("#interviewScreen"),
  topbarPhase: document.querySelector("#topbarPhase"),
  tokenDisplay: document.querySelector("#tokenDisplay"),
  clockDisplay: document.querySelector("#clockDisplay"),
  sceneStatus: document.querySelector("#sceneStatus"),
  officerGrid: document.querySelector("#officerGrid"),
  officerPortrait: document.querySelector("#officerPortrait"),
  setupForm: document.querySelector("#setupForm"),
  startButton: document.querySelector("#startButton"),
  startStatus: document.querySelector("#startStatus"),
  submitButton: document.querySelector("#submitButton"),
  responseInput: document.querySelector("#responseInput"),
  captureStatus: document.querySelector("#captureStatus"),
  dictationPreview: document.querySelector("#dictationPreview"),
  currentPrompt: document.querySelector("#currentPrompt"),
  speakerLabel: document.querySelector("#speakerLabel"),
  preludeOverlay: document.querySelector("#preludeOverlay"),
  preludeToken: document.querySelector("#preludeToken"),
  preludeMessage: document.querySelector("#preludeMessage"),
  fingerprintScanner: document.querySelector("#fingerprintScanner"),
  passportCard: document.querySelector("#passportCard"),
  reportOverlay: document.querySelector("#reportOverlay"),
  reportContent: document.querySelector("#reportContent"),
  restartButton: document.querySelector("#restartButton"),
  cameraPreview: document.querySelector("#cameraPreview")
};

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function chance(rate) {
  return Math.random() < rate;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function setPhase(phase) {
  state.phase = phase;
  const labels = {
    intro: "Intake",
    prelude: "Queue",
    interview: "Interview",
    decision: "Decision",
    report: "Review"
  };
  els.topbarPhase.textContent = labels[phase] || "Interview";
}

function setDialogue(speaker, text) {
  els.speakerLabel.textContent = speaker;
  els.currentPrompt.textContent = text;
}

function setCaptureStatus(text) {
  els.captureStatus.textContent = text;
}

function renderOfficerSvg(appearance, compact = false, mode = "idle") {
  const {
    skin,
    hair,
    tie,
    jawScale,
    browTilt,
    lipCurve,
    bodyScale = 1,
    shoulderScale = 1,
    hairStyle = "short",
    beardStyle = "clean",
    glasses = false,
    faceWidth = 1,
    bodyTone = "#313b47"
  } = appearance.features;
  const uniqueId = `${appearance.id}-${compact ? "c" : "m"}-${Math.random().toString(36).slice(2, 7)}`;
  const width = compact ? 180 : 470;
  const height = compact ? 210 : 620;
  const shoulderWidth = 118 * shoulderScale;
  const faceRadius = 76 * jawScale * faceWidth;
  const expression = {
    idle: {
      leftBrow: browTilt,
      rightBrow: -browTilt,
      mouthLeft: 288 + lipCurve,
      mouthRight: 288 + lipCurve,
      mouthMid: 282 + lipCurve,
      eyeY: 208,
      lidScale: 1
    },
    stare: {
      leftBrow: browTilt + 2,
      rightBrow: -browTilt - 2,
      mouthLeft: 286 + lipCurve,
      mouthRight: 286 + lipCurve,
      mouthMid: 280 + lipCurve,
      eyeY: 208,
      lidScale: 0.9
    },
    typing: {
      leftBrow: browTilt + 1,
      rightBrow: -browTilt,
      mouthLeft: 287 + lipCurve,
      mouthRight: 287 + lipCurve,
      mouthMid: 283 + lipCurve,
      eyeY: 212,
      lidScale: 0.72
    },
    lean: {
      leftBrow: browTilt + 3,
      rightBrow: -browTilt - 1,
      mouthLeft: 286 + lipCurve,
      mouthRight: 284 + lipCurve,
      mouthMid: 281 + lipCurve,
      eyeY: 207,
      lidScale: 0.88
    },
    skeptical: {
      leftBrow: browTilt + 7,
      rightBrow: -browTilt - 1,
      mouthLeft: 288 + lipCurve,
      mouthRight: 281 + lipCurve,
      mouthMid: 279 + lipCurve,
      eyeY: 206,
      lidScale: 0.82
    },
    smirk: {
      leftBrow: browTilt + 1,
      rightBrow: -browTilt - 2,
      mouthLeft: 289 + lipCurve,
      mouthRight: 282 + lipCurve,
      mouthMid: 280 + lipCurve,
      eyeY: 207,
      lidScale: 0.94
    }
  }[mode] || {
    leftBrow: browTilt,
    rightBrow: -browTilt,
    mouthLeft: 288 + lipCurve,
    mouthRight: 288 + lipCurve,
    mouthMid: 282 + lipCurve,
    eyeY: 208,
    lidScale: 1
  };
  const hairMarkup = {
    bald: `<ellipse cx="180" cy="146" rx="58" ry="20" fill="#f1d9c4" opacity="0.78"></ellipse>`,
    balding: `
      <path d="M118 184 C124 140, 146 116, 172 112 C214 106, 236 126, 246 180" fill="${hair}"></path>
      <path d="M146 154 C156 138, 200 136, 214 152" stroke="#eed5bf" stroke-width="10" stroke-linecap="round" opacity="0.72"></path>
    `,
    lady: `
      <path d="M104 192 C104 120, 250 112, 260 190 L256 244 C232 270, 128 272, 106 236 Z" fill="${hair}"></path>
    `,
    short: `
      <path d="M108 184 C118 124, 238 108, 254 182 L252 154 C244 96, 116 98, 102 162 Z" fill="${hair}"></path>
    `,
    older: `
      <path d="M110 188 C118 134, 238 122, 250 184 L248 164 C242 118, 122 120, 106 170 Z" fill="${hair}"></path>
      <path d="M112 188 C110 214, 112 234, 122 250" stroke="${hair}" stroke-width="10" stroke-linecap="round"></path>
      <path d="M248 188 C250 214, 248 234, 238 250" stroke="${hair}" stroke-width="10" stroke-linecap="round"></path>
    `,
    messy: `
      <path d="M108 188 C122 124, 240 108, 254 184 L252 152 C230 108, 204 110, 186 126 C174 104, 142 104, 102 162 Z" fill="${hair}"></path>
    `
  }[hairStyle];

  const beardMarkup =
    beardStyle === "subtle"
      ? `<path d="M136 280 C146 308, 214 308, 224 280" stroke="#4c342c" stroke-width="9" stroke-linecap="round" opacity="0.48"></path>`
      : beardStyle === "moustache"
        ? `<path d="M150 274 C166 266, 194 266, 210 274" stroke="#4b352e" stroke-width="6" stroke-linecap="round"></path>`
        : "";

  const glassesMarkup = glasses
    ? `
      <circle cx="168" cy="${expression.eyeY}" r="21" fill="none" stroke="#2a2320" stroke-width="4"></circle>
      <circle cx="232" cy="${expression.eyeY}" r="21" fill="none" stroke="#2a2320" stroke-width="4"></circle>
      <path d="M189 ${expression.eyeY - 3} H211" stroke="#2a2320" stroke-width="3"></path>
    `
    : "";

  return `
    <svg viewBox="0 0 400 520" width="${width}" height="${height}" aria-hidden="true">
      <defs>
        <radialGradient id="faceGlow-${uniqueId}" cx="48%" cy="35%" r="72%">
          <stop offset="0%" stop-color="#f4dcc7" stop-opacity="0.96"></stop>
          <stop offset="100%" stop-color="${skin}" stop-opacity="1"></stop>
        </radialGradient>
        <radialGradient id="faceContour-${uniqueId}" cx="50%" cy="40%" r="76%">
          <stop offset="0%" stop-color="#f6e2cf" stop-opacity="0.2"></stop>
          <stop offset="100%" stop-color="#8f634f" stop-opacity="0.24"></stop>
        </radialGradient>
        <linearGradient id="suit-${uniqueId}" x1="0" x2="1">
          <stop offset="0%" stop-color="#1c2129"></stop>
          <stop offset="100%" stop-color="#343c48"></stop>
        </linearGradient>
        <linearGradient id="shirt-${uniqueId}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#f1f4f6"></stop>
          <stop offset="100%" stop-color="#d8dfe3"></stop>
        </linearGradient>
        <filter id="soft-${uniqueId}">
          <feGaussianBlur stdDeviation="0.34"></feGaussianBlur>
        </filter>
      </defs>
      <ellipse cx="200" cy="494" rx="${126 * shoulderScale}" ry="22" fill="#0d1117" opacity="0.45"></ellipse>
      <path d="M${200 - shoulderWidth} 502 C${200 - shoulderWidth + 26} ${380 - 10 * bodyScale}, ${200 + shoulderWidth - 26} ${380 - 10 * bodyScale}, ${200 + shoulderWidth} 502" fill="url(#suit-${uniqueId})"></path>
      <path d="M152 348 L248 348 L272 520 L128 520 Z" fill="url(#shirt-${uniqueId})"></path>
      <path d="M172 350 L228 350 L215 520 L185 520 Z" fill="${tie}" opacity="0.94"></path>
      <path d="M120 510 L162 348 L186 380 L168 520 Z" fill="${bodyTone}" opacity="0.95"></path>
      <path d="M280 510 L238 348 L214 380 L232 520 Z" fill="${bodyTone}" opacity="0.95"></path>
      <ellipse cx="200" cy="240" rx="${faceRadius}" ry="${104 * jawScale}" fill="url(#faceGlow-${uniqueId})" filter="url(#soft-${uniqueId})"></ellipse>
      <ellipse cx="200" cy="242" rx="${faceRadius}" ry="${104 * jawScale}" fill="url(#faceContour-${uniqueId})"></ellipse>
      <ellipse cx="${200 - faceRadius + 10}" cy="246" rx="10" ry="22" fill="${skin}" opacity="0.96"></ellipse>
      <ellipse cx="${200 + faceRadius - 10}" cy="246" rx="10" ry="22" fill="${skin}" opacity="0.96"></ellipse>
      <g transform="translate(20 16)">${hairMarkup}</g>
      <path d="M168 128 C180 118, 220 116, 236 126" stroke="#ffffff" stroke-opacity="0.16" stroke-width="6" fill="none"></path>
      <rect x="142" y="196" width="50" height="6.5" rx="4" fill="#241d1c" transform="rotate(${expression.leftBrow} 167 198)"></rect>
      <rect x="208" y="196" width="50" height="6.5" rx="4" fill="#241d1c" transform="rotate(${expression.rightBrow} 233 198)"></rect>
      <g class="eyes">
        <ellipse cx="168" cy="${expression.eyeY}" rx="20" ry="${11 * expression.lidScale}" fill="#f8fbfd"></ellipse>
        <ellipse cx="232" cy="${expression.eyeY}" rx="20" ry="${11 * expression.lidScale}" fill="#f8fbfd"></ellipse>
        <circle cx="169" cy="${expression.eyeY + 1}" r="6.3" fill="#3d4f61"></circle>
        <circle cx="233" cy="${expression.eyeY + 1}" r="6.3" fill="#3d4f61"></circle>
        <circle cx="171.5" cy="${expression.eyeY - 2.5}" r="1.8" fill="#ffffff" opacity="0.82"></circle>
        <circle cx="235.5" cy="${expression.eyeY - 2.5}" r="1.8" fill="#ffffff" opacity="0.82"></circle>
      </g>
      ${glassesMarkup}
      <path d="M198 230 C192 256, 192 272, 204 280" stroke="#9f6f55" stroke-width="4.1" stroke-linecap="round" fill="none"></path>
      <path d="M172 324 C182 ${expression.mouthLeft}, 218 ${expression.mouthRight}, 228 324" stroke="#70382d" stroke-width="4.7" stroke-linecap="round" fill="none"></path>
      <path d="M176 324 C188 ${expression.mouthMid}, 212 ${expression.mouthMid}, 224 324" stroke="#9f5c4f" stroke-width="2.2" stroke-linecap="round" opacity="0.5" fill="none"></path>
      <ellipse cx="200" cy="266" rx="34" ry="16" fill="#b87459" opacity="0.14"></ellipse>
      <ellipse cx="164" cy="274" rx="18" ry="10" fill="#c88669" opacity="0.12"></ellipse>
      <ellipse cx="236" cy="274" rx="18" ry="10" fill="#c88669" opacity="0.12"></ellipse>
      <path d="M182 332 C188 354, 212 354, 218 332" stroke="#8d6e63" stroke-width="12" stroke-linecap="round" opacity="0.82"></path>
      <g transform="translate(20 36)">${beardMarkup}</g>
    </svg>
  `;
}

function renderOfficerCards() {
  els.officerGrid.innerHTML = "";

  for (const choice of OFFICER_CHOICES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `officer-card ${state.selectedOfficerId === choice.id ? "is-selected" : ""}`;

    if (choice.kind === "auto") {
      button.innerHTML = `
        <div class="officer-card__portrait">${renderOfficerSvg(OFFICER_APPEARANCES[0], true)}</div>
        <div class="officer-card__label">${choice.label}</div>
      `;
    } else {
      button.innerHTML = `
        <div class="officer-card__portrait">${renderOfficerSvg(choice, true)}</div>
        <div class="officer-card__label">${choice.label}</div>
      `;
    }

    button.addEventListener("click", () => {
      state.selectedOfficerId = choice.id;
      renderOfficerCards();
    });
    els.officerGrid.appendChild(button);
  }
}

function resolveOfficerId() {
  if (state.selectedOfficerId !== "auto") {
    return state.selectedOfficerId;
  }

  return OFFICER_APPEARANCES[Math.floor(Math.random() * OFFICER_APPEARANCES.length)].id;
}

function updateOfficerPortrait(mode = "idle") {
  const officer =
    OFFICER_APPEARANCES.find((item) => item.id === state.activeOfficerId) ||
    OFFICER_APPEARANCES[0];
  els.officerPortrait.className = `officer-portrait officer-portrait--${mode}`;
  els.officerPortrait.innerHTML = renderOfficerSvg(officer, false, mode);
}

function inferFundingSource(snapshot) {
  const value = String(snapshot || "").trim();
  if (!value) {
    return "";
  }

  const match = value.match(
    /\b(parents?|father|mother|uncle|aunt|brother|sister|self|loan|bank|scholarship|assistantship|sponsor)\b/i
  );

  return match ? match[0] : "";
}

function inferAnnualIncome(snapshot) {
  const match = String(snapshot || "").match(/\b(\d{2,3}(?:,\d{3})+|\d{4,6})\b/);
  return match ? match[1].replace(/,/g, "") : "";
}

function normalizeCaseFile() {
  const formData = new FormData(els.setupForm);
  const raw = Object.fromEntries(formData.entries());
  const snapshot = String(raw.coa || "").trim();
  const extraContext = String(raw.extraContext || "").trim();

  return {
    fullName: String(raw.fullName || "").trim(),
    visaClass: "F1",
    school: String(raw.school || "").trim(),
    major: "",
    degreeLevel: "masters",
    coa: snapshot,
    fundingSource: inferFundingSource(snapshot),
    annualIncome: inferAnnualIncome(snapshot),
    scholarship: /scholarship|assistantship|ta|ra/i.test(snapshot) ? snapshot : "",
    relativesInUs: String(raw.relativesInUs || "").trim(),
    currentOccupation: "",
    returnPlan: /return|come back|work in nepal/i.test(extraContext) ? extraContext : "",
    gapExplanation: /gap|after graduation|worked|job/i.test(extraContext) ? extraContext : "",
    extraContext
  };
}

async function ensureMediaPermissions() {
  if (state.stream) {
    return state.stream;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    setCaptureStatus("Camera and microphone unavailable. Type and press Enter.");
    return null;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: 640, height: 480 },
      audio: true
    });
    state.stream = stream;
    state.mediaMonitor = new MediaMonitor(els.cameraPreview);
    await state.mediaMonitor.attach(stream);
    setCaptureStatus("Mic and camera active.");
    return stream;
  } catch {
    setCaptureStatus("Permissions denied. Type and press Enter.");
    return null;
  }
}

function loadVoices() {
  state.voices = window.speechSynthesis?.getVoices?.() || [];
}

function pickVoice() {
  if (!state.session || !state.voices.length) {
    return null;
  }

  const hint = state.session.officer.appearance.voiceHint;
  const englishVoices = state.voices.filter((voice) => voice.lang?.toLowerCase().startsWith("en"));
  const matching = englishVoices.find((voice) =>
    hint === "female"
      ? /female|zira|samantha|victoria|karen/i.test(voice.name)
      : /male|daniel|fred|alex/i.test(voice.name)
  );
  return matching || englishVoices[0] || state.voices[0] || null;
}

async function speakOfficer(text) {
  setDialogue("Officer", text);
  const synth = window.speechSynthesis;
  if (!synth) {
    return;
  }

  synth.cancel();

  await new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = 0.88 + (state.session?.officer.energyLevel || 0.5) * 0.16;
    utterance.pitch = 0.72 + (state.session?.officer.appearance.timbre || 0.5) * 0.34;
    utterance.volume = 0.95;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    synth.speak(utterance);
  });
}

function createAmbientAudio() {
  if (state.ambient || !window.AudioContext) {
    return;
  }

  const context = new window.AudioContext();
  const master = context.createGain();
  master.gain.value = 0.018;
  master.connect(context.destination);

  const hum = context.createOscillator();
  hum.type = "triangle";
  hum.frequency.value = 58;
  hum.connect(master);
  hum.start();

  const air = context.createOscillator();
  air.type = "sine";
  air.frequency.value = 142;
  const airGain = context.createGain();
  airGain.gain.value = 0.004;
  air.connect(airGain);
  airGain.connect(master);
  air.start();

  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * 0.24;
  }
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 420;
  filter.Q.value = 0.45;
  const noiseGain = context.createGain();
  noiseGain.gain.value = 0.008;
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start();

  state.ambient = { context, hum, air, noise, master };
}

function playChime(type = "token") {
  if (!window.AudioContext) {
    return;
  }

  const context = state.ambient?.context || new window.AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.type = "sine";
  oscillator.frequency.value = type === "scan" ? 720 : 560;
  gain.gain.setValueAtTime(0.001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + (type === "scan" ? 0.18 : 0.34));
  oscillator.start();
  oscillator.stop(context.currentTime + (type === "scan" ? 0.2 : 0.36));
}

function setSceneStatus(status, mode = "idle") {
  els.sceneStatus.textContent = status;
  updateOfficerPortrait(mode);
}

function setupRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    setCaptureStatus("Speech recognition unavailable. Type and press Enter.");
    return;
  }

  const recognition = new Recognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let combined = "";
    for (let index = 0; index < event.results.length; index += 1) {
      combined += event.results[index][0].transcript;
    }
    const transcript = combined.trim();
    els.responseInput.value = transcript;
    els.dictationPreview.textContent = transcript ? `Heard: ${transcript}` : "";
    scheduleSpeechSubmit();
  };

  recognition.onerror = () => {
    setCaptureStatus("Speech capture unstable. You can still type and press Enter.");
  };

  recognition.onspeechend = () => {
    if (state.recognitionActive) {
      try {
        recognition.stop();
      } catch {
        // noop
      }
    }
  };

  recognition.onend = () => {
    state.recognitionActive = false;
    if (state.awaitingResponse && els.responseInput.value.trim()) {
      handleSubmitResponse();
      return;
    }
    if (state.shouldAutoListen && state.awaitingResponse) {
      setCaptureStatus("Listening timed out. Speak again or type below.");
    }
  };

  state.recognition = recognition;
}

function scheduleSpeechSubmit() {
  if (state.speechSubmitTimer) {
    clearTimeout(state.speechSubmitTimer);
  }

  state.speechSubmitTimer = window.setTimeout(() => {
    if (state.awaitingResponse && els.responseInput.value.trim()) {
      handleSubmitResponse();
    }
  }, 1100);
}

async function primeRecognition() {
  if (!state.recognition || state.recognitionPrimed) {
    return;
  }

  try {
    state.recognition.start();
    state.recognitionActive = true;
    await sleep(220);
    state.recognitionPrimed = true;
    state.recognition.stop();
  } catch {
    state.recognitionPrimed = false;
  }
}

function startRecognition() {
  if (!state.recognition || state.recognitionActive || !state.awaitingResponse) {
    return;
  }

  els.dictationPreview.textContent = "Listening...";
  try {
    state.recognition.start();
    state.recognitionActive = true;
    setCaptureStatus("Listening. Stop speaking and it will send automatically.");
  } catch {
    setCaptureStatus("Speech capture did not start. Type and press Enter.");
  }
}

function stopRecognition() {
  state.shouldAutoListen = false;
  if (state.speechSubmitTimer) {
    clearTimeout(state.speechSubmitTimer);
    state.speechSubmitTimer = null;
  }
  if (state.recognition && state.recognitionActive) {
    try {
      state.recognition.stop();
    } catch {
      // noop
    }
  }
}

async function runPrelude() {
  setPhase("prelude");
  els.preludeOverlay.classList.remove("hidden");
  els.preludeToken.textContent = state.session.tokenNumber;
  els.preludeMessage.textContent = `Token ${state.session.tokenNumber}. Proceed to window three.`;
  els.tokenDisplay.textContent = state.session.tokenNumber;
  playChime("token");
  setSceneStatus("Queue", "idle");
  await sleep(1300);

  els.preludeMessage.textContent = "Place four fingers on scanner.";
  els.fingerprintScanner.classList.add("is-active");
  playChime("scan");
  await sleep(1500);

  els.fingerprintScanner.classList.remove("is-active");
  els.preludeMessage.textContent = "Wait for the officer.";
  setSceneStatus("Reviewing", "stare");
  await sleep(3200 + Math.random() * 8200);

  els.preludeOverlay.classList.add("hidden");
}

function computeOfficerDelay(kind = "question") {
  if (!state.session) {
    return 1200;
  }

  const strictness = state.session.officer.strictness;
  const patience = state.session.officer.patience;
  const base = kind === "reaction" ? 420 : 1200;
  const spread = kind === "reaction" ? 460 : 980;
  return base + strictness * 760 + (1 - patience) * 680 + Math.random() * spread;
}

async function askNextQuestion(overrideTopic = null) {
  const question = issueNextQuestion(state.session, overrideTopic);
  setPhase("interview");
  state.awaitingResponse = false;
  els.responseInput.value = "";
  els.dictationPreview.textContent = "";
  setSceneStatus("Reviewing", chance(state.session.officer.typingFrequency) ? "typing" : "stare");
  setCaptureStatus("Wait.");
  await sleep(computeOfficerDelay("question"));
  setSceneStatus("Speaking", "idle");
  await speakOfficer(question.text);
  setSceneStatus(
    chance(state.session.officer.typingFrequency * 0.8) ? "Typing" : "Listening",
    chance(state.session.officer.typingFrequency) ? "typing" : "stare"
  );
  state.awaitingResponse = true;
  state.responseStartedAt = performance.now();
  state.shouldAutoListen = true;
  startRecognition();
}

async function deliverReaction(reaction) {
  if (!reaction?.text) {
    return;
  }

  setSceneStatus("Reviewing", reaction.mode || "stare");
  await sleep(computeOfficerDelay("reaction"));
  await speakOfficer(reaction.text);
}

async function deliverDecision() {
  stopRecognition();
  setPhase("decision");
  setSceneStatus("Typing", "typing");

  if (chance(ACTIVE_MODEL.interactionProbabilities.silentTypingBeforeDecisionProbability)) {
    await sleep(3000 + Math.random() * 7000);
  }

  finalizeSession(state.session);
  setSceneStatus("Decision", "stare");
  await speakOfficer(state.session.decision.phrase);
  els.passportCard.classList.remove("is-returned", "is-kept");
  els.passportCard.classList.add(
    state.session.decision.passportAction === "kept" ? "is-kept" : "is-returned"
  );
  await sleep(900);
  renderReport();
}

async function handleSubmitResponse() {
  if (!state.session || !state.awaitingResponse) {
    return;
  }

  const answerText = els.responseInput.value.trim();
  if (!answerText) {
    return;
  }

  state.awaitingResponse = false;
  stopRecognition();
  setDialogue("You", answerText);
  els.dictationPreview.textContent = `Sent: ${answerText}`;
  setCaptureStatus("Processing response.");

  const responseEndedAt = performance.now();
  const mediaMetrics = state.mediaMonitor?.getMetricsBetween(
    state.responseStartedAt,
    responseEndedAt
  );
  const outcome = processAnswer(
    state.session,
    answerText,
    state.responseStartedAt,
    responseEndedAt,
    mediaMetrics
  );

  els.responseInput.value = "";

  if (outcome.interruptionText) {
    setSceneStatus("Interrupting", "lean");
    await sleep(360);
    await speakOfficer(outcome.interruptionText);
  }

  await deliverReaction(outcome.reaction);

  if (outcome.shouldFinalize) {
    await deliverDecision();
    return;
  }

  await askNextQuestion(outcome.nextTopicOverride || null);
}

function renderRiskBar(label, value) {
  return `
    <div class="risk-row">
      <span>${label}</span>
      <div class="risk-row__bar"><i style="width:${Math.round(value * 100)}%"></i></div>
      <strong>${Math.round(value * 100)}%</strong>
    </div>
  `;
}

function renderTrendChart(points) {
  if (!points.length) {
    return "<p>Not enough behavioral signal captured.</p>";
  }

  const width = 420;
  const height = 140;
  const maxX = points[points.length - 1].timestamp || 1;
  const polyline = points
    .map((point) => {
      const x = (point.timestamp / maxX) * width;
      const y = height - point.nervousness * (height - 16) - 8;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="140" aria-hidden="true">
      <path d="M0 ${height - 8} H${width}" stroke="rgba(255,255,255,0.18)" stroke-width="1"></path>
      <polyline points="${polyline}" fill="none" stroke="#d4f0dd" stroke-width="3"></polyline>
    </svg>
  `;
}

function renderReport() {
  const report = buildReport(state.session);
  setPhase("report");

  const moments = report.moments
    .slice(0, 8)
    .map(
      (moment) => `
        <div class="moment-row">
          <strong>${moment.timestamp}</strong>
          <span>${escapeHtml(moment.label)}</span>
          <p>${escapeHtml(moment.detail)}</p>
        </div>
      `
    )
    .join("");

  const transcript = report.transcript
    .map(
      (turn) => `
        <div class="transcript-row">
          <span class="transcript-row__time">${turn.clock}</span>
          <span class="transcript-row__role">${turn.role === "officer" ? "Officer" : "You"}</span>
          <p>${escapeHtml(turn.text)}</p>
        </div>
      `
    )
    .join("");

  const recommendations = report.recommendations
    .map(
      (item) => `
        <div class="recommendation-row">
          <p>${escapeHtml(item.prompt)}</p>
          <strong>${escapeHtml(item.suggestion)}</strong>
        </div>
      `
    )
    .join("");

  els.reportContent.innerHTML = `
    <div class="report-grid">
      <div class="report-card">
        <span class="eyebrow">Outcome</span>
        <h3>${state.session.decision.approved ? "Approved" : "Refused under 214(b)"}</h3>
        <p>Approval estimate: <strong>${Math.round(report.approvalProbability * 100)}%</strong></p>
        <p>Duration: <strong>${formatElapsed(report.totalDurationSeconds)}</strong></p>
      </div>

      <div class="report-card">
        <span class="eyebrow">Risk Breakdown</span>
        ${renderRiskBar("Immigrant intent", report.immigrantIntentRisk)}
        ${renderRiskBar("Financial", report.financialCredibilityRisk)}
        ${renderRiskBar("Consistency", 1 - report.consistencyIntegrityScore)}
      </div>

      <div class="report-card">
        <span class="eyebrow">Behavior</span>
        <p>Confidence index: <strong>${Math.round(report.confidenceIndex * 100)}%</strong></p>
        <p>Conciseness index: <strong>${Math.round(report.concisenessIndex * 100)}%</strong></p>
        <p>Total imported records: <strong>${GENERATED_CORPUS_SUMMARY.totalRecords || "--"}</strong></p>
      </div>
    </div>

    <div class="report-card">
      <span class="eyebrow">Nervousness Trend</span>
      ${renderTrendChart(report.nervousnessTrend)}
    </div>

    <details class="report-details" open>
      <summary>Micro analysis</summary>
      <div class="moment-list">${moments || "<p>No major spikes recorded.</p>"}</div>
    </details>

    <details class="report-details">
      <summary>Embassy-style rewrites</summary>
      <div class="recommendation-list">${recommendations || "<p>No rewrite blocks generated.</p>"}</div>
    </details>

    <details class="report-details">
      <summary>Full transcript</summary>
      <div class="transcript-list">${transcript}</div>
    </details>
  `;

  els.reportOverlay.classList.remove("hidden");
}

async function startInterview() {
  els.startButton.disabled = true;
  els.startStatus.textContent = "Starting.";

  createAmbientAudio();
  await ensureMediaPermissions();
  await primeRecognition();

  const officerId = resolveOfficerId();
  state.activeOfficerId = officerId;
  state.session = createSession(normalizeCaseFile(), officerId);

  els.introScreen.classList.add("hidden");
  els.interviewScreen.classList.remove("hidden");
  els.reportOverlay.classList.add("hidden");
  els.passportCard.classList.remove("is-returned", "is-kept");
  els.tokenDisplay.textContent = state.session.tokenNumber;
  updateOfficerPortrait("idle");
  setDialogue("Officer", "Wait.");
  els.dictationPreview.textContent = "";
  setCaptureStatus("Stand by.");

  await runPrelude();
  await askNextQuestion();

  els.startButton.disabled = false;
  els.startStatus.textContent =
    "Camera and microphone will be requested once. If they fail, typed responses still work.";
}

function bindEvents() {
  els.startButton.addEventListener("click", () => {
    startInterview();
  });

  els.submitButton.addEventListener("click", () => {
    handleSubmitResponse();
  });

  els.responseInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmitResponse();
    }
  });

  els.restartButton.addEventListener("click", () => {
    window.location.reload();
  });

  if (window.speechSynthesis?.addEventListener) {
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
  }
}

function startClock() {
  const tick = () => {
    if (state.session && ["interview", "decision", "report"].includes(state.phase)) {
      const elapsed =
        ((state.session.finishedAt || performance.now()) - state.session.startedAt) / 1000;
      els.clockDisplay.textContent = formatElapsed(elapsed);
    } else {
      const now = new Date();
      els.clockDisplay.textContent = `${String(now.getHours()).padStart(2, "0")}:${String(
        now.getMinutes()
      ).padStart(2, "0")}`;
    }
    requestAnimationFrame(tick);
  };
  tick();
}

renderOfficerCards();
setupRecognition();
loadVoices();
bindEvents();
startClock();
setDialogue("Officer", "Add your details if you want, then start.");
setCaptureStatus("Waiting to begin.");
