FROM python:3.13-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/build
ARG MMALIGN_COMMIT=23f14ffcf8647f2dc1c0e01043db3a7f3a661c28
RUN curl -fsSL "https://codeload.github.com/pylelab/USalign/tar.gz/${MMALIGN_COMMIT}" | tar -xz --strip-components=1 && g++ -O3 -ffast-math MMalign.cpp -o /usr/local/bin/MMalign
COPY requirements.lock /opt/requirements.lock
RUN pip install --no-cache-dir --prefix=/install -r /opt/requirements.lock
FROM python:3.13-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/* && useradd --create-home --uid 10001 analysis && mkdir /data && chown analysis:analysis /data
COPY --from=build /install /usr/local
COPY --from=build /usr/local/bin/MMalign /usr/local/bin/MMalign
WORKDIR /app
COPY --chown=analysis:analysis . /app
ENV AMYLOID_DATA_DIR=/data OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
USER analysis
EXPOSE 8001
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1", "--no-access-log"]
