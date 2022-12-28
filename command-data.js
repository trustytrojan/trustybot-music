import trustybot from 'trustybot-base';
const { chat_input, option } = trustybot.utils.APIObjectCreator.command;

import { ChannelType } from 'discord.js';
const { GuildVoice, GuildStageVoice } = ChannelType;

/**
 * Typing for VSCode
 * @typedef {import('discord.js').APIApplicationCommand} Command
 */

const restriction_desc = 'if selected, only members with this role can press this button!';

/** @type {Command[]} */
export const guild_commands = [
  chat_input('start_session', 'start a music session in a voice channel', [
    option.channel('channel', 'choose a voice channel for me to join', [GuildVoice, GuildStageVoice], true)
  ]),
  chat_input('button_restrictions', 'restrict usage of buttons to members with specified roles', [
    option.role('pause_or_resume', restriction_desc),
    option.role('skip', restriction_desc),
    option.role('loop', restriction_desc),
    option.role('add_to_queue', restriction_desc),
    option.role('shuffle', restriction_desc),
    option.role('skip_to', restriction_desc),
    option.role('end_session', restriction_desc)
  ]),
  chat_input('server_settings', 'change server settings', [
    option.string('embed_color', 'set the default color of my embeds (hex color code)')
  ])
];
