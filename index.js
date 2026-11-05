// Discord-Bot: /start baut einen kompletten Server (Rollen, Kategorien, Text- & Sprachkanäle).
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits: P, SlashCommandBuilder } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) throw new Error('Bitte DISCORD_TOKEN als Umgebungsvariable setzen.');

// Grundrechte für normale Mitglieder
const BASE = [
  P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AddReactions, P.AttachFiles, P.EmbedLinks,
  P.UseExternalEmojis, P.UseApplicationCommands, P.ChangeNickname, P.CreateInstantInvite,
  P.Connect, P.Speak, P.Stream, P.UseVAD, P.SendMessagesInThreads, P.CreatePublicThreads,
];
const MOD = [
  P.KickMembers, P.BanMembers, P.ModerateMembers, P.ManageMessages, P.ManageThreads, P.ManageNicknames,
  P.MuteMembers, P.DeafenMembers, P.MoveMembers, P.ViewAuditLog, P.MentionEveryone,
];

// Reihenfolge = von oben nach unten in der Rollenliste
const ROLES = [
  { key: 'owner',     name: '👑 Owner',     color: 0xe74c3c, permissions: [P.Administrator] },
  { key: 'admin',     name: '🛡️ Admin',     color: 0xe67e22, permissions: [P.Administrator] },
  { key: 'mod',       name: '🔨 Moderator', color: 0x3498db, permissions: [...BASE, ...MOD] },
  { key: 'supporter', name: '🎧 Supporter', color: 0x2ecc71, permissions: [...BASE, P.ManageMessages, P.ModerateMembers, P.MuteMembers, P.MoveMembers] },
  { key: 'vip',       name: '💎 VIP',       color: 0x9b59b6, permissions: [...BASE, P.PrioritySpeaker, P.UseExternalStickers] },
  { key: 'bot',       name: '🤖 Bots',      color: 0x95a5a6, permissions: [...BASE, P.ManageMessages] },
  { key: 'member',    name: '👤 Mitglied',  color: 0x1abc9c, permissions: BASE },
  { key: 'muted',     name: '🔇 Muted',     color: 0x555555, permissions: [], hoist: false },
];

const LAYOUT = [
  { name: '📢 INFO',    mode: 'readonly', text: ['📜・regeln', '📣・ankündigungen', '👋・willkommen', '🎉・events'] },
  { name: '💬 CHAT',    text: ['💬・allgemein', '🖼️・bilder', '😂・memes', '🤖・bot-befehle'] },
  { name: '🔊 TALKS',   voice: ['🔊 Talk 1', '🔊 Talk 2', '🔊 Talk 3', '🎮 Gaming', '🎵 Musik', '💤 AFK'] },
  { name: '🎫 SUPPORT', text: ['🎫・support'], voice: ['⏳ Support-Warteraum'] },
  { name: '🛡️ TEAM',    mode: 'staff', text: ['🛡️・team-chat', '📋・mod-log'], voice: ['🛡️ Team-Talk'] },
];

function overwrites(mode, guild, r) {
  const ow = [{ id: r.muted.id, deny: [P.SendMessages, P.Speak, P.AddReactions, P.SendMessagesInThreads] }];
  if (mode === 'readonly') {
    ow.push({ id: guild.roles.everyone.id, deny: [P.SendMessages] }, { id: r.mod.id, allow: [P.SendMessages] });
  }
  if (mode === 'staff') {
    ow.push({ id: guild.roles.everyone.id, deny: [P.ViewChannel] });
    for (const k of ['mod', 'supporter']) ow.push({ id: r[k].id, allow: [P.ViewChannel] });
  }
  return ow;
}

async function buildServer(guild, user) {
  await guild.roles.everyone.setPermissions(BASE);

  // Jede neue Rolle landet ganz unten, daher von oben nach unten erstellen.
  const r = {};
  for (const role of ROLES) {
    r[role.key] = await guild.roles.create({ name: role.name, color: role.color, permissions: role.permissions, hoist: role.hoist ?? true, reason: '/start' });
  }

  let afk;
  for (const cat of LAYOUT) {
    const permissionOverwrites = overwrites(cat.mode, guild, r);
    const parent = await guild.channels.create({ name: cat.name, type: ChannelType.GuildCategory, permissionOverwrites });
    for (const name of cat.text ?? []) await guild.channels.create({ name, type: ChannelType.GuildText, parent, permissionOverwrites });
    for (const name of cat.voice ?? []) {
      const ch = await guild.channels.create({ name, type: ChannelType.GuildVoice, parent, permissionOverwrites });
      if (name.includes('AFK')) afk = ch;
    }
  }
  if (afk) await guild.setAFKChannel(afk).catch(() => {});

  // Wer /start ausführt, bekommt die Owner-Rolle
  await guild.members.addRole({ user, role: r.owner }).catch(() => {});
}

const command = new SlashCommandBuilder()
  .setName('start')
  .setDescription('Baut den kompletten Server auf (Rollen, Chats, Talks)')
  .setDefaultMemberPermissions(P.Administrator);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`Eingeloggt als ${client.user.tag}`);
  for (const g of client.guilds.cache.values()) await g.commands.set([command]);
});
client.on('guildCreate', g => g.commands.set([command]));

client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand() || i.commandName !== 'start') return;
  if (!i.memberPermissions.has(P.Administrator)) return i.reply({ content: 'Nur Admins.', ephemeral: true });
  if (!i.guild.members.me.permissions.has(P.Administrator)) return i.reply({ content: 'Der Bot braucht Administrator-Rechte.', ephemeral: true });

  await i.deferReply({ ephemeral: true });
  const start = Date.now();
  try {
    await buildServer(i.guild, i.user);
    await i.editReply(`✅ Server fertig in ${Math.round((Date.now() - start) / 1000)} Sekunden.`);
  } catch (e) {
    console.error(e);
    await i.editReply(`❌ Fehler: ${e.message}`).catch(() => {});
  }
});

client.login(TOKEN);
