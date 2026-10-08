const {SlashCommandBuilder,PermissionFlagsBits}=require('discord.js');
module.exports={data:new SlashCommandBuilder().setName('confessionpanel').setDescription('Admin: đăng hoặc cập nhật bảng chọn công khai / ẩn danh').setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),execute:require('../../utils/confessionPanel').command};
