# The measurement bench for moderation. Everything the pipeline needs lives in
# this image; nothing is installed on the host.
FROM python:3.12-slim

# Models and datasets are downloaded into a mounted cache, never into the image,
# so a rebuild does not cost gigabytes again.
ENV HF_HOME=/cache/huggingface \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
 && apt-get install --yes --no-install-recommends build-essential curl \
 && rm -rf /var/lib/apt/lists/*

# CPU-only torch: the node has no GPU, and the GPU wheels are an extra 2 GB.
# transformers refuses to load a .bin checkpoint on torch below 2.6 — the
# restriction is a security one (CVE-2025-32434), not a preference, and the
# translation model in the cache is exactly such a checkpoint.
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.6.0

# fasttext-wheel is built against numpy 1.x: it calls np.array(..., copy=False),
# which numpy 2 turned from a hint into an error. Pinning the array library is
# the honest fix; monkey-patching the identifier would hide it.
RUN pip install \
      "numpy<2" \
      # These two are pinned together on purpose. 4.5.0 of the engine ships a
      # shared library asking for an executable stack, which glibc 2.41 in Debian
      # trixie refuses outright — the import dies before any of our code runs. The
      # engine versions that do load pass `dtype` to the model constructor, and
      # that argument only exists in transformers from 4.56. So the floor is set
      # by the engine and the ceiling by not crossing into transformers 5, which
      # would put the already-measured classifiers on new code. Checked: the
      # English classifier answers 0.987 on the control message, as before.
      transformers==4.56.2 \
      ctranslate2==4.6.3 \
      sentencepiece==0.2.0 \
      # Not pinned: it is transformers' own dependency, and pinning it to an
      # older release than transformers asks for makes the build unsolvable.
      huggingface-hub \
      fasttext-wheel==0.9.2 \
      datasets==3.2.0 \
      requests==2.32.3

WORKDIR /bench
COPY . /bench

CMD ["python", "pipeline.py", "--help"]
