import { ACTIVE_MODEL } from "../data/generatedModel.js";
import {
  analyzeTextResponse,
  answerRiskSignals,
  computeBehaviorScores,
  detectContradictions,
  extractFacts,
  formatElapsed,
  generateMicroAnalysis,
  shortSuggestion
} from "./analysis.js";
import { buildContextualQuestion, buildRevisitQuestion, openingQuestion } from "./questions.js";

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function sampleNormal(mean, spread) {
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * spread;
}

function sampleBetween(min, max) {
  return min + Math.random() * (max - min);
}

function weightedPick(entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let threshold = Math.random() * total;
  for (const entry of entries) {
    threshold -= entry.weight;
    if (threshold <= 0) {
      return entry.value;
    }
  }
  return entries[entries.length - 1]?.value;
}

function chance(rate) {
  return Math.random() < rate;
}

function sampleTargetDuration(model) {
  const dist = model.distributions.interviewDurationSeconds;
  const random = Math.random();
  if (random < dist.underTwoMinutesProbability) {
    return sampleBetween(dist.min, Math.min(120, dist.p75));
  }
  return sampleBetween(Math.max(95, dist.p25 || dist.min), dist.p90);
}

function sampleTargetQuestions(model) {
  const dist = model.distributions.questionCount;
  if (Math.random() < 0.25) {
    return Math.round(sampleBetween(dist.min, dist.median + 1));
  }
  return Math.round(sampleBetween(dist.median, dist.p90 + 1));
}

export const OFFICER_APPEARANCES = [
  {
    id: "bald-jacked",
    label: "Bald VO",
    voiceHint: "male",
    timbre: 0.34,
    typingBias: 0.68,
    expressionBias: 0.62,
    features: {
      skin: "#c89473",
      hair: "#1c1b1c",
      tie: "#24395f",
      jawScale: 1.08,
      browTilt: 5,
      lipCurve: -1,
      bodyScale: 1.12,
      shoulderScale: 1.16,
      hairStyle: "bald",
      beardStyle: "clean",
      glasses: false,
      faceWidth: 1.04,
      bodyTone: "#2c3642"
    }
  },
  {
    id: "balding-thin",
    label: "Bald VO 2",
    voiceHint: "male",
    timbre: 0.39,
    typingBias: 0.54,
    expressionBias: 0.51,
    features: {
      skin: "#d0ab8b",
      hair: "#5d5b58",
      tie: "#4d2f17",
      jawScale: 0.96,
      browTilt: 2,
      lipCurve: 0,
      bodyScale: 0.94,
      shoulderScale: 0.9,
      hairStyle: "balding",
      beardStyle: "clean",
      glasses: false,
      faceWidth: 0.94,
      bodyTone: "#2b3239"
    }
  },
  {
    id: "american-lady",
    label: "Lady VO",
    voiceHint: "female",
    timbre: 0.57,
    typingBias: 0.5,
    expressionBias: 0.56,
    features: {
      skin: "#e4c3ad",
      hair: "#75513f",
      tie: "#4d2338",
      jawScale: 1.02,
      browTilt: 1,
      lipCurve: 2,
      bodyScale: 1.12,
      shoulderScale: 1.08,
      hairStyle: "lady",
      beardStyle: "clean",
      glasses: false,
      faceWidth: 1.08,
      bodyTone: "#3a4351"
    }
  },
  {
    id: "young-indian",
    label: "Young Indian VO",
    voiceHint: "male",
    timbre: 0.44,
    typingBias: 0.61,
    expressionBias: 0.48,
    features: {
      skin: "#b9825d",
      hair: "#171514",
      tie: "#203651",
      jawScale: 0.98,
      browTilt: 0,
      lipCurve: 1,
      bodyScale: 0.98,
      shoulderScale: 0.96,
      hairStyle: "short",
      beardStyle: "subtle",
      glasses: false,
      faceWidth: 0.96,
      bodyTone: "#2d3640"
    }
  },
  {
    id: "old-indian",
    label: "Old Indian VO",
    voiceHint: "male",
    timbre: 0.31,
    typingBias: 0.46,
    expressionBias: 0.66,
    features: {
      skin: "#aa7655",
      hair: "#6a665d",
      tie: "#3d2e20",
      jawScale: 1.01,
      browTilt: 4,
      lipCurve: -1,
      bodyScale: 1.02,
      shoulderScale: 1.0,
      hairStyle: "older",
      beardStyle: "moustache",
      glasses: false,
      faceWidth: 1.0,
      bodyTone: "#2f353c"
    }
  },
  {
    id: "round-glasses",
    label: "Round Glasses VO",
    voiceHint: "male",
    timbre: 0.49,
    typingBias: 0.57,
    expressionBias: 0.43,
    features: {
      skin: "#d5b396",
      hair: "#2a241d",
      tie: "#263d60",
      jawScale: 0.94,
      browTilt: -1,
      lipCurve: 2,
      bodyScale: 0.95,
      shoulderScale: 0.92,
      hairStyle: "messy",
      beardStyle: "clean",
      glasses: true,
      faceWidth: 0.92,
      bodyTone: "#323944"
    }
  }
];

function createOfficerState(appearance) {
  const priors = ACTIVE_MODEL.officerPriors;
  return {
    appearance,
    strictness: clamp(sampleNormal(priors.strictnessMean, priors.strictnessSpread)),
    patience: clamp(sampleNormal(priors.patienceMean, 0.16)),
    interruptLikelihood: clamp(sampleNormal(priors.interruptMean, 0.14) + (appearance.expressionBias - 0.5) * 0.15),
    followUpDepth: clamp(sampleNormal(priors.followUpDepthMean, 0.18)),
    approvalThresholdVariability: clamp(sampleNormal(priors.approvalThresholdVariability, 0.08)),
    typingFrequency: clamp(sampleNormal(priors.typingFrequencyMean, 0.16) + (appearance.typingBias - 0.5) * 0.2),
    eyeContactFrequency: clamp(sampleNormal(priors.eyeContactMean, 0.15)),
    energyLevel: clamp(sampleNormal(priors.energyMean, 0.14))
  };
}

function initialMemory() {
  return {
    index: new Map(),
    history: []
  };
}

function createRiskState() {
  return {
    immigrantIntent: 0.34,
    financialCredibility: 0.31,
    consistency: 0.18,
    behavioralConfidence: 0.52
  };
}

function nextTopic(session) {
  const asked = session.topicsAsked;
  const caseFile = session.caseFile;
  const questionBudgetPressure = session.questionsAsked / Math.max(1, session.targetQuestionCount);
  const revisitRate = ACTIVE_MODEL.interactionProbabilities.revisitEarlierAnswerProbability;

  if (session.questionsAsked === 0) {
    return "opening";
  }

  if (chance(revisitRate + session.officer.followUpDepth * 0.1) && session.memory.history.length > 2) {
    return "revisit";
  }

  const topicWeights = [
    {
      value: "academics",
      weight: asked.academics ? 0.6 : 1.2
    },
    {
      value: "funding",
      weight:
        (caseFile.fundingSource ? 1.05 : 0.58) +
        session.risk.financialCredibility * 1.2 +
        (asked.funding ? 0.2 : 0.45)
    },
    {
      value: "relatives",
      weight:
        (caseFile.relativesInUs ? 0.95 : 0.24) +
        session.risk.immigrantIntent * 0.95 +
        (asked.relatives ? 0.18 : 0.4)
    },
    {
      value: "intent",
      weight:
        1.2 +
        session.risk.immigrantIntent * 1.1 +
        (asked.intent ? 0.42 : 0.7) +
        questionBudgetPressure * 0.4
    },
    {
      value: "work",
      weight: (caseFile.currentOccupation ? 0.95 : 0.28) + (asked.work ? 0.2 : 0.45)
    },
    {
      value: "gaps",
      weight:
        (caseFile.gapExplanation ? 0.98 : 0.2) +
        (session.caseFile.degreeLevel !== "bachelors" ? 0.16 : 0) +
        (asked.gaps ? 0.16 : 0.5)
    },
    {
      value: "credibility",
      weight:
        0.35 +
        session.risk.financialCredibility * 0.35 +
        session.risk.consistency * 0.5 +
        (asked.credibility ? 0.12 : 0.24)
    }
  ];

  return weightedPick(topicWeights);
}

function buildQuestion(topic, session) {
  if (topic === "opening") {
    return openingQuestion(session);
  }

  if (topic === "revisit") {
    return buildRevisitQuestion(session) || buildContextualQuestion("intent", session);
  }

  return buildContextualQuestion(topic, session);
}

function strongScholarship(caseFile) {
  const scholarshipText = `${caseFile.scholarship || ""} ${caseFile.coa || ""}`.toLowerCase();
  return /full ride|full scholarship|100%|fully funded|assistantship|full funding/.test(
    scholarshipText
  );
}

function openingRemark(session) {
  const { caseFile } = session;

  if (strongScholarship(caseFile)) {
    return chance(0.5) ? "Full ride?" : "Fully funded?";
  }

  if (caseFile.school) {
    const shortSchool = caseFile.school.split(",")[0].slice(0, 42).trim();
    if (shortSchool) {
      return chance(0.5) ? `Okay. ${shortSchool}.` : `Alright. ${shortSchool}.`;
    }
  }

  return "Student visa.";
}

function deriveImmediateTopic(session, facts, contradictions, textAnalysis) {
  const keys = new Set(facts.map((fact) => fact.key));

  if (session.lastQuestion?.topic === "opening") {
    return session.caseFile.school ? "academics" : session.caseFile.coa ? "funding" : "academics";
  }

  if (contradictions.length) {
    return "revisit";
  }

  if (session.lastQuestion?.topic === "funding") {
    if (!keys.has("moneyMentions") || textAnalysis.wordCount < 4) {
      return "funding";
    }
  }

  if (keys.has("relativeRelation") && !keys.has("relativeStatus")) {
    return "relatives";
  }

  if (session.lastQuestion?.topic === "academics" && !keys.has("school")) {
    return "academics";
  }

  if (session.lastQuestion?.topic === "intent" && !keys.has("returnPlan")) {
    return "intent";
  }

  return null;
}

function deriveOfficerReaction(session, textAnalysis, behavior, contradictions, signals, facts) {
  const answerText = facts.find((fact) => fact.key === "answerText")?.value || "";

  if (session.lastQuestion?.topic === "opening") {
    if (/\b(hello|hi|good morning|good afternoon|here you go|sure|yes officer)\b/i.test(answerText)) {
      return {
        text: openingRemark(session),
        mode: "typing"
      };
    }

    return {
      text: openingRemark(session),
      mode: "typing"
    };
  }

  if (contradictions.length) {
    return {
      text: chance(0.5) ? "Hold on." : "That doesn't line up.",
      mode: "skeptical"
    };
  }

  if (signals.stayIntent || /sell property|liquidate|ready to stay/i.test(answerText)) {
    return {
      text: "Hmm.",
      mode: "skeptical"
    };
  }

  if (signals.mentionsRelatives && chance(0.34)) {
    return {
      text: "I see.",
      mode: "stare"
    };
  }

  if (/\b(joke|funny|haha|laugh)\b/i.test(answerText) && chance(0.35)) {
    return {
      text: "Alright.",
      mode: "smirk"
    };
  }

  if (behavior.nervousness > 0.76 && chance(0.3)) {
    return {
      text: "Take a second.",
      mode: "stare"
    };
  }

  if (
    session.lastQuestion?.topic === "funding" &&
    !facts.some((fact) => fact.key === "moneyMentions") &&
    chance(0.5)
  ) {
    return {
      text: "How much exactly?",
      mode: "lean"
    };
  }

  return null;
}

function storeFacts(memory, facts, timestamp) {
  for (const fact of facts) {
    memory.history.push({ ...fact, timestamp });
    if (fact.key === "answerText") {
      continue;
    }
    memory.index.set(fact.key, { ...fact, timestamp });
  }
}

function adjustOfficer(session, behavior, contradictions) {
  const tension = behavior.nervousness;
  const contradictionImpact = contradictions.reduce((sum, item) => sum + item.severity, 0);
  const drift = sampleNormal(0, 0.035);

  session.officer.strictness = clamp(session.officer.strictness + tension * 0.06 + contradictionImpact * 0.08 + drift);
  session.officer.patience = clamp(session.officer.patience - tension * 0.08 - contradictionImpact * 0.06 + drift);
  session.officer.interruptLikelihood = clamp(
    session.officer.interruptLikelihood + tension * 0.09 + contradictionImpact * 0.08
  );
  session.officer.followUpDepth = clamp(
    session.officer.followUpDepth + contradictionImpact * 0.1 + (behavior.confidence < 0.48 ? 0.05 : -0.03)
  );
  session.officer.energyLevel = clamp(session.officer.energyLevel + drift * 1.8);
}

function updateRiskState(session, textAnalysis, behavior, contradictions, signals, answerText) {
  const current = session.risk;
  const longAnswerPenalty = textAnalysis.longAnswer ? 0.06 : 0;
  const contradictionPenalty = contradictions.reduce((sum, item) => sum + item.severity, 0);
  const relativePenalty = signals.mentionsRelatives && session.caseFile.relativesInUs ? 0.08 : 0;

  current.immigrantIntent = clamp(
    current.immigrantIntent +
      (signals.stayIntent ? 0.24 : 0) +
      (signals.weakReturn && /intent|relatives/.test(session.lastQuestion.topic) ? 0.08 : 0) +
      relativePenalty +
      longAnswerPenalty * 0.5
  );

  current.financialCredibility = clamp(
    current.financialCredibility +
      (/loan|borrow/i.test(answerText) ? 0.06 : 0) +
      (signals.liquidation ? 0.2 : 0) +
      (session.lastQuestion.topic === "funding" && textAnalysis.wordCount < 4 ? 0.06 : 0) +
      contradictionPenalty * 0.2
  );

  current.consistency = clamp(current.consistency + contradictionPenalty * 0.45);
  current.behavioralConfidence = clamp(behavior.confidence);
}

function shouldFinalize(session) {
  if (session.questionsAsked >= session.targetQuestionCount + 1) {
    return true;
  }

  const elapsed = (performance.now() - session.startedAt) / 1000;
  if (elapsed >= session.targetDurationSeconds * 0.92 && session.questionsAsked >= 3) {
    return true;
  }

  if (session.risk.consistency > 0.72 || session.risk.immigrantIntent > 0.86) {
    return true;
  }

  return false;
}

function computeApprovalProbability(session) {
  const randomness = sampleNormal(0, 0.12) + sampleNormal(0, session.officer.approvalThresholdVariability * 0.08);
  const score =
    1.18 -
    session.risk.immigrantIntent * 1.34 -
    session.risk.financialCredibility * 1.08 -
    session.risk.consistency * 1.22 +
    session.risk.behavioralConfidence * 0.78 -
    session.officer.strictness * 0.74 +
    randomness;

  return clamp(1 / (1 + Math.exp(-score)));
}

export function createSession(caseFile, appearanceId) {
  const appearance =
    OFFICER_APPEARANCES.find((item) => item.id === appearanceId) || OFFICER_APPEARANCES[0];
  return {
    id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    createdAt: new Date().toISOString(),
    tokenNumber: 100 + Math.floor(Math.random() * 899),
    caseFile,
    officer: createOfficerState(appearance),
    memory: initialMemory(),
    risk: createRiskState(),
    transcript: [],
    reportMoments: [],
    nervousnessTrend: [],
    topicsAsked: {},
    targetDurationSeconds: Math.round(sampleTargetDuration(ACTIVE_MODEL)),
    targetQuestionCount: sampleTargetQuestions(ACTIVE_MODEL),
    questionsAsked: 0,
    startedAt: performance.now(),
    finishedAt: null,
    decision: null,
    lastQuestion: null
  };
}

export function issueNextQuestion(session, overrideTopic = null) {
  const topic = overrideTopic || nextTopic(session);
  const text = buildQuestion(topic, session);
  session.lastQuestion = { topic, text, issuedAt: performance.now() };
  session.questionsAsked += 1;
  session.topicsAsked[topic] = (session.topicsAsked[topic] || 0) + 1;
  session.transcript.push({
    role: "officer",
    text,
    topic,
    timestampSeconds: (performance.now() - session.startedAt) / 1000
  });
  return session.lastQuestion;
}

export function processAnswer(session, answerText, responseStartedAt, responseEndedAt, mediaMetrics) {
  const responseSeconds = Math.max(0.8, (responseEndedAt - responseStartedAt) / 1000);
  const textAnalysis = analyzeTextResponse(answerText, responseSeconds);
  const behavior = computeBehaviorScores(textAnalysis, mediaMetrics);
  const facts = extractFacts(answerText, session.lastQuestion?.topic || "intent", session.caseFile);
  const contradictions = detectContradictions(session.memory, facts, session.caseFile);
  const signals = answerRiskSignals(answerText);

  updateRiskState(session, textAnalysis, behavior, contradictions, signals, answerText);
  storeFacts(session.memory, facts, (responseEndedAt - session.startedAt) / 1000);
  adjustOfficer(session, behavior, contradictions);

  session.nervousnessTrend.push({
    timestamp: (responseEndedAt - session.startedAt) / 1000,
    nervousness: behavior.nervousness
  });

  session.transcript.push({
    role: "applicant",
    text: answerText,
    topic: session.lastQuestion?.topic || "intent",
    timestampSeconds: (responseEndedAt - session.startedAt) / 1000,
    metrics: { ...textAnalysis, ...behavior },
    contradictions
  });

  const microMoments = generateMicroAnalysis({
    elapsedSeconds: (responseEndedAt - session.startedAt) / 1000,
    textAnalysis,
    behavior,
    contradictions,
    questionTopic: session.lastQuestion?.topic || "intent",
    answerText
  });

  session.reportMoments.push(...microMoments);
  const immediateTopic = deriveImmediateTopic(session, facts, contradictions, textAnalysis);
  const reaction = deriveOfficerReaction(
    session,
    textAnalysis,
    behavior,
    contradictions,
    signals,
    facts
  );

  let interruptionText = null;
  if (textAnalysis.longAnswer && chance(session.officer.interruptLikelihood)) {
    interruptionText = chance(0.5) ? "Only answer the question." : "Okay. Stop there.";
    session.transcript.push({
      role: "officer",
      text: interruptionText,
      topic: "clarification",
      timestampSeconds: (responseEndedAt - session.startedAt) / 1000 + 0.2
    });
  } else if (!textAnalysis.concise && chance(0.18 + session.officer.interruptLikelihood * 0.2)) {
    interruptionText = chance(0.5) ? "Sorry?" : "One line.";
    session.transcript.push({
      role: "officer",
      text: interruptionText,
      topic: "clarification",
      timestampSeconds: (responseEndedAt - session.startedAt) / 1000 + 0.2
    });
  }

  return {
    textAnalysis,
    behavior,
    contradictions,
    microMoments,
    reaction,
    nextTopicOverride: immediateTopic,
    interruptionText,
    shouldFinalize: shouldFinalize(session)
  };
}

export function finalizeSession(session) {
  session.finishedAt = performance.now();
  const approvalProbability = computeApprovalProbability(session);
  const approved = approvalProbability >= Math.random();

  session.decision = {
    approved,
    approvalProbability: Number(approvalProbability.toFixed(3)),
    phrase: approved
      ? "Your visa is approved."
      : "I’m sorry. I cannot issue your visa today under Section 214(b).",
    passportAction: approved ? "kept" : "returned"
  };

  session.transcript.push({
    role: "officer",
    text: session.decision.phrase,
    topic: "decision",
    timestampSeconds: (session.finishedAt - session.startedAt) / 1000
  });

  return session.decision;
}

export function buildReport(session) {
  const totalDurationSeconds = ((session.finishedAt || performance.now()) - session.startedAt) / 1000;
  const contradictionCount = session.transcript.reduce(
    (sum, turn) => sum + (turn.contradictions?.length || 0),
    0
  );
  const avgConfidence =
    session.transcript
      .filter((turn) => turn.role === "applicant")
      .reduce((sum, turn) => sum + (turn.metrics?.confidence || 0), 0) /
    Math.max(1, session.transcript.filter((turn) => turn.role === "applicant").length);

  const driftSummary = [
    `Strictness ${Math.round(session.officer.strictness * 100)}%`,
    `Patience ${Math.round(session.officer.patience * 100)}%`,
    `Interrupt ${Math.round(session.officer.interruptLikelihood * 100)}%`,
    `Follow-up depth ${Math.round(session.officer.followUpDepth * 100)}%`
  ];

  const recommendations = session.transcript
    .filter((turn) => turn.role === "applicant")
    .slice(-4)
    .map((turn) => ({
      prompt: turn.text,
      suggestion: shortSuggestion(turn.topic, session.caseFile)
    }));

  return {
    transcript: session.transcript.map((turn) => ({
      ...turn,
      clock: formatElapsed(turn.timestampSeconds)
    })),
    approvalProbability: session.decision?.approvalProbability || 0,
    totalDurationSeconds: Math.round(totalDurationSeconds),
    immigrantIntentRisk: Number(session.risk.immigrantIntent.toFixed(3)),
    financialCredibilityRisk: Number(session.risk.financialCredibility.toFixed(3)),
    consistencyIntegrityScore: Number((1 - session.risk.consistency).toFixed(3)),
    confidenceIndex: Number(avgConfidence.toFixed(3)),
    nervousnessTrend: session.nervousnessTrend,
    concisenessIndex: Number(
      (
        session.transcript
          .filter((turn) => turn.role === "applicant")
          .reduce((sum, turn) => sum + (turn.metrics?.conciseness || 0), 0) /
        Math.max(1, session.transcript.filter((turn) => turn.role === "applicant").length)
      ).toFixed(3)
    ),
    behavioralDriftSummary: driftSummary.join(" | "),
    moments: session.reportMoments,
    contradictionCount,
    recommendations
  };
}
