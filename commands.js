const { String } = require('discord.js').ApplicationCommandOptionType

const guild_commands = [
  { name: 'start_session', description: 'start a music session' },
  { name: 'permissions', description: 'restrict usage of certain buttons to members with the roles you specify', options: [
    { name: 'end_session', type: String, description: 'separate role mentions by space' },
    { name: 'pause_or_resume', type: String, description: 'separate role mentions by space' },
    { name: 'toggle_loop', type: String, description: 'separate role mentions by space' },
    { name: 'skip', type: String, description: 'separate role mentions by space' },
    { name: 'add_to_queue', type: String, description: 'separate role mentions by space' },
    { name: 'shuffle', type: String, description: 'separate role mentions by space' }
  ] }
]

const global_commands = [
  { name: 'ping', description: 'check ping' },
  { name: 'eval', description: 'owner only command', options: [
    { name: 'code', type: String, description: 'code to evaluate', required: true }
  ] }
]

module.exports = { guild_commands, global_commands }