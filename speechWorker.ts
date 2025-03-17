// speechWorker.ts

export {}; // Add this line to make the file a module

onmessage = async (event: MessageEvent) => {
  console.log("Worker received message:", event.data);
  const { apiKey, audioBlob } = event.data;
  console.log("Worker received audioBlob:", audioBlob);

  const url = `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          languageCode: 'en-US',
        },
        audio: {
          content: await audioBlob.arrayBuffer(),
        },
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log("Speech recognition data:", data);
    postMessage(data.results[0].alternatives[0].transcript);
  } catch (error) {
    console.error('Error in speech recognition:', error);
    postMessage('Error processing speech recognition');
  }
};
