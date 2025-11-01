console.log('[Offscreen] Speech recognition offscreen document loaded');

let recognition = null;
let transcript = '';
let isRecording = false;

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Offscreen] Received message:', message.action);

    if (message.action === 'startRecording') {
        startRecording(message.mode)
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async response
    }

    if (message.action === 'stopRecording') {
        stopRecording()
            .then((result) => sendResponse({ 
                success: true, 
                transcript: result.transcript
            }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (message.action === 'isRecording') {
        sendResponse({ isRecording });
        return false;
    }
});

async function startRecording(mode) {
    console.log('[Offscreen] Starting speech recognition in mode:', mode);

    if (isRecording) {
        console.warn('[Offscreen] Already recording');
        return;
    }

    transcript = '';

    // Initialize Web Speech API for speech-to-text
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        throw new Error('SPEECH_NOT_SUPPORTED: Web Speech API is not available in this browser.');
    }

    try {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            isRecording = true;
            console.log('[Offscreen] ✓ Speech recognition started successfully');
            
            // Send status update to popup
            chrome.runtime.sendMessage({
                action: 'speechStatus',
                status: 'started'
            }).catch(() => {});
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcriptPiece = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcriptPiece + ' ';
                } else {
                    interimTranscript += transcriptPiece;
                }
            }

            if (finalTranscript) {
                transcript += finalTranscript;
                console.log('[Offscreen] Speech recognized (final):', finalTranscript);
            }

            // Send live transcript to popup
            chrome.runtime.sendMessage({
                action: 'transcriptUpdate',
                transcript: transcript + interimTranscript,
                isFinal: !!finalTranscript
            }).catch(() => {});
        };

        recognition.onerror = (event) => {
            console.error('[Offscreen] Speech recognition error:', event.error);
            
            if (event.error === 'not-allowed') {
                recognition = null;
                isRecording = false;
                throw new Error('PERMISSION_DENIED: Microphone permission was denied. Please allow microphone access in browser settings.');
            } else if (event.error === 'no-speech') {
                console.log('[Offscreen] No speech detected, waiting...');
            } else {
                console.error('[Offscreen] Speech error:', event.error);
            }
        };

        recognition.onend = () => {
            console.log('[Offscreen] Speech recognition ended');
            if (isRecording) {
                // Restart if still supposed to be recording (handles auto-stop after silence)
                console.log('[Offscreen] Restarting speech recognition...');
                try {
                    recognition.start();
                } catch (e) {
                    console.error('[Offscreen] Failed to restart recognition:', e);
                }
            }
        };

        recognition.start();
        console.log('[Offscreen] Starting speech recognition...');
        
    } catch (error) {
        console.error('[Offscreen] Failed to initialize speech recognition:', error);
        isRecording = false;
        throw error;
    }
}

async function stopRecording() {
    console.log('[Offscreen] Stopping speech recognition...');

    if (!isRecording) {
        throw new Error('Not currently recording');
    }

    // Stop speech recognition
    if (recognition) {
        recognition.stop();
        isRecording = false;
        console.log('[Offscreen] Speech recognition stopped');
    }

    console.log('[Offscreen] Final transcript:', transcript);

    return {
        transcript: transcript.trim()
    };
}

