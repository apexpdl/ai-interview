import { PUBLIC_REPORTS_SAMPLE } from "./publicReportsSample.js";

const BASELINE_PRIORS = {
  interviewUnderTwoMinutes: 0.42,
  fundingFollowUpRate: 0.58,
  relativeProbeRate: 0.34,
  interruptionRate: 0.19,
  silentTypingRate: 0.61,
  revisitRate: 0.28,
  emotionalNeutrality: 0.71,
  approvalToneNeutral: 0.76
};

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
}

function median(values) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function quantile(values, ratio) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * ratio))
  );
  return sorted[index];
}

function rateFromCounts(items, accessor) {
  if (!items.length) {
    return 0;
  }

  const total = items.reduce((sum, item) => sum + accessor(item), 0);
  return total / items.length;
}

function blend(sampleRate, priorRate, sampleSize, priorWeight = 10) {
  const weightedSample = sampleRate * sampleSize;
  const weightedPrior = priorRate * priorWeight;
  return (weightedSample + weightedPrior) / (sampleSize + priorWeight);
}

function numericBlend(localValue, priorValue, sampleSize, priorWeight = 8) {
  if (typeof localValue !== "number" || Number.isNaN(localValue)) {
    return priorValue;
  }

  if (typeof priorValue !== "number" || Number.isNaN(priorValue)) {
    return localValue;
  }

  return Number(
    ((localValue * sampleSize + priorValue * priorWeight) / (sampleSize + priorWeight)).toFixed(1)
  );
}

function normalizeTone(tone) {
  return tone?.toLowerCase().includes("neutral") ? "neutral" : "non-neutral";
}

function normalizeRecord(record) {
  return {
    country: record.country || (record.city === "Kathmandu" ? "Nepal" : "Unknown"),
    city: record.city || record.location || "Unknown",
    mission: record.mission || (record.city ? `U.S. Mission ${record.city}` : "Unknown"),
    platform: record.platform || record.sourceType || "manual",
    sourceType: record.sourceType || record.platform || "manual",
    ...record
  };
}

function countBy(records, accessor) {
  const counts = {};

  for (const record of records) {
    const key = accessor(record) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => right[1] - left[1])
  );
}

function buildTriggerWeights(records, fallback = []) {
  const triggerCounts = new Map();

  for (const record of records) {
    for (const trigger of record.triggers || []) {
      triggerCounts.set(trigger, (triggerCounts.get(trigger) || 0) + 1);
    }
  }

  const total = [...triggerCounts.values()].reduce((sum, value) => sum + value, 0);
  if (!total) {
    return fallback;
  }

  return [...triggerCounts.entries()]
    .map(([id, count]) => ({
      id,
      weight: Number((count / total).toFixed(3))
    }))
    .sort((a, b) => b.weight - a.weight);
}

function buildSourceNotes(records, limit = 48) {
  const notes = [];
  const seen = new Set();

  for (const record of records) {
    const key = `${record.sourceLabel || ""}|${record.sourceUrl || ""}`;
    if (!record.sourceUrl || seen.has(key)) {
      continue;
    }
    seen.add(key);
    notes.push({
      label: record.sourceLabel || record.sourceUrl,
      url: record.sourceUrl
    });
    if (notes.length >= limit) {
      break;
    }
  }

  return notes;
}

function buildDistribution(values, fallbackDistribution, underTwoMinutesProbability) {
  if (!values.length && fallbackDistribution) {
    return {
      ...fallbackDistribution,
      underTwoMinutesProbability:
        typeof underTwoMinutesProbability === "number"
          ? underTwoMinutesProbability
          : fallbackDistribution.underTwoMinutesProbability
    };
  }

  const local = {
    min: Math.min(...values),
    mean: Number(mean(values).toFixed(1)),
    median: median(values),
    p25: quantile(values, 0.25),
    p75: quantile(values, 0.75),
    p90: quantile(values, 0.9)
  };

  if (!fallbackDistribution) {
    return {
      ...local,
      underTwoMinutesProbability: underTwoMinutesProbability || 0
    };
  }

  return {
    min: values.length ? local.min : fallbackDistribution.min,
    mean: numericBlend(local.mean, fallbackDistribution.mean, values.length),
    median: numericBlend(local.median, fallbackDistribution.median, values.length),
    p25: numericBlend(local.p25, fallbackDistribution.p25, values.length),
    p75: numericBlend(local.p75, fallbackDistribution.p75, values.length),
    p90: numericBlend(local.p90, fallbackDistribution.p90, values.length),
    underTwoMinutesProbability
  };
}

function groupBy(records, accessor) {
  const groups = new Map();

  for (const record of records) {
    const key = accessor(record);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(record);
  }

  return groups;
}

export function buildProbabilisticModel(records, options = {}) {
  const normalized = records.map(normalizeRecord);
  const adjudicated = normalized.filter((record) =>
    ["approved", "rejected", "221g"].includes(record.outcome)
  );
  const approvedRecords = adjudicated.filter((record) => record.outcome === "approved");
  const rejectedRecords = adjudicated.filter((record) => record.outcome === "rejected");
  const priorModel = options.priorModel || null;
  const priorRates = {
    underTwoMinutes:
      priorModel?.distributions?.interviewDurationSeconds?.underTwoMinutesProbability ??
      BASELINE_PRIORS.interviewUnderTwoMinutes,
    fundingFollowUp:
      priorModel?.interactionProbabilities?.fundingFollowUpProbability ??
      BASELINE_PRIORS.fundingFollowUpRate,
    relativeProbe:
      priorModel?.interactionProbabilities?.relativeStatusProbeProbability ??
      BASELINE_PRIORS.relativeProbeRate,
    interruption:
      priorModel?.interactionProbabilities?.interruptionProbability ??
      BASELINE_PRIORS.interruptionRate,
    silentTyping:
      priorModel?.interactionProbabilities?.silentTypingBeforeDecisionProbability ??
      BASELINE_PRIORS.silentTypingRate,
    revisit:
      priorModel?.interactionProbabilities?.revisitEarlierAnswerProbability ??
      BASELINE_PRIORS.revisitRate,
    emotionalNeutrality:
      priorModel?.tonalPatterns?.emotionalNeutralityProbability ??
      BASELINE_PRIORS.emotionalNeutrality,
    approvalToneNeutral:
      priorModel?.tonalPatterns?.approvalToneNeutralProbability ??
      BASELINE_PRIORS.approvalToneNeutral
  };

  const durations = adjudicated.map((record) => record.durationSeconds).filter(Boolean);
  const questionCounts = adjudicated.map((record) => record.questionCount).filter(Boolean);
  const sampleSize = adjudicated.length;

  const underTwoMinutesRate = blend(
    rateFromCounts(adjudicated, (record) => (record.underTwoMinutes ? 1 : 0)),
    priorRates.underTwoMinutes,
    sampleSize
  );
  const fundingFollowUpRate = blend(
    rateFromCounts(adjudicated, (record) => (record.fundingFollowUps > 0 ? 1 : 0)),
    priorRates.fundingFollowUp,
    sampleSize
  );
  const relativeProbeRate = blend(
    rateFromCounts(adjudicated, (record) => (record.relativeStatusProbing ? 1 : 0)),
    priorRates.relativeProbe,
    sampleSize
  );
  const interruptionRate = blend(
    rateFromCounts(adjudicated, (record) => (record.interruptions > 0 ? 1 : 0)),
    priorRates.interruption,
    sampleSize
  );
  const silentTypingRate = blend(
    rateFromCounts(adjudicated, (record) => (record.silentTypingBeforeDecision ? 1 : 0)),
    priorRates.silentTyping,
    sampleSize
  );
  const revisitRate = blend(
    rateFromCounts(adjudicated, (record) => (record.revisitEarlierAnswers ? 1 : 0)),
    priorRates.revisit,
    sampleSize
  );
  const emotionalNeutralityRate = blend(
    rateFromCounts(adjudicated, (record) => (normalizeTone(record.emotionalTone) === "neutral" ? 1 : 0)),
    priorRates.emotionalNeutrality,
    sampleSize
  );
  const approvalToneNeutrality = blend(
    rateFromCounts(approvedRecords, (record) => (normalizeTone(record.approvalTone) === "neutral" ? 1 : 0)),
    priorRates.approvalToneNeutral,
    approvedRecords.length || 1,
    5
  );

  const durationDistribution = buildDistribution(
    durations,
    priorModel?.distributions?.interviewDurationSeconds || {
      min: 62,
      mean: 117.4,
      median: 105,
      p25: 96,
      p75: 120,
      p90: 180,
      underTwoMinutesProbability: priorRates.underTwoMinutes
    },
    Number(underTwoMinutesRate.toFixed(3))
  );

  const questionDistribution = buildDistribution(
    questionCounts,
    priorModel?.distributions?.questionCount || {
      min: 3,
      mean: 5.8,
      median: 5,
      p25: 4,
      p75: 8,
      p90: 10
    }
  );

  return {
    generatedAt: options.generatedAt || "runtime-model",
    scope: options.label || "Global public-report model",
    sampleSize,
    totalRecordCount: normalized.length,
    adjudicatedCount: adjudicated.length,
    distributions: {
      interviewDurationSeconds: durationDistribution,
      questionCount: questionDistribution
    },
    interactionProbabilities: {
      fundingFollowUpProbability: Number(fundingFollowUpRate.toFixed(3)),
      relativeStatusProbeProbability: Number(relativeProbeRate.toFixed(3)),
      interruptionProbability: Number(interruptionRate.toFixed(3)),
      silentTypingBeforeDecisionProbability: Number(silentTypingRate.toFixed(3)),
      revisitEarlierAnswerProbability: Number(revisitRate.toFixed(3))
    },
    tonalPatterns: {
      emotionalNeutralityProbability: Number(emotionalNeutralityRate.toFixed(3)),
      approvalToneNeutralProbability: Number(approvalToneNeutrality.toFixed(3))
    },
    common214bTriggers: buildTriggerWeights(
      rejectedRecords,
      priorModel?.common214bTriggers || []
    ),
    officerPriors: {
      strictnessMean: Number(
        (
          (priorModel?.officerPriors?.strictnessMean ?? 0.54) +
          Math.min(0.22, relativeProbeRate * 0.12 + interruptionRate * 0.2)
        ).toFixed(3)
      ),
      strictnessSpread: priorModel?.officerPriors?.strictnessSpread ?? 0.18,
      patienceMean: Number(
        (
          (priorModel?.officerPriors?.patienceMean ?? 0.49) -
          Math.min(0.18, interruptionRate * 0.15)
        ).toFixed(3)
      ),
      interruptMean: Number(interruptionRate.toFixed(3)),
      followUpDepthMean: Number(
        (
          (priorModel?.officerPriors?.followUpDepthMean ?? 0.51) +
          fundingFollowUpRate * 0.08 +
          revisitRate * 0.06
        ).toFixed(3)
      ),
      approvalThresholdVariability:
        priorModel?.officerPriors?.approvalThresholdVariability ?? 0.19,
      typingFrequencyMean: Number(silentTypingRate.toFixed(3)),
      eyeContactMean: priorModel?.officerPriors?.eyeContactMean ?? 0.58,
      energyMean: priorModel?.officerPriors?.energyMean ?? 0.47
    },
    breakdowns: {
      byCountry: countBy(normalized, (record) => record.country),
      byCity: countBy(normalized, (record) => `${record.city}, ${record.country}`),
      byPlatform: countBy(normalized, (record) => record.platform),
      byVisaType: countBy(normalized, (record) => record.visaType),
      byOutcome: countBy(normalized, (record) => record.outcome)
    },
    sourceNotes: buildSourceNotes(normalized)
  };
}

export function buildModelBundle(records, options = {}) {
  const normalized = records.map(normalizeRecord);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const target = {
    country: options.targetCountry || "Nepal",
    city: options.targetCity || "Kathmandu"
  };

  const globalModel = buildProbabilisticModel(normalized, {
    label: "Global public-report model",
    generatedAt
  });

  const countryModels = {};
  for (const [country, countryRecords] of groupBy(normalized, (record) => record.country)) {
    countryModels[country] = buildProbabilisticModel(countryRecords, {
      label: `${country} public-report model`,
      generatedAt,
      priorModel: globalModel
    });
  }

  const cityModels = {};
  for (const [cityKey, cityRecords] of groupBy(
    normalized,
    (record) => `${record.country}::${record.city}`
  )) {
    const [country, city] = cityKey.split("::");
    cityModels[cityKey] = buildProbabilisticModel(cityRecords, {
      label: `${city}, ${country} public-report model`,
      generatedAt,
      priorModel: countryModels[country] || globalModel
    });
  }

  const targetKey = `${target.country}::${target.city}`;
  const activeModel =
    cityModels[targetKey] ||
    countryModels[target.country] ||
    globalModel;

  return {
    generatedAt,
    recordCount: normalized.length,
    adjudicatedCount: normalized.filter((record) =>
      ["approved", "rejected", "221g"].includes(record.outcome)
    ).length,
    target,
    active: activeModel,
    global: globalModel,
    countries: countryModels,
    cities: cityModels,
    sourceBreakdown: {
      byCountry: countBy(normalized, (record) => record.country),
      byPlatform: countBy(normalized, (record) => record.platform),
      byVisaType: countBy(normalized, (record) => record.visaType)
    }
  };
}

export const PROBABILISTIC_MODEL = buildModelBundle(PUBLIC_REPORTS_SAMPLE).active;
