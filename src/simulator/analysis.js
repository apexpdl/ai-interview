const FILLER_PATTERN = /\b(uh|um|erm|like|actually|you know|basically|sort of|kind of)\b/gi;
const MONEY_PATTERN = /\$?\s?(\d{1,3}(?:[,\d]{0,9})(?:\.\d+)?)\s*(k|m|lakhs?|thousand|million)?/gi;
const YEAR_PATTERN = /\b(19|20)\d{2}\b/g;
const RELATIVE_PATTERN = /\b(brother|sister|uncle|aunt|cousin|father|mother|husband|wife|fiance|fiancée|spouse)\b/i;
const STATUS_PATTERN = /\b(citizen|green card|permanent resident|f-1|h1b|h-1b|b1\/b2|visitor|student|asylum|opt|cpt)\b/i;
const JOB_PATTERN = /\b(engineer|developer|manager|analyst|consultant|teacher|lecturer|researcher|officer|designer|intern|accountant)\b/i;
const RETURN_PATTERN = /\b(return|come back|go back|back in nepal|in nepal|after graduation|after my studies|after the program)\b/i;
const RISKY_STAY_PATTERN = /\b(stay in the u\.?s\.?|settle|settlement|permanent|move there|live there)\b/i;
const LIQUIDATE_PATTERN = /\b(sell land|sell property|liquidate|dispose of land)\b/i;

function toWords(text) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeMoney(raw, unit) {
  const amount = Number(raw.replace(/,/g, ""));
  const normalizedUnit = (unit || "").toLowerCase();

  if (normalizedUnit.startsWith("lakh")) {
    return amount * 100000;
  }

  if (normalizedUnit === "k" || normalizedUnit === "thousand") {
    return amount * 1000;
  }

  if (normalizedUnit === "m" || normalizedUnit === "million") {
    return amount * 1000000;
  }

  return amount;
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

export function analyzeTextResponse(text, responseSeconds) {
  const words = toWords(text);
  const fillers = text.match(FILLER_PATTERN) || [];
  const speakingRate = responseSeconds > 0 ? words.length / responseSeconds : words.length;
  const fillerRatio = words.length ? fillers.length / words.length : 0;
  const longAnswer = words.length > 44;
  const concise = words.length >= 4 && words.length <= 24;
  const hesitationClusters =
    (text.match(/\.{3,}|,\s*,|\b(uh|um)\b.*\b(uh|um)\b/gi) || []).length +
    (fillers.length >= 3 ? 1 : 0);
  const directness = Math.max(
    0,
    Math.min(1, 1 - fillerRatio - (longAnswer ? 0.22 : 0) - Math.max(0, speakingRate - 3.8) * 0.05)
  );

  return {
    wordCount: words.length,
    fillers: fillers.length,
    fillerRatio: Number(fillerRatio.toFixed(3)),
    speakingRate: Number(speakingRate.toFixed(2)),
    hesitationClusters,
    longAnswer,
    concise,
    directness: Number(directness.toFixed(3))
  };
}

export function extractFacts(text, questionTopic, caseFile) {
  const facts = [];
  const lower = text.toLowerCase();
  const years = [...text.matchAll(YEAR_PATTERN)].map((match) => match[0]);
  const moneyMentions = [...text.matchAll(MONEY_PATTERN)].map((match) =>
    normalizeMoney(match[1], match[2])
  );
  const relative = text.match(RELATIVE_PATTERN)?.[1];
  const status = text.match(STATUS_PATTERN)?.[1];
  const job = text.match(JOB_PATTERN)?.[1];

  if (questionTopic === "academics" && caseFile.school) {
    facts.push({ key: "school", value: caseFile.school, confidence: 0.55 });
  }

  if (questionTopic === "funding") {
    facts.push({ key: "fundingSource", value: text, confidence: 0.75 });
  }

  if (questionTopic === "intent" || RETURN_PATTERN.test(lower)) {
    facts.push({ key: "returnPlan", value: text, confidence: 0.7 });
  }

  if (questionTopic === "gaps") {
    facts.push({ key: "gapExplanation", value: text, confidence: 0.8 });
  }

  if (questionTopic === "work" || job) {
    facts.push({ key: "currentOccupation", value: job || text, confidence: 0.7 });
  }

  if (relative) {
    facts.push({ key: "relativeRelation", value: relative.toLowerCase(), confidence: 0.8 });
  }

  if (status) {
    facts.push({ key: "relativeStatus", value: status.toUpperCase(), confidence: 0.82 });
  }

  if (moneyMentions.length) {
    facts.push({ key: "moneyMentions", value: moneyMentions, confidence: 0.8 });
  }

  if (years.length) {
    facts.push({ key: "yearMentions", value: years, confidence: 0.72 });
  }

  if (/\btexas|new york|california|dallas|boston|virginia|ohio|illinois|florida|maryland\b/i.test(lower)) {
    const location = text.match(
      /\b(Texas|New York|California|Dallas|Boston|Virginia|Ohio|Illinois|Florida|Maryland)\b/i
    )?.[0];
    facts.push({ key: "relativeLocation", value: location, confidence: 0.82 });
  }

  facts.push({ key: "answerText", value: text, confidence: 1 });
  return facts;
}

export function detectContradictions(memory, facts, caseFile) {
  const contradictions = [];

  for (const fact of facts) {
    const prior = memory.index.get(fact.key);
    if (!prior) {
      continue;
    }

    if (fact.key === "relativeRelation" && prior.value !== fact.value) {
      contradictions.push({
        key: fact.key,
        previous: prior.value,
        current: fact.value,
        severity: 0.4
      });
    }

    if (fact.key === "relativeStatus" && prior.value !== fact.value) {
      contradictions.push({
        key: fact.key,
        previous: prior.value,
        current: fact.value,
        severity: 0.6
      });
    }

    if (fact.key === "moneyMentions") {
      const previousAmount = prior.value?.[0];
      const currentAmount = fact.value?.[0];
      if (previousAmount && currentAmount) {
        const delta = Math.abs(previousAmount - currentAmount) / Math.max(previousAmount, 1);
        if (delta > 0.3) {
          contradictions.push({
            key: fact.key,
            previous: previousAmount,
            current: currentAmount,
            severity: 0.55
          });
        }
      }
    }
  }

  if (caseFile.relativesInUs && /no one|nobody|none/i.test(facts.find((fact) => fact.key === "answerText")?.value || "")) {
    contradictions.push({
      key: "relativesInUs",
      previous: caseFile.relativesInUs,
      current: "denied",
      severity: 0.7
    });
  }

  if (caseFile.fundingSource && /i will sell|sell property|liquidate/i.test(facts.find((fact) => fact.key === "answerText")?.value || "")) {
    contradictions.push({
      key: "fundingSource",
      previous: caseFile.fundingSource,
      current: "liquidation",
      severity: 0.62
    });
  }

  return contradictions;
}

export function computeBehaviorScores(textAnalysis, mediaMetrics) {
  const eyeContact = mediaMetrics?.eyeContactStability ?? 0.52;
  const voiceSteadiness = mediaMetrics?.voiceSteadiness ?? 0.5;
  const posture = mediaMetrics?.postureStability ?? 0.53;
  const conciseness = textAnalysis.concise ? 0.82 : textAnalysis.longAnswer ? 0.36 : 0.58;

  const nervousness = Math.max(
    0,
    Math.min(
      1,
      0.42 +
        textAnalysis.fillerRatio * 2.8 +
        Math.max(0, textAnalysis.speakingRate - 3.6) * 0.08 +
        textAnalysis.hesitationClusters * 0.11 +
        (1 - eyeContact) * 0.18 +
        (1 - voiceSteadiness) * 0.2 +
        (1 - posture) * 0.12 +
        (textAnalysis.longAnswer ? 0.09 : 0)
    )
  );

  const confidence = Math.max(
    0,
    Math.min(
      1,
      textAnalysis.directness * 0.42 +
        eyeContact * 0.16 +
        voiceSteadiness * 0.19 +
        posture * 0.12 +
        conciseness * 0.11
    )
  );

  return {
    eyeContact,
    voiceSteadiness,
    postureStability: posture,
    nervousness: Number(nervousness.toFixed(3)),
    confidence: Number(confidence.toFixed(3)),
    conciseness: Number(conciseness.toFixed(3))
  };
}

export function generateMicroAnalysis({
  elapsedSeconds,
  textAnalysis,
  behavior,
  contradictions,
  questionTopic,
  answerText
}) {
  const entries = [];
  const timestamp = formatElapsed(elapsedSeconds);

  if (behavior.nervousness >= 0.7) {
    entries.push({
      timestamp,
      label: "High-risk answer",
      detail: "Elevated tension signals and reduced verbal stability."
    });
  }

  if (textAnalysis.longAnswer) {
    entries.push({
      timestamp,
      label: "Neutral but vulnerable",
      detail: "Over-explanation pattern detected."
    });
  }

  if (textAnalysis.concise && behavior.confidence >= 0.68) {
    entries.push({
      timestamp,
      label: "Strong anchor answer",
      detail: "Direct answer with stable delivery."
    });
  }

  if (contradictions.length) {
    entries.push({
      timestamp,
      label: "High-risk answer",
      detail: `Consistency issue detected around ${contradictions[0].key}.`
    });
  }

  if (questionTopic === "funding" && /\bloan|borrow|sell|property\b/i.test(answerText)) {
    entries.push({
      timestamp,
      label: "High-risk answer",
      detail: "Funding explanation introduced fragility or asset liquidation language."
    });
  }

  return entries;
}

export function formatElapsed(seconds) {
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(Math.floor(seconds % 60)).padStart(2, "0");
  return `${mins}:${secs}`;
}

export function answerRiskSignals(answerText) {
  return {
    stayIntent: RISKY_STAY_PATTERN.test(answerText),
    liquidation: LIQUIDATE_PATTERN.test(answerText),
    weakReturn: !RETURN_PATTERN.test(answerText),
    mentionsRelatives: RELATIVE_PATTERN.test(answerText)
  };
}

export function shortSuggestion(questionTopic, caseFile) {
  switch (questionTopic) {
    case "funding":
      return "State the sponsor, job title, annual income, and available funds in one line.";
    case "relatives":
      return "Disclose the relative and status directly, then stop.";
    case "intent":
      return `Name a specific Nepal-based role tied to ${caseFile.major || "the program"}.`;
    case "gaps":
      return "Give dates, activity, and outcome. Do not narrate around it.";
    default:
      return "Answer in one or two concrete sentences and stop.";
  }
}
