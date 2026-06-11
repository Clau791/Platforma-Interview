FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt requirements-vision.txt ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 ffmpeg docker-cli \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir -r requirements-vision.txt
# tensorflow from requirements-vision pins an older typing_extensions; override to meet pydantic
RUN pip install --no-cache-dir typing_extensions==4.12.2

COPY app ./app
COPY alembic.ini ./alembic.ini
COPY alembic ./alembic
COPY scripts ./scripts

ENV PYTHONPATH=/app

CMD ["/app/scripts/entrypoint.sh"]
