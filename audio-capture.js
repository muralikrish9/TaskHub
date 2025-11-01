console.log('[Audio Capture] Module loaded - Using MediaRecorder API');

let mediaRecorder = null;
let audioChunks = [];
let recordingMode = null;
let isRecording = false;
let audioStream = null;

// Check if MediaRecorder is available
export function isMediaRecorderAvailable() {
    const available = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    console.log('[Audio Capture] MediaRecorder available:', available);
    return available;
}

// Start recording - expects audioStream from popup context
export async function startRecording(mode, audioStreamParam) {
    console.log('[Audio Capture] Starting recording in mode:', mode);

    if (!isMediaRecorderAvailable()) {
        throw new Error('MediaRecorder API not available in this browser');
    }

    if (isRecording) {
        console.warn('[Audio Capture] Already recording');
        return;
    }

    try {
        recordingMode = mode;
        audioChunks = [];

        // Use the stream passed from popup (where getUserMedia was called)
        audioStream = audioStreamParam;
        console.log('[Audio Capture] Using audio stream from popup');

        if (!audioStream) {
            throw new Error('No audio stream provided');
        }

        // Create MediaRecorder
        mediaRecorder = new MediaRecorder(audioStream, {
            mimeType: 'audio/webm'
        });

        // Collect audio data
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
                console.log('[Audio Capture] Audio chunk received, size:', event.data.size);
            }
        };

        mediaRecorder.onstop = () => {
            console.log('[Audio Capture] Recording stopped, total chunks:', audioChunks.length);
        };

        mediaRecorder.onerror = (event) => {
            console.error('[Audio Capture] Recording error:', event.error);
        };

        // Start recording
        mediaRecorder.start(1000); // Collect data every second
        isRecording = true;

        console.log('[Audio Capture] ✓ Recording started');
        return true;
    } catch (error) {
        console.error('[Audio Capture] Failed to start recording:', error);
        isRecording = false;
        throw error;
    }
}

// Stop recording and return audio as data URL
export function stopRecording() {
    console.log('[Audio Capture] Stopping recording');

    if (!isRecording || !mediaRecorder) {
        return null;
    }

    return new Promise((resolve, reject) => {
        try {
            mediaRecorder.stop();

            mediaRecorder.onstop = () => {
                console.log('[Audio Capture] MediaRecorder stopped');

                // Create blob from audio chunks
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const reader = new FileReader();

                reader.onloadend = () => {
                    const dataUrl = reader.result;
                    console.log('[Audio Capture] ✓ Audio converted to data URL, size:', dataUrl.length);

                    isRecording = false;
                    audioChunks = [];

                    resolve(dataUrl);
                };

                reader.onerror = (error) => {
                    console.error('[Audio Capture] Failed to convert audio:', error);
                    reject(error);
                };

                reader.readAsDataURL(audioBlob);
            };

            // Stop all audio tracks
            if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
                audioStream = null;
            }

        } catch (error) {
            console.error('[Audio Capture] Error stopping recording:', error);
            reject(error);
        }
    });
}

// Check if currently recording
export function isCurrentlyRecording() {
    return isRecording;
}

// Reset (clean up)
export function reset() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
    }

    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }

    mediaRecorder = null;
    isRecording = false;
    recordingMode = null;
    audioChunks = [];
}

// Legacy functions for compatibility (no-op since we use multimodal)
export function onTranscriptUpdate(callback) {
    // Not used with multimodal approach
    console.log('[Audio Capture] onTranscriptUpdate called but multimodal mode does not use callbacks');
}

export function removeTranscriptCallback(callback) {
    // Not used with multimodal approach
}

export function isSpeechRecognitionAvailable() {
    return false; // We're using multimodal, not Speech Recognition
}

export function getCurrentTranscript() {
    return ''; // Not used with multimodal
}