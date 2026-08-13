# Agent Zoe v2.9.1: The Hydra Expansion

Version **2.9.1** successfully expands Agent Zoe's brain with six new independent, generous free-tier AI providers, bringing her total multi-cloud fallback array (the Hydra Brain) to twelve robust engines. 

## The Expanded Hydra Array

Zoe now supports a comprehensive roster of model providers, allowing her to seamlessly route requests across multiple independent endpoints if any single provider experiences rate limits or downtime.

| Engine ID | Provider Name | Default Model | Free-Tier / Access Profile |
| :--- | :--- | :--- | :--- |
| **cerebras** | Cerebras | Llama 3.1 70B | Ultra-fast inference with up to 1M free tokens per day [1]. |
| **sambanova** | SambaNova Cloud | Meta Llama 3.1 8B | Developer tier offering high-speed open-source model execution. |
| **cohere** | Cohere Command | Command R+ | Advanced structured planning and tool-use model. |
| **together** | Together AI | Llama 3.1 8B Turbo | Broad open-source model catalog with developer credit allocation. |
| **fireworks** | Fireworks AI | Llama 3 70B Instruct | High-throughput optimized inference endpoints. |
| **nvidia** | NVIDIA NIM | Llama 3.1 70B | Accelerated enterprise-grade model inference. |

## Integration and Fallback Architecture

All six new providers have been fully wired into both the **Cloudflare Worker proxy** (`functions/api/proxy/index.js` and `status.js`) and the **client-side engine registry** (`zoe-core.js`). 

1. **Server-Side Security**: Provider API keys are configured as secure environment variables (Secrets) in Cloudflare Pages, preventing exposure on client devices or iPad memory.
2. **Automatic Status Discovery**: The settings modal queries `/api/proxy/status` in real time, displaying live readiness indicators (`✓ ready` or `✗ secret not set`) for every provider in the Hydra array.
3. **Conservative Failover Chain**: When operating in `auto` mode, Zoe evaluates providers in priority order, automatically bypassing missing secrets or rate-limited engines (HTTP 429/402) to guarantee uninterrupted interaction.

## References

[1] Cerebras Systems, *Cerebras Inference Free Tier and Model Limits*, https://inference-docs.cerebras.ai/
