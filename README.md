# Kathmandu Visa Interview Simulator

Browser-based mock U.S. visa interview simulator designed to feel like a consular window interaction, not a chatbot session.

## Quick start

```bash
npm run import:bulk
npm run start
```

Then open [http://127.0.0.1:4173/index.html](http://127.0.0.1:4173/index.html).

If you have not imported any external data yet, `npm run import:bulk` will still generate a working model from the built-in starter corpus.

## Daily workflow

1. Put exported or scraped interview reports into `data/imports/`.
2. Run `npm run import:bulk`.
3. Review `data/generated/corpus-summary.json`.
4. Run `npm run start`.
5. Open the simulator in a browser and allow mic/camera if you want live behavioral analysis.

## Commands

```bash
npm run import:bulk   # rebuild normalized corpus + generated model
npm run model         # print active model summary
npm run check         # run simulator verification
npm run start         # serve the app locally
```

## Bulk import sources

Supported folders are documented in [data/imports/README.md](/Users/apexpoudel/Documents/ai-interviewer/data/imports/README.md).

Recommended input shape:

```json
{
  "sourcePlatform": "reddit",
  "sourceType": "reddit",
  "sourceLabel": "F1 rejected in Mumbai",
  "sourceUrl": "https://example.com/post",
  "country": "India",
  "city": "Mumbai",
  "visaType": "F1",
  "publishedAt": "2025-07-20T00:00:00Z",
  "text": "Full interview recollection or transcript here"
}
```

The importer will infer:

- duration
- question count
- funding follow-ups
- relative probing
- interruptions
- silent typing before decision
- likely 214(b) triggers
- tone markers

## What the app reads

The runtime uses [src/data/generatedModel.js](/Users/apexpoudel/Documents/ai-interviewer/src/data/generatedModel.js).

That file is rebuilt from:

- raw imports in `data/imports/`
- normalized output in `data/generated/normalized-records.jsonl`
- aggregated summary in `data/generated/corpus-summary.json`

## GitHub guidance

Yes, upload the codebase if you want versioning or collaboration, but do not push raw private exports blindly.

Safe to commit:

- app code
- importer scripts
- templates
- generated aggregate model if it contains no sensitive text

Usually keep out of Git:

- raw Telegram/Facebook exports
- anything from closed groups or private communities
- transcripts containing personal names, passport numbers, phone numbers, emails, or case IDs
- API keys, cookies, scraping credentials

If you want to share the repo publicly, use a private repo first, review `data/imports/` and `data/generated/`, then decide what should stay local.
