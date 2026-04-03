const RELEVANCE_PATTERN =
  /\b(visa|interview|214\(b\)|221\(g\)|consulate|embassy|consular|vo:|officer:|approved|rejected|refused)\b/i;
const APPROVED_PATTERN =
  /\b(approved|visa\s+(?:is\s+)?approved|issuing you a visa|issued)\b/i;
const REJECTED_PATTERN =
  /\b(214\(b\)|221\(g\)|refused|refusal|rejected|denied|cannot issue your visa)\b/i;
const FUNDING_PATTERN =
  /\b(sponsor|funding|finance|financial|income|salary|bank balance|loan|assistantship|scholarship|who is paying)\b/i;
const RELATIVE_PATTERN =
  /\b(brother|sister|uncle|aunt|cousin|spouse|wife|husband|fiance|fiancée|anyone in the u\.s\.|relative)\b/i;
const TYPING_PATTERN =
  /\b(typed|typing|started typing|was typing|kept typing)\b/i;
const INTERRUPTION_PATTERN =
  /\b(interrupted|cut me off|stop there|one line|only answer the question|sorry\?)\b/i;
const REVISIT_PATTERN =
  /\b(earlier you said|you said earlier|again asked|asked me again|came back to)\b/i;
const NEUTRAL_TONE_PATTERN =
  /\b(neutral|normal|expressionless|straight face|cold)\b/i;
const COURTEOUS_APPROVAL_PATTERN =
  /\b(congrats|good luck|have a nice day|stay on campus)\b/i;
const UNDER_TWO_MINUTES_PATTERN =
  /\b(under two minutes|within two minutes|less than 2 minutes|59 seconds|one minute|1 minute|2 minutes)\b/i;

const VISA_TYPE_PATTERNS = [
  ["F1", /\b(f-?1|student visa)\b/i],
  ["J1", /\b(j-?1|exchange visa)\b/i],
  ["B1B2", /\b(b1\/b2|b-?1\/b-?2|visitor visa|tourist visa)\b/i],
  ["H1B", /\b(h-?1b)\b/i],
  ["L1", /\b(l-?1)\b/i]
];

const TRIGGER_PATTERNS = [
  ["siblings-in-us", /\b(brother|sister).*\b(u\.s\.|america|citizen|green card|status)\b/i],
  ["immigrant-intent", /\b(stay in the u\.s\.|settle|permanent|move there)\b/i],
  ["weak-research-fit", /\bwhy this university|how did you know this university|research fit\b/i],
  ["masters-rationale", /\bwhy masters|why this degree|why now\b/i],
  ["credibility-risk", /\bnot convinced|credibility|did you prepare this yourself|consultancy\b/i],
  ["gap-years", /\bgap|years after graduation|what were you doing after graduation\b/i],
  ["relative-petition-risk", /\bfiled for|petition|sponsor immigrant\b/i],
  ["financial-fragility", /\bloan|borrow|sell property|liquidate|bank balance\b/i],
  ["social-media-vetting", /\bsocial media\b/i]
];

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function slugify(value) {
  return String(value || "record")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function countMatches(text, pattern) {
  return text.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))?.length || 0;
}

function detectVisaType(text, explicitVisaType) {
  if (explicitVisaType) {
    return explicitVisaType;
  }

  for (const [visaType, pattern] of VISA_TYPE_PATTERNS) {
    if (pattern.test(text)) {
      return visaType;
    }
  }

  return "unknown";
}

function detectOutcome(text, explicitOutcome) {
  if (explicitOutcome) {
    return explicitOutcome;
  }

  const approved = APPROVED_PATTERN.test(text);
  const rejected = REJECTED_PATTERN.test(text);

  if (approved && !rejected) {
    return "approved";
  }

  if (rejected && /221\(g\)/i.test(text)) {
    return "221g";
  }

  if (rejected) {
    return "rejected";
  }

  return "unknown";
}

function inferDurationSeconds(text, explicitDuration) {
  if (Number.isFinite(explicitDuration)) {
    return explicitDuration;
  }

  const secondsMatch = text.match(/\b(\d{1,3})\s*(seconds?|secs?)\b/i);
  if (secondsMatch) {
    return Number(secondsMatch[1]);
  }

  const minutesMatch = text.match(/\b(\d{1,2})\s*(minutes?|mins?)\b/i);
  if (minutesMatch) {
    return Number(minutesMatch[1]) * 60;
  }

  if (UNDER_TWO_MINUTES_PATTERN.test(text)) {
    return 110;
  }

  return 105;
}

function inferQuestionCount(text, explicitCount) {
  if (Number.isFinite(explicitCount)) {
    return explicitCount;
  }

  const officerLineMatches =
    text.match(/^\s*(?:vo|co|officer|consular officer)\s*[:\-]/gim)?.length || 0;
  if (officerLineMatches) {
    return officerLineMatches;
  }

  const questionMarks = text.match(/\?/g)?.length || 0;
  return Math.max(3, Math.min(12, questionMarks || 4));
}

function inferTone(text) {
  if (/\b(sarcastic|skeptical|stern|harsh|sharp)\b/i.test(text)) {
    return "skeptical";
  }

  if (/\b(friendly|smile|calm|soft)\b/i.test(text)) {
    return "friendly-neutral";
  }

  if (NEUTRAL_TONE_PATTERN.test(text)) {
    return "neutral";
  }

  return "neutral";
}

function inferApprovalTone(text, outcome) {
  if (outcome !== "approved") {
    return "n/a";
  }

  if (COURTEOUS_APPROVAL_PATTERN.test(text)) {
    return "courteous";
  }

  return "neutral";
}

function inferTriggers(text, outcome) {
  if (outcome !== "rejected" && outcome !== "221g") {
    return [];
  }

  return TRIGGER_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([id]) => id);
}

function detectMission(text, explicitMission, city, country) {
  if (explicitMission) {
    return explicitMission;
  }

  const missionMatch = text.match(
    /\b(?:u\.?s\.?\s+)?(?:embassy|consulate)\s+(?:in|at)\s+([A-Z][A-Za-z .'-]+?)(?:[\n,.;]|$)/i
  );

  if (missionMatch) {
    return `U.S. Mission ${missionMatch[1].trim()}`;
  }

  if (city && country) {
    return `U.S. Mission ${city}`;
  }

  return "Unknown";
}

function combineTextFragments(fragments) {
  return normalizeWhitespace(fragments.filter(Boolean).join("\n\n"));
}

function normalizeLocationFields(entry = {}) {
  return {
    country: entry.country || entry.location?.country || "Unknown",
    city: entry.city || entry.location?.city || "Unknown"
  };
}

export function inferCanonicalRecord(entry, sourceDefaults = {}) {
  const { country, city } = normalizeLocationFields({
    ...sourceDefaults,
    ...entry
  });

  const text = combineTextFragments([
    entry.title,
    entry.summary,
    entry.selftext,
    entry.body,
    entry.description,
    entry.transcript,
    entry.text,
    entry.content,
    entry.evidenceSummary,
    entry.rawText
  ]);

  const hasCanonicalShape =
    Number.isFinite(entry.durationSeconds) &&
    Number.isFinite(entry.questionCount) &&
    typeof entry.outcome === "string";

  if (!text && hasCanonicalShape) {
    return {
      id:
        entry.id ||
        slugify(
          `${entry.sourceType || sourceDefaults.sourceType || "manual"}-${entry.sourceLabel || "record"}`
        ),
      country,
      city,
      location: entry.location || city,
      mission: entry.mission || detectMission("", sourceDefaults.mission, city, country),
      visaType: entry.visaType || sourceDefaults.visaType || "unknown",
      outcome: entry.outcome,
      durationSeconds: entry.durationSeconds,
      durationConfidence: entry.durationConfidence ?? 0.6,
      questionCount: entry.questionCount,
      fundingFollowUps: entry.fundingFollowUps ?? 0,
      relativeStatusProbing: entry.relativeStatusProbing ?? false,
      interruptions: entry.interruptions ?? 0,
      silentTypingBeforeDecision: entry.silentTypingBeforeDecision ?? false,
      revisitEarlierAnswers: entry.revisitEarlierAnswers ?? false,
      underTwoMinutes: entry.underTwoMinutes ?? entry.durationSeconds <= 120,
      emotionalTone: entry.emotionalTone || "neutral",
      approvalTone:
        entry.approvalTone || (entry.outcome === "approved" ? "neutral" : "n/a"),
      triggers: entry.triggers || [],
      sourceLabel:
        entry.sourceLabel ||
        entry.title ||
        sourceDefaults.sourceLabel ||
        "Imported visa interview report",
      sourceUrl: entry.sourceUrl || entry.url || sourceDefaults.sourceUrl || "",
      sourceType: entry.sourceType || sourceDefaults.sourceType || "manual",
      platform:
        entry.platform || sourceDefaults.platform || entry.sourceType || "manual",
      publishedAt: entry.publishedAt || entry.createdAt || sourceDefaults.publishedAt || "",
      evidenceSummary: entry.evidenceSummary || "",
      rawText: entry.rawText || entry.evidenceSummary || ""
    };
  }

  if (!text || !RELEVANCE_PATTERN.test(text)) {
    return null;
  }

  const outcome = detectOutcome(text, entry.outcome);
  const durationSeconds = inferDurationSeconds(text, entry.durationSeconds);
  const questionCount = inferQuestionCount(text, entry.questionCount);
  const sourceLabel =
    entry.sourceLabel ||
    entry.title ||
    entry.label ||
    sourceDefaults.sourceLabel ||
    "Imported visa interview report";
  const sourcePlatform =
    entry.platform || entry.sourcePlatform || sourceDefaults.platform || "manual";

  return {
    id: entry.id || slugify(`${sourcePlatform}-${sourceLabel}-${entry.sourceUrl || entry.url || text.slice(0, 36)}`),
    country,
    city,
    location: city,
    mission: detectMission(text, entry.mission, city, country),
    visaType: detectVisaType(text, entry.visaType || sourceDefaults.visaType),
    outcome,
    durationSeconds,
    durationConfidence: entry.durationConfidence ?? 0.38,
    questionCount,
    fundingFollowUps:
      entry.fundingFollowUps ?? Math.min(6, countMatches(text, FUNDING_PATTERN)),
    relativeStatusProbing:
      entry.relativeStatusProbing ?? RELATIVE_PATTERN.test(text),
    interruptions:
      entry.interruptions ?? Math.min(5, countMatches(text, INTERRUPTION_PATTERN)),
    silentTypingBeforeDecision:
      entry.silentTypingBeforeDecision ?? TYPING_PATTERN.test(text),
    revisitEarlierAnswers:
      entry.revisitEarlierAnswers ?? REVISIT_PATTERN.test(text),
    underTwoMinutes:
      entry.underTwoMinutes ??
      (durationSeconds <= 120 || UNDER_TWO_MINUTES_PATTERN.test(text)),
    emotionalTone: entry.emotionalTone || inferTone(text),
    approvalTone: entry.approvalTone || inferApprovalTone(text, outcome),
    triggers: entry.triggers || inferTriggers(text, outcome),
    sourceLabel,
    sourceUrl: entry.sourceUrl || entry.url || sourceDefaults.sourceUrl || "",
    sourceType: entry.sourceType || sourceDefaults.sourceType || sourcePlatform,
    platform: sourcePlatform,
    publishedAt: entry.publishedAt || entry.createdAt || sourceDefaults.publishedAt || "",
    evidenceSummary:
      entry.evidenceSummary ||
      normalizeWhitespace(text.split("\n").slice(0, 3).join(" ")).slice(0, 240),
    rawText: text
  };
}

function flattenObjectCollection(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(value.items)) {
    return value.items;
  }

  if (Array.isArray(value.data)) {
    return value.data;
  }

  if (Array.isArray(value.posts)) {
    return value.posts;
  }

  if (Array.isArray(value.videos)) {
    return value.videos;
  }

  if (Array.isArray(value.messages)) {
    return value.messages;
  }

  if (Array.isArray(value.comments)) {
    return value.comments;
  }

  return [value];
}

function mapRedditItem(item) {
  const data = item.data || item;
  return {
    title: data.title,
    selftext: data.selftext || data.body,
    text: combineTextFragments([
      data.title,
      data.selftext,
      data.body,
      data.comment_body
    ]),
    url:
      data.url ||
      data.permalink ||
      data.full_link ||
      data.link ||
      "",
    publishedAt: data.created_utc
      ? new Date(data.created_utc * 1000).toISOString()
      : data.createdAt || "",
    sourceLabel: data.title || "Reddit visa interview post",
    sourcePlatform: "reddit",
    sourceType: "reddit",
    country: data.country,
    city: data.city,
    visaType: data.visaType
  };
}

function mapYoutubeItem(item) {
  return {
    title: item.title,
    description: item.description,
    transcript: Array.isArray(item.transcript)
      ? item.transcript.map((line) => (typeof line === "string" ? line : line.text || "")).join("\n")
      : item.transcript,
    url: item.videoUrl || item.url || "",
    publishedAt: item.publishedAt || item.uploadedAt || "",
    sourceLabel: item.title || "YouTube visa interview video",
    sourcePlatform: "youtube",
    sourceType: "youtube",
    country: item.country,
    city: item.city,
    visaType: item.visaType
  };
}

function mapTelegramItem(item) {
  const text = Array.isArray(item.text)
    ? item.text.map((part) => (typeof part === "string" ? part : part.text || "")).join("")
    : item.text || item.message || "";
  return {
    title: item.title,
    text,
    url: item.link || "",
    publishedAt: item.date || "",
    sourceLabel: item.title || "Telegram visa interview message",
    sourcePlatform: "telegram",
    sourceType: "telegram",
    country: item.country,
    city: item.city,
    visaType: item.visaType
  };
}

function mapFacebookItem(item) {
  return {
    title: item.title,
    text: item.message || item.story || item.text || "",
    url: item.permalink_url || item.permalink || item.url || "",
    publishedAt: item.created_time || item.createdAt || "",
    sourceLabel: item.title || "Facebook visa interview post",
    sourcePlatform: "facebook",
    sourceType: "facebook",
    country: item.country,
    city: item.city,
    visaType: item.visaType
  };
}

function mapGenericItem(item, defaults) {
  return {
    ...item,
    sourcePlatform: item.platform || item.sourcePlatform || defaults.platform || "manual",
    sourceType: item.sourceType || defaults.sourceType || item.platform || "manual"
  };
}

export function parseJsonl(input) {
  return String(input)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function importCandidatesFromFileContent(input, fileMetadata) {
  const extension = fileMetadata.extension.toLowerCase();
  const sourceHint = fileMetadata.sourceHint;

  if (extension === ".txt") {
    return [
      {
        title: fileMetadata.fileName,
        text: input,
        sourcePlatform: sourceHint || "manual",
        sourceType: sourceHint || "manual",
        country: fileMetadata.country,
        city: fileMetadata.city
      }
    ];
  }

  let parsed;
  if (extension === ".jsonl") {
    parsed = parseJsonl(input);
  } else if (extension === ".json") {
    parsed = JSON.parse(input);
  } else {
    return [];
  }

  const collection = flattenObjectCollection(parsed);
  if (sourceHint === "reddit") {
    return collection.map(mapRedditItem);
  }
  if (sourceHint === "youtube") {
    return collection.map(mapYoutubeItem);
  }
  if (sourceHint === "telegram") {
    return collection.map(mapTelegramItem);
  }
  if (sourceHint === "facebook") {
    return collection.map(mapFacebookItem);
  }

  return collection.map((item) => mapGenericItem(item, { platform: sourceHint, sourceType: sourceHint }));
}
