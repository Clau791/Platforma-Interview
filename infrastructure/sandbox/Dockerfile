FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends nodejs npm \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m sandbox
USER sandbox
WORKDIR /home/sandbox

ENV PYTHONDONTWRITEBYTECODE=1

CMD ["sleep", "infinity"]
