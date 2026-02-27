# MLX Model for Action Classification

This directory should contain a quantized LLM for local action classification.

## Recommended Model

**Qwen2.5-1.5B-Instruct (4-bit quantized)** — ~800MB, ~80ms inference on M-series Macs.

## Download & Convert

```bash
pip install mlx-lm

# Convert and quantize to 4-bit
python -m mlx_lm.convert --hf-path Qwen/Qwen2.5-1.5B-Instruct -q --q-bits 4 --upload-repo ""

# The output will be in a local directory. Copy all files here:
# config.json, tokenizer.json, tokenizer_config.json, *.safetensors, special_tokens_map.json
```

## Required Files

After conversion, this directory must contain at minimum:
- `config.json`
- `tokenizer.json`
- `tokenizer_config.json`
- `model*.safetensors` (one or more weight files)

## Alternative Models

| Model | Size (Q4) | Speed (M2) | Notes |
|-------|-----------|------------|-------|
| SmolLM2-1.7B | ~600MB | ~50ms | Fastest, good for classification |
| Qwen2.5-1.5B | ~800MB | ~80ms | Best structured JSON output |
| Phi-3.5-mini-3.8B | ~1.8GB | ~150ms | Best quality, larger |

## Without a Model

If no model is found here, the widget falls back to forwarding context events
to Electron for server-side classification via the analyze-action edge function.
