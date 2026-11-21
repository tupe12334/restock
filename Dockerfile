# Standalone server image. Stdlib only. Data lives in the /data volume.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    RESTOCK_DATA=/data

RUN useradd --create-home --uid 10001 restock \
    && mkdir -p /data \
    && chown restock:restock /data

WORKDIR /app
COPY . /app
USER restock

VOLUME /data
EXPOSE 8765

CMD ["python3", "-m", "restock", "serve", "--host", "0.0.0.0", "--port", "8765"]
