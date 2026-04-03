import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { inferCanonicalRecord, importCandidatesFromFileContent } from "./importers.js";
import { buildModelBundle } from "./probabilisticModel.js";
import { PUBLIC_REPORTS_SAMPLE } from "./publicReportsSample.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const importsRoot = path.join(projectRoot, "data", "imports");
const generatedRoot = path.join(projectRoot, "data", "generated");
const generatedModulePath = path.join(projectRoot, "src", "data", "generatedModel.js");

function hashFingerprint(record) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        sourceUrl: record.sourceUrl || "",
        sourceLabel: record.sourceLabel || "",
        outcome: record.outcome || "",
        city: record.city || "",
        country: record.country || "",
        rawText: (record.rawText || "").slice(0, 500)
      })
    )
    .digest("hex");
}

async function walk(dir) {
  let output = [];
  let entries = [];

  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return output;
  }

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "templates") {
        continue;
      }
      output = output.concat(await walk(absolutePath));
      continue;
    }

    if (!/\.(json|jsonl|txt)$/i.test(entry.name)) {
      continue;
    }

    output.push(absolutePath);
  }

  return output;
}

function detectSourceHint(filePath) {
  const normalized = filePath.toLowerCase();
  if (normalized.includes("/reddit/")) {
    return "reddit";
  }
  if (normalized.includes("/youtube/")) {
    return "youtube";
  }
  if (normalized.includes("/telegram/")) {
    return "telegram";
  }
  if (normalized.includes("/facebook/")) {
    return "facebook";
  }
  if (normalized.includes("/blogs/")) {
    return "blog";
  }
  if (normalized.includes("/normalized/")) {
    return "normalized";
  }
  return "manual";
}

function toSerializableRecord(record) {
  return {
    id: record.id,
    country: record.country,
    city: record.city,
    location: record.location,
    mission: record.mission,
    visaType: record.visaType,
    outcome: record.outcome,
    durationSeconds: record.durationSeconds,
    durationConfidence: record.durationConfidence,
    questionCount: record.questionCount,
    fundingFollowUps: record.fundingFollowUps,
    relativeStatusProbing: record.relativeStatusProbing,
    interruptions: record.interruptions,
    silentTypingBeforeDecision: record.silentTypingBeforeDecision,
    revisitEarlierAnswers: record.revisitEarlierAnswers,
    underTwoMinutes: record.underTwoMinutes,
    emotionalTone: record.emotionalTone,
    approvalTone: record.approvalTone,
    triggers: record.triggers,
    sourceLabel: record.sourceLabel,
    sourceUrl: record.sourceUrl,
    sourceType: record.sourceType,
    platform: record.platform,
    publishedAt: record.publishedAt,
    evidenceSummary: record.evidenceSummary,
    rawText: record.rawText
  };
}

function summarizeRecords(records, bundle, importStats) {
  const counts = (accessor) => {
    const map = {};
    for (const record of records) {
      const key = accessor(record) || "unknown";
      map[key] = (map[key] || 0) + 1;
    }
    return Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1]));
  };

  return {
    generatedAt: bundle.generatedAt,
    importStats,
    totalRecords: records.length,
    adjudicatedRecords: bundle.adjudicatedCount,
    activeTarget: bundle.target,
    activeScope: bundle.active.scope,
    byCountry: counts((record) => record.country),
    byCity: counts((record) => `${record.city}, ${record.country}`),
    byPlatform: counts((record) => record.platform),
    byVisaType: counts((record) => record.visaType),
    byOutcome: counts((record) => record.outcome),
    topActiveTriggers: bundle.active.common214bTriggers.slice(0, 10)
  };
}

function buildGeneratedModule({ records, bundle, summary }) {
  return `export const GENERATED_RECORDS = ${JSON.stringify(records, null, 2)};\n\nexport const GENERATED_MODEL_BUNDLE = ${JSON.stringify(bundle, null, 2)};\n\nexport const ACTIVE_MODEL = GENERATED_MODEL_BUNDLE.active;\n\nexport const GENERATED_CORPUS_SUMMARY = ${JSON.stringify(summary, null, 2)};\n`;
}

async function ensureGeneratedDirs() {
  await fs.mkdir(generatedRoot, { recursive: true });
}

async function loadImportedRecords() {
  const files = await walk(importsRoot);
  const candidates = [];
  const failures = [];

  for (const filePath of files) {
    try {
      const fileName = path.basename(filePath);
      const extension = path.extname(filePath);
      const sourceHint = detectSourceHint(filePath);
      const fileContent = await fs.readFile(filePath, "utf8");
      const parsedCandidates = importCandidatesFromFileContent(fileContent, {
        fileName,
        extension,
        sourceHint
      });

      for (const candidate of parsedCandidates) {
        candidates.push({
          candidate,
          filePath,
          sourceHint
        });
      }
    } catch (error) {
      failures.push({
        filePath,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { files, candidates, failures };
}

async function main() {
  await ensureGeneratedDirs();
  const includeSeed = !process.argv.includes("--no-seed");
  const { files, candidates, failures } = await loadImportedRecords();
  const normalized = [];
  const seenFingerprints = new Set();

  if (includeSeed) {
    for (const record of PUBLIC_REPORTS_SAMPLE) {
      const fingerprint = hashFingerprint(record);
      if (seenFingerprints.has(fingerprint)) {
        continue;
      }
      seenFingerprints.add(fingerprint);
      normalized.push(toSerializableRecord(record));
    }
  }

  for (const item of candidates) {
    const normalizedRecord = inferCanonicalRecord(item.candidate, {
      sourceType: item.sourceHint,
      platform: item.sourceHint
    });

    if (!normalizedRecord) {
      continue;
    }

    const fingerprint = hashFingerprint(normalizedRecord);
    if (seenFingerprints.has(fingerprint)) {
      continue;
    }

    seenFingerprints.add(fingerprint);
    normalized.push(toSerializableRecord(normalizedRecord));
  }

  const bundle = buildModelBundle(normalized, {
    targetCountry: "Nepal",
    targetCity: "Kathmandu"
  });
  const importStats = {
    scannedFiles: files.length,
    importedCandidates: candidates.length,
    failures,
    usedSeedRecords: includeSeed ? PUBLIC_REPORTS_SAMPLE.length : 0,
    normalizedRecords: normalized.length
  };
  const summary = summarizeRecords(normalized, bundle, importStats);

  await fs.writeFile(
    path.join(generatedRoot, "normalized-records.jsonl"),
    normalized.map((record) => JSON.stringify(record)).join("\n") + "\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(generatedRoot, "corpus-summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8"
  );
  await fs.writeFile(
    generatedModulePath,
    buildGeneratedModule({
      records: normalized,
      bundle,
      summary
    }),
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        scannedFiles: importStats.scannedFiles,
        importedCandidates: importStats.importedCandidates,
        normalizedRecords: importStats.normalizedRecords,
        activeScope: bundle.active.scope,
        activeSampleSize: bundle.active.sampleSize,
        countries: Object.keys(bundle.countries).length,
        cities: Object.keys(bundle.cities).length,
        failures: failures.length
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
