const Discord = require('discord.js')

Array.prototype.next = function() {
  if(!this.i || this.i >= this.length) this.i = 0
  return this[this.i++]
}

Discord.BaseInteraction.prototype.replyEphemeral = async function(x) {
  if(typeof x === 'string')
    await this.reply({ content: x, ephemeral: true });
  else if(typeof x === 'object') {
    x.ephemeral = true;
    await this.reply(x);
  }
}
// follow ups cannot be ephemeral

Discord.Guild.prototype.dynamic = function(size) { return this.iconURL({ dynamic: true, size }) }
Discord.User.prototype.dynamic = function(size) { return this.displayAvatarURL({ dynamic: true, size }) }
Discord.GuildMember.prototype.dynamic = function(size) { return this.displayAvatarURL({ dynamic: true, size }) }

Discord.User.prototype.clearDM = async function() {
  const toDelete = Array.from((await (this.dmChannel ?? await this.createDM()).messages.fetch()).filter(v => v.author.id === this.client.user.id).values())
  setInterval(async () => {
    try { await toDelete.next().delete() }
    catch(err) { clearInterval() }
  }, 1_000)
}
