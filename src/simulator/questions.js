function sanitize(value) {
  return typeof value === "string" ? value.trim() : "";
}

export const QUESTION_BANK = {
  opening: [
    "Good morning. Documents, please.",
    "Morning. Let me see your documents.",
    "Hello. Your documents, please.",
    "Good morning. Passport and I-20."
  ],
  academics: [
    "Why this university?",
    "Why this major?",
    "What did you study before this?",
    "Why this program and not another one?",
    "Why now?"
  ],
  funding: [
    "Who is paying?",
    "Annual income?",
    "What does your sponsor do?",
    "How long has your sponsor worked there?",
    "What if the funding stops?",
    "How much do you have available?"
  ],
  relatives: [
    "Anyone in the U.S.?",
    "What status?",
    "Where does he live?",
    "Who filed for whom?",
    "How often do you speak?",
    "When did they move there?"
  ],
  intent: [
    "What after graduation?",
    "What job in Nepal?",
    "Why not stay in the U.S.?",
    "Company name?",
    "Salary expectation in Nepal?",
    "Why return?"
  ],
  work: [
    "What do you do now?",
    "How long have you worked there?",
    "Why leave that job?",
    "What exactly is your role?"
  ],
  gaps: [
    "What were you doing after graduation?",
    "Explain this gap.",
    "Why the delay?",
    "What have you been doing this year?"
  ],
  credibility: [
    "How did you get this admit?",
    "Why did they fund you?",
    "Who helped you apply?",
    "Did you prepare this yourself?"
  ],
  clarification: [
    "Sorry?",
    "Say that again.",
    "One line.",
    "Only answer the question."
  ]
};

export function openingQuestion(session) {
  if (session.questionsAsked === 0) {
    return QUESTION_BANK.opening[Math.floor(Math.random() * QUESTION_BANK.opening.length)];
  }
  return null;
}

export function buildRevisitQuestion(session) {
  const facts = session.memory.history.filter(
    (fact) => fact.key !== "answerText" && fact.key !== "moneyMentions" && fact.key !== "jobMentions"
  );

  if (!facts.length) {
    return null;
  }

  const chosen = facts[Math.floor(Math.random() * facts.length)];
  const value = sanitize(chosen.value);

  switch (chosen.key) {
    case "relativeRelation":
      return `You said ${value}. What status?`;
    case "relativeLocation":
      return `When did ${value} move there?`;
    case "fundingSource":
      return `Earlier you said ${value}. Income source?`;
    case "returnPlan":
      return `That job in Nepal. Which company?`;
    case "currentOccupation":
      return `How long have you been doing that?`;
    case "gapExplanation":
      return "During that gap, what exactly were you doing?";
    case "school":
      return `Why ${value}?`;
    default:
      return null;
  }
}

export function buildContextualQuestion(topic, session) {
  const { caseFile } = session;

  if (topic === "academics") {
    if (!sanitize(caseFile.school)) {
      return caseFile.visaClass === "B1B2" ? "Why are you going to the United States?" : "Which university?";
    }
    if (!sanitize(caseFile.major)) {
      return caseFile.visaClass === "B1B2" ? "Purpose of travel?" : "What will you study?";
    }
  }

  if (topic === "funding") {
    const source = sanitize(caseFile.fundingSource);
    if (!source && sanitize(caseFile.coa)) {
      return "Who is paying that amount?";
    }
    if (!source) {
      return "Who is paying?";
    }
    if (source && Math.random() > 0.45) {
      return `You said ${source}. What does ${source.split(" ")[0]} do?`;
    }
  }

  if (topic === "relatives") {
    const relative = sanitize(caseFile.relativesInUs);
    if (!relative) {
      return "Anyone in the U.S.?";
    }
    if (relative && Math.random() > 0.35) {
      return "Anyone else in the U.S.?";
    }
  }

  if (topic === "intent") {
    const degree = sanitize(caseFile.degreeLevel);
    if (degree === "phd") {
      return "After the PhD, then what?";
    }
  }

  if (topic === "gaps" && sanitize(caseFile.gapExplanation)) {
    return "Your gap. Explain it.";
  }

  if (topic === "intent" && !sanitize(caseFile.returnPlan)) {
    return caseFile.visaClass === "B1B2" ? "When will you come back?" : "What after graduation?";
  }

  const options = QUESTION_BANK[topic] || QUESTION_BANK.intent;
  return options[Math.floor(Math.random() * options.length)];
}
