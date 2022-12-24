import {
  ApplicationCommandOptionType,
} from 'discord.js';

const { String, Role } = ApplicationCommandOptionType;

/**
 * Typing for VSCode
 * @typedef {import('discord.js').APIApplicationCommand} Command
 */

const restriction_desc = 'if selected, only members with this role can press this button!';

/** @type {Command[]} */
export const guild_commands = [
  { name: 'start_session', description: 'start a music session' },
  { name: 'button_restrictions', description: 'restrict usage of buttons to members with specified roles', options: [
    { name: 'pause_or_resume', type: Role, description: restriction_desc },
    { name: 'skip', type: Role, description: restriction_desc },
    { name: 'loop', type: Role, description: restriction_desc },
    { name: 'add_to_queue', type: Role, description: restriction_desc },
    { name: 'shuffle', type: Role, description: restriction_desc },
    { name: 'skip_to', type: Role, description: restriction_desc },
    { name: 'end_session', type: Role, description: restriction_desc },
  ] },
  { name: 'server_settings', description: 'change server settings', options: [
    { name: 'embed_color', type: String, description: 'set the default color of my embeds (hex color code)' }
  ] }
];
