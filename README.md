# TaskHub - AI-Powered Chrome Extension

TaskHub is a Chrome extension built for the Google Chrome Built-in AI Challenge 2025. It converts highlighted text into structured tasks using Chrome's built-in AI APIs and automatically syncs them to your Google Calendar and Google Tasks.

## Features

- **Smart Task Capture**: Highlight any text on any webpage and instantly convert it into a structured task
- **AI-Powered Processing**: Uses Chrome's built-in Prompt, Summarizer, and Writer APIs for intelligent task extraction
- **Google Integration**: Automatic sync to Google Tasks and Google Calendar with smart scheduling
- **Voice Capture**: Record voice notes and meetings, automatically extracting action items
- **Screenshot Analysis**: Capture screenshots and extract tasks from visual content
- **Privacy-First**: All AI processing happens locally on your device
- **Clean UI**: Beautiful, modern interface with drag-and-drop task management

## Quick Start

1. **Enable Chrome AI APIs**:
   - Visit `chrome://flags/#prompt-api-for-gemini-nano` and set to **Enabled**
   - Visit `chrome://flags/#optimization-guide-on-device-model` and set to **Enabled**
   - Click **Relaunch** and wait for model download

2. **Install Extension**:
   - Clone this repository
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select this folder

3. **Set Up Google Integration** (Optional):
   - Go to Settings in the extension popup
   - Click "Sign in with Google"
   - Follow the OAuth flow

4. **Start Using**:
   - Highlight any text on any webpage
   - Click "Capture Task" button
   - Watch your task appear in the extension and Google Calendar!

## Project Structure

```
TaskHub/
├── manifest.json          # Extension manifest
├── background.js          # Service worker with AI logic
├── content.js             # Content script for capture UI
├── popup.html/js/css      # Extension popup interface
├── google-auth.js         # OAuth authentication
├── google-tasks.js        # Google Tasks API
├── google-calendar.js     # Google Calendar API
├── audio-capture.js       # Voice recording
├── offscreen.html/js      # Audio processing context
├── icons/                 # Extension icons
├── Office Code Pro/       # Custom fonts
└── *.md                   # Documentation
```

## Documentation

- **[USAGE_GUIDE.md](USAGE_GUIDE.md)** - Complete user guide
- **[OAUTH_SETUP.md](OAUTH_SETUP.md)** - Google Cloud setup instructions
- **[AUDIO_FEATURE_GUIDE.md](AUDIO_FEATURE_GUIDE.md)** - Voice capture guide
- **[TASKHUB_STORY.md](TASKHUB_STORY.md)** - Project story and motivation
- **[DEVPOST_STORY.md](DEVPOST_STORY.md)** - Hackathon submission story

## Technology

- **Chrome Built-in AI APIs**: Prompt, Summarizer, Writer, Rewriter, Translator
- **Chrome Extension APIs**: Manifest V3, Service Workers, Content Scripts
- **Google APIs**: Tasks API, Calendar API, OAuth 2.0
- **Languages**: JavaScript, HTML, CSS
- **Architecture**: Event-driven service worker with modular design

## License

MIT License - See [LICENSE](LICENSE) file for details

## Development

Built with ❤️ for the Google Chrome Built-in AI Challenge 2025

