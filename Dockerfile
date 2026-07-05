# Multi-stage lightweight python build
FROM python:3.11-slim as builder

WORKDIR /app

# Enable python virtual environment isolation
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Production image
FROM python:3.11-slim as runner

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY . .

# Expose standard bindings
EXPOSE 8000

ENV MEMORYVAULT_HOST=0.0.0.0
ENV MEMORYVAULT_PORT=8000

CMD ["python", "-m", "backend.main"]
