# Google OAuth Setup Guide

## Overview

TaskHub uses Chrome Identity API for Google OAuth authentication. This means **users don't need to set up their own OAuth keys** - the extension uses a single OAuth client ID tied to the extension.

## Current Configuration

The extension is already configured with:
- **OAuth Client ID**: `919088017561-7s3d5vohbmovqctj3iq9fg4uiruiqktq.apps.googleusercontent.com`
- **Scopes**: 
  - `https://www.googleapis.com/auth/tasks`
  - `https://www.googleapis.com/auth/calendar`
  - `https://www.googleapis.com/auth/userinfo.email`

## For Development

The current OAuth client ID in `manifest.json` should work for development. If you need to create a new one:

### Steps to Create Chrome App OAuth Client:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth client ID**
5. Select **Chrome App** as the application type
6. Enter your Extension ID (found in `chrome://extensions/` after loading unpacked extension)
7. Add the required scopes:
   - Google Tasks API
   - Google Calendar API
   - Userinfo.email
8. Save the Client ID
9. Update `manifest.json` with the new Client ID

## For Chrome Web Store Publication

When publishing to Chrome Web Store:

### 1. OAuth Verification Required

Since TaskHub requests sensitive scopes (Tasks and Calendar), you'll need to:

1. **Submit for OAuth verification** in Google Cloud Console
2. **Provide a privacy policy URL** (required for sensitive scopes)
3. **Complete the OAuth consent screen** with:
   - App name: TaskHub
   - User support email
   - Developer contact information
   - Application home page
   - Privacy policy URL
   - Terms of service URL (optional but recommended)

### 2. Privacy Policy Requirements

You'll need to host a privacy policy that covers:

- What data is collected: Tasks, calendar events, Google account email
- How data is used: Task synchronization, calendar scheduling
- Data storage: Local storage in Chrome extension, synced to Google Tasks/Calendar
- User rights: Ability to disconnect Google account, delete data
- Data deletion: How users can remove their data

### 3. Verification Timeline

- **Basic verification**: 1-2 weeks
- **Sensitive scopes**: 4-6 weeks (Tasks and Calendar require more review)

## Privacy Policy Template

A minimal privacy policy should include:

```
TaskHub Privacy Policy

What We Collect:
- Task information you create
- Calendar scheduling preferences
- Your Google account email (for sync)

How We Use It:
- Store tasks locally in your browser
- Sync tasks to Google Tasks (if enabled)
- Schedule tasks in Google Calendar (if enabled)

Data Storage:
- All data is stored locally in your Chrome browser
- If Google sync is enabled, tasks are synced to your Google account
- We do not store your data on external servers

Your Rights:
- You can disable Google sync at any time
- You can delete all local data from extension settings
- You can revoke OAuth access in your Google account settings

Contact:
[Your email]
```

## Local-Only Mode

If users don't sign in with Google, TaskHub works in **local-only mode**:
- All tasks are saved locally in Chrome storage
- No data is sent to Google servers
- Users can enable Google sync later if desired

## Testing

To test OAuth:

1. Load the extension unpacked in Chrome
2. Go to Settings tab
3. Click "Sign in with Google"
4. Complete the OAuth consent flow
5. Verify tasks sync to Google Tasks and Calendar

## Troubleshooting

**"OAuth2 access denied"**: User cancelled the sign-in flow. This is expected and the app will work in local-only mode.

**"Failed to get token"**: Check that:
- Extension ID matches the OAuth client configuration
- Required APIs are enabled in Google Cloud Console
- Scopes match in both places

## Implementation Notes

- Uses `chrome.identity.getAuthToken()` - no client secret needed
- Tokens are cached and auto-refreshed by Chrome
- Invalid tokens are automatically cleared on 401 errors
- All API requests include automatic token refresh retry logic

