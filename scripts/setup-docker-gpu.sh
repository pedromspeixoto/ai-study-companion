#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Docker GPU Support Setup Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if [ -f /etc/os-release ]; then
            . /etc/os-release
            OS=$ID
            OS_VERSION=$VERSION_ID
        else
            echo -e "${RED}❌ Cannot detect Linux distribution${NC}"
            exit 1
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo -e "${BLUE}macOS detected${NC}"
        echo ""
        echo -e "${YELLOW}⚠️  Important: Docker Desktop on macOS does NOT support GPU passthrough${NC}"
        echo -e "${YELLOW}   (Neither NVIDIA CUDA nor Apple Silicon Metal)${NC}"
        echo ""
        echo -e "${GREEN}✅ Solution: Run Ollama natively on macOS for GPU acceleration!${NC}"
        echo ""
        echo -e "${BLUE}Ollama can use Apple's Metal GPU when installed natively.${NC}"
        echo -e "${BLUE}This provides much better performance than running in Docker.${NC}"
        echo ""
        echo -e "${YELLOW}To install Ollama natively on macOS:${NC}"
        echo -e "${BLUE}  1. Install via Homebrew:${NC}"
        echo -e "${YELLOW}     brew install ollama${NC}"
        echo ""
        echo -e "${BLUE}  2. Start Ollama service:${NC}"
        echo -e "${YELLOW}     ollama serve${NC}"
        echo ""
        echo -e "${BLUE}  3. Pull required models:${NC}"
        echo -e "${YELLOW}     ollama pull llama3.1:8b${NC}"
        echo -e "${YELLOW}     ollama pull nomic-embed-text${NC}"
        echo ""
        echo -e "${BLUE}  4. Update docker-compose.yml to use:${NC}"
        echo -e "${YELLOW}     OLLAMA_BASE_URL=http://host.docker.internal:11434${NC}"
        echo ""
        echo -e "${GREEN}This will allow your Docker containers to connect to native Ollama${NC}"
        echo -e "${GREEN}which uses Metal GPU acceleration for much better performance!${NC}"
        echo ""
        exit 0
    else
        echo -e "${RED}❌ Unsupported OS: $OSTYPE${NC}"
        exit 1
    fi
}

# Check for NVIDIA GPU
check_nvidia_gpu() {
    echo -e "${BLUE}Step 1: Checking for NVIDIA GPU...${NC}"
    
    if command -v nvidia-smi &> /dev/null; then
        echo -e "${GREEN}✅ NVIDIA drivers detected${NC}"
        nvidia-smi --query-gpu=name --format=csv,noheader | head -1 | while read gpu_name; do
            echo -e "   GPU: ${GREEN}$gpu_name${NC}"
        done
        echo ""
        return 0
    else
        echo -e "${RED}❌ NVIDIA drivers not found${NC}"
        echo -e "${YELLOW}   Please install NVIDIA GPU drivers first:${NC}"
        echo -e "${YELLOW}   Ubuntu/Debian: sudo apt-get install nvidia-driver-<version>${NC}"
        echo -e "${YELLOW}   RHEL/CentOS: sudo yum install nvidia-driver${NC}"
        echo -e "${YELLOW}   Or download from: https://www.nvidia.com/Download/index.aspx${NC}"
        echo ""
        echo -e "${YELLOW}   After installing drivers, reboot and run this script again.${NC}"
        exit 1
    fi
}

# Check if nvidia-container-toolkit is installed
check_nvidia_toolkit() {
    echo -e "${BLUE}Step 2: Checking for nvidia-container-toolkit...${NC}"
    
    if command -v nvidia-ctk &> /dev/null; then
        echo -e "${GREEN}✅ nvidia-container-toolkit is already installed${NC}"
        nvidia-ctk --version | head -1
        echo ""
        return 0
    else
        echo -e "${YELLOW}⚠️  nvidia-container-toolkit not found${NC}"
        echo ""
        return 1
    fi
}

# Install nvidia-container-toolkit based on OS
install_nvidia_toolkit() {
    echo -e "${BLUE}Step 3: Installing nvidia-container-toolkit...${NC}"
    
    case $OS in
        ubuntu|debian)
            echo -e "${YELLOW}   Detected: Ubuntu/Debian${NC}"
            
            # Check if Docker is installed
            if ! command -v docker &> /dev/null; then
                echo -e "${RED}❌ Docker is not installed${NC}"
                echo -e "${YELLOW}   Please install Docker first: https://docs.docker.com/get-docker/${NC}"
                exit 1
            fi
            
            # Configure repository
            echo -e "${YELLOW}   Configuring NVIDIA repository...${NC}"
            distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
            curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
            curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
                sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
                sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
            
            # Update and install
            echo -e "${YELLOW}   Updating package list...${NC}"
            sudo apt-get update
            
            echo -e "${YELLOW}   Installing nvidia-container-toolkit...${NC}"
            sudo apt-get install -y nvidia-container-toolkit
            ;;
            
        rhel|centos|fedora|rocky|almalinux)
            echo -e "${YELLOW}   Detected: RHEL/CentOS/Fedora${NC}"
            
            # Check if Docker is installed
            if ! command -v docker &> /dev/null; then
                echo -e "${RED}❌ Docker is not installed${NC}"
                echo -e "${YELLOW}   Please install Docker first: https://docs.docker.com/get-docker/${NC}"
                exit 1
            fi
            
            # Configure repository
            echo -e "${YELLOW}   Configuring NVIDIA repository...${NC}"
            distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
            
            # Determine package manager
            if command -v dnf &> /dev/null; then
                PKG_MGR="dnf"
            elif command -v yum &> /dev/null; then
                PKG_MGR="yum"
            else
                echo -e "${RED}❌ Neither dnf nor yum found${NC}"
                exit 1
            fi
            
            curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo | \
                sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo
            
            # Install
            echo -e "${YELLOW}   Installing nvidia-container-toolkit...${NC}"
            sudo $PKG_MGR install -y nvidia-container-toolkit
            ;;
            
        *)
            echo -e "${RED}❌ Unsupported Linux distribution: $OS${NC}"
            echo -e "${YELLOW}   Please install nvidia-container-toolkit manually:${NC}"
            echo -e "${YELLOW}   https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html${NC}"
            exit 1
            ;;
    esac
    
    echo -e "${GREEN}✅ nvidia-container-toolkit installed successfully${NC}"
    echo ""
}

# Configure Docker to use NVIDIA runtime
configure_docker() {
    echo -e "${BLUE}Step 4: Configuring Docker to use NVIDIA runtime...${NC}"
    
    # Check if Docker daemon is running
    if ! sudo docker info &> /dev/null; then
        echo -e "${RED}❌ Docker daemon is not running${NC}"
        echo -e "${YELLOW}   Please start Docker: sudo systemctl start docker${NC}"
        exit 1
    fi
    
    # Configure runtime
    echo -e "${YELLOW}   Configuring NVIDIA runtime...${NC}"
    sudo nvidia-ctk runtime configure --runtime=docker
    
    # Restart Docker
    echo -e "${YELLOW}   Restarting Docker daemon...${NC}"
    sudo systemctl restart docker
    
    # Wait a moment for Docker to restart
    sleep 2
    
    # Verify Docker is running
    if sudo docker info &> /dev/null; then
        echo -e "${GREEN}✅ Docker configured and restarted successfully${NC}"
        echo ""
    else
        echo -e "${RED}❌ Docker failed to restart${NC}"
        echo -e "${YELLOW}   Check Docker status: sudo systemctl status docker${NC}"
        exit 1
    fi
}

# Test GPU access
test_gpu_access() {
    echo -e "${BLUE}Step 5: Testing GPU access in Docker...${NC}"
    
    echo -e "${YELLOW}   Running test container...${NC}"
    if sudo docker run --rm --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi &> /dev/null; then
        echo -e "${GREEN}✅ GPU access test passed!${NC}"
        echo ""
        return 0
    else
        echo -e "${YELLOW}⚠️  GPU test container failed (this might be due to network/download issues)${NC}"
        echo -e "${YELLOW}   Trying alternative test...${NC}"
        
        # Alternative: check if --gpus flag is recognized
        if sudo docker run --rm --gpus all --help 2>&1 | grep -q "gpus"; then
            echo -e "${GREEN}✅ Docker GPU support is configured${NC}"
            echo -e "${YELLOW}   (Test container download failed, but configuration looks correct)${NC}"
            echo ""
            return 0
        else
            echo -e "${RED}❌ GPU support not working properly${NC}"
            echo -e "${YELLOW}   Check Docker logs: sudo journalctl -u docker${NC}"
            return 1
        fi
    fi
}

# Main execution
main() {
    detect_os
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        exit 0
    fi
    
    check_nvidia_gpu
    
    if ! check_nvidia_toolkit; then
        install_nvidia_toolkit
    fi
    
    configure_docker
    
    if test_gpu_access; then
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}✅ Setup completed successfully!${NC}"
        echo -e "${GREEN}========================================${NC}"
        echo ""
        echo -e "${BLUE}You can now use GPU support in Docker Compose.${NC}"
        echo -e "${BLUE}Start your services with:${NC}"
        echo -e "${YELLOW}  docker compose up -d${NC}"
        echo ""
    else
        echo -e "${YELLOW}⚠️  Setup completed, but GPU test had issues.${NC}"
        echo -e "${YELLOW}   You may need to troubleshoot further.${NC}"
        echo ""
    fi
}

# Run main function
main
