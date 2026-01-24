#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Stop Ollama Service (macOS)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}❌ This script is for macOS only${NC}"
    exit 1
fi

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo -e "${YELLOW}⚠️  Ollama is not installed${NC}"
    exit 0
fi

# Check if Ollama service is running
check_ollama_running() {
    if pgrep -f "ollama serve" > /dev/null; then
        return 0
    else
        return 1
    fi
}

# Stop Ollama service
stop_ollama() {
    echo -e "${BLUE}Stopping Ollama service...${NC}"
    
    if ! check_ollama_running; then
        echo -e "${GREEN}✅ Ollama service is not running${NC}"
        return 0
    fi
    
    # Try to stop via Homebrew services first
    if brew services list 2>/dev/null | grep -q ollama; then
        echo -e "${YELLOW}   Stopping via Homebrew services...${NC}"
        brew services stop ollama 2>/dev/null || true
        sleep 2
    fi
    
    # Kill any remaining Ollama processes
    if check_ollama_running; then
        echo -e "${YELLOW}   Stopping Ollama processes...${NC}"
        pkill -f "ollama serve" 2>/dev/null || true
        sleep 2
    fi
    
    # Verify it's stopped
    if check_ollama_running; then
        echo -e "${RED}❌ Could not stop Ollama service${NC}"
        echo -e "${YELLOW}   Please stop it manually: pkill -f 'ollama serve'${NC}"
        return 1
    else
        echo -e "${GREEN}✅ Ollama service stopped successfully${NC}"
        return 0
    fi
}

# Main execution
main() {
    if stop_ollama; then
        echo ""
        echo -e "${GREEN}Ollama has been stopped.${NC}"
        echo -e "${BLUE}To start it again, run: ./scripts/setup-ollama-macos.sh${NC}"
        echo -e "${BLUE}Or manually: ollama serve${NC}"
        echo ""
    else
        echo ""
        echo -e "${YELLOW}⚠️  There was an issue stopping Ollama.${NC}"
        echo ""
        exit 1
    fi
}

# Run main function
main
