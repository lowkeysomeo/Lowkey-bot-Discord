const { EmbedBuilder } = require('discord.js');
const { imageUrl } = require('./cinema');

// Discord draws an embed's image after its description. Two embeds put the
// poster immediately below the title, ahead of screening times and instructions.
function withPoster(embed, show) {
  if (!show?.imageUrl) return [embed];
  let url;
  try { url = imageUrl(show.imageUrl); } catch { return [embed]; }
  const { title, description, footer, timestamp, ...rest } = embed.toJSON();
  return [
    new EmbedBuilder({ ...rest, title, image: { url } }),
    new EmbedBuilder({ color: rest.color, ...(description ? { description } : {}), ...(footer ? { footer } : {}), ...(timestamp ? { timestamp } : {}) }),
  ];
}
module.exports = { withPoster };
