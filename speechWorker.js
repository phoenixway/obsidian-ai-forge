onmessage = async (event) => {
    try {
      const { apiKey, audioBlob } = event.data;
      console.log("Worker received audioBlob:", audioBlob);
  
      const url = `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`;
  
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
  
  // Add an error event listener to catch any errors in the worker
  onerror = (event) => {
    console.error('Worker error:', event);
  };
  