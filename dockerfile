FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for PostgreSQL
RUN apt-get update && apt-get install -y \
    postgresql-client \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy application files
COPY requirements.txt .
COPY models.py .
COPY app.py .
COPY main.py .
COPY github_routes.py .
COPY slack_routes.py .
COPY allowed_imports.json .
COPY admin_utils.py .
COPY changelog.md .
COPY setup_db.py .
COPY pyproject.toml .
COPY .env.example .env

# Copy templates and static files
COPY templates/ templates/
COPY static/ static/

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["python", "main.py"]
