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

// Maps Seerr's notification_type to a clean status label + embed color.
// (media.status reflects library availability, not the request decision,
// so we derive the status shown in the embed from notification_type instead.)
const NOTIFICATION_INFO = {
  MEDIA_PENDING: { label: 'Pending Approval', color: 0xf1c40f },
  MEDIA_APPROVED: { label: 'Approved', color: 0x2ecc71 },
  MEDIA_AUTO_APPROVED: { label: 'Automatically Approved', color: 0x2ecc71 },
  MEDIA_DECLINED: { label: 'Declined', color: 0xe74c3c },
  MEDIA_AVAILABLE: { label: 'Available', color: 0x3498db },
  MEDIA_FAILED: { label: 'Processing Failed', color: 0xe74c3c },
};
const DEFAULT_COLOR = 0x95a5a6;

function buildEmbed(payload) {
  const info = NOTIFICATION_INFO[payload.notification_type];

  const title = payload.subject
    ? `${payload.event}: ${payload.subject}`
    : payload.event;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(info?.color ?? DEFAULT_COLOR)
    .setTimestamp();

  if (payload.message) {
    embed.setDescription(payload.message);
  }

  embed.addFields(
    {
      name: 'Requested By',
      value: payload.request?.requestedBy_username || 'Unknown',
      inline: true,
    },
    {
      name: 'Request Status',
      value: info?.label || payload.event || 'Unknown',
      inline: true,
    }
  );

  if (payload.image) {
    embed.setThumbnail(payload.image);
  }

  return embed;
}

// Reads the Discord ID(s) of the requesting user from Seerr's nested
// "request" object (Seerr's stock default webhook payload). Handles both
// the array form ("requestedBy_settings_discordIds") and, defensively, an
// older/singular form some payload variants may use.
function extractDiscordIds(payload) {
  const raw =
    payload.request?.requestedBy_settings_discordIds ??
    payload.request?.requestedBy_settings_discordId;

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