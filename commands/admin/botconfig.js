const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { getGuildSetting, setGuildSetting } = require('../../utils/guildSettings');
const { CHAT_ROLE_LEVELS } = require('../../utils/levelRoles');
const { VOICE_ROLE_LEVELS } = require('../../utils/voiceRoles');

const settings = [
  { name: 'Kênh thông báo level', value: 'LEVEL_CHANNEL_ID', type: 'channel' },
  { name: 'Kênh tổng kết tháng', value: 'MONTHLY_RANK_CHANNEL_ID', type: 'channel' },
  { name: 'Role Booster (+10% XP)', value: 'VNL_BOOSTER_ROLE_ID', type: 'role' },
  ...CHAT_ROLE_LEVELS.map(level => ({ name: `Role Chat Level ${level}`, value: `LEVEL_ROLE_${level}`, type: 'role' })),
  ...VOICE_ROLE_LEVELS.map(level => ({ name: `Role Voice Level ${level}`, value: `VOICE_ROLE_${level}`, type: 'role' })),
  ...['CHAT', 'VOICE'].flatMap(type => [1, 2, 3].map(rank => ({
    name: `Role ${type} Top ${rank} tháng`, value: `MONTHLY_${type}_TOP${rank}_ROLE_ID`, type: 'role',
  }))),
];

module.exports.data = new SlashCommandBuilder().setName('botconfig')
  .setDescription('Admin: cấu hình kênh và role riêng cho server').setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(option => option.setName('setting').setDescription('Mục cần cấu hình').setRequired(true)
    .addChoices(...settings.map(({ name, value }) => ({ name, value }))))
  .addChannelOption(option => option.setName('channel').setDescription('Kênh thông báo')
    .addChannelTypes(ChannelType.GuildText))
  .addRoleOption(option => option.setName('role').setDescription('Role của server'))
  .addBooleanOption(option => option.setName('disable').setDescription('Tắt mục cấu hình này'));

module.exports.execute = async interaction => {
  const reply = content => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return reply('Chỉ admin server được cấu hình bot.');
  }
  const key = interaction.options.getString('setting', true);
  const setting = settings.find(item => item.value === key);
  if (!setting) return reply('Mục cấu hình không hợp lệ.');
  const channel = interaction.options.getChannel('channel');
  const role = interaction.options.getRole('role');
  if (interaction.options.getBoolean('disable')) {
    if (channel || role) return reply('Chọn disable hoặc chọn kênh/role, không dùng cùng lúc.');
    setGuildSetting(interaction.guildId, key, null);
    return reply(`✅ Đã tắt ${setting.name} trong server này.`);
  }
  if (!channel && !role) {
    const current = getGuildSetting(interaction.guildId, key);
    return reply(`${setting.name}: ${current ? (setting.type === 'channel' ? `<#${current}>` : `<@&${current}>`) : 'chưa cấu hình'}.`);
  }
  if ((setting.type === 'channel' && (!channel || role)) || (setting.type === 'role' && (!role || channel))) {
    return reply(`Hãy chọn đúng mục ${setting.type} cho cấu hình này.`);
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
  if (channel) {
    if (channel.guildId !== interaction.guildId || channel.type !== ChannelType.GuildText) {
      return interaction.editReply('Hãy chọn kênh văn bản của server này.');
    }
    if (!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles])) {
      return interaction.editReply('Bot cần View Channel, Send Messages, Embed Links và Attach Files trong kênh đó.');
    }
  } else {
    if (role.guild?.id !== interaction.guildId || role.id === interaction.guildId) {
      return interaction.editReply('Hãy chọn role hợp lệ của server, không dùng @everyone.');
    }
    if (key !== 'VNL_BOOSTER_ROLE_ID' && (role.managed || !me.permissions.has(PermissionFlagsBits.ManageRoles)
      || me.roles.highest.comparePositionTo(role) <= 0)) {
      return interaction.editReply('Bot cần Manage Roles và role của bot phải nằm trên role thưởng; không chọn role do ứng dụng quản lý.');
    }
  }
  setGuildSetting(interaction.guildId, key, (channel || role).id);
  return interaction.editReply({ content: `✅ Đã lưu ${setting.name} cho server này.`, allowedMentions: { parse: [] } });
};
