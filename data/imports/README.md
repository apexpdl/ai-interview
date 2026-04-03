# Bulk Import Workflow

Put local source exports in this folder, then run:

```bash
npm run import:bulk
```

The importer scans subfolders recursively and writes:

- `data/generated/normalized-records.jsonl`
- `data/generated/corpus-summary.json`
- `src/data/generatedModel.js`

## Supported folders

- `data/imports/reddit/`
- `data/imports/youtube/`
- `data/imports/telegram/`
- `data/imports/facebook/`
- `data/imports/blogs/`
- `data/imports/normalized/`
- `data/imports/manual/`

## Best input format

If you already have scraped or exported content, convert it to JSONL objects with these fields:

```json
{
  "sourcePlatform": "reddit",
  "sourceType": "reddit",
  "sourceLabel": "F1 visa rejected at Chennai",
  "sourceUrl": "https://example.com/post",
  "country": "India",
  "city": "Chennai",
  "visaType": "F1",
  "publishedAt": "2025-07-11T00:00:00Z",
  "text": "Full post body or transcript here"
}
```

The importer can infer outcome, duration, question count, funding follow-ups, relative probing, interruptions, typing pauses, and likely 214(b) triggers from the text.

## Platform notes

- `reddit/`: arrays or JSONL objects containing `title`, `selftext`, `body`, `url`, `created_utc`
- `youtube/`: arrays or JSONL objects containing `title`, `description`, `transcript`, `videoUrl`
- `telegram/`: Telegram export JSON with `messages` entries or JSONL lines with `text`
- `facebook/`: arrays or JSONL objects containing `message`, `permalink_url`, `created_time`
- `blogs/` or `manual/`: plain JSON, JSONL, or `.txt` files

## Quality note

Automatic extraction is only as good as the source text. For high-quality modeling, include:

- exact city and country
- visa class
- full transcript or detailed recollection
- outcome
- any timing note such as `2 minutes`, `59 seconds`, `typed for 20 seconds`
