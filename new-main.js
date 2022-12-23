import trustybot from './trustybot.js';
import TGuild from './TGuild.js';
import MusicSession from './MusicSession.js';

import {
  Collection,
  EmbedBuilder,
  TextChannel,
  ActivityType
} from 'discord.js';
const { Playing } = ActivityType;

import {
  import_json,
  something_went_wrong,
  modal_row,
  modal_sender,
  format_error,
  do_nothing,
  extract_text
} from './utils.js';

const tguilds = await TGuild.readFromFile();

/** @type {Collection<string, MusicSession>} */
const sessions = new Collection();

const client = new trustybot(
  {
    intents: [
      'Guilds',
      'GuildMembers',
      'GuildVoiceStates'
    ]
  },
  {
    on_kill: TGuild.writeToFile(tguilds)
  }
);

client.on('ready', () => {
  update_status();
});

client.on('interactionCreate', async (interaction) => {
  function _handleError(err) {
    client.handleError(err);
    interaction.reply(format_error(err)).catch(do_nothing);
    interaction.followUp(format_error(err)).catch(do_nothing);
  }

  if(!interaction.inCachedGuild()) return;
  if(!interaction.isRepliable()) return;
  const { guild, guildId, member, channel } = interaction;
  const { me } = guild.members;
  if(!me) { interaction.replyEphemeral('where am i???'); return; }
  const tguild = tguilds.ensure(guildId, () => new TGuild({ guild: guildId }));
  const embed = new EmbedBuilder().setColor(tguild.embed_color);

  try {
    if(interaction.isChatInputCommand()) {
      const { commandName, options } = interaction;
      switch(commandName) {
        case 'start_session': {
          // text channel check
          if(!(channel instanceof TextChannel)) {
            interaction.replyEphemeral('this only works in text channels!');
            return;
          }

          // check perms in text channel
          let myPerms = channel.permissionsFor(me, true);
          if(
            !myPerms.has('CreatePublicThreads') &&
            !myPerms.has('SendMessagesInThreads') &&
            !myPerms.has('EmbedLinks') &&
            !myPerms.has('ManageThreads') &&
            !myPerms.has('ManageMessages')
          ) {
            const perms = '```Create Public Threads\nSend Messages in Threads\nEmbed Links\nManage Messages\nManage Threads```';
            embed.setDescription(`please give me the following perms in ${channel} so i can start a session`);
            embed.addFields('required permissions', perms);
            interaction.reply({ embeds: [embed] });
            return;
          }

          // voice channel check
          const voice_channel = member.voice.channel;
          if(!voice_channel) { interaction.reply('join a voice channel first'); return; }

          // check perms in voice channel
          myPerms = voice_channel.permissionsFor(me, true);
          if(
            !myPerms.has('Connect') &&
            !myPerms.has('Speak')
          ) {
            const perms = '```Connect\nSpeak```';
            embed.setDescription(`please give me the following perms in ${voice_channel} so i can start a session`);
            embed.addFields('required permissions', perms);
            interaction.reply({ embeds: [embed] });
            return;
          }

          // check for existing session
          let session = sessions.get(guildId);
          if(session instanceof MusicSession) {
            await interaction.reply(`a music player session already exists in ${session}!`);
            break;
          }
  
          const msg = await interaction.reply({ content: 'creating session...', fetchReply: true })
          let sessionChannel
          try { sessionChannel = await msg.startThread({ name: 'music!!!!' }); }
          catch(err) {
            try { await msg.edit(`thread creation failed... \`${err}\`\ni need more perms`); }
            catch(err) { await user.send(`thread creation failed... \`${err}\`\ni need more perms`); }
            break
          }
  
          const voiceConnection = Voice.joinVoiceChannel({ channelId: voiceChannel.id, guildId, adapterCreator: guild.voiceAdapterCreator })
          sessions.set(guildId, new MusicSession(voiceConnection, sessionChannel, interaction, tmg, deleteMusicSession, handleError))
          await msg.edit(`session created by ${user}! open the thread below to control the music player!`)
          updateStatus()
        } break;
        case 'button_restrictions': {

        } break;
        case 'server_settings': {

        } break;
      }
    }
  } catch(err) { _handleError(err); }
});

/**
 * @param {string} id 
 */
function delete_music_session(id) {
  if(sessions.delete(id)) {
    update_status();
  }
}

function update_status() {
  client.setStatus(Playing, `music in ${sessions.size} ${(sessions.size == 1) ? 'server' : 'servers'}`);
}

client.login();
