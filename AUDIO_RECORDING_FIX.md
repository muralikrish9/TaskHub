# Audio Recording Fix - Offscreen Document Implementation

## Problem
Chrome extension popups cannot directly call `getUserMedia()` for microphone access. The permission prompt would be dismissed, and Chrome wouldn't re-prompt, causing a `NotAllowedError: Permission dismissed` error.

## Solution
Implemented **Offscreen Document API** - the official Chrome Extension solution for media capture in Manifest V3.

## What Changed

### 1. Created Offscreen Document (`offscreen.html` + `offscreen.js`)
- Offscreen documents CAN call `getUserMedia()` and show permission prompts
- Handles MediaRecorder API for audio capture
- Converts audio to data URL and sends back to extension

### 2. Updated `manifest.json`
```json
"permissions": [
  "offscreen"  // Changed from "tabCapture" or "audioCapture"
]
```

### 3. Updated `background.js`
- Added `setupOffscreenDocument()` - creates offscreen document on demand
- Added message handlers:
  - `startOffscreenRecording` - creates offscreen doc and starts recording
  - `stopOffscreenRecording` - stops recording and returns audio data

### 4. Updated `popup.js`
- Removed direct `getUserMedia()` calls
- Removed `audio-capture.js` import (no longer needed)
- Simplified to use message passing to offscreen document:
  ```javascript
  startRecording(mode) → sends message to background → creates offscreen → records audio
  stopRecording() → sends message → returns audio data URL
  ```

### 5. Removed `audio-capture.js` dependency
- All audio capture logic now in `offscreen.js`
- Popup just coordinates UI and sends messages

## How It Works Now

1. User clicks "Start Recording" in popup
2. Popup sends `startOffscreenRecording` message to background
3. Background creates offscreen document (if not exists)
4. Background forwards `startRecording` to offscreen document
5. Offscreen document calls `getUserMedia()` - **permission prompt appears!**
6. User grants permission
7. Offscreen document records audio using MediaRecorder
8. User clicks "Stop Recording"
9. Offscreen document converts audio to data URL
10. Returns audio data to popup via background
11. Popup processes audio with AI (multimodal Prompt API)

## Why This Works

- **Offscreen documents** are invisible HTML pages that run in the extension context
- They have access to web APIs like `getUserMedia()`, `MediaRecorder`, etc.
- They can show permission prompts (unlike popups)
- They persist across popup opens/closes
- They're the official Chrome solution for media in extensions

## Files Created
- `offscreen.html` - HTML container for offscreen document
- `offscreen.js` - Audio recording logic with MediaRecorder
- `AUDIO_RECORDING_FIX.md` - This document

## Files Modified
- `manifest.json` - Added "offscreen" permission
- `background.js` - Added offscreen document management
- `popup.js` - Simplified to use offscreen recording

## Files No Longer Used
- `audio-capture.js` - Replaced by `offscreen.js`

## Testing
1. Reload the extension
2. Open the extension popup
3. Go to the "Audio" tab
4. Click "Start Recording"
5. **You should now see the microphone permission prompt!**
6. Grant permission
7. Recording should start successfully
8. Speak some text
9. Click "Stop Recording"
10. Audio will be processed with AI and tasks extracted

## References
- [Chrome Offscreen Documents](https://developer.chrome.com/docs/extensions/reference/offscreen/)
- [Chrome Extension Audio Capture](https://developer.chrome.com/docs/extensions/mv3/user_media/)



