import { ACTIVE_MODEL, GENERATED_CORPUS_SUMMARY, GENERATED_MODEL_BUNDLE } from "./generatedModel.js";

console.log(
  JSON.stringify(
    {
      summary: GENERATED_CORPUS_SUMMARY,
      activeModel: ACTIVE_MODEL,
      availableCountries: Object.keys(GENERATED_MODEL_BUNDLE.countries),
      availableCities: Object.keys(GENERATED_MODEL_BUNDLE.cities)
    },
    null,
    2
  )
);
