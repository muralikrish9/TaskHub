# TaskHub - Chrome AI Extension

## Project Overview

**TaskHub** is a Chrome extension built for the Google Chrome Built-in AI Challenge 2025. The extension automates knowledge work tracking by converting highlighted text into structured tasks using Chrome's built-in AI APIs (Prompt, Summarizer, Writer). It generates daily work summaries with time tracking and project breakdowns, all processed locally for privacy.

**Hackathon**: Google Chrome Built-in AI Challenge 2025  
**Deadline**: November 1, 2025  
**Prize Categories**: Most Helpful, Best Hybrid AI Application, Best Multimodal AI Application

## Recent Changes

### October 21, 2025 - Initial Implementation
- Created complete Chrome Extension structure with Manifest V3
- Implemented highlight capture system with floating button UI
- Integrated Chrome Prompt API for intelligent task extraction
- Added Chrome Summarizer API for content condensation
- Implemented Chrome Writer API for daily summary generation
- Built popup interface with three tabs: Today, Summary, Settings
- Created local storage layer for task metadata and work context
- Added Google Calendar integration stub (marked as future feature)
- Set up documentation landing page with installation instructions
- Generated extension icons (16px, 48px, 128px)

### October 21, 2025 - Critical Bug Fixes (Architect Review)
- **Fixed data loss bug**: onInstalled now checks `details.reason` to prevent wiping tasks on extension updates
- **Added AI toggle support**: extractTaskFromText now respects the `aiEnabled` setting
- **Clarified Calendar integration**: Updated UI to show Google Calendar as "Coming Soon" instead of implying it's functional
- All changes preserve user data and improve transparency

### October 22, 2025 - Full Google Integration
- **Added OAuth2 configuration**: Updated manifest.json with Chrome Identity API permissions and OAuth2 client configuration
- **Created Google Auth module** (`google-auth.js`): OAuth token management using Chrome Identity API with sign-in/out capabilities
- **Created Google Tasks module** (`google-tasks.js`): Integration with Google Tasks API to sync captured tasks automatically
- **Created Google Calendar module** (`google-calendar.js`): Time-blocking integration to create calendar events with task duration
- **Updated background.js**: Integrated Google sync into task saving workflow with proper error handling
  - Uses Promise.allSettled to track individual API success/failure
  - Only marks task as synced if BOTH Google Tasks and Calendar succeed
  - Detailed logging for debugging sync issues
- **Updated popup UI**: Added Google sign-in interface with account status display and sync toggle
- **Updated README**: Comprehensive step-by-step Google Cloud Console setup instructions
- **Architecture Review**: Fixed critical sync reliability issues identified by architect review

## User Preferences

None specified yet.

## Project Architecture

### Extension Structure

```
├── manifest.json       # Chrome Extension Manifest V3 + OAuth2
├── background.js       # Service worker with AI & Google sync
├── content.js          # Highlight capture and UI injection
├── google-auth.js      # Google OAuth token management
├── google-tasks.js     # Google Tasks API integration
├── google-calendar.js  # Google Calendar API integration
├── popup.html          # Extension popup interface
├── popup.js            # Popup functionality and data display
├── popup.css           # Popup styling
├── icons/              # Extension icons (16px, 48px, 128px)
├── index.html          # Landing page with setup instructions
├── server.py           # Simple HTTP server for documentation
├── create_icons.py     # Icon generation script
└── README.md           # Comprehensive documentation
```

### Technology Stack

**Chrome Built-in AI APIs:**
- **Prompt API**: Task reasoning, deadline inference, priority assignment
- **Summarizer API**: Content condensation and key point extraction
- **Writer API**: Professional daily summary generation

**Chrome Extension APIs:**
- Manifest V3 with service workers
- Content scripts for DOM manipulation
- Chrome Storage API for local data persistence
- Chrome Scripting API for dynamic content injection
- Chrome Identity API for OAuth token management

**Google Cloud Integrations:**
- Google Tasks API for task syncing
- Google Calendar API for time-blocking events
- OAuth 2.0 authentication with refresh tokens

### Key Features

1. **Highlight Capture Engine** (`content.js`)
   - Detects text selection on any webpage
   - Displays floating "Capture Task" button
   - Sends selected text + context to background worker
   - Shows success/error notifications

2. **AI Processing Layer** (`background.js`)
   - Prompt API: Extracts task, priority, duration, deadline, project
   - Summarizer API: Condenses long text into actionable items
   - Writer API: Generates professional daily summaries
   - Fallback handling when AI unavailable

3. **Storage Layer** (`background.js`)
   - Chrome Storage API for task persistence
   - Task metadata: ID, text, context, timestamps
   - Settings: Calendar integration, default duration, AI toggle

4. **Google Integration** (`google-*.js`, `background.js`)
   - **OAuth Authentication**: Chrome Identity API for secure token management
   - **Google Tasks Sync**: Automatically creates tasks in user's default task list
   - **Google Calendar Sync**: Creates time-blocked events with task details
   - **Reliability**: Uses Promise.allSettled to ensure both APIs succeed before marking synced
   - **User Control**: Toggle sync on/off, sign in/out from Settings tab

5. **Dashboard Interface** (`popup.html` + `popup.js`)
   - Today tab: Task list, stats, quick capture
   - Summary tab: AI-generated reports, project breakdown
   - Settings tab: Calendar connection, AI status, data management

6. **Daily Summary Generation** (`background.js`)
   - Groups tasks by project
   - Calculates time per project
   - Uses Writer API for professional narrative
   - Export as Markdown or copy to clipboard

### Data Flow

```
User highlights text
    ↓
content.js captures selection + context
    ↓
chrome.runtime.sendMessage to background.js
    ↓
Prompt API extracts structured task data
    ↓
Summarizer API condenses description
    ↓
Save to Chrome Storage
    ↓
Optional: Create Google Calendar event
    ↓
Update popup.js display
```

### AI Availability Handling

The extension checks AI availability on initialization:
- If APIs available: Use full AI-powered extraction
- If APIs unavailable: Fallback to basic text parsing
- Display AI status in Settings tab

### Privacy & Security

- All AI processing happens locally (no external API calls)
- Tasks stored locally using Chrome Storage API
- No API keys required for AI features
- Google Calendar requires explicit user permission
- No tracking or analytics

## Development Notes

### Running the Documentation Server

```bash
python server.py
```

The server runs on port 5000 and serves the landing page with installation instructions.

### Loading the Extension in Chrome

1. Use Chrome Canary or Chrome Dev
2. Join Chrome Built-in AI Early Preview Program
3. Enable AI flags in chrome://flags
4. Load unpacked extension from chrome://extensions

### Testing

1. Visit any webpage
2. Highlight text (>10 characters)
3. Click "Capture Task" button
4. Open extension popup to view captured tasks
5. Generate daily summary in Summary tab

### Known Limitations

- Requires Chrome Canary/Dev with AI APIs enabled
- AI APIs currently in experimental phase
- Google Calendar integration requires manual connection setup
- No multimodal (image/audio) support yet (planned)

## Next Steps

### MVP Complete ✅
- ✅ Highlight capture with floating UI
- ✅ AI task extraction (Prompt API)
- ✅ AI content summarization (Summarizer API)
- ✅ Daily summary generation (Writer API)
- ✅ Local storage with Chrome Storage API
- ✅ Popup interface with 3 tabs
- ✅ Google OAuth authentication
- ✅ Google Tasks integration
- ✅ Google Calendar time-blocking

### Future Enhancements
- [ ] Screenshot capture with OCR for visual task extraction
- [ ] Multimodal AI (image/audio input via Prompt API)
- [ ] Additional task manager integrations (Notion, Linear, Asana)
- [ ] Weekly/monthly aggregation mode
- [ ] Chrome Proofreader API for summary refinement
- [ ] Batch sync retry for failed Google syncs
- [ ] Export functionality improvements (PDF, CSV)

## Hackathon Submission Checklist

- [x] Extension uses Chrome built-in AI APIs (Prompt, Summarizer, Writer)
- [x] Open source repository with MIT license
- [ ] Demo video (< 3 minutes)
- [ ] Public GitHub repository
- [ ] Text description with APIs used and problem solved
- [ ] Working application accessible for testing
- [ ] English documentation

## Resources

- [Chrome Built-in AI Documentation](https://developer.chrome.com/docs/ai/built-in-apis)
- [Google Chrome AI Challenge 2025](https://googlechromeai2025.devpost.com/)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome AI Early Preview Program](https://developer.chrome.com/docs/ai/join-epp)
