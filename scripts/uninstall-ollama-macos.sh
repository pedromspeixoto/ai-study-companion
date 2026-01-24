#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Ollama Uninstall Script for macOS${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}❌ This script is for macOS only${NC}"
    exit 1
fi

# Check if Ollama is installed
check_ollama_installed() {
    if command -v ollama &> /dev/null; then
        echo -e "${GREEN}✅ Ollama is installed${NC}"
        ollama --version
        echo ""
        return 0
    else
        echo -e "${YELLOW}⚠️  Ollama is not installed${NC}"
        echo ""
        return 1
    fi
}

# Stop Ollama service
stop_ollama_service() {
    echo -e "${BLUE}Step 1: Stopping Ollama service...${NC}"
    
    # Check if Ollama service is running
    if pgrep -f "ollama serve" > /dev/null; then
        echo -e "${YELLOW}   Stopping Ollama service...${NC}"
        
        # Try to stop via Homebrew services
        if brew services list 2>/dev/null | grep -q ollama; then
            echo -e "${YELLOW}   Stopping via Homebrew services...${NC}"
            brew services stop ollama 2>/dev/null || true
            sleep 2
        fi
        
        # Kill any remaining Ollama processes
        if pgrep -f "ollama serve" > /dev/null; then
            echo -e "${YELLOW}   Killing remaining Ollama processes...${NC}"
            pkill -f "ollama serve" 2>/dev/null || true
            sleep 2
        fi
        
        # Verify it's stopped
        if pgrep -f "ollama serve" > /dev/null; then
            echo -e "${RED}❌ Could not stop Ollama service${NC}"
            echo -e "${YELLOW}   Please stop it manually and run this script again${NC}"
            return 1
        else
            echo -e "${GREEN}✅ Ollama service stopped${NC}"
            echo ""
            return 0
        fi
    else
        echo -e "${GREEN}✅ Ollama service is not running${NC}"
        echo ""
        return 0
    fi
}

# Remove Ollama models and data
remove_ollama_data() {
    echo -e "${BLUE}Step 2: Removing Ollama data and models...${NC}"
    
    local ollama_home="${HOME}/.ollama"
    
    if [ -d "$ollama_home" ]; then
        echo -e "${YELLOW}   Found Ollama data directory: $ollama_home${NC}"
        echo -e "${YELLOW}   This includes all downloaded models (can be several GB)${NC}"
        echo ""
        read -p "   Remove Ollama data directory? (y/N): " -n 1 -r
        echo ""
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}   Removing Ollama data directory...${NC}"
            rm -rf "$ollama_home"
            echo -e "${GREEN}✅ Ollama data directory removed${NC}"
        else
            echo -e "${YELLOW}⚠️  Keeping Ollama data directory${NC}"
            echo -e "${YELLOW}   You can remove it manually later: rm -rf $ollama_home${NC}"
        fi
    else
        echo -e "${GREEN}✅ No Ollama data directory found${NC}"
    fi
    echo ""
}

# Uninstall Ollama
uninstall_ollama() {
    echo -e "${BLUE}Step 3: Uninstalling Ollama...${NC}"
    
    # Check if installed via Homebrew
    if brew list ollama &> /dev/null; then
        echo -e "${YELLOW}   Ollama was installed via Homebrew${NC}"
        echo -e "${YELLOW}   Uninstalling via Homebrew...${NC}"
        brew uninstall ollama
        echo -e "${GREEN}✅ Ollama uninstalled via Homebrew${NC}"
    else
        # Check if it's in /usr/local/bin or other common locations
        if [ -f "/usr/local/bin/ollama" ]; then
            echo -e "${YELLOW}   Found Ollama at /usr/local/bin/ollama${NC}"
            echo -e "${YELLOW}   This might have been installed manually${NC}"
            read -p "   Remove /usr/local/bin/ollama? (y/N): " -n 1 -r
            echo ""
            
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                sudo rm -f /usr/local/bin/ollama
                echo -e "${GREEN}✅ Removed /usr/local/bin/ollama${NC}"
            else
                echo -e "${YELLOW}⚠️  Keeping /usr/local/bin/ollama${NC}"
            fi
        else
            echo -e "${YELLOW}⚠️  Could not determine how Ollama was installed${NC}"
            echo -e "${YELLOW}   Please uninstall it manually${NC}"
        fi
    fi
    echo ""
}

# Remove Ollama from PATH (if added manually)
check_path() {
    echo -e "${BLUE}Step 4: Checking shell configuration...${NC}"
    
    local shell_config=""
    if [ -n "$ZSH_VERSION" ]; then
        shell_config="${HOME}/.zshrc"
    elif [ -n "$BASH_VERSION" ]; then
        shell_config="${HOME}/.bash_profile"
    fi
    
    if [ -f "$shell_config" ]; then
        if grep -q "ollama" "$shell_config" 2>/dev/null; then
            echo -e "${YELLOW}   Found Ollama references in $shell_config${NC}"
            echo -e "${YELLOW}   You may want to remove them manually${NC}"
        else
            echo -e "${GREEN}✅ No Ollama references found in shell config${NC}"
        fi
    fi
    echo ""
}

# Verify uninstallation
verify_uninstallation() {
    echo -e "${BLUE}Step 5: Verifying uninstallation...${NC}"
    
    if command -v ollama &> /dev/null; then
        echo -e "${RED}❌ Ollama is still accessible${NC}"
        echo -e "${YELLOW}   Please check your PATH and remove Ollama manually${NC}"
        return 1
    else
        echo -e "${GREEN}✅ Ollama is no longer accessible${NC}"
        return 0
    fi
}

# Main execution
main() {
    if ! check_ollama_installed; then
        echo -e "${YELLOW}Nothing to uninstall. Ollama is not installed.${NC}"
        exit 0
    fi
    
    echo -e "${YELLOW}⚠️  This will uninstall Ollama and optionally remove all models and data.${NC}"
    echo ""
    read -p "Continue with uninstallation? (y/N): " -n 1 -r
    echo ""
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Uninstallation cancelled.${NC}"
        exit 0
    fi
    
    stop_ollama_service
    remove_ollama_data
    uninstall_ollama
    check_path
    
    if verify_uninstallation; then
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}✅ Ollama uninstalled successfully!${NC}"
        echo -e "${GREEN}========================================${NC}"
        echo ""
        echo -e "${BLUE}To reinstall Ollama, run:${NC}"
        echo -e "${YELLOW}  ./scripts/setup-ollama-macos.sh${NC}"
        echo ""
    else
        echo -e "${YELLOW}⚠️  Uninstallation completed with warnings.${NC}"
        echo -e "${YELLOW}   Please check the output above for any remaining steps.${NC}"
        echo ""
    fi
}

# Run main function
main
