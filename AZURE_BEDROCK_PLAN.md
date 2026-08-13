# Agent Zoe: Azure & AWS Bedrock "Always Free" Hydra Brain Architecture Plan (v2.9.0)

## Overview
To provide Agent Zoe with a robust, unblockable, and high-performance backend that bypasses any credit exhaustion or browser/API restrictions on mobile devices (iPad), we are outlining the **Hydra Brain v2.9.0** pivot using **Microsoft Azure AI** and **AWS Bedrock** free tiers / generous developer offerings.

---

## 1. Architecture Strategy

```
+-----------------------------------------------------------------+
+                      AGENT ZOE FRONTEND                         +
+            (Cloudflare Pages — Midnight Theme & Zelda UI)       +
+-----------------------------------------------------------------+
                                  │
                                  ▼
+-----------------------------------------------------------------+
+                CLOUDFLARE WORKERS API PROXY                     +
+          (Unified Multi-Model Routing & Failover Chain)         +
+-----------------------------------------------------------------+
         │                        │                      │
         ▼                        ▼                      ▼
┌──────────────────┐    ┌──────────────────┐    ┌─────────────────┐
|  Primary Brain   |    |  Secondary Brain |    | Tertiary Brain  |
|  AWS Bedrock     |    |  Azure AI Studio |    | Google Gemini   |
|  (Claude 3 Haiku |    |  (Phi-3 / Llama) |    | (1.5 Flash)     |
|   Always Free/   |    |                  |    |                 |
|   Free Tier)     |    |                  |    |                 |
└──────────────────┘    └──────────────────┘    └─────────────────┘
```

---

## 2. Core Components & Free Tier Alignment

### A. AWS Bedrock (Primary Engine)
* **Models**: Anthropic Claude 3 Haiku / Amazon Titan Text.
* **Access**: AWS Free Tier / Bedrock trial credits.
* **Integration**: Server-side IAM Role or API key securely stored in Cloudflare Workers secrets (`BEDROCK_API_KEY` / AWS SigV4 proxy).

### B. Microsoft Azure AI / Azure OpenAI (Secondary Engine)
* **Models**: Phi-3 Mini / Llama-3 8B / GPT-4o-mini (Free trial tier).
* **Access**: Azure Free Account ($200 credit + 12 months of free services).
* **Integration**: Standard Azure OpenAI REST endpoints proxied via Cloudflare Worker (`AZURE_OPENAI_ENDPOINT` & `AZURE_OPENAI_KEY`).

### C. Google Gemini Studio (Tertiary Backup)
* **Models**: Gemini 1.5 Flash (Free Tier: 15 RPM / 1,500 RPD).
* **Integration**: Retained as our fast multimodal fallback.

---

## 3. Implementation Roadmap (v2.9.0)

1. **Worker Proxy Update**: Modify `functions/api/proxy/index.js` to include Bedrock and Azure endpoints in the engine chain (`MODEL_CHAIN = ['bedrock', 'azure', 'gemini', 'openrouter']`).
2. **Secrets Configuration**: Set up Cloudflare Pages/Worker environment secrets for Azure and AWS credentials.
3. **iPad Touch & Deploy Verification**: Once the backend is multi-cloud resilient, we finalize the GitHub webhook bridge so Zoe pushes code updates natively without relying on client-side button friction.
