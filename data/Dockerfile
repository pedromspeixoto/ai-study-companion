FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for psycopg2
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv for faster package management
RUN pip install uv

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies using uv
RUN uv pip install --system -e . && \
    uv pip install --system dagster-webserver

# Copy source code
COPY src/ ./src/

# Copy workspace configuration
COPY workspace.yaml ./

# Set environment variables
ENV PYTHONPATH=/app/src
ENV DAGSTER_HOME=/app/.dagster_home

# Create dagster home directory
RUN mkdir -p /app/.dagster_home

# Expose Dagster webserver port
EXPOSE 3000

# Default command to run Dagster dev server
CMD ["dagster", "dev", "-h", "0.0.0.0", "-p", "3000", "-w", "workspace.yaml"]
