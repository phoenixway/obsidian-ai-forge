// speechWorker.ts

// Add an empty export to make this file a module
export {};

// Define the onmessage event handler
onmessage = async (event: MessageEvent) => {
  const { apiKey, audioBlob } = event.data;
  console.log('onmessage');
    
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

    const data = await response.json();
    postMessage(data.results[0].alternatives[0].transcript);
  } catch (error) {
    console.error('Error in speech recognition:', error);
  }
};
