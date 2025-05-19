FROM python:3.11-slim

WORKDIR /app

# Install system dependencies with specific versions where possible
RUN apt-get update && apt-get install -y \
    postgresql-client \
    libpq-dev \
    gcc \
    wget \
    curl \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire application
COPY . .

# Create non-root user
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app

# Create necessary directories with proper permissions if needed
RUN mkdir -p /app/data && chmod 777 /app/data

# Run as non-root user for security
USER appuser

# Expose port the app runs on
EXPOSE 3000

# Command to run the application - bind to 0.0.0.0 to make it accessible
CMD ["python", "main.py", "--host", "0.0.0.0", "--port", "3000"]