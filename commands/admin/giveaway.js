const { SlashCommandBuilder,ChannelType,PermissionFlagsBits } = require('discord.js');
const { command } = require('../../utils/giveawaySystem');
const data = new SlashCommandBuilder().setName('giveaway').setDescription('Admin: tổ chức và quản lý giveaway').setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(s=>s.setName('create').setDescription('Tạo giveaway mới')
    .addStringOption(o=>o.setName('prize').setDescription('Phần thưởng được trao cho mỗi người thắng').setRequired(true).setMaxLength(200))
    .addStringOption(o=>o.setName('duration').setDescription('Thời lượng: 30m, 2h, 7d (5 phút đến 30 ngày)').setRequired(true))
    .addIntegerOption(o=>o.setName('winners').setDescription('Số người thắng').setRequired(true).setMinValue(1).setMaxValue(20))
    .addChannelOption(o=>o.setName('channel').setDescription('Kênh đăng giveaway').setRequired(true).addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement))
    .addStringOption(o=>o.setName('description').setDescription('Lời nhắn hoặc hướng dẫn nhận quà').setMaxLength(1500))
    .addRoleOption(o=>o.setName('role').setDescription('Role cần có để tham gia (không bắt buộc)')))
  .addSubcommand(s=>s.setName('list').setDescription('Xem các giveaway đang mở'));
for (const [name,description] of [['end','Kết thúc sớm và quay người thắng'],['cancel','Hủy giveaway đang mở'],['reroll','Quay lại, loại những người thắng hiện tại']]) data.addSubcommand(s=>s.setName(name).setDescription(description).addStringOption(o=>o.setName('id').setDescription('ID giveaway từ dashboard hoặc /giveaway list').setRequired(true)));
module.exports = {data,execute:command};
