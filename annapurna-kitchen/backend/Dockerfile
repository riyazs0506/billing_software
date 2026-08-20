FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=Asia/Kolkata

# default-mysql-client provides mysqldump, which backup_service shells out to.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        default-mysql-client \
        build-essential \
        libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && apt-get purge -y build-essential && apt-get autoremove -y

COPY . .

RUN mkdir -p /var/backups/annapurna instance logs \
    && adduser --disabled-password --gecos '' annapurna \
    && chown -R annapurna:annapurna /app /var/backups/annapurna
USER annapurna

EXPOSE 5000

# 2 workers: the APScheduler backup job must not run in several processes.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", \
     "--timeout", "60", "--access-logfile", "-", "run:app"]
