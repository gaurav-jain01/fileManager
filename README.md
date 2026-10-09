# FileVault

A personal library for saved links, descriptions, tags, and notes, built with Next.js and MongoDB. Includes collection filters, favorites, grid/list views, search, sorting, and a source-linked assistant.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` if you don't already have configuration. Set `MONGODB_URI` to your MongoDB connection string.
3. Run `npm run dev` and open http://localhost:3000.

`npm run build` creates a production build; `npm start` serves it.

## Loading and API usage

The home page makes no application API requests until you open a section (a direct `?item=` link loads just that item). Use **Show library**, a sidebar file filter, or Ctrl/⌘ K to load the library. **Hide library** hides its data and stops list requests. Daily to-dos load only after clicking **Daily to-do**; hiding them pauses their timer and requests. Daily/weekly reports load only after choosing the corresponding chart tab. Assistant status loads on first opening its panel.

Library queries, item details, and daily views use bounded, in-memory 60-second caches with in-flight deduplication. Reopening a recent view, switching grid/list, or focusing a recently loaded daily list does not make another request. Edits invalidate affected caches; daily checkbox/title updates use the returned saved record without an extra GET. Upload batches refresh the library once per batch. Search is debounced for 250 ms, and unchanged filters do not reload. **Refresh library** and **Refresh to-dos** bypass caches; changes made in another tab may take up to a minute to appear when revisiting a view, or appear immediately with Refresh. There is no background polling.

The UI requests `GET /api/files?summary=1` for cards: descriptions and note previews are limited to 220 characters, with full notes and upload bytes excluded at the database projection. Full content is fetched on opening/editing an item. `meta=0` skips global counts, categories and tags while those values are fresh. Counts are hidden until loaded. `mode=none` on daily to-dos skips historical reports and queries only the selected day. Default API responses remain compatible with existing consumers.

## Daily to-do list

Use **Daily to-do** beside the note/upload actions on the home page. Add tasks, edit titles, check off completed work, reopen tasks, or remove a task from today's list. Changes are saved in MongoDB's dedicated **`daily_todos`** collection, initialized automatically by the API with a day/creation-time index.

Each list runs until **local midnight**, using the browser's IANA time zone. A countdown shows the remaining time, and an open page switches to the new day automatically. This is a calendar day (normally 24 hours; daylight-saving changes may make it shorter or longer), not a rolling 24-hour deadline for each task. The server stores each task's date, time zone, closing time and completion timestamp; once the closing time passes, edits and deletion are rejected. No expiration/TTL deletes history.

Browse any previous date using the date picker or arrows. **Add to today** copies an unfinished task while keeping the original day's record. Tasks are not automatically carried over. **Daily** charts show seven days ending on the selected date; **Weekly** charts show eight Monday-based weeks through that date, with a partial final week. Bars show completed and unfinished counts, including empty days. Hover/focus bars for details, or open **View chart data** for a table. Reports include all tasks, even when the checklist is paginated (50 per page). Existing general Tasks remain separate from these daily lists.

API: `GET /api/daily-todos?timeZone=Asia/Kolkata&day=YYYY-MM-DD&mode=daily|weekly&page=1`; `POST /api/daily-todos` with `{title, day, timeZone}`; `PATCH /api/daily-todos/:id` with title and/or boolean `done`; `DELETE /api/daily-todos/:id`. Creation is limited to today's date in the supplied time zone. This shares the existing personal-workspace access model.

## Tasks

Open **Tasks** in the sidebar to create, edit, complete, reopen, and delete tasks. Each task has a title, optional description, status (To do, In progress, Done), priority, and optional due date. Search titles/descriptions, filter by status or priority, and sort or page through results. Overdue labels use your browser's local calendar date; deadlines are stored as `YYYY-MM-DD` so they do not shift across time zones.

For a simple to-do, type in **What needs to get done?** and press Enter or **Add to-do**. Checkboxes update immediately and save to MongoDB; a failed save restores the previous state. **All**, **Active**, and **Completed** views let you focus on unfinished work; Active includes both To do and In progress. The remaining count covers the whole list. **Undo** is available for six seconds after a status change. Quick entry keeps your text on failure, and existing tasks use the same collection. Use **New task** or Edit to add details, deadlines, or priority.

Tasks use a dedicated MongoDB **`tasks`** collection in the database configured by `MONGODB_URI`, with timestamps and indexes for status/updates and deadlines. Run `npm run db:init-tasks` to create the collection and indexes without deleting existing data. Mongoose also initializes the collection when the task API first connects. The existing seed script does not populate tasks.

API: `GET /api/tasks` (search, status, priority, sort, page, limit), `POST /api/tasks`, and `GET`, `PATCH`, `DELETE /api/tasks/:id`. The task system shares the app's existing single-workspace access model. Tasks are not included in the vault assistant's file search.

Run `npx playwright test tests/browser/tasks.spec.mjs` against the running app (or set `PLAYWRIGHT_CHANNEL=chrome` to use installed Google Chrome) for task persistence, filtering, validation, deletion, and mobile error recovery checks. The persistence test removes only its own temporary task.

## Assistant

The assistant searches saved titles, descriptions, categories, tags, and notes. It does **not** fetch linked pages or read the contents of Google Docs, Sheets, or PDFs.

Without an API key, the panel is labeled **Search mode**. It supports keyword lookup, favorites, common file types, recent items, and keyword match counts. Search mode handles each question independently; it does not interpret conversational follow-ups or synthesize AI answers.

To enable AI answers, add `OPENAI_API_KEY` to `.env.local` and restart the server. `OPENAI_MODEL` optionally overrides `gpt-4o-mini`. Keys stay on the server. When AI is enabled, your question, recent conversation, and selected saved metadata/notes are sent to OpenAI's [Responses API](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), with response storage disabled. The assistant is read-only. Source links come from actual retrieved records; generated source IDs are checked against those records. Model-written answers can still be inaccurate, so consult the linked sources.

Small vaults are included in full when they fit the context budget. Larger vaults use up to 100 keyword candidates plus recent records, bounded to approximately 110,000 characters. The model is told when coverage is incomplete. Search fallback shows up to six results and the exact keyword match count. Provider errors or timeouts return clearly labeled search results.

This app retains the original single-workspace model and has no sign-in or user isolation. Run it locally or behind private access; authentication and per-user ownership would be needed before a public multi-user deployment.

## Checks

- `npm run lint`
- `npm test` — validation, literal search, safe URLs, retrieval, and citation validation.
- `npm run build`
- `npx playwright install chromium`, then start the app at http://localhost:3000 and run `npm run test:e2e`.

Browser tests use mocked writes to exercise creation, editing, favorites, deletion, and failure recovery without changing your data. Read-only integration tests require a reachable MongoDB database with at least one saved item. Screenshots are written to `/private/tmp/filevault-*.png` on macOS (adjust paths on other platforms). Live OpenAI responses require a configured key and are not covered by the mocked browser tests.

The existing `scripts/seed.mjs` clears collections before adding sample records. Do not run it against a vault you want to keep.

## Notepad and uploads

Use **New note** to write a standalone note without a URL. The Markdown editor includes bold, italic, headings, lists, quotes, code, links, and a formatted preview. Click **Save note** (or press Ctrl/⌘ S) to save its title, text, collection, and tags to MongoDB. Notes support up to 12,000 characters and are searchable in the library and assistant. Unsaved changes are marked and closing a changed note asks before discarding it.

### Supporting images in notes (Cloudinary)

Click **Image** in the note toolbar, paste a screenshot, or drop images into the editor. Images are inserted at the text cursor (or appended when using Preview). Use **Preview** to see them alongside your formatted text. PNG, JPG, WebP, and GIF are supported, up to 5 MB each and 10 new images per save. Edit the Markdown description between `![` and `]` to set accessible alt text and the displayed caption. Remove a pending image with its × button, or remove its Markdown line. Existing HTTPS image links can also be embedded with `![Description](https://example.com/image.png)`.

New images stay in your browser until **Save note**. Saving uploads them to Cloudinary through the server and stores their HTTPS links in the note's Markdown in MongoDB. Upload failures leave your draft open; retries reuse uploads that already succeeded during the current editing session. Discarding a draft before saving does not upload anything. Cloudinary image delivery uses automatic format and quality selection.

To enable uploads:

1. Create a [Cloudinary account](https://cloudinary.com/users/register/free), then open the Console's **Settings → API Keys** for your product environment.
2. Set these server-only values in `.env.local` (the placeholders are in `.env.example`):

   ```dotenv
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   CLOUDINARY_FOLDER=filevault/notes
   ```

3. Restart `npm run dev`. On a hosted deployment, set the same environment variables in the hosting configuration and redeploy.
4. Create a note, insert an image, preview it, and save. Reopen the note to verify delivery.

No unsigned upload preset is needed. The server uses signed Cloudinary uploads and restricts uploads to raster image formats; the API secret never enters the browser. Without credentials, text-only notes still work and image saves show a configuration error without discarding the draft.

`CLOUDINARY_FOLDER` controls the Media Library folder for new note images in Cloudinary's dynamic folder mode. Set it to a path such as `my-app/note-images`; if omitted or blank, it defaults to `filevault/notes`. Restart the app after changing the environment. Changing this setting affects future uploads; existing images stay in their current folders. The public-ID prefix remains `filevault/notes/`, independently of the Media Library folder.

Images use public Cloudinary delivery URLs under the `filevault/notes/` public-ID prefix. Anyone who has an image URL can view it. Removing an image reference or deleting a note does not delete the Cloudinary asset, because links can be reused in other notes. Remove unused assets in Cloudinary's Media Library when appropriate. If an upload succeeds but you then abandon a failed note save, that uploaded asset also remains there. Sensitive images would need authenticated media delivery and application access control; the existing app is a single private workspace with no sign-in.

Cloudinary fits inline note images because it provides image optimization, transformations, and CDN delivery. Google Drive is useful for document storage, but its viewer/download links and short-lived thumbnail URLs require more handling for embedded images. See [Cloudinary image delivery](https://cloudinary.com/documentation/image_transformations) and [Drive file URL behavior](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).

`PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/browser/note-images.spec.mjs` checks image insertion, previews, MongoDB persistence, error recovery, clipboard/drop behavior, and mobile layout. These tests mock Cloudinary so they require no account and create no remote assets; live Cloudinary upload requires the credentials above. The assistant can search image descriptions in Markdown, but does not analyze the image pixels.

To verify a configured account end to end, run `RUN_CLOUDINARY_LIVE=1 PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/browser/cloudinary-live.spec.mjs` against the running app. This opt-in test uploads one generated image, saves and reopens a temporary note, checks real image delivery, then deletes its note and Cloudinary asset. It is skipped during ordinary browser test runs.

### File uploads

Click **View** on an upload to preview it inside the app. PDFs, images, text, audio, and video can be displayed directly. Excel (`xls`, `xlsx`), CSV, OpenDocument sheets (`ods`), PowerPoint (`ppt`, `pptx`, `pps`, `ppsx`), OpenDocument presentations (`odp`), and Word documents (`doc`, `docx`, `odt`, `rtf`) are converted to PDF for viewing. **Download** always returns the original upload. Spreadsheet previews put each sheet on one PDF page so columns are not split across pages; the PDF viewer supports zooming. PDF conversion preserves document layout as supported by LibreOffice, but unavailable fonts may be substituted and presentation animations become static slides.

Office previews require **LibreOffice on the machine running Next.js**. On macOS, run `brew install --cask libreoffice`; on Debian/Ubuntu, install `libreoffice` using the system package manager. Standard locations and `soffice` on PATH are detected automatically. For a custom installation, set `LIBREOFFICE_PATH` to the full executable path in `.env.local` and restart the app. Production hosting must support launching this binary and writing temporary files; installing an npm package alone does not provide the converter.

Conversions use [LibreOffice's headless PDF export](https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html). Documents are processed locally in temporary directories with isolated profiles and macros disabled. Temporary files are removed after success or failure. A bounded five-minute memory cache avoids repeated conversion; converted PDFs are not added to MongoDB. Missing converter, damaged/password-protected documents, conversion timeouts, and oversized previews display an error with a retry action. No public document URL or third-party viewer is required.

`RUN_OFFICE_PREVIEW_LIVE=1 PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/browser/office-preview.spec.mjs` checks real XLSX, PPTX, DOCX, and CSV conversion through upload, PDF preview, and original download. It requires LibreOffice and a reachable database, and deletes only its own temporary uploads.

Use **Upload files** to browse or drop up to 10 files at a time, with a 10 MB limit per file. Original bytes and metadata are stored together in MongoDB, so no local upload directory or separate storage account is required. Downloads preserve the file bytes and name. Uploaded files are served as attachments, and binary content is excluded from library and assistant JSON responses. Delete removes both the metadata and stored bytes. You can edit an upload's title, description, tags, collection, and notes; use **View → Replace file** to replace its contents with a new file (up to 10 MB). The old file bytes are overwritten in one atomic MongoDB update, with no retained version or duplicate item. The item ID, title, collection, tags, notes, and favorites are preserved; its filename, size, file type, and preview update to the replacement. Failed or oversized replacements keep the current file. Regular uploads are stored in MongoDB; only images inserted into notes use Cloudinary.

The upload dialog shows a **Title** input before you choose files. Enter a title to use for your selected files, or leave it blank to use their filenames. Each queued file also has an individual **Title** input; editing it overrides the shared title for that file. Titles are saved to MongoDB and searchable in **All files** and **Uploads**, while downloads retain the original filenames. Blank individual titles are rejected, and failed uploads keep their titles for retry. Files that already uploaded successfully are not sent again.

The **Notepad** and **Uploads** sidebar sections filter the same library. The assistant can search note text and upload metadata/annotations; it does not extract contents from uploaded PDFs or other binary files. Note sources open the saved note; upload sources download the file.

The development server refreshes the cached Mongoose file model on module reload, so schema updates apply without a manual restart. Production continues to reuse its compiled model. For browser tests against another port, set `VAULT_TEST_URL` (for example `http://127.0.0.1:3010`). Note/upload integration tests create uniquely named temporary records, verify persistence and byte-for-byte download, and delete only their own records in cleanup.
