import trustybot from './trustybot.js';
import TGuild from './TGuild.js';
import MusicSession from './MusicSession.js';
import Track from './Track.js';

import {
  Collection,
  EmbedBuilder,
  TextChannel,
  ActivityType,
  TextInputStyle
} from 'discord.js';
const { Playing } = ActivityType;
const { Short } = TextInputStyle;

import {
  joinVoiceChannel
} from '@discordjs/voice';

import {
  YouTubePlayList, SoundCloudPlaylist, YouTubeVideo, SoundCloudTrack,
  yt_validate, so_validate, playlist_info, video_basic_info, search, soundcloud
} from 'play-dl';

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
  const session = sessions.get(guildId);

  try {
    if(interaction.isChatInputCommand()) {
      const { commandName } = interaction;
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
            interaction.reply(`a music player session already exists in ${session}!`);
            return;
          }
  
          // create thread
          const msg = await interaction.reply({ content: 'creating session...', fetchReply: true });
          let session_thread;
          try { session_thread = await msg.startThread({ name: 'music!!!!' }); }
          catch {
            msg.edit(`thread creation failed... i need more perms`);
            return;
          }
  
          // join voice channel
          const vc = joinVoiceChannel({
            channelId: voice_channel.id,
            guildId,
            adapterCreator: guild.voiceAdapterCreator
          });

          // all done
          sessions.set(guildId, new MusicSession(vc, session_thread, tguild, delete_music_session, _handleError));
          msg.edit(`session created by ${member}! open the thread below to control the music player!`)
          update_status();
        } break;
        case 'button_restrictions': {

        } break;
        case 'server_settings': {

        } break;
      }
    }

    else if(interaction.isButton()) {
      const { customId } = interaction;
      const session = sessions.get(guildId);
      if(!session) {
        interaction.replyEphemeral('there is no music session in this server?!?');
        return;
      }
      if(session.button_lock) {
        interaction.replyEphemeral(`i am busy changing tracks... please wait`);
        return;
      }

      switch(customId) {
        case 'enqueue': {
          // get query from user
          const modal_int = await modal_sender(interaction, 'Add songs to the queue', 30_000, [
            modal_row('youtube', 'youtube: search/video/playlist', Short),
            modal_row('soundcloud', 'soundcloud: search/track/playlist', Short)
          ]);
          if(!modal_int) {
            interaction.followUp(`${member} you took too long to submit`);
            return;
          }
          const [youtube, soundcloud] = extract_text(modal_int);

          // search for or fetch track details
          let playlist, track;
          if(youtube) {
            const query = youtube;
            const type = yt_validate(query);
            switch(type) {
              case 'playlist': playlist = await playlist_info(query, { incomplete: true }); break;
              case 'video': track = (await video_basic_info(query)).video_details; break;
              case 'search': ([track] = await search(query, { source: { youtube: 'video' }, limit: 1 }));
            }
          } else if(soundcloud) {
            const query = soundcloud;
            const type = await so_validate(query);
            switch(type) {
              case 'playlist': playlist = await soundcloud(query); break;
              case 'track': track = await soundcloud(query); break;
              case 'search': ([track] = await search(query, { source: { soundcloud: 'tracks' }, limit: 1 }));
            }
          }

          // enqueue track(s) if found
          let to_be_queued;
          if(playlist instanceof YouTubePlayList)
            to_be_queued = playlist.videos.map(v => new Track(v, member));
          else if(playlist instanceof SoundCloudPlaylist)
            to_be_queued = playlist.tracks.map(v => new Track(v, member));
          else if(track instanceof YouTubeVideo || track instanceof SoundCloudTrack)
            to_be_queued = new Track(track, member);
          else {
            await modal_int.replyEphemeral(`i couldn't find the requested video/track!`);
            return;
          }

          session.enqueue(to_be_queued, member);
          await modal_int.replyEphemeral('success!');
        } break;
        case 'pause': session.pause(interaction); break;
        case 'unpause': session.unpause(interaction); break;
        case 'skip': session.skip(interaction); break;
        case 'loop': session.toggle_loop(interaction); break;
        case 'shuffle': session.shuffle(interaction); break;
        case 'skip_to': {
          const modal_int = await modal_sender(interaction, 'Skip to track number...', 30_000, [
            modal_row('skip_to', 'track number', Short, { required: true })
          ]);
          if(!modal_int) {
            interaction.followUp(`${member} you took too long to submit`);
            return;
          }
          let [track_num] = extract_text(modal_int);
          track_num = Number.parseInt(track_num);
          session.skip_to(track_num-1, member);
          modal_int.replyEphemeral('success!');
        } break;
        case 'end': session.end(`music session ended by ${member}`);
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
