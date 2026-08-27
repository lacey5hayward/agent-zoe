# Agent Zoe Hub — Discord Setup

## Private bot invite URL

Application ID: `1542554771158995024`

Invite URL:

https://discord.com/oauth2/authorize?client_id=1542554771158995024&scope=bot%20applications.commands&permissions=84992

The invite URL requests the `bot` and `applications.commands` scopes with basic permissions for viewing channels, sending messages, reading message history, and embedding links.

## Secret handling

Never store the Discord bot token, Tumblr credentials, or other private credentials in this file, GitHub, or client-side code. Store them only as encrypted production secrets in the Agent Zoe Cloudflare project.

## Pending

The Discord Interactions Endpoint URL will be added after its signed-request handler is deployed and verified. It is separate from Tumblr’s OAuth URLs.
