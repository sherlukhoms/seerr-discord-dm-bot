# Seerr Discord DM Bot

Receives Seerr webhook notifications and sends them as a direct message (DM)
to the respective requesting user — instead of posting them publicly in a
text channel.

## How it works

1. Seerr fires a webhook on every request event (Pending, Approved, Declined,
   Available, ...) to this bot.
2. The bot reads the requester's Discord ID from the payload
   (`requestedBy_settings_discordIds` — only present if the user has linked
   their Discord account in Seerr under Settings → Notifications).
3. The bot builds an embed (title, description, Requested By / Request
   Status, poster as thumbnail) and sends it as a DM via `user.send()`.

**Requirement:** The bot must share at least one server (guild) with the
user, otherwise Discord will reject the DM. So invite the bot to the same
server where your existing Seerr notifications already run.

## 1. Create a Discord bot

1. https://discord.com/developers/applications → New Application
2. **Bot** tab → generate a token, you'll need it as `DISCORD_BOT_TOKEN`
3. Privileged Gateway Intents: none of the three (Presence / Server Members /
   Message Content) are needed here — the bot only needs `Guilds`.
4. **OAuth2 → URL Generator** tab: scope `bot`, no special permissions
   required (plain DMs only need server membership). Use the generated URL
   to invite the bot to your server.

## 2. Local development (optional)

If you want to run/test the bot directly instead of via Docker:

```bash
cd seerr-discord-dm-bot
cp .env.example .env
# fill in DISCORD_BOT_TOKEN, optionally WEBHOOK_SECRET
npm install
npm start
```

`docker compose` (see below) also auto-loads a local `.env` file for
variable substitution, so the same `.env` works for `docker compose up`
without any extra config.

## 3. Deploying via Portainer (Git stack)

This repo is structured so it can be deployed directly as a Portainer
"Stack from a Git repository":

1. Push this repo to GitHub.
2. In Portainer: **Stacks → Add stack → Repository**
   - Repository URL: your GitHub repo URL
   - Compose path: `docker-compose.yml` (already at repo root)
3. Under **Environment variables**, add:
   - `DISCORD_BOT_TOKEN` = your bot token
   - `WEBHOOK_SECRET` = a secret string of your choice (optional, see below)
4. Deploy the stack. Secrets stay in Portainer only — they are never written
   to the repo, since `.env` is gitignored.
5. Check **Containers → seerr-discord-dm-bot → Logs** for `Logged in as ...`
   to confirm the bot connected successfully.

To update later: push changes to GitHub, then use Portainer's
**Pull and redeploy** button on the stack.

### Networking note

This bot and your Seerr instance don't need to be in the same Portainer
stack or Docker network. Since the port is published on the host
(`3000:3000`), Seerr just needs to reach the bot via the server's IP — see
the webhook URL below. If you'd rather avoid exposing the port and instead
attach both containers to the same Docker network, that also works; just
remove the `ports:` mapping and declare Seerr's network as `external: true`
in `docker-compose.yml`.

## 4. Deploying via plain Docker Compose (no Portainer)

```bash
docker compose up -d --build
```

(Make sure `.env` exists locally with `DISCORD_BOT_TOKEN` set, as in step 2.)

## 5. Configure Seerr

Settings → Notifications → enable **Webhook** (not the Discord agent!).

- **Webhook URL:** `http://<server-ip>:3000/seerr-webhook`
  (or `http://seerr-discord-dm-bot:3000/seerr-webhook` if on the same Docker network)
- **Authorization Header:** your `WEBHOOK_SECRET` (optional but recommended)
- **JSON Payload:** replace the default payload with:

```json
{
  "notification_type": "{{notification_type}}",
  "event": "{{event}}",
  "subject": "{{subject}}",
  "message": "{{message}}",
  "image": "{{image}}",
  "media_status": "{{media_status}}",
  "requestedBy_username": "{{requestedBy_username}}",
  "requestedBy_avatar": "{{requestedBy_avatar}}",
  "requestedBy_discordIds": {{requestedBy_settings_discordIds}}
}
```

Important: `requestedBy_discordIds` **without** quotes, since Seerr inserts
an actual JSON array there (e.g. `["123456789012345678"]`).

- Enable the notification types you care about (Request Pending Approval,
  Request Approved, Request Declined, Request Available, ...). According to
  Seerr's docs, the `requestedBy_*` variables are available for **all**
  request notification types, regardless of whether `notifyuser_*` is
  restricted for that type.

Test with **Test Notification** in the Seerr settings — the bot will just
acknowledge it in the logs (`TEST_NOTIFICATION` doesn't contain a real
Discord ID).

## 6. Requirement on the user side

Every user who should receive DMs must link their own Discord account in
Seerr under **Settings → Notifications → Discord**. Without that link, there
is no `requestedBy_discordIds` and the bot will just log a warning.

## Notes

- `{{image}}` usually returns a full poster URL (TMDB image) from Seerr. If
  the thumbnail doesn't load, check whether the URL is actually absolute.
- Discord blocks DMs if the user has disabled "Allow direct messages from
  server members" in their privacy settings — that shows up as an error in
  the logs but isn't a bug in the bot.
