FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ARG DEBIAN_FRONTEND=noninteractive
ARG VAGDHENU_REV=c18927a8a77775753e32248177a5a6bea1019a12
ARG INDICF5_REV=13f7c4d627cc10111aea8fe9c0039462cacacdc7
ARG BIGVGAN_REV=7d2b454564a6c7d014227f635b7423881f14bdac

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/huggingface \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    PYTHONPATH=/opt/vagdhenu/src:/opt/BigVGAN

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git libsndfile1 python3.10 python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN python3.10 -m pip install --upgrade pip \
    && python3.10 -m pip install torch==2.4.1 torchaudio==2.4.1 --index-url https://download.pytorch.org/whl/cu121

COPY requirements.txt /tmp/api-requirements.txt
RUN python3.10 -m pip install -r /tmp/api-requirements.txt \
    && python3.10 -m pip install transformers==4.46.3 vocos==0.1.0 \
      x-transformers==2.19.7 numpy==1.26.4 librosa==0.11.0 \
      matplotlib==3.10.7 pydub pypinyin safetensors scipy soundfile \
      torchdiffeq tqdm huggingface_hub indic-transliteration

RUN git clone https://github.com/prathoshap/vagdhenu.git /opt/vagdhenu \
    && git -C /opt/vagdhenu checkout "${VAGDHENU_REV}" \
    && git clone https://github.com/ai4bharat/IndicF5.git /opt/IndicF5 \
    && git -C /opt/IndicF5 checkout "${INDICF5_REV}" \
    && sed -i '/from f5_tts.model.trainer import Trainer/d' /opt/IndicF5/f5_tts/model/__init__.py \
    && sed -i 's/, \"Trainer\"//' /opt/IndicF5/f5_tts/model/__init__.py \
    && python3.10 -m pip install --no-deps /opt/IndicF5 \
    && git clone https://github.com/NVIDIA/BigVGAN.git /opt/BigVGAN \
    && git -C /opt/BigVGAN checkout "${BIGVGAN_REV}"

RUN HF_HUB_OFFLINE=0 python3.10 /opt/vagdhenu/scripts/download_weights.py \
    && HF_HUB_OFFLINE=0 python3.10 -c "from huggingface_hub import snapshot_download; snapshot_download('charactr/vocos-mel-24khz'); snapshot_download('nvidia/bigvgan_v2_24khz_100band_256x')"

COPY app.py /app/app.py
WORKDIR /app

EXPOSE 8000
CMD ["python3.10", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
