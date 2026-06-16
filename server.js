require('dotenv').config();
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const {
  Client, GatewayIntentBits, Partials,
  REST, Routes, SlashCommandBuilder, EmbedBuilder
} = require('discord.js');

const app  = express();
const PORT = process.env.PORT || 3000;
const LICENSES_FILE = path.join(__dirname, 'licenses.json');

const MAX_PER_USER_PER_DAY = 5;

// ── License helpers ──────────────────────────────────────
function loadLicenses() {
  try {
    if (!fs.existsSync(LICENSES_FILE)) return [];
    return JSON.parse(fs.readFileSync(LICENSES_FILE, 'utf8'));
  } catch { return []; }
}
function saveLicenses(list) {
  fs.writeFileSync(LICENSES_FILE, JSON.stringify(list, null, 2));
}
function generateCode() {
  const seg = () => Math.random().toString(36).toUpperCase().slice(2, 6).padEnd(4, '0');
  return `SYM_${seg()}_${seg()}_${seg()}`;
}

// Count how many licenses a user generated in last 24h
function countUserToday(licenses, userId) {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  return licenses.filter(l =>
    l.creatorId === userId && new Date(l.createdAt).getTime() > since
  ).length;
}

// ── Express ──────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/verify-license', (req, res) => {
  const code = (req.body.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ message: 'No code provided' });
  const licenses = loadLicenses();
  const idx = licenses.findIndex(l => l.code === code);
  if (idx === -1) return res.status(404).json({ message: 'Invalid license code' });
  if (licenses[idx].status === 'USED') return res.status(403).json({ message: 'License already used' });
  licenses[idx].status  = 'USED';
  licenses[idx].usedAt  = new Date().toISOString();
  licenses[idx].usedBy  = 'web-login';
  licenses[idx].logs.push({ when: new Date().toISOString(), by: 'web-login', action: 'used' });
  saveLicenses(licenses);
  res.json({ ok: true, message: 'License accepted' });
});

app.get('/licenses', (req, res) => res.json(loadLicenses()));

app.post('/create-license', (req, res) => {
  const licenses = loadLicenses();
  const code = generateCode();
  const license = {
    code, status: 'UNUSED',
    createdAt: new Date().toISOString(),
    usedAt: '', usedBy: '',
    note: 'created via web',
    creatorId: '', creatorTag: '',
    logs: [{ when: new Date().toISOString(), by: 'web', action: 'generated', details: '' }]
  };
  licenses.unshift(license);
  saveLicenses(licenses);
  res.json(license);
});

app.post('/proxy/add_uid', async (req, res) => {
  const TARGET = 'http://cloud.obsidianhosting.xyz:2091/api/free/add_uid';
  try {
    const response = await fetch(TARGET, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const text = await response.text();
    res.status(response.status).send(text);
  } catch (err) {
    res.status(502).send('Proxy error: ' + err.message);
  }
});

app.get('/ping', (req, res) => res.send('pong'));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// ── Self-ping ─────────────────────────────────────────────
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || null;
if (RENDER_URL) {
  setTimeout(() => {
    setInterval(() => {
      fetch(`${RENDER_URL}/ping`)
        .then(r => console.log(`[ping] ${new Date().toISOString()} → ${r.status}`))
        .catch(e => console.error('[ping] error:', e.message));
    }, 10 * 60 * 1000);
  }, 60 * 1000);
}

// ── Discord Bot ───────────────────────────────────────────
const TOKEN      = process.env.DISCORD_TOKEN;
const LOG_CH_ID  = process.env.DISCORD_CHANNEL_ID;
const WEBSITE_URL = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';

if (!TOKEN) {
  console.warn('[bot] DISCORD_TOKEN not set — bot disabled.');
} else {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  // ── Send VIP embed log to log channel ─────────────────
  async function sendLog(embed) {
    if (!LOG_CH_ID) return;
    try {
      const ch = await client.channels.fetch(LOG_CH_ID);
      if (ch) await ch.send({ embeds: [embed] });
    } catch (e) {
      console.error('[bot] Log send error:', e.message);
    }
  }

  // ── Generate license core ──────────────────────────────
  async function handleGenLicense(interaction, userTag, userId, avatarURL) {
    const licenses = loadLicenses();
    const todayCount = countUserToday(licenses, userId);

    // ── LIMIT CHECK ──
    if (todayCount >= MAX_PER_USER_PER_DAY) {
      const resetTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const resetStr  = `<t:${Math.floor(resetTime.getTime()/1000)}:R>`;

      const limitEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🚫 ⛔ LIMIT REACHED ⛔ 🚫')
        .setDescription(`> ❌ **You have used all your daily licenses!**\n> You can only generate **${MAX_PER_USER_PER_DAY} licenses per 24 hours**.`)
        .addFields(
          { name: '👤 User', value: `\`${userTag}\``, inline: true },
          { name: '📊 Used Today', value: `\`${todayCount} / ${MAX_PER_USER_PER_DAY}\``, inline: true },
          { name: '⏰ Resets', value: resetStr, inline: true },
        )
        .setThumbnail(avatarURL || null)
        .setFooter({ text: '🔒 Shadow Hub Licence System' })
        .setTimestamp();

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [limitEmbed] });
      } else {
        await interaction.reply({ embeds: [limitEmbed], ephemeral: true });
      }
      return null;
    }

    // ── Generate ──
    const code = generateCode();
    const now  = new Date();
    const license = {
      code, status: 'UNUSED',
      createdAt: now.toISOString(),
      usedAt: '', usedBy: '',
      note: `generated by ${userTag}`,
      creatorId: userId,
      creatorTag: userTag,
      logs: [{ when: now.toISOString(), by: userTag, action: 'generated', details: `ID: ${userId}` }]
    };
    licenses.unshift(license);
    saveLicenses(licenses);

    const totalUserLicenses = licenses.filter(l => l.creatorId === userId).length;
    const expiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const expiryStr = `<t:${Math.floor(expiry.getTime()/1000)}:F>`;
    const relStr    = `<t:${Math.floor(expiry.getTime()/1000)}:R>`;

    // ── VIP Log Embed ──
    const logEmbed = new EmbedBuilder()
      .setColor(0x00FF99)
      .setTitle('✅ 🎫 UID Successfully Added')
      .setDescription(`> 🎉 **License generated successfully!**\n> Use the code below to login via the whitelist website.`)
      .addFields(
        { name: '📱 Application',        value: '`UID BYPASS`',              inline: true },
        { name: '📶 Status',             value: '`Login Successful`',        inline: true },
        { name: '👤 User',               value: `\`${userTag}\``,            inline: true },
        { name: '🆔 UID',                value: `\`${userId}\``,             inline: true },
        { name: '⏳ Duration',           value: '`24 Hours`',                inline: true },
        { name: '🎰 Slot',               value: `\`${todayCount + 1} / ${MAX_PER_USER_PER_DAY} Used\``, inline: true },
        { name: '📊 Licenses Generated', value: `\`${totalUserLicenses}\``,  inline: true },
        { name: '💀 Expiry Time',        value: `${expiryStr} (${relStr})`,  inline: false },
        { name: '🔑 License Key',        value: `\`\`\`${code}\`\`\``,      inline: false },
        { name: '🌐 Website',            value: `[🔗 UID White List Website](${WEBSITE_URL})`, inline: false },
      )
      .setThumbnail(avatarURL || null)
      .setFooter({ text: '🛡️ Shadow Hub Licence System • Powered by SHADOW_HUB' })
      .setTimestamp();

    // Send to log channel
    await sendLog(logEmbed);

    // Reply to user (ephemeral — only they see it, then it disappears)
    const replyEmbed = new EmbedBuilder()
      .setColor(0x00FF99)
      .setTitle('✅ 🎫 Your License Key')
      .setDescription(`> 🎉 **License generated! Copy your key below.**`)
      .addFields(
        { name: '🔑 License Key', value: `\`\`\`${code}\`\`\``, inline: false },
        { name: '⏳ Valid For',   value: '`24 Hours`',           inline: true },
        { name: '🎰 Daily Slot', value: `\`${todayCount + 1} / ${MAX_PER_USER_PER_DAY}\``, inline: true },
        { name: '🌐 Login Here', value: `[Click Here](${WEBSITE_URL})`, inline: false },
      )
      .setFooter({ text: '🔒 This message is only visible to you' })
      .setTimestamp();

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [replyEmbed] });
    } else {
      await interaction.reply({ embeds: [replyEmbed], ephemeral: true });
    }

    console.log(`[bot] License generated: ${code} by ${userTag}`);
    return code;
  }

  client.once('ready', async () => {
    console.log(`[bot] Logged in as ${client.user.tag}`);
    try {
      const rest = new REST({ version: '10' }).setToken(TOKEN);
      const commands = [
        new SlashCommandBuilder()
          .setName('genlicense')
          .setDescription('🎫 Generate a one-time 24h license key')
          .toJSON(),
      ];
      const guilds = client.guilds.cache.map(g => g.id);
      for (const guildId of guilds) {
        await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
      }
      console.log('[bot] Slash commands registered');
    } catch (e) {
      console.error('[bot] Slash command register error:', e.message);
    }
  });

  // Prefix command: !genlicense
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.content.toLowerCase() !== '!genlicense') return;
    // Delete user's command message
    try { await message.delete(); } catch {}

    const fakeInteraction = {
      user: message.author,
      replied: false, deferred: false,
      reply: async (opts) => { /* ephemeral not possible in prefix, skip reply */ },
      editReply: async () => {},
    };
    const avatarURL = message.author.displayAvatarURL({ size: 128 });
    await handleGenLicense(fakeInteraction, message.author.tag, message.author.id, avatarURL);
  });

  // Slash command: /genlicense
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'genlicense') return;
    await interaction.deferReply({ ephemeral: true });
    const avatarURL = interaction.user.displayAvatarURL({ size: 128 });
    await handleGenLicense(interaction, interaction.user.tag, interaction.user.id, avatarURL);
  });

  client.login(TOKEN).catch(e => console.error('[bot] Login failed:', e.message));
}
