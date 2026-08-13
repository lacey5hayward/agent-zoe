# Research findings — Azure/Bedrock pivot

## Microsoft Foundry Models overview
Source: https://learn.microsoft.com/en-us/azure/foundry/concepts/foundry-models-overview

The official Microsoft documentation says Foundry Models supports models sold by Azure and models from partners/community. Pricing information is provided before deployment. Partner/community models are billed through Azure Marketplace, and consumption pricing is available during deployment. The documentation does not establish that general model inference is always free; therefore, every candidate deployment must be checked in the Azure portal before use.

## AWS Bedrock
The official AWS Bedrock pricing page was blocked by the sandbox browser policy. Search results surfaced the official page and third-party summaries indicating that Bedrock model inference generally does not have a permanent standalone free tier and that new-account credits/trials may be time-limited. This must be confirmed in the user's AWS billing console before enabling calls. Do not describe Bedrock as always free.

## Cloudflare
Search results identified the official Cloudflare Workers Secrets documentation: https://developers.cloudflare.com/workers/configuration/secrets/ and Pages Functions documentation: https://developers.cloudflare.com/pages/functions/. These support keeping provider credentials server-side rather than in the iPad/browser.

## Design implication
The safest next step is a cost-guarded provider adapter: Bedrock and Azure routes remain disabled until the user confirms billing/credits and model access. A hard daily request/token budget, fail-closed behavior, and provider status diagnostics should be implemented before activation. Gemini/OpenRouter code should remain preserved but inactive until explicitly re-enabled.

Recorded 2026-08-13.
