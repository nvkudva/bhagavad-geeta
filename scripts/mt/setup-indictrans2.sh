#!/usr/bin/env bash
# Sets up IndicTrans2 for local GPU inference on an RTX 5090 (Blackwell, sm_120).
#
# Version pins here are load-bearing:
#   python 3.12  - on 3.14 the tokenizers wheel older transformers needs has no
#                  prebuilt artefact and the Rust build fails.
#   torch cu128+ - sm_120 is absent from cu126 and earlier builds; they load but
#                  cannot launch a kernel on this card.
#   transformers==4.46.3 - IndicTrans2's vendored modeling_indictrans.py reads
#                  past_key_values[0][0].shape[2]. From 4.47 the cache is an
#                  object whose first layer is None -> AttributeError. Pinning
#                  keeps the legacy tuple cache, so use_cache stays True and the
#                  KV cache keeps working. Do not "fix" this with use_cache=False.
# Under WSL, check nothing else holds the GPU first: an LM Studio / llama.cpp
# server left resident will make the translation run stall rather than OOM,
# because the driver spills the overflow to host memory instead of failing.
set -euo pipefail
cd "$(dirname "$0")/../.."

uv venv --python 3.12 .venv-it2
# shellcheck disable=SC1091
source .venv-it2/bin/activate

uv pip install torch --index-url https://download.pytorch.org/whl/cu128
uv pip install 'transformers==4.46.3' sentencepiece 'huggingface_hub[cli]' \
  git+https://github.com/VarunGumma/IndicTransToolkit.git

python - <<'PY'
import torch
cap = torch.cuda.get_device_capability()
print(torch.__version__, cap, torch.cuda.get_device_name(0))
assert cap >= (12, 0), f"expected sm_120 Blackwell, got sm_{cap[0]}{cap[1]}"
assert cap[0] in [c for c in [int(a.split('_')[1][:2]) for a in torch.cuda.get_arch_list() if a.startswith('sm_')]], \
    f"this torch build has no sm_{cap[0]}{cap[1]} kernels: {torch.cuda.get_arch_list()}"
PY

# ai4bharat/indictrans2-en-indic-1B is gated (MIT, instant auto-approval).
# Needs HF_TOKEN and the terms accepted once in a browser.
# pytorch_model.bin is the same weights as model.safetensors - skipping it
# halves the transfer.
hf download ai4bharat/indictrans2-en-indic-1B --exclude "pytorch_model.bin"
