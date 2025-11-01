import { getAuthToken, isSignedIn, revokeToken, getUserEmail, signIn, signOut, checkAuthStatus } from './google-auth.js';
import { syncTask as syncToGoogleTasks, deleteTask as deleteFromGoogleTasks } from './google-tasks.js';
import { syncTaskToCalendar, deleteEvent as deleteFromGoogleCalendar } from './google-calendar.js';

let aiSession = null;
let summarizerSession = null;
let writerSession = null;
let rewriterSession = null;
// Note: Translator sessions are created on-demand, not stored globally
let audioMultimodalSupported = true;

function markAudioUnsupported(reason) {
  if (audioMultimodalSupported) {
    audioMultimodalSupported = false;
    console.warn('[Audio Extract] Disabling Chrome AI audio pipeline:', reason);
  }
}

// Offscreen document management for audio recording
async function setupOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('offscreen.html')]
  });

  if (existingContexts.length > 0) {
    console.log('[Offscreen] Document already exists');
    return;
  }

  console.log('[Offscreen] Creating offscreen document for speech recognition');
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Speech recognition for voice task capture'
  });
  console.log('[Offscreen] Document created successfully');
}

async function initializeAI() {
  console.log('[AI Init] Starting AI initialization...');

  try {
    // Initialize Prompt API using Chrome's global LanguageModel constructor
    try {
      console.log('[AI Init] Creating LanguageModel session with language [en]...');
      aiSession = await LanguageModel.create(['en']);
      console.log('[AI Init] ✓ Prompt API (LanguageModel) initialized successfully');
    } catch (error) {
      console.error('[AI Init] ✗ Failed to initialize Prompt API (LanguageModel):', error);
      console.error('[AI Init] Error details:', error.message);
    }

    // Initialize Summarizer API using Chrome's global Summarizer constructor
    try {
      console.log('[AI Init] Creating Summarizer session...');
      summarizerSession = await Summarizer.create({
        type: 'key-points',
        format: 'plain-text',
        length: 'short'
      });
      console.log('[AI Init] ✓ Summarizer API initialized successfully');
    } catch (error) {
      console.error('[AI Init] ✗ Failed to initialize Summarizer API:', error);
      console.error('[AI Init] Error details:', error.message);
    }

    // Initialize Writer API using Chrome's global Writer constructor
    try {
      console.log('[AI Init] Creating Writer session...');
      writerSession = await Writer.create({
        tone: 'formal',
        format: 'plain-text',
        length: 'medium'
      });
      console.log('[AI Init] ✓ Writer API initialized successfully');
    } catch (error) {
      console.error('[AI Init] ✗ Failed to initialize Writer API:', error);
      console.error('[AI Init] Error details:', error.message);
    }

    // Initialize Rewriter API using Chrome's global Rewriter constructor
    try {
      console.log('[AI Init] Creating Rewriter session...');
      rewriterSession = await Rewriter.create({
        tone: 'as-is',
        format: 'plain-text',
        length: 'as-is'
      });
      console.log('[AI Init] ✓ Rewriter API initialized successfully');
    } catch (error) {
      console.error('[AI Init] ✗ Failed to initialize Rewriter API:', error);
      console.error('[AI Init] Error details:', error.message);
    }

    // Check Translator API availability (but don't initialize yet)
    // Translator will be created on-demand when needed with specific source/target languages
    try {
      console.log('[AI Init] Checking Translator API availability...');
      if (typeof Translator !== 'undefined') {
        console.log('[AI Init] ✓ Translator API is available');
        // We'll create translator sessions on-demand in translateText()
      } else {
        console.log('[AI Init] ⚠ Translator API not available (trial token may be missing)');
      }
    } catch (error) {
      console.error('[AI Init] ✗ Failed to check Translator API:', error);
      console.error('[AI Init] Error details:', error.message);
    }

    const hasTranslator = typeof Translator !== 'undefined';
    const hasAnyAI = !!(aiSession || summarizerSession || writerSession || rewriterSession || hasTranslator);
    console.log('[AI Init] ========================================');
    console.log('[AI Init] Initialization complete:');
    console.log('[AI Init]   - LanguageModel (Prompt):', aiSession ? '✓ Ready' : '✗ Failed');
    console.log('[AI Init]   - Summarizer:', summarizerSession ? '✓ Ready' : '✗ Failed');
    console.log('[AI Init]   - Writer:', writerSession ? '✓ Ready' : '✗ Failed');
    console.log('[AI Init]   - Rewriter:', rewriterSession ? '✓ Ready' : '✗ Failed');
    console.log('[AI Init]   - Translator:', hasTranslator ? '✓ Available' : '✗ Not Available');
    console.log('[AI Init] ========================================');
    return hasAnyAI;
  } catch (error) {
    console.error('[AI Init] ✗ Complete failure during AI initialization:', error);
    return false;
  }
}

async function translateText(text, targetLanguage, sourceLanguage = 'en') {
  // Check if Translator API is available
  if (typeof Translator === 'undefined') {
    console.log('[Translate] Translator API not available');
    return null;
  }

  try {
    console.log('[Translate] Creating translator session (', sourceLanguage, '→', targetLanguage, ')');

    // Create translator on-demand with specific source and target languages
    // Note: Chrome's Translator API doesn't support 'auto' detection, so we use 'en' as default
    const translator = await Translator.create({
      sourceLanguage: sourceLanguage,
      targetLanguage: targetLanguage
    });

    console.log('[Translate] Translating text...');
    const translated = await translator.translate(text);
    console.log('[Translate] ✓ Translation successful');

    // Destroy the translator session to free resources
    if (translator.destroy) {
      await translator.destroy();
    }

    return translated;
  } catch (error) {
    console.error('[Translate] Translation failed:', error);
    console.error('[Translate] Error details:', error.message);
    return null;
  }
}

async function extractTaskFromText(text, context) {
  console.log('[Task Extract] Starting extraction for text:', text.substring(0, 100));
  console.log('[Task Extract] Context:', context);

  try {
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || { aiEnabled: true };
    console.log('[Task Extract] Settings loaded:', settings);
    console.log('[Task Extract] Translation enabled:', settings.translationEnabled);
    console.log('[Task Extract] Translation language:', settings.translationLanguage);

    if (!settings.aiEnabled) {
      console.log('[Task Extract] AI disabled in settings, using fallback');
      return createFallbackTask(text, context);
    }

    if (!aiSession) {
      console.log('[Task Extract] No AI session, attempting to initialize...');
      await initializeAI();
    }

    if (!aiSession) {
      console.log('[Task Extract] Still no AI session after init, using fallback');
      return createFallbackTask(text, context);
    }

    console.log('[Task Extract] Using AI to extract task...');

    // Smart context expansion: use full email context if available
    let textToAnalyze = text;
    if (context.fullEmailContext && context.fullEmailContext.length > text.length) {
      console.log('[Task Extract] Using full email context for better task extraction');
      textToAnalyze = `Selected text: "${text}"\n\nFull email context:\n"${context.fullEmailContext}"`;
    }

    console.log('[Task Extract] Translation setting - enabled:', settings.translationEnabled, 'language:', settings.translationLanguage);

    // First, summarize the text to get a cleaner version
    let summarizedText = textToAnalyze;
    if (summarizerSession && textToAnalyze.length > 200) {
      try {
        console.log('[Task Extract] Summarizing text for cleaner extraction...');
        summarizedText = await summarizerSession.summarize(textToAnalyze);
        console.log('[Task Extract] ✓ Text summarized:', summarizedText.substring(0, 100) + '...');
      } catch (error) {
        console.log('[Task Extract] Summarization failed, using original text:', error);
        summarizedText = textToAnalyze;
      }
    }

    const prompt = `Analyze the following text and extract a clear, actionable task.

Context:
- Page: ${context.title}
- URL: ${context.url}

Text to analyze:
"${summarizedText}"

Extract the following in JSON format:
{
  "task": "Clear, concise, actionable task description (max 50 words)",
  "priority": "high|medium|low",
  "estimatedDuration": number in minutes,
  "deadline": "inferred deadline or null",
  "project": "inferred project/category name",
  "tags": ["tag1", "tag2"]
}

Requirements:
- Task description should be concise and focused on the key action
- Remove unnecessary context and verbose language
- Make it scannable and actionable
- If it's an email or long text, extract the core task/action item
- Be specific about what needs to be done`;

    console.log('[Task Extract] Sending prompt to AI...');
    const response = await aiSession.prompt(prompt);
    console.log('[Task Extract] AI response received:', response);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const extracted = JSON.parse(jsonMatch[0]);
        console.log('[Task Extract] ✓ Successfully parsed AI response:', extracted);

        // Translate visible fields if localization is enabled
        if (settings.translationEnabled && settings.translationLanguage && settings.translationLanguage !== 'en') {
          const targetLang = settings.translationLanguage;
          try {
            if (extracted.task) {
              console.log('[Task Extract] Translating task description to', targetLang);
              const translatedTask = await translateText(extracted.task, targetLang, 'en');
              if (translatedTask) {
                extracted.task = translatedTask;
              }
            }

            if (extracted.project) {
              console.log('[Task Extract] Translating project name to', targetLang);
              const translatedProject = await translateText(extracted.project, targetLang, 'en');
              if (translatedProject) {
                extracted.project = translatedProject;
              }
            }

            if (Array.isArray(extracted.tags) && extracted.tags.length > 0) {
              console.log('[Task Extract] Translating tags to', targetLang);
              const joinedTags = extracted.tags.join('\n');
              const translatedTags = await translateText(joinedTags, targetLang, 'en');
              if (translatedTags) {
                extracted.tags = translatedTags
                  .split('\n')
                  .map(tag => tag.trim())
                  .filter(tag => tag.length > 0);
              }
            }
          } catch (error) {
            console.error('[Task Extract] Failed to translate output fields:', error);
            // Keep English fields if translation fails
          }
        }

        return {
          ...extracted,
          source: 'ai',
          originalText: text,
          context: context
        };
      } else {
        console.warn('[Task Extract] No JSON found in AI response');
      }
    } catch (e) {
      console.error('[Task Extract] Failed to parse AI response:', e);
    }

    console.log('[Task Extract] Falling back to basic extraction');
    return createFallbackTask(text, context);
  } catch (error) {
    console.error('[Task Extract] ✗ Task extraction failed:', error);
    return createFallbackTask(text, context);
  }
}

async function summarizeText(text) {
  try {
    if (summarizerSession) {
      console.log('[Summarizer] Using AI to summarize text');
      return await summarizerSession.summarize(text);
    }

    console.log('[Summarizer] No AI available, using truncation');
    return text.length > 100 ? text.substring(0, 100) + '...' : text;
  } catch (error) {
    console.error('[Summarizer] Summarization failed:', error);
    return text.substring(0, 100);
  }
}

function createFallbackTask(text, context) {
  console.log('[Fallback] Creating fallback task');

  // Create a more concise summary for fallback
  let summary = text;
  if (text.length > 80) {
    // Try to find a good break point (sentence end, comma, etc.)
    const breakPoints = ['. ', '! ', '? ', ', ', '; '];
    let bestBreak = 80;

    for (const breakPoint of breakPoints) {
      const index = text.lastIndexOf(breakPoint, 80);
      if (index > 40) {
        bestBreak = index + breakPoint.length;
        break;
      }
    }

    summary = text.substring(0, bestBreak).trim();
    if (summary.length < text.length) {
      summary += '...';
    }
  }

  return {
    task: summary,
    priority: 'medium',
    estimatedDuration: 30,
    deadline: null,
    project: context.title || 'General',
    tags: [],
    source: 'fallback',
    originalText: text,
    context: context
  };
}

// NOTE: This function is currently not used because Chrome's Prompt API multimodal audio is not yet supported.
// Keeping it here for future when the API becomes available.
async function extractTasksFromAudio(dataUrl, mode, context) {
  console.log('[Audio Extract] Starting multimodal audio processing for mode:', mode);

  try {
    if (!audioMultimodalSupported) {
      console.log('[Audio Extract] Multimodal audio disabled, skipping to transcript fallback');
      return [];
    }

    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || { aiEnabled: true };

    if (!settings.aiEnabled || !aiSession) {
      console.log('[Audio Extract] AI disabled or unavailable, using fallback');
      return [];
    }

    if (mode === 'quick') {
      // Quick mode: extract single task from audio
      console.log('[Audio Extract] Quick mode - extracting single task from audio');

      const prompt = `Listen to this audio recording and extract a clear, actionable task from it.

Extract the following in JSON format:
{
  "task": "Clear, concise, actionable task description (max 50 words)",
  "priority": "high|medium|low",
  "estimatedDuration": number in minutes,
  "deadline": "inferred deadline or null",
  "project": "inferred project/category name",
  "tags": ["tag1", "tag2"]
}

Requirements:
- Task description should be concise and focused on the key action
- Remove unnecessary context and verbose language
- Make it scannable and actionable
- Be specific about what needs to be done`;

      console.log('[Audio Extract] Sending multimodal prompt to AI with audio...');

      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const audioBlob = await response.blob();
      
      console.log('[Audio Extract] Audio blob details:', {
        size: audioBlob.size,
        type: audioBlob.type
      });

      // Convert to File object with proper name and type (required for multimodal API)
      const audioFile = new File([audioBlob], 'audio.webm', { 
        type: audioBlob.type || 'audio/webm'
      });
      
      console.log('[Audio Extract] Calling AI with multimodal input...');

      const aiResponse = await aiSession.prompt(prompt, { audio: audioFile });
      console.log('[Audio Extract] AI response received:', aiResponse);

      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extracted = JSON.parse(jsonMatch[0]);
          console.log('[Audio Extract] ✓ Successfully parsed AI response:', extracted);
          return [{
            ...extracted,
            source: 'audio-quick',
            originalText: 'Captured from audio recording',
            context: context
          }];
        } else {
          console.warn('[Audio Extract] No JSON found in AI response');
          const normalized = (aiResponse || '').toLowerCase();
          if (normalized.includes('provide') && normalized.includes('audio')) {
            markAudioUnsupported('API requested manual audio upload (quick)');
          }
        }
      } catch (e) {
        console.error('[Audio Extract] Failed to parse AI response:', e);
        markAudioUnsupported(e.message || 'Parse error (quick)');
      }

      // No structured result; signal caller to fallback to transcript
      console.log('[Audio Extract] Returning empty result for transcript fallback');
      return [];

    } else {
      // Meeting mode: extract multiple tasks from audio
      console.log('[Audio Extract] Meeting mode - extracting multiple tasks from audio');

      const prompt = `Listen to this meeting audio recording and extract all action items and tasks.

Extract multiple tasks in JSON array format:
[
  {
    "task": "Clear, actionable task description (max 50 words)",
    "priority": "high|medium|low",
    "estimatedDuration": number in minutes,
    "assignee": "person name if mentioned, or null",
    "deadline": "inferred deadline or null",
    "project": "inferred project or category name",
    "tags": ["tag1", "tag2"]
  }
]

Requirements:
- Extract ALL actionable items from the meeting
- Be specific about what needs to be done
- Include context about who should do it if mentioned
- Each task should be independent and actionable
- Priority based on language cues (urgent, important, ASAP = high)
- Estimate duration based on task complexity`;

      console.log('[Audio Extract] Sending multimodal prompt to AI for meeting extraction...');

      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const audioBlob = await response.blob();
      
      console.log('[Audio Extract] Audio blob details:', {
        size: audioBlob.size,
        type: audioBlob.type
      });

      // Convert to File object with proper name and type (required for multimodal API)
      const audioFile = new File([audioBlob], 'meeting.webm', { 
        type: audioBlob.type || 'audio/webm'
      });
      
      console.log('[Audio Extract] Calling AI with multimodal input...');

      const aiResponse = await aiSession.prompt(prompt, { audio: audioFile });
      console.log('[Audio Extract] AI response received:', aiResponse);

      try {
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const tasks = JSON.parse(jsonMatch[0]);
          console.log('[Audio Extract] ✓ Successfully parsed', tasks.length, 'tasks');

          // Add metadata to each task
          return tasks.map(task => ({
            ...task,
            source: 'audio-meeting',
            originalText: 'Captured from audio recording',
            context: context
          }));
        } else {
          console.warn('[Audio Extract] No JSON array found in AI response');
          const normalized = (aiResponse || '').toLowerCase();
          if (normalized.includes('provide') && normalized.includes('audio')) {
            markAudioUnsupported('API requested manual audio upload (meeting)');
          }
        }
      } catch (e) {
        console.error('[Audio Extract] Failed to parse AI response:', e);
        markAudioUnsupported(e.message || 'Parse error (meeting)');
      }

      console.log('[Audio Extract] Returning empty result for transcript fallback (meeting)');
      return [];
  }
} catch (error) {
  console.error('[Audio Extract] ✗ Audio processing failed:', error);
  markAudioUnsupported(error.message || 'Audio processing error');
  return [];
}
}

// Legacy function for transcript-based processing (kept for compatibility)
async function extractTasksFromTranscript(transcript, mode, context) {
  console.log('[Transcript Extract] Processing transcript text for mode:', mode);
  
  try {
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || { aiEnabled: true };

    if (!settings.aiEnabled || !aiSession) {
      console.log('[Transcript Extract] AI disabled or unavailable, using fallback');
      return [createFallbackTask(transcript.substring(0, 100), context)];
    }

    if (mode === 'quick') {
      // Quick mode: extract single task from transcript
      console.log('[Transcript Extract] Quick mode - extracting single task');

      const prompt = `Extract a clear, actionable task from this speech transcript:

"${transcript}"

Return ONLY a JSON object with this exact format (no other text):
{
  "task": "Clear, concise, actionable task description (max 50 words)",
  "priority": "high|medium|low",
  "estimatedDuration": number in minutes,
  "deadline": "inferred deadline or null",
  "project": "inferred project/category name",
  "tags": ["tag1", "tag2"]
}

Requirements:
- Task description should be focused on the key action
- Remove unnecessary context and verbose language
- Make it scannable and actionable
- Be specific about what needs to be done`;

      console.log('[Transcript Extract] Sending prompt to AI...');
      const aiResponse = await aiSession.prompt(prompt);
      console.log('[Transcript Extract] AI response received:', aiResponse);

      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extracted = JSON.parse(jsonMatch[0]);
          console.log('[Transcript Extract] ✓ Successfully parsed AI response');
          return [{
            ...extracted,
            source: 'audio-quick',
            originalText: transcript,
            context: context
          }];
        }
      } catch (parseError) {
        console.error('[Transcript Extract] Failed to parse JSON:', parseError);
      }

      console.log('[Transcript Extract] Using fallback for quick mode');
      return [createFallbackTask(transcript.substring(0, 100), context)];

    } else if (mode === 'meeting') {
      // Meeting mode: extract multiple tasks
      console.log('[Transcript Extract] Meeting mode - extracting multiple tasks');

      const prompt = `Extract all actionable tasks from this meeting transcript:

"${transcript}"

Return ONLY a JSON array with this exact format (no other text):
[
  {
    "task": "Clear, actionable task description",
    "priority": "high|medium|low",
    "estimatedDuration": number in minutes,
    "deadline": "inferred deadline or null",
    "project": "project name",
    "tags": ["tag1", "tag2"]
  }
]

Requirements:
- Extract ALL distinct tasks mentioned
- Make each task clear and actionable
- Infer priority based on urgency/importance in the conversation
- Estimate realistic durations
- Identify any mentioned deadlines`;

      console.log('[Transcript Extract] Sending prompt to AI...');
      const aiResponse = await aiSession.prompt(prompt);
      console.log('[Transcript Extract] AI response received');

      try {
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const extracted = JSON.parse(jsonMatch[0]);
          console.log('[Transcript Extract] ✓ Extracted', extracted.length, 'tasks');
          return extracted.map(task => ({
            ...task,
            source: 'audio-meeting',
            originalText: transcript,
            context: context
          }));
        }
      } catch (parseError) {
        console.error('[Transcript Extract] Failed to parse JSON:', parseError);
      }

      console.log('[Transcript Extract] Using fallback for meeting mode');
      return [createFallbackTask(transcript.substring(0, 100), context)];
    }

  } catch (error) {
    console.error('[Transcript Extract] ✗ Failed to process transcript:', error);
    return [createFallbackTask('Audio recording captured', context)];
  }
}

async function extractTasksFromAudioTranscript(transcript, mode, context) {
  // Fallback: use new transcript extraction
  return extractTasksFromTranscript(transcript, mode, context);
}

async function generateMeetingSummary(transcript, extractedTasks) {
  console.log('[Meeting Summary] Generating summary for', extractedTasks.length, 'tasks');

  try {
    if (!writerSession) {
      console.log('[Meeting Summary] Writer API not available, using basic summary');
      return createBasicMeetingSummary(transcript, extractedTasks);
    }

    const tasksText = extractedTasks.map((t, i) =>
      `${i + 1}. ${t.task} (${t.priority} priority, ${t.estimatedDuration || 30} min)`
    ).join('\n');

    const prompt = `Create a professional meeting summary.

Meeting Transcript:
"${transcript.substring(0, 1500)}${transcript.length > 1500 ? '...' : ''}"

Action Items:
${tasksText}

Generate a comprehensive meeting summary in the following format:

MEETING SUMMARY
==============

Overview:
[2-3 sentence overview of the meeting]

Key Discussion Points:
[Bullet points of main topics discussed]

Decisions Made:
[Any decisions or conclusions reached]

Action Items:
${tasksText}

Next Steps:
[Brief summary of follow-up actions]

Format: Professional, clear, and actionable.`;

    console.log('[Meeting Summary] Using Writer API to generate summary...');
    const summary = await writerSession.write(prompt);
    console.log('[Meeting Summary] ✓ Summary generated');
    return summary;
  } catch (error) {
    console.error('[Meeting Summary] Writer API failed, using fallback:', error);
    return createBasicMeetingSummary(transcript, extractedTasks);
  }
}

function createBasicMeetingSummary(transcript, extractedTasks) {
  const transcriptPreview = transcript.length > 300 ? transcript.substring(0, 300) + '...' : transcript;
  const tasksText = extractedTasks.map((t, i) =>
    `${i + 1}. ${t.task} (${t.priority} priority, ~${t.estimatedDuration || 30} min)`
  ).join('\n');

  return `MEETING SUMMARY
==============

Transcript Preview:
${transcriptPreview}

Action Items Extracted:
${tasksText}

Total Action Items: ${extractedTasks.length}
Estimated Total Time: ${extractedTasks.reduce((sum, t) => sum + (t.estimatedDuration || 30), 0)} minutes`;
}

async function saveTask(taskData) {
  console.log('[Save Task] Saving task:', taskData);
  const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const task = {
    id: taskId,
    ...taskData,
    createdAt: new Date().toISOString(),
    completed: false,
    syncedToGoogle: false,
    status: 'todo',
    order: Date.now()
  };

  const result = await chrome.storage.local.get(['tasks', 'settings']);
  const tasks = result.tasks || [];
  const settings = result.settings || { googleSyncEnabled: true };

  tasks.push(task);
  await chrome.storage.local.set({ tasks });
  console.log('[Save Task] ✓ Task saved locally. Total tasks:', tasks.length);

  if (settings.googleSyncEnabled) {
    try {
      const signedIn = await isSignedIn();
      if (signedIn) {
        console.log('[Save Task] Syncing to Google services...');

        const results = await Promise.allSettled([
          syncToGoogleTasks(task),
          syncTaskToCalendar(task)
        ]);

        const tasksSuccess = results[0].status === 'fulfilled';
        const calendarSuccess = results[1].status === 'fulfilled';

        if (!tasksSuccess) {
          console.error('[Save Task] ✗ Google Tasks sync failed:', results[0].reason);
        }
        if (!calendarSuccess) {
          console.error('[Save Task] ✗ Google Calendar sync failed:', results[1].reason);
        }

        if (tasksSuccess && calendarSuccess) {
          task.syncedToGoogle = true;
          // Store Google IDs for future deletion
          if (results[0].value && results[0].value.id) {
            task.googleTaskId = results[0].value.id;
          }
          if (results[1].value && results[1].value.id) {
            task.googleEventId = results[1].value.id;
          }
          const updatedTasks = tasks.map(t => t.id === task.id ? task : t);
          await chrome.storage.local.set({ tasks: updatedTasks });
          console.log('[Save Task] ✓ Task synced to Google Tasks and Calendar');
        } else if (tasksSuccess || calendarSuccess) {
          console.log('[Save Task] ⚠ Partial sync success (Tasks:', tasksSuccess, 'Calendar:', calendarSuccess, ')');
        } else {
          console.log('[Save Task] ✗ Google sync failed completely');
        }
      } else {
        console.log('[Save Task] User not signed in to Google, skipping sync');
      }
    } catch (error) {
      console.error('[Save Task] ✗ Google sync failed:', error);
      // Don't fail the entire task save if Google sync fails
    }
  }

  return task;
}

async function createCalendarEvent(task, settings) {
  try {
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + (task.estimatedDuration || 30) * 60000);

    const event = {
      summary: task.task,
      description: `Captured from: ${task.context.url}\n\nOriginal text: ${task.originalText}`,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    };

    console.log('[Calendar] TODO: Google Calendar API integration - Event prepared:', event);

  } catch (error) {
    console.error('[Calendar] Failed to create calendar event:', error);
  }
}

async function generateDailySummary() {
  console.log('[Summary] Generating daily summary...');

  try {
    const result = await chrome.storage.local.get(['tasks']);
    const tasks = result.tasks || [];

    const today = new Date().toDateString();
    const todayTasks = tasks.filter(task =>
      new Date(task.createdAt).toDateString() === today
    );

    console.log('[Summary] Today tasks count:', todayTasks.length);

    if (todayTasks.length === 0) {
      return 'No tasks captured today.';
    }

    const projectGroups = {};
    todayTasks.forEach(task => {
      const project = task.project || 'General';
      if (!projectGroups[project]) {
        projectGroups[project] = [];
      }
      projectGroups[project].push(task);
    });

    let summaryText = `Daily Work Summary - ${new Date().toLocaleDateString()}\n\n`;

    let totalMinutes = 0;
    Object.keys(projectGroups).forEach(project => {
      const projectTasks = projectGroups[project];
      const projectMinutes = projectTasks.reduce((sum, task) => sum + (task.estimatedDuration || 30), 0);
      totalMinutes += projectMinutes;

      summaryText += `${project} (${Math.round(projectMinutes / 60 * 10) / 10}h):\n`;
      projectTasks.forEach(task => {
        summaryText += `  - ${task.task}\n`;
      });
      summaryText += '\n';
    });

    summaryText += `\nTotal time: ${Math.round(totalMinutes / 60 * 10) / 10} hours\n`;
    summaryText += `Tasks captured: ${todayTasks.length}`;

    if (writerSession) {
      try {
        console.log('[Summary] Using Writer API to enhance summary...');
        const enhancedPrompt = `Create a professional daily work summary based on this data:\n\n${summaryText}`;
        const enhanced = await writerSession.write(enhancedPrompt);
        console.log('[Summary] ✓ Writer API enhanced the summary');
        return enhanced || summaryText;
      } catch (e) {
        console.error('[Summary] Writer API failed, using fallback:', e);
        return summaryText;
      }
    }

    console.log('[Summary] No Writer API available, returning basic summary');
    return summaryText;
  } catch (error) {
    console.error('[Summary] ✗ Failed to generate summary:', error);
    return 'Failed to generate summary.';
  }
}

async function captureScreenshotTask(tabId, url, title) {
  console.log('[Screenshot] Starting screenshot capture for tab:', tabId);

  try {
    // Capture the visible tab as a data URL
    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png'
    });
    console.log('[Screenshot] ✓ Screenshot captured, size:', screenshotDataUrl.length, 'bytes');

    // Extract task from screenshot using multimodal AI
    const extracted = await extractTaskFromScreenshot(screenshotDataUrl, url, title);

    // Add screenshot data to the extracted task
    extracted.screenshot = screenshotDataUrl;
    extracted.hasScreenshot = true;

    // Save task with screenshot
    const saved = await saveTask(extracted);
    console.log('[Screenshot] ✓ Task saved with screenshot');

    // Notify the tab
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'taskCaptured', task: saved });
    } catch (e) {
      console.log('[Screenshot] Could not notify tab (page may not have content script)');
    }

    return saved;
  } catch (error) {
    console.error('[Screenshot] ✗ Screenshot capture failed:', error);
    throw error;
  }
}

async function extractTaskFromScreenshot(screenshotDataUrl, url, title) {
  console.log('[Screenshot Extract] Analyzing screenshot with multimodal AI...');

  try {
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || { aiEnabled: true };

    if (!settings.aiEnabled) {
      console.log('[Screenshot Extract] AI disabled, using fallback');
      return createFallbackTask('Screenshot from ' + title, { url, title, timestamp: new Date().toISOString() });
    }

    if (!aiSession) {
      console.log('[Screenshot Extract] No AI session, attempting to initialize...');
      await initializeAI();
    }

    if (!aiSession) {
      console.log('[Screenshot Extract] Still no AI session, using fallback');
      return createFallbackTask('Screenshot from ' + title, { url, title, timestamp: new Date().toISOString() });
    }

    console.log('[Screenshot Extract] Using multimodal AI to analyze screenshot...');

    // Convert data URL to blob for multimodal input
    const blob = await fetch(screenshotDataUrl).then(r => r.blob());

    const prompt = `Analyze this screenshot and extract any visible tasks, action items, or important information.

Context:
- Page: ${title}
- URL: ${url}

Please extract the following in JSON format:
{
  "task": "Clear, concise description of the main task or action item visible in the screenshot (max 50 words)",
  "priority": "high|medium|low",
  "estimatedDuration": number in minutes,
  "deadline": "inferred deadline or null",
  "project": "inferred project/category name",
  "tags": ["tag1", "tag2"]
}

Look for:
- Task descriptions, action items, or to-dos
- Important text, headings, or highlighted content
- Due dates or deadlines
- Project or category names
- Priority indicators

If the screenshot shows a task list, email, or project management tool, extract the most prominent task.
If it's general content, summarize the key action item or information.`;

    console.log('[Screenshot Extract] Sending multimodal prompt to AI...');

    // Use multimodal prompt with image
    const response = await aiSession.prompt(prompt, {
      image: blob
    });

    console.log('[Screenshot Extract] AI response received:', response);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const extracted = JSON.parse(jsonMatch[0]);
        console.log('[Screenshot Extract] ✓ Successfully parsed AI response:', extracted);
        return {
          ...extracted,
          source: 'screenshot-ai',
          originalText: 'Captured from screenshot',
          context: { url, title, timestamp: new Date().toISOString() }
        };
      } else {
        console.warn('[Screenshot Extract] No JSON found in AI response');
      }
    } catch (e) {
      console.error('[Screenshot Extract] Failed to parse AI response:', e);
    }

    console.log('[Screenshot Extract] Falling back to basic extraction');
    return createFallbackTask('Screenshot from ' + title, { url, title, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[Screenshot Extract] ✗ Screenshot analysis failed:', error);
    return createFallbackTask('Screenshot from ' + title, { url, title, timestamp: new Date().toISOString() });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] ========================================');
  console.log('[Background] Received message:', message.action);
  console.log('[Background] Message data:', message.data);
  console.log('[Background] Sender:', sender);

  if (message.action === 'captureTask') {
    console.log('[Background] >>> Starting captureTask handler');
    (async () => {
      try {
        console.log('[Background] Processing task capture...');
        console.log('[Background] Selected text:', message.data.selectedText);
        console.log('[Background] Context:', message.data);

        const extracted = await extractTaskFromText(
          message.data.selectedText,
          message.data
        );

        console.log('[Background] Task extracted:', extracted);
        const task = await saveTask(extracted);

        console.log('[Background] ✓ Task saved successfully, sending response');
        sendResponse({ success: true, task });
      } catch (error) {
        console.error('[Background] ✗ Capture failed with error:', error);
        console.error('[Background] Error stack:', error.stack);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep message channel open for async response
  }

  if (message.action === 'manualCreateTask') {
    console.log('[Background] >>> Starting manualCreateTask handler');
    (async () => {
      try {
        const manualData = message.data || {};
        if (!manualData.task || !manualData.task.trim()) {
          throw new Error('Task description is required');
        }

        const payload = {
          task: manualData.task.trim(),
          priority: ['low', 'medium', 'high'].includes(manualData.priority) ? manualData.priority : 'medium',
          estimatedDuration: typeof manualData.estimatedDuration === 'number'
            ? Math.min(Math.max(manualData.estimatedDuration, 5), 480)
            : 30,
          project: manualData.project?.trim() || 'General',
          deadline: manualData.deadline || null,
          tags: Array.isArray(manualData.tags) ? manualData.tags : [],
          source: 'manual',
          originalText: manualData.originalText || manualData.task,
          context: manualData.context || {
            title: 'Manual Entry',
            url: 'manual-entry',
            timestamp: new Date().toISOString()
          }
        };

        const savedTask = await saveTask(payload);
        console.log('[Background] ✓ Manual task saved');
        sendResponse({ success: true, task: savedTask });
      } catch (error) {
        console.error('[Background] ✗ Manual task creation failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'autoCapturePage') {
    console.log('[Background] >>> Starting autoCapturePage handler');
    (async () => {
      try {
        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          throw new Error('No active tab found');
        }

        console.log('[Background] Getting page content from tab:', tab.id);

        let pageText = '';

        try {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageText' });
          if (response?.text) {
            pageText = response.text.trim();
          }
          if (response?.error) {
            console.warn('[Background] Content script reported error:', response.error);
          }
        } catch (sendMessageError) {
          console.warn('[Background] Could not retrieve text via content script:', sendMessageError);
        }

        if (!pageText) {
          try {
            const [injection] = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                try {
                  const body = document.body;
                  if (!body) return '';
                  const raw = (body.innerText || body.textContent || '')
                    .replace(/\s+/g, ' ')
                    .trim();
                  return raw.substring(0, 6000);
                } catch (err) {
                  return '';
                }
              }
            });
            if (injection?.result) {
              pageText = injection.result.trim();
            }
          } catch (scriptError) {
            console.warn('[Background] Fallback DOM extraction failed:', scriptError);
          }
        }

        if (!pageText) {
          throw new Error('No readable content found on this page. Try another page or capture a screenshot.');
        }

        console.log('[Background] Received text from page, length:', pageText.length);

        // Extract task(s) from the page text
        const context = {
          title: tab.title,
          url: tab.url,
          timestamp: new Date().toISOString()
        };

        const extracted = await extractTaskFromText(pageText, context);
        
        // Save the task
        const task = await saveTask(extracted);
        
        console.log('[Background] ✓ Auto-captured task from page:', task.task);
        sendResponse({ success: true, tasks: [task], task });
      } catch (error) {
        console.error('[Background] ✗ Auto capture failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep message channel open for async response
  }

  if (message.action === 'generateSummary') {
    console.log('[Background] >>> Starting generateSummary handler');
    (async () => {
      try {
        const summary = await generateDailySummary();
        console.log('[Background] ✓ Summary generated');
        sendResponse({ success: true, summary });
      } catch (error) {
        console.error('[Background] ✗ Summary generation failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'checkAI') {
    console.log('[Background] >>> Starting checkAI handler');
    (async () => {
      const available = await initializeAI();
      const status = {
        available,
        hasPrompt: !!aiSession,
        hasSummarizer: !!summarizerSession,
        hasWriter: !!writerSession,
        hasRewriter: !!rewriterSession,
        hasTranslator: typeof Translator !== 'undefined'
      };
      console.log('[Background] AI Status:', status);
      sendResponse(status);
    })();
    return true;
  }

  if (message.action === 'generateQuote') {
    console.log('[Background] >>> Starting generateQuote handler');
    (async () => {
      try {
        // Make sure AI is initialized
        if (!aiSession) {
          console.log('[Background] AI not initialized, attempting to initialize...');
          await initializeAI();
        }

        if (!aiSession) {
          throw new Error('AI Prompt API not available');
        }

        // Generate a productivity quote using Prompt API
        const prompt = `Generate a single short, inspiring productivity quote about getting things done, focus, or achievement. 
The quote should be:
- Maximum 15 words
- Motivational and actionable
- Professional and positive
- Original and creative (don't repeat common quotes)

Respond with ONLY the quote text, no attribution, no quotation marks, no extra text.`;

        console.log('[Background] Generating quote with Prompt API...');
        const quote = await aiSession.prompt(prompt);
        
        // Clean up the quote
        let cleanQuote = quote.trim()
          .replace(/^["']|["']$/g, '') // Remove leading/trailing quotes
          .replace(/\n/g, ' ') // Remove newlines
          .trim();

        // Ensure it's not too long
        if (cleanQuote.length > 120) {
          cleanQuote = cleanQuote.substring(0, 117) + '...';
        }

        console.log('[Background] ✓ Quote generated:', cleanQuote);
        sendResponse({ success: true, quote: cleanQuote });
      } catch (error) {
        console.error('[Background] ✗ Quote generation failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'debugSettings') {
    console.log('[Background] >>> Starting debugSettings handler');
    (async () => {
      try {
        const result = await chrome.storage.local.get(['settings']);
        const settings = result.settings || {};
        console.log('[Background] Current settings:', settings);
        console.log('[Background] Translation enabled:', settings.translationEnabled);
        console.log('[Background] Translation language:', settings.translationLanguage);
        sendResponse({ settings });
      } catch (error) {
        console.error('[Background] Settings debug failed:', error);
        sendResponse({ error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'quickCapture') {
    console.log('[Background] >>> Starting quickCapture handler');
    (async () => {
      try {
        const extracted = await extractTaskFromText(
          message.data.text,
          { title: 'Quick Capture', url: 'manual', timestamp: new Date().toISOString() }
        );

        const task = await saveTask(extracted);
        console.log('[Background] ✓ Quick capture successful');
        sendResponse({ success: true, task });
      } catch (error) {
        console.error('[Background] ✗ Quick capture failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'googleSignIn') {
    console.log('[Background] >>> Starting Google Sign In');
    (async () => {
      try {
        const result = await signIn();
        if (result.success) {
          console.log('[Background] ✓ Google sign in successful');
          sendResponse({ success: true, email: result.email });
        } else {
          console.log('[Background] ✗ Google sign in failed:', result.error);
          sendResponse({ success: false, error: result.error });
        }
      } catch (error) {
        console.error('[Background] ✗ Google sign in failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'googleSignOut') {
    console.log('[Background] >>> Starting Google Sign Out');
    (async () => {
      try {
        const result = await signOut();
        if (result.success) {
          console.log('[Background] ✓ Google sign out successful');
          sendResponse({ success: true });
        } else {
          console.log('[Background] ✗ Google sign out failed:', result.error);
          sendResponse({ success: false, error: result.error });
        }
      } catch (error) {
        console.error('[Background] ✗ Google sign out failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'checkGoogleAuth') {
    console.log('[Background] >>> Checking Google auth status');
    (async () => {
      try {
        const status = await checkAuthStatus();
        console.log('[Background] Google auth status:', status.signedIn ? 'Signed in' : 'Not signed in');
        sendResponse({ signedIn: status.signedIn, email: status.email });
      } catch (error) {
        console.error('[Background] ✗ Failed to check Google auth:', error);
        sendResponse({ signedIn: false, email: null });
      }
    })();
    return true;
  }

  if (message.action === 'deleteFromGoogle') {
    console.log('[Background] >>> Starting deleteFromGoogle handler');
    (async () => {
      try {
        const { taskId, task } = message.data;
        console.log('[Background] Deleting task from Google services:', taskId);

        const signedIn = await isSignedIn();
        if (!signedIn) {
          console.log('[Background] User not signed in, skipping Google deletion');
          sendResponse({ success: true, message: 'Not signed in to Google' });
          return;
        }

        // Try to delete from Google Tasks and Calendar
        // Note: We need to find the Google IDs from the task data
        const results = await Promise.allSettled([
          task.googleTaskId ? deleteFromGoogleTasks(task.googleTaskId) : Promise.resolve(true),
          task.googleEventId ? deleteFromGoogleCalendar(task.googleEventId) : Promise.resolve(true)
        ]);

        const tasksSuccess = results[0].status === 'fulfilled';
        const calendarSuccess = results[1].status === 'fulfilled';

        if (!tasksSuccess) {
          console.error('[Background] ✗ Google Tasks deletion failed:', results[0].reason);
        }
        if (!calendarSuccess) {
          console.error('[Background] ✗ Google Calendar deletion failed:', results[1].reason);
        }

        if (tasksSuccess && calendarSuccess) {
          console.log('[Background] ✓ Task deleted from Google Tasks and Calendar');
          sendResponse({ success: true, message: 'Deleted from Google services' });
        } else if (tasksSuccess || calendarSuccess) {
          console.log('[Background] ⚠ Partial deletion success (Tasks:', tasksSuccess, 'Calendar:', calendarSuccess, ')');
          sendResponse({ success: true, message: 'Partially deleted from Google services' });
        } else {
          console.log('[Background] ✗ Google deletion failed completely');
          sendResponse({ success: false, error: 'Failed to delete from Google services' });
        }
      } catch (error) {
        console.error('[Background] ✗ Google deletion failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'captureScreenshot') {
    console.log('[Background] >>> Starting captureScreenshot handler');
    (async () => {
      try {
        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
          throw new Error('No active tab found');
        }

        const task = await captureScreenshotTask(tab.id, tab.url, tab.title);
        console.log('[Background] ✓ Screenshot capture successful');
        sendResponse({ success: true, task });
      } catch (error) {
        console.error('[Background] ✗ Screenshot capture failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'processAudioRecording') {
    console.log('[Background] >>> Starting processAudioRecording handler');
    (async () => {
      try {
        const { audioDataUrl, transcript, mode } = message.data || {};
        if (!audioDataUrl) {
          throw new Error('Missing audio payload');
        }

        const context = {
          url: 'audio-capture',
          title: mode === 'meeting' ? 'Meeting' : 'Voice Task',
          timestamp: new Date().toISOString()
        };

        if (!aiSession) {
          console.log('[Background] Audio processing requires AI session. Attempting init...');
          await initializeAI();
        }

        let extractedTasks = [];
        let usedAudio = false;

        if (aiSession) {
          try {
            console.log('[Background] Attempting multimodal extraction from audio...');
            extractedTasks = await extractTasksFromAudio(audioDataUrl, mode, context);
            usedAudio = extractedTasks.length > 0;
          } catch (audioError) {
            console.error('[Background] Multimodal audio extraction failed:', audioError);
          }
        } else {
          console.warn('[Background] AI session unavailable; skipping audio extraction');
        }

        if ((!extractedTasks || extractedTasks.length === 0) && transcript && transcript.trim()) {
          console.log('[Background] Falling back to transcript extraction for audio recording');
          extractedTasks = await extractTasksFromTranscript(transcript, mode, context);
        }

        let fallbackUsed = false;
        if (!extractedTasks || extractedTasks.length === 0) {
          extractedTasks = [createFallbackTask('Audio recording captured', context)];
          fallbackUsed = true;
        }

        let summary = null;
        if (mode === 'meeting' && extractedTasks.length > 0) {
          summary = await generateMeetingSummary(transcript || 'Audio meeting recording', extractedTasks);
          console.log('[Background] ✓ Meeting summary generated (audio pipeline)');
        }

        sendResponse({
          success: true,
          tasks: extractedTasks,
          summary,
          usedAudio,
          fallbackUsed,
          audioUnsupported: !audioMultimodalSupported
        });
      } catch (error) {
        console.error('[Background] ✗ Audio recording processing failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'processTranscript') {
    console.log('[Background] >>> Starting processTranscript handler');
    (async () => {
      try {
        const { transcript, mode } = message.data;
        console.log('[Background] Processing transcript in', mode, 'mode');
        console.log('[Background] Transcript text:', transcript);

        const context = {
          url: 'speech-capture',
          title: mode === 'meeting' ? 'Meeting' : 'Voice Task',
          timestamp: new Date().toISOString()
        };

        // Extract tasks from transcript text
        let extractedTasks;
        if (transcript && transcript.trim()) {
          console.log('[Background] Extracting tasks from transcript...');
          extractedTasks = await extractTasksFromTranscript(transcript, mode, context);
        } else {
          console.warn('[Background] No transcript available');
          extractedTasks = [createFallbackTask('No speech detected', context)];
        }
        
        console.log('[Background] ✓ Extracted', extractedTasks.length, 'tasks');

        let summary = null;
        if (mode === 'meeting' && extractedTasks.length > 0) {
          summary = await generateMeetingSummary('Audio meeting recording', extractedTasks);
          console.log('[Background] ✓ Meeting summary generated');
        }

        sendResponse({
          success: true,
          tasks: extractedTasks,
          summary: summary
        });
      } catch (error) {
        console.error('[Background] ✗ Audio processing failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'startOffscreenRecording') {
    console.log('[Background] >>> Starting speech recognition');
    (async () => {
      try {
        await setupOffscreenDocument();

        console.log('[Background] Offscreen document ready, starting speech recognition');

        // Send recording request to offscreen document
        const response = await chrome.runtime.sendMessage({
          action: 'startRecording',
          mode: message.mode
        });

        if (response.success) {
          console.log('[Background] ✓ Recording started successfully');
        } else {
          console.error('[Background] ✗ Recording failed:', response.error);
        }

        sendResponse(response);
      } catch (error) {
        console.error('[Background] ✗ Failed to start offscreen recording:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'stopOffscreenRecording') {
    console.log('[Background] >>> Stopping speech recognition');
    (async () => {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'stopRecording' });
        console.log('[Background] Stop recording response:', response);
        
        if (response.success) {
          sendResponse({
            success: true,
            transcript: response.transcript || ''
          });
        } else {
          sendResponse(response);
        }
      } catch (error) {
        console.error('[Background] ✗ Failed to stop offscreen recording:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'saveAudioTasks') {
    console.log('[Background] >>> Starting saveAudioTasks handler');
    (async () => {
      try {
        const { tasks, mode } = message.data;
        console.log('[Background] Saving', tasks.length, 'tasks from audio');

        const savedTasks = [];
        for (const task of tasks) {
          const saved = await saveTask(task);
          savedTasks.push(saved);
        }

        console.log('[Background] ✓ Audio tasks saved successfully');
        sendResponse({ success: true, tasks: savedTasks });
      } catch (error) {
        console.error('[Background] ✗ Failed to save audio tasks:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }


  console.log('[Background] ⚠ Unknown action received:', message.action);
});

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Install] ========================================');
  console.log('[Install] TaskHub event:', details.reason);

  await initializeAI();

  if (details.reason === 'install') {
    await chrome.storage.local.set({
      tasks: [],
      settings: {
        googleSyncEnabled: true,
        defaultDuration: 30,
        productiveHours: 8,
        workStartTime: '09:00',
        aiEnabled: true,
        translationEnabled: false,
        translationLanguage: 'en'
      }
    });
    console.log('[Install] ✓ Initial storage setup complete');
  } else if (details.reason === 'update') {
    const result = await chrome.storage.local.get(['settings']);
    if (!result.settings) {
      await chrome.storage.local.set({
        settings: {
          googleSyncEnabled: true,
          defaultDuration: 30,
          productiveHours: 8,
          workStartTime: '09:00',
          aiEnabled: true,
          translationEnabled: false,
          translationLanguage: 'en'
        }
      });
    } else {
      // Add missing settings for existing installations
      let updated = false;
      if (result.settings.googleSyncEnabled === undefined) {
        result.settings.googleSyncEnabled = true;
        updated = true;
      }
      if (result.settings.productiveHours === undefined) {
        result.settings.productiveHours = 8;
        updated = true;
      }
      if (result.settings.workStartTime === undefined) {
        result.settings.workStartTime = '09:00';
        updated = true;
      }
      if (result.settings.translationEnabled === undefined) {
        result.settings.translationEnabled = false;
        updated = true;
      }
      if (result.settings.translationLanguage === undefined) {
        result.settings.translationLanguage = 'en';
        updated = true;
      }
      if (updated) {
        await chrome.storage.local.set({ settings: result.settings });
        console.log('[Install] ✓ Settings updated with new fields');
      }
    }
    console.log('[Install] ✓ Extension updated, preserving existing data');
  }
});

// Initialize on service worker startup
console.log('[Background] Service worker started, initializing AI...');
initializeAI();

// Create context menu items on install and startup
try {
  chrome.runtime.onInstalled.addListener(() => {
    try {
      chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
          id: 'gsd_capture_full_page',
          title: 'TaskHub - Capture task from page',
          contexts: ['page']
        });
        chrome.contextMenus.create({
          id: 'gsd_capture_screenshot',
          title: 'TaskHub - Capture task from screenshot',
          contexts: ['page']
        });
      });
    } catch (e) { }
  });

  chrome.runtime.onStartup.addListener(() => {
    try {
      chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
          id: 'gsd_capture_full_page',
          title: 'TaskHub - Capture task from page',
          contexts: ['page']
        });
        chrome.contextMenus.create({
          id: 'gsd_capture_screenshot',
          title: 'TaskHub - Capture task from screenshot',
          contexts: ['page']
        });
      });
    } catch (e) { }
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) return;

    if (info.menuItemId === 'gsd_capture_full_page') {
      try {
        const [execution] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({
            url: location.href,
            title: document.title,
            selectedText: (document.body && document.body.innerText) ? document.body.innerText.trim() : '',
            fullEmailContext: null,
            timestamp: new Date().toISOString()
          })
        });

        const page = execution?.result || { url: tab.url, title: tab.title || 'Page', selectedText: '', fullEmailContext: null, timestamp: new Date().toISOString() };
        const extracted = await extractTaskFromText(page.selectedText || page.title, page);
        const saved = await saveTask(extracted);

        try { await chrome.tabs.sendMessage(tab.id, { action: 'taskCaptured', task: saved }); } catch (_) { }
      } catch (error) {
        console.error('[ContextMenu] Full page capture failed:', error);
      }
    } else if (info.menuItemId === 'gsd_capture_screenshot') {
      try {
        await captureScreenshotTask(tab.id, tab.url, tab.title);
      } catch (error) {
        console.error('[ContextMenu] Screenshot capture failed:', error);
      }
    }
  });
} catch (_) { }
