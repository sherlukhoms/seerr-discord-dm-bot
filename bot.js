require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const app = express();
app.use(express.json());

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_BOT_TOKEN);

// Colors mirroring Seerr's own Discord embeds
const STATUS_COLORS = {
  'Request Approved': 0x2ecc71,
  'Request Declined': 0xe74c3c,
  'Request Pending Approval': 0xf1c40f,
  'Request Automatically Approved': 0x2ecc71,
  'Media Available': 0x3498db,
  'Request Processing Failed': 0xe74c3c,
  default: 0x95a5a6,
};

function buildEmbed(payload) {
  const title = payload.subject
    ? `${payload.event}: ${payload.subject}`
    : payload.event;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(STATUS_COLORS[payload.event] || STATUS_COLORS.default)
    .setTimestamp();

  if (payload.message) {
    embed.setDescription(payload.message);
  }

  embed.addFields(
    {
      name: 'Requested By',
      value: payload.requestedBy_username || 'Unknown',
      inline: true,
    },
    {
      name: 'Request Status',
      value: payload.media_status || payload.event || 'Unknown',
      inline: true,
    }
  );

  if (payload.image) {
    embed.setThumbnail(payload.image);
  }

  return embed;
}

// Handles both the current Seerr default (singular "requestedBy_discordId" as
// a plain string) and the array-based "requestedBy_discordIds" described in
// newer Seerr docs, in case that ever lands in your deployed version.
function extractDiscordIds(payload) {
  const raw = payload.requestedBy_discordId ?? payload.requestedBy_discordIds;

  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'string') {
    // Guard against an unresolved template variable (e.g. "{{...}}")
    // making it through if the field name doesn't exist in this Seerr version.
    if (raw.trim() === '' || raw.startsWith('{{')) return [];
    return [raw];
  }
  return [];
}

app.post('/seerr-webhook', async (req, res) => {
  // Optional protection via shared secret (see .env.example)
  if (process.env.WEBHOOK_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== process.env.WEBHOOK_SECRET) {
      console.warn('[Webhook] Unauthorized request rejected.');
      return res.status(401).send('Unauthorized');
    }
  }

  const payload = req.body;

  // Test notification from the Seerr settings page -> just acknowledge
  if (payload.notification_type === 'TEST_NOTIFICATION') {
    console.log('[Webhook] Test notification received.');
    return res.sendStatus(200);
  }

  console.log(`[Webhook] Received: ${payload.notification_type} - ${payload.subject}`);
  console.log('[Webhook] Raw payload (debug):', JSON.stringify(payload));

  const discordIds = extractDiscordIds(payload);

  if (discordIds.length === 0) {
    console.warn(
      '[Webhook] No Discord ID found (user likely has not linked Discord in Seerr).'
    );
    return res.sendStatus(200);
  }

  const embed = buildEmbed(payload);

  for (const discordId of discordIds) {
    try {
      const user = await client.users.fetch(discordId);
      await user.send({ embeds: [embed] });
      console.log(`[DM] Sent to ${user.tag} (${discordId}).`);
    } catch (err) {
      console.error(`[DM] Failed to send to ${discordId}:`, err.message);
    }
  }

  res.sendStatus(200);
});

app.get('/health', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Webhook] Server listening on port ${PORT}`);
});