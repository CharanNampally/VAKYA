FROM python:3.11-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 TOKENIZERS_PARALLELISM=false \
    PYTHONPATH=/app:/app/companion
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY azure/tutor/requirements.txt /tmp/requirements.txt
RUN pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cu124 \
    && pip install -r /tmp/requirements.txt
RUN HF_HUB_OFFLINE=0 python -c "from huggingface_hub import snapshot_download; snapshot_download('Qwen/Qwen3-4B', revision='1cfa9a7208912126459214e8b04321603b3df60c', local_dir='/opt/models/qwen', allow_patterns=['*.json','*.safetensors','*.txt','*.model'])"
RUN HF_HUB_OFFLINE=0 python -c "from huggingface_hub import snapshot_download; snapshot_download('google/madlad400-3b-mt', revision='fa184c675da0b5c9e1c8694fccd4e12e2d422094', local_dir='/opt/models/madlad', allow_patterns=['*.json','*.safetensors','*.txt','*.model'])"
COPY companion/vakya_companion /app/companion/vakya_companion
COPY azure/tutor/engine.py azure/tutor/quota.py azure/tutor/app.py /app/
WORKDIR /app
RUN python -c "from engine import HostedEngine; assert HostedEngine().capabilities()['conversation']"
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
