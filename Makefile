.PHONY: help up down restart logs ollama-setup ollama-stop ollama-status clean

# Default target
help:
	@echo "Study Companion - Makefile Commands"
	@echo "===================================="
	@echo ""
	@echo "Docker Commands:"
	@echo "  make up          - Start all Docker services"
	@echo "  make down        - Stop all Docker services"
	@echo "  make restart     - Restart all Docker services"
	@echo "  make logs        - Show logs from all services"
	@echo "  make clean       - Stop services and remove volumes"
	@echo ""
	@echo "Ollama Commands (macOS only):"
	@echo "  make ollama-setup    - Install and start Ollama locally"
	@echo "  make ollama-stop     - Stop Ollama service"
	@echo "  make ollama-status   - Check Ollama service status"
	@echo ""
	@echo "Combined Commands:"
	@echo "  make start       - Setup Ollama (if macOS) and start Docker services"
	@echo "  make stop        - Stop Ollama (if macOS) and Docker services"
	@echo ""

# Detect OS
UNAME_S := $(shell uname -s)
IS_MACOS := $(if $(filter Darwin,$(UNAME_S)),true,false)

# Start Docker services
up:
	@echo "🚀 Starting Docker services..."
	docker compose up -d
	@echo "✅ Docker services started"
	@echo ""
	@if [ "$(IS_MACOS)" = "true" ]; then \
		echo "💡 Tip: Make sure Ollama is running locally (run 'make ollama-setup' if needed)"; \
	fi

# Stop Docker services
down:
	@echo "🛑 Stopping Docker services..."
	docker compose down
	@echo "✅ Docker services stopped"

# Restart Docker services
restart: down up

# Show Docker logs
logs:
	docker compose logs -f

# Clean up (stop and remove volumes)
clean:
	@echo "🧹 Cleaning up Docker services and volumes..."
	docker compose down -v
	@echo "✅ Cleanup complete"

# Ollama setup (macOS only)
ollama-setup:
	@if [ "$(IS_MACOS)" != "true" ]; then \
		echo "❌ Ollama setup is only available on macOS"; \
		echo "   For Linux, uncomment the ollama service in docker-compose.yml"; \
		exit 1; \
	fi
	@echo "🔧 Setting up Ollama on macOS..."
	./scripts/setup-ollama-macos.sh

# Stop Ollama (macOS only)
ollama-stop:
	@if [ "$(IS_MACOS)" != "true" ]; then \
		echo "❌ Ollama stop is only available on macOS"; \
		exit 1; \
	fi
	@echo "🛑 Stopping Ollama service..."
	./scripts/stop-ollama-macos.sh

# Check Ollama status (macOS only)
ollama-status:
	@if [ "$(IS_MACOS)" != "true" ]; then \
		echo "❌ Ollama status check is only available on macOS"; \
		exit 1; \
	fi
	@echo "📊 Checking Ollama status..."
	@if pgrep -f "ollama serve" > /dev/null 2>&1; then \
		echo "✅ Ollama is running"; \
		echo ""; \
		echo "Available models:"; \
		ollama list 2>/dev/null || echo "  (Could not list models)"; \
	else \
		echo "❌ Ollama is not running"; \
		echo "   Run 'make ollama-setup' to start it"; \
	fi

# Combined: Setup Ollama (if macOS) and start Docker
start:
	@if [ "$(IS_MACOS)" = "true" ]; then \
		echo "🍎 macOS detected - Setting up Ollama first..."; \
		$(MAKE) ollama-setup || echo "⚠️  Ollama setup had issues, continuing anyway..."; \
		echo ""; \
	fi
	@echo "🚀 Starting Docker services..."
	$(MAKE) up

# Combined: Stop Ollama (if macOS) and Docker
stop:
	@if [ "$(IS_MACOS)" = "true" ]; then \
		echo "🍎 macOS detected - Stopping Ollama..."; \
		$(MAKE) ollama-stop || echo "⚠️  Ollama stop had issues, continuing anyway..."; \
		echo ""; \
	fi
	@echo "🛑 Stopping Docker services..."
	$(MAKE) down
