#!/bin/sh
# Start Ollama server in background
ollama serve &
SERVE_PID=$!

# Wait for Ollama to be ready
sleep 5
until ollama list > /dev/null 2>&1; do
  echo "Waiting for Ollama to be ready..."
  sleep 2
done

echo "Ollama is ready, pulling models..."
ollama pull llama3.1:8b
ollama pull nomic-embed-text
echo "Models pulled successfully"

# Keep the server running
wait $SERVE_PID
