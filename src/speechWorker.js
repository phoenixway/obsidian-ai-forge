// speech.worker.js

/**
 * Конвертує ArrayBuffer в рядок Base64.
 * @param {ArrayBuffer} buffer - ArrayBuffer для конвертації.
 * @returns {string} Рядок Base64.
 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return self.btoa(binary); // btoa доступний у Web Workers
}

self.onmessage = async (event) => {
  try {
    const { apiKey, audioBlob, languageCode } = event.data;
    console.log("[SpeechWorker] Received audioBlob:", audioBlob);
    console.log("[SpeechWorker] Blob type:", audioBlob.type, "Blob size:", audioBlob.size);

    const audioArrayBuffer = await audioBlob.arrayBuffer();
    const audioBase64 = arrayBufferToBase64(audioArrayBuffer);

    const requestConfigPayload = {
      config: {
        encoding: 'WEBM_OPUS', // Спробуємо цей формат
        // sampleRateHertz: 16000, // Не потрібен для WEBM_OPUS
        languageCode: languageCode || 'en-US',
        enableAutomaticPunctuation: true,
      },
      audio: {
        content: audioBase64,
      },
    };

    console.log("[SpeechWorker] Sending request to Google Speech API with config:", requestConfigPayload.config);

    const url = `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(requestConfigPayload),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const responseText = await response.text();
    if (!response.ok) {
      console.error("[SpeechWorker] HTTP error! Status:", response.status, "Response:", responseText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${responseText}`);
    }

    const data = JSON.parse(responseText);
    console.log("[SpeechWorker] Speech recognition data:", data);

    if (data.results && data.results.length > 0 && data.results[0].alternatives && data.results[0].alternatives.length > 0) {
      const transcript = data.results[0].alternatives[0].transcript;
      console.log("[SpeechWorker] Transcript:", transcript);
      self.postMessage({ success: true, transcript: transcript });
    } else {
      console.warn("[SpeechWorker] No transcription results found in API response:", data);
      self.postMessage({ success: false, error: "No transcription results found.", details: data });
    }

  } catch (error) {
    // Переконуємося, що error є об'єктом Error або має властивість message
    const errorMessage = (error instanceof Error) ? error.message : String(error);
    const errorStack = (error instanceof Error) ? error.stack : undefined;
    const errorDetails = (error && typeof error === 'object' && 'details' in error) ? (error as any).details : String(error);

    console.error('[SpeechWorker] Error in speech recognition:', errorMessage, errorStack, errorDetails);
    self.postMessage({ 
        success: false, 
        error: `Error processing speech recognition: ${errorMessage}`, 
        details: errorDetails 
    });
  }
};

self.onerror = (event) => {
  console.error('[SpeechWorker] Uncaught worker error:', event);
  const errorMessage = (event instanceof ErrorEvent) ? event.message : 'Unknown worker error';
  self.postMessage({ success: false, error: `Uncaught worker error: ${errorMessage}` });
};