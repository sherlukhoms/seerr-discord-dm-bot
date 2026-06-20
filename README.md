# Seerr Discord DM Bot

Repo: https://github.com/sherlukhoms/seerr-discord-dm-bot

Receives Seerr webhook notifications and sends them as a direct message (DM)
to the requesting user — instead of posting them publicly in a text channel.

## How it works

1. Seerr fires a webhook on every request event (Pending, Approved, Declined,
   Available, ...) to this bot.
2. The bot reads the requester's Discord ID from the webhook payload's
   nested `request.requestedBy_settings_discordIds` field — only present if
   that user has linked their Discord account in Seerr (see step 5 below).
3. The bot builds an embed (title, description, Requested By / Request
   Status, poster as thumbnail) and sends it as a DM.

**Requirement:** The bot must share at least one server with the
user, otherwise Discord rejects the DM. Invite the bot to the same server
your Seerr notifications already use.

## 1. Create a Discord bot

1. https://discord.com/developers/applications → New Application
2. **Bot** tab → generate a token, save it — you'll need it as `DISCORD_BOT_TOKEN`
3. Privileged Gateway Intents: none needed (the bot only uses `Guilds`)
4. **OAuth2 → URL Generator**: scope `bot`, no permissions required → use
   the generated URL to invite the bot to your server

## 2. Get the image

The simplest option: just use the already-published public image, no
forking or building required:

```
ghcr.io/sherlukhoms/seerr-discord-dm-bot:latest
```

This is the same image used in the examples below — you only need your own
Discord bot token (step 1) and your own `WEBHOOK_SECRET`, nothing else.

<details>
<summary>Want to modify the code instead of just using it?</summary>

Fork this repo, then push to your fork. The included GitHub Action
(`.github/workflows/docker-publish.yml`) automatically builds and publishes
*your* version to *your own* GitHub Container Registry namespace on every
push to `main`:

1. Push to your fork, check the **Actions** tab for a green checkmark
2. On GitHub → your fork → **Packages** sidebar → `seerr-discord-dm-bot` →
   **Package settings** → set visibility to **Public** (the image has no
   secrets baked in — the token is injected at runtime — so this is safe)

You'll then have your own image at
`ghcr.io/<your-username>/seerr-discord-dm-bot:latest` to use instead of the
one above.
</details>

## 3. Deploy

`WEBHOOK_SECRET` isn't issued by Discord or Seerr — it's just a random
string you make up yourself, used to verify that incoming webhook calls
actually come from your Seerr instance. Generate one with:

```powershell
# PowerShell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```bash
# Node.js (also works inside the container)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use the same value in both places it's needed: the bot's `WEBHOOK_SECRET`
environment variable, and Seerr's webhook **Authorization Header** (step 4).

**Recommended: add it to your existing Portainer stack** (e.g. the same
stack as Radarr/Sonarr/Seerr). Add this service block:

```yaml
  seerr-discord-dm-bot:
    image: ghcr.io/sherlukhoms/seerr-discord-dm-bot:latest
    container_name: seerr-discord-dm-bot
    restart: unless-stopped
    environment:
      DISCORD_BOT_TOKEN: ${DISCORD_BOT_TOKEN}
      WEBHOOK_SECRET: ${WEBHOOK_SECRET}
      PORT: 3000
    ports:
      - "3000:3000"
```

Then, in the stack's **Environment variables** section in Portainer, add
`DISCORD_BOT_TOKEN` and `WEBHOOK_SECRET`, and update/redeploy the stack. If
the bot and Seerr are on the same Docker network, you can drop the `ports:`
block entirely — they'll reach each other by container name.

Check the logs (**Containers → seerr-discord-dm-bot → Logs**) for
`Logged in as ...` to confirm it connected.

To get future updates: re-pull/redeploy the stack in Portainer once in a
while (image tags don't auto-refresh on their own). If you forked and
build your own image, push your changes first and wait for the Action to
finish before redeploying.

<details>
<summary>Other ways to run it</summary>

**As its own separate Portainer stack (Git-based):**
Stacks → Add stack → Repository → point at this repo, compose path
`docker-compose.yml`. Same two environment variables as above.

**Plain Docker Compose, no Portainer:**
```bash
git clone https://github.com/sherlukhoms/seerr-discord-dm-bot.git
cd seerr-discord-dm-bot
cp .env.example .env   # fill in DISCORD_BOT_TOKEN, optionally WEBHOOK_SECRET
docker compose up -d --build
```

**Local development without Docker:**
```bash
npm install
npm start
```
</details>

## 4. Configure Seerr

Settings → Notifications → enable **Webhook** (not the Discord agent — that
one can only post to a channel, it can't DM).

- **Webhook URL:** `http://seerr-discord-dm-bot:3000/seerr-webhook` (same
  Docker network) or `http://<server-ip>:3000/seerr-webhook` (if you
  published the port)
- **Authorization Header:** your `WEBHOOK_SECRET` (optional but recommended)
- **JSON Payload:** leave Seerr's stock default payload as-is — no edits
  needed. The bot reads everything it needs straight from it.
- Enable the notification types you care about (Request Pending Approval,
  Request Approved, Request Declined, Request Available, ...)

Test with the **Test Notification** button in Seerr — the bot just
acknowledges it in the logs (a test has no real Discord ID attached).

> **Important:** Also keep Seerr's built-in **Discord** notification agent
> (Settings → Notifications → Discord) **enabled**, even though you don't
> need its channel posts. The personal "Discord" tab in a user's own
> notification settings — where they enter their Discord ID (see step 5) —
> only shows up if this agent is enabled. Disable it and users lose the
> ability to link their Discord account at all.
>
> Tip: rather than spamming a public channel, create a private channel
> only the admin can see, and point the Discord agent's webhook there. That
> way the admin still gets push notifications as a fallback/overview, while
> regular users only get the clean DM from this bot.

## 5. One thing every user has to do themselves

Each user who wants to receive DMs must link their own Discord account in
Seerr, under their personal **Settings → Notifications → Discord** (this is
a per-user setting, not something an admin can do for them). Without it,
the bot just logs a warning and moves on.

This tab only appears if the admin-level Discord agent is enabled — see the
note in step 4.

To find their own Discord User ID, each user needs to enable **Developer
Mode** first: in Discord, go to **User Settings → Advanced** (near the
bottom of the settings list) → toggle on **Developer Mode**. Then
right-click their own username/avatar anywhere in Discord → **Copy User
ID**, and paste that into Seerr.

## Notes

- `{{image}}` usually returns a full poster URL (TMDB image) from Seerr.
- Discord blocks DMs if the user disabled "Allow direct messages from
  server members" in their privacy settings — shows up as an error in the
  logs, not a bug in the bot.
