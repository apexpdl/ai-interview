import { ACTIVE_MODEL } from "../data/generatedModel.js";
import { buildReport, createSession, finalizeSession, issueNextQuestion, processAnswer } from "./engine.js";

globalThis.performance = globalThis.performance || {
  now: () => Date.now()
};

const session = createSession(
  {
    fullName: "Test Applicant",
    visaClass: "F1",
    school: "University at Albany",
    major: "Computer Science",
    degreeLevel: "masters",
    fundingSource: "parents",
    annualIncome: "32000",
    scholarship: "",
    relativesInUs: "brother on F-1 in Texas",
    currentOccupation: "software engineer",
    returnPlan: "return to Nepal and work in fintech",
    gapExplanation: ""
  },
  "bald-jacked"
);

issueNextQuestion(session);
processAnswer(session, "Parents are paying. My father runs a hardware business and earns around 32000 dollars.", performance.now() - 1200, performance.now(), {
  eyeContactStability: 0.61,
  postureStability: 0.66,
  voiceSteadiness: 0.57
});
issueNextQuestion(session);
processAnswer(session, "My brother is on F-1 in Texas. I talk to him once a week.", performance.now() - 900, performance.now(), {
  eyeContactStability: 0.52,
  postureStability: 0.58,
  voiceSteadiness: 0.49
});
finalizeSession(session);
const report = buildReport(session);

console.log(
  JSON.stringify(
    {
      modelSampleSize: ACTIVE_MODEL.sampleSize,
      activeScope: ACTIVE_MODEL.scope,
      decision: session.decision,
      transcriptTurns: report.transcript.length,
      immigrantIntentRisk: report.immigrantIntentRisk
    },
    null,
    2
  )
);
