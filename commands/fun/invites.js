const { SlashCommandBuilder } = require('discord.js');
const { count } = require('../../utils/inviteSystem');
module.exports = {
  data: new SlashCommandBuilder().setName('invites').setDescription('Xem số thành viên đã mời thành công')
    .addUserOption(option=>option.setName('user').setDescription('Thành viên muốn xem')),
  async execute(interaction) {
    if(!interaction.inGuild())return interaction.reply({content:'Dùng lệnh này trong server.',flags:64});
    const user=interaction.options.getUser('user')||interaction.user;
    const total=count(interaction.guildId,user.id);
    return interaction.reply({content:'💌 <@'+user.id+'> đã mời **'+total+' thành viên mới** được bot ghi nhận.\n🏅 '+(total>=100?'Đã đạt mốc 100 lượt mời!':total>=50?'Đã đạt mốc 50; còn '+(100-total)+' lượt đến mốc 100.':'Còn '+(50-total)+' lượt đến mốc 50.')+'\nMỗi thành viên chỉ tính một lần, kể từ khi bật theo dõi. Role được cấp theo cấu hình của server.',flags:64,allowedMentions:{parse:[]}});
  },
};
