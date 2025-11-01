# TaskHub Extension – Sharing & Onboarding Guide

Use this guide when you want to hand TaskHub to a teammate or friend. It walks through the full setup, what every tab does, and the things people usually miss on day one.

---

## What TaskHub Delivers
- Turns any highlighted text (emails, docs, tickets) into structured tasks with AI-enriched fields.
- Captures full-page summaries/screenshot context, and can auto-extract tasks from the current tab.
- Records voice notes or meetings, then turns them into individual tasks (plus a meeting summary).
- Keeps work organized in a triage board (`Todo`, `In Progress`, `Done`) with drag-and-drop and inline edits.
- Syncs to Google Tasks and Google Calendar when you sign in, while keeping a local copy for offline use.

---

## 1. Prerequisites
- **Browser:** Google Chrome 127+ (or current Canary) on macOS/Windows. Those builds include Chrome’s built-in AI APIs that TaskHub uses for summarizing, writing, rewriting, translation, and multimodal audio.  
  - If Chrome is older, update via `chrome://settings/help`.
- **Enable Chrome’s Prompt API + Device Optimization (one-time):**
  1. Visit `chrome://flags/#prompt-api-for-gemini-nano` and set the flag to **Enabled**.
  2. Visit `chrome://flags/#optimization-guide-on-device-model` and set the flag to **Enabled** so Chrome downloads the on-device model TaskHub needs.
  3. Click **Relaunch** when Chrome prompts you. After restart, leave Chrome open for a few minutes so the model download completes (optional: confirm progress at `chrome://optimization-guide-internals` → On Device Model).
- **Device Optimization toggle:** Go to `chrome://settings/performance` (Performance → Device Optimization) and confirm the toggle is **On**. This makes sure Chrome schedules the Gemini Nano model locally.
- **Permissions:** Allow microphone access for the Audio tab and Google account access if you want sync.
- **Google Tasks/Calendar:** A Google Workspace or personal Google account for Tasks/Calendar sync. When you sign in, Chrome may warn that the extension isn’t from the Chrome Web Store—click **More details** → **Continue** to finish OAuth.


---

## 2. Install the Extension Locally
1. Download or clone the `TaskHubAI` folder to your machine.
2. Open Chrome and go to `chrome://extensions`.
3. Toggle **Developer mode** (top-right).
4. Click **Load unpacked** and pick the `TaskHubAI` folder.
5. Pin TaskHub to the toolbar so it is easy to find:
   - Click the puzzle piece icon → pin **TaskHub**.

> Tip: When you ship an update, teammates can revisit `chrome://extensions`, click the refresh icon on TaskHub, and reload any pages where the content script runs.

---

## 3. First Launch & Required Permissions
1. Click the TaskHub icon to open the popup.
2. Chrome may show a banner asking for permissions (storage, active tab, scripting); accept them so TaskHub can read highlights and create the floating "Capture Task" button.
3. If you plan to use voice capture, open the **Audio** tab and allow microphone access the first time Chrome prompts you. (There’s also a “Microphone Permission Required” helper in the UI if you need to grant it later.)

### Checking Chrome AI Availability
- Head to **Settings → AI Features**, then hit **Check status**.  
- If you see “Chrome AI not available,” the browser build doesn’t yet expose the LanguageModel/Summarizer APIs. Updating Chrome usually fixes this; otherwise the extension falls back to simpler extraction.

---

## 4. Capturing Tasks from the Web

### Highlight → Capture Task
1. Highlight any actionable text on a webpage.
2. A floating **Capture Task** button appears near the selection.
3. Click it to send the selection (plus surrounding context for Gmail threads) to the background AI worker.
4. You’ll get a toast confirming the task was created; open the popup’s **Today** tab to review it.

### Context Menu Shortcuts
- Right-click anywhere on a page and choose:
  1. **TaskHub – Capture task from page** – pipes the full page text through AI.
  2. **TaskHub – Capture task from screenshot** – takes a visible-area screenshot and extracts the top action items using the multimodal prompt API.

### Popup “More Actions” Menu
Inside **Today → ••• (More actions)** you’ll find:
- **Create Task Manually** – opens a modal so you can type a task, set priority, duration, deadline, project, and tags without AI.
- **Capture from Screenshot** – same as the context menu option but triggered from the popup (good if you hide right-click menus).
- **Auto Capture from Page** – grabs the current tab’s readable text via the content script and saves the strongest actionable item it finds.

---

## 5. Working with Your Task Board
- The **status pills** (`Todo`, `In Progress`, `Done`) filter the task list and show counts.
- Each task card supports:
  - A completion checkbox (moves the task to `Done`).
  - Inline edits for title, duration, project, deadline, and priority.
  - Drag-and-drop reordering via the ⋮⋮ handle (order persists in storage).
  - Screenshot preview badge if it came from an image capture (click to enlarge).
- Use the quick notification banner at the bottom of the popup to confirm saves/updates.
- Quotes at the top can be dismissed; they reappear when TaskHub fetches fresh motivation.

---

## 6. Syncing with Google Tasks & Calendar (Optional)

Before signing in, create a Google Cloud OAuth 2.0 Web application credential and add the client ID to `manifest.json → oauth2.client_id`. The OAuth consent screen must list the `https://www.googleapis.com/auth/tasks`, `calendar`, and `userinfo.email` scopes. If the client ID is missing or invalid, TaskHub stays in local-only mode and the popup will show “Google sync unavailable.”

1. Go to **Settings → Google Account** and click **Sign In with Google**.
2. Approve the OAuth window (Tasks, Calendar, user info scopes). TaskHub caches the token via `chrome.identity`, so you won’t have to paste anything manually.
3. Keep **Google Sync** toggled on (same settings card) if you want automatic sync.
   - Tasks go into a `TaskHub Tasks` list (creates it the first time) with priority/duration/notes attached.
   - Calendar events are created using your working hours defaults so you can time-block new work.
4. If you disconnect Google (Sign Out), TaskHub remains fully usable in local-only mode. A banner reminds you that sync is off.

---

## 7. Generating Daily Summaries
- Open the **Summary** tab and click **Generate Summary**.
- TaskHub compiles today’s captured tasks, groups them by project, and totals the estimated minutes.
- When Chrome’s Writer API is available, the summary is rewritten into a polish-ready narrative; otherwise you get a structured fallback.
- Use **Copy to Clipboard** or **Export as Markdown** for daily stand-ups, status reports, or knowledge bases.
- The lower sections show “Today at a Glance” stats and a “Project Breakdown” with hoverable tooltips to preview top tasks.

---

## 8. Recording Audio & Meetings
1. Switch to the **Audio** tab.
2. Pick a mode:
   - **Quick Task** – expects a single voice note; produces one task with AI-estimated priority/duration.
   - **Meeting** – extracts multiple action items and builds a meeting summary you can copy.
3. Hit **Start Recording**. Grant microphone access if asked.
4. Speak naturally. You’ll see a live transcript (Web Speech API). The timer runs until you press **Stop**.
5. After you stop, TaskHub:
   - Sends the audio blob to Chrome’s multimodal prompt API (when available).
   - Falls back to transcript-only extraction if multimodal isn’t supported.
6. Preview extracted tasks, then click **Save Tasks** to add them to the board (and sync if enabled).
7. In Meeting mode, **Copy Summary** becomes active once AI produces the recap.
8. **Cancel** clears the transcript and discards the recording.

Troubleshooting:
- If the UI shows “Microphone Permission Required,” click **Open Chrome Settings** and set TaskHub → Microphone → Allow.
- When multimodal audio isn’t available, TaskHub notes that it used the transcript fallback so you know accuracy may be lower.

---

## 9. Personalizing TaskHub
- **Theme Toggle (sun icon)** opens a modal with five themes (light, dark, minimal blue, warm, glass). The choice is stored per user.
- **Work Settings** let you set default task duration, target productive hours, and workday start time—used in summaries and calendar scheduling.
- **AI Features** toggle lets you disable Chrome AI completely (TaskHub switches to deterministic fallbacks).
- **Translation** toggle translates AI-generated task titles, projects, and tags into your chosen language (English, Spanish, French, etc.).
- **Danger Zone → Clear All Data** wipes every stored task/settings entry from `chrome.storage.local` (irreversible).

---

## 10. Tips for Sharing with Others
1. **Bundle the Folder:** Zip the `TaskHubAI` directory or share the Git repository link.
2. **Provide the Essentials:** Send this guide and a quick reminder about needing Chrome 127+.
3. **First Run Checklist:**
   - Load unpacked extension.
   - Open popup → allow highlight capture.
   - Go to Settings → connect Google (optional).
   - Test by highlighting a line in Gmail or a doc to see the "Capture Task" button.
4. **Encourage Pinning:** Having the icon visible reinforces adoption and speeds up capture.
5. **Share Best Practices:** Recommend capturing tasks directly from source material (emails, specs) and running the Summary before end-of-day stand-ups.

---

## 11. Troubleshooting & FAQ
- **No Capture Task button appears:** Refresh the page after loading the extension; ensure Chrome isn't blocking extensions on that domain.
- **AI status shows unavailable:** Update Chrome, then reopen the popup. TaskHub retries initialization when you visit Settings → AI Features.
- **Google sign-in fails or loops:** In Chrome’s extensions page, make sure the extension has permission to run in incognito/private if you test there. Otherwise, re-open the OAuth popup (user cancellation returns a silent error).
- **Audio capture stops immediately:** Microphone access was denied. Re-run permission flow from the Audio tab or use `chrome://settings/content/microphone`.
- **Need to move data to a new machine:** Copy the task list from Summary export or sign into Google Tasks so everything syncs automatically.

---

TaskHub is ready to demo out-of-the-box once it is loaded in Chrome. Share this checklist alongside the code and people will be capturing, summarizing, and scheduling tasks within minutes.
