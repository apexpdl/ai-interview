import { ACTIVE_MODEL, GENERATED_CORPUS_SUMMARY, GENERATED_MODEL_BUNDLE } from "./generatedModel.js";

console.log(
  JSON.stringify(
    {
      summary: GENERATED_CORPUS_SUMMARY,
      activeModel: ACTIVE_MODEL,
      countries: Object.keys(GENERATED_MODEL_BUNDLE.countries).length,
      cities: Object.keys(GENERATED_MODEL_BUNDLE.cities).length
    },
    null,
    2
  )
);
