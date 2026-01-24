#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Ollama Native Setup for macOS${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}❌ This script is for macOS only${NC}"
    echo -e "${YELLOW}   For Linux, use: ./scripts/setup-docker-gpu.sh${NC}"
    exit 1
fi

# Check for Homebrew
check_homebrew() {
    echo -e "${BLUE}Step 1: Checking for Homebrew...${NC}"
    
    if command -v brew &> /dev/null; then
        echo -e "${GREEN}✅ Homebrew is installed${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}❌ Homebrew is not installed${NC}"
        echo -e "${YELLOW}   Installing Homebrew...${NC}"
        echo -e "${YELLOW}   Run this command:${NC}"
        echo -e "${BLUE}   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"${NC}"
        echo ""
        echo -e "${YELLOW}   After installing Homebrew, run this script again.${NC}"
        exit 1
    fi
}

# Check if Ollama is installed
check_ollama() {
    echo -e "${BLUE}Step 2: Checking for Ollama...${NC}"
    
    if command -v ollama &> /dev/null; then
        echo -e "${GREEN}✅ Ollama is already installed${NC}"
        ollama --version
        echo ""
        return 0
    else
        echo -e "${YELLOW}⚠️  Ollama not found${NC}"
        echo ""
        return 1
    fi
}

# Install Ollama
install_ollama() {
    echo -e "${BLUE}Step 3: Installing Ollama...${NC}"
    
    echo -e "${YELLOW}   Installing via Homebrew...${NC}"
    brew install ollama
    
    echo -e "${GREEN}✅ Ollama installed successfully${NC}"
    echo ""
}

# Check if Ollama service is running
check_ollama_service() {
    echo -e "${BLUE}Step 4: Checking Ollama service...${NC}"
    
    # Check if ollama serve is running
    if pgrep -f "ollama serve" > /dev/null; then
        echo -e "${GREEN}✅ Ollama service is running${NC}"
        echo ""
        return 0
    else
        echo -e "${YELLOW}⚠️  Ollama service is not running${NC}"
        echo ""
        return 1
    fi
}

# Start Ollama service
start_ollama_service() {
    echo -e "${BLUE}Step 5: Starting Ollama service...${NC}"
    
    # Try to start via launchd if installed via brew
    if brew services list | grep -q ollama; then
        echo -e "${YELLOW}   Starting via Homebrew services...${NC}"
        brew services start ollama
        sleep 3
    else
        echo -e "${YELLOW}   Starting Ollama in background...${NC}"
        echo -e "${YELLOW}   (You may need to run 'ollama serve' manually)${NC}"
        
        # Try to start it
        nohup ollama serve > /dev/null 2>&1 &
        sleep 3
    fi
    
    # Verify it's running
    if check_ollama_service; then
        echo -e "${GREEN}✅ Ollama service started${NC}"
        echo ""
    else
        echo -e "${YELLOW}⚠️  Could not verify Ollama is running${NC}"
        echo -e "${YELLOW}   Please start it manually: ollama serve${NC}"
        echo ""
    fi
}

# Check for required models
check_models() {
    echo -e "${BLUE}Step 6: Checking for required models...${NC}"
    
    local models_ok=true
    
    # Check llama3.1:8b
    if ollama list 2>/dev/null | grep -q "llama3.1:8b"; then
        echo -e "${GREEN}✅ llama3.1:8b is installed${NC}"
    else
        echo -e "${YELLOW}⚠️  llama3.1:8b not found${NC}"
        models_ok=false
    fi
    
    # Check nomic-embed-text
    if ollama list 2>/dev/null | grep -q "nomic-embed-text"; then
        echo -e "${GREEN}✅ nomic-embed-text is installed${NC}"
    else
        echo -e "${YELLOW}⚠️  nomic-embed-text not found${NC}"
        models_ok=false
    fi
    
    echo ""
    
    if [ "$models_ok" = false ]; then
        return 1
    else
        return 0
    fi
}

# Pull required models
pull_models() {
    echo -e "${BLUE}Step 7: Pulling required models...${NC}"
    
    echo -e "${YELLOW}   Pulling llama3.1:8b (this may take a while)...${NC}"
    ollama pull llama3.1:8b
    
    echo -e "${YELLOW}   Pulling nomic-embed-text...${NC}"
    ollama pull nomic-embed-text
    
    echo -e "${GREEN}✅ All models pulled successfully${NC}"
    echo ""
}

# Test Ollama
test_ollama() {
    echo -e "${BLUE}Step 8: Testing Ollama connection...${NC}"
    
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Ollama API is accessible${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}❌ Ollama API is not accessible${NC}"
        echo -e "${YELLOW}   Make sure Ollama is running: ollama serve${NC}"
        echo ""
        return 1
    fi
}

# Main execution
main() {
    check_homebrew
    
    if ! check_ollama; then
        install_ollama
    fi
    
    if ! check_ollama_service; then
        start_ollama_service
    fi
    
    if ! check_models; then
        pull_models
    fi
    
    if test_ollama; then
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}✅ Setup completed successfully!${NC}"
        echo -e "${GREEN}========================================${NC}"
        echo ""
        echo -e "${BLUE}Ollama is running natively with Metal GPU acceleration!${NC}"
        echo ""
        echo -e "${YELLOW}To use with Docker containers, set in docker-compose.yml:${NC}"
        echo -e "${BLUE}  OLLAMA_BASE_URL=http://host.docker.internal:11434${NC}"
        echo ""
        echo -e "${YELLOW}Or set in your .env files:${NC}"
        echo -e "${BLUE}  OLLAMA_BASE_URL=http://host.docker.internal:11434${NC}"
        echo ""
        echo -e "${GREEN}The ollama service in docker-compose.yml is commented out${NC}"
        echo -e "${GREEN}since you're running it natively for better GPU performance!${NC}"
        echo ""
    else
        echo -e "${YELLOW}⚠️  Setup completed, but Ollama service needs to be started.${NC}"
        echo -e "${YELLOW}   Run: ollama serve${NC}"
        echo ""
    fi
}

# Run main function
main
