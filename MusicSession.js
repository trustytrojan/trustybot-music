import { randomInt } from 'crypto';

import {
  ButtonStyle,
  resolveColor,
  EmbedBuilder,
  OverwriteType
} from 'discord.js';
const { Primary, Secondary, Danger, Success } = ButtonStyle;

import {
  createAudioPlayer,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  entersState
} from '@discordjs/voice';
const { Paused, Playing, Idle } = AudioPlayerStatus;
const { Disconnected, Connecting, Signalling, Destroyed, Ready } = VoiceConnectionStatus;

import {
  button,
  button_row
} from './utils.js';

import Track from './Track.js';
import './prototype.js';

/**
 * Typing for VSCode
 * @typedef {import('@discordjs/voice').VoiceConnection} VoiceConnection
 * @typedef {import('@discordjs/voice').AudioPlayer} AudioPlayer
 * @typedef {import('discord.js').VoiceChannel} VoiceChannel
 * @typedef {import('discord.js').ButtonInteraction} ButtonInteraction
 * @typedef {import('discord.js').GuildMember} GuildMember
 * @typedef {import('discord.js').APIEmbed} APIEmbed
 * @typedef {import('discord.js').APIEmbedFooter} APIEmbedFooter
 * @typedef {import('discord.js').Message} Message
 * @typedef {import('discord.js').APIButtonComponent} ButtonComponent
 * @typedef {import('./TGuild.js').default} TGuild
 */

const buttons = Object.freeze({
  pause:
    Object.freeze(button('pause', 'pause', Primary, { emoji: '⏸️' })),
  pause_disabled:
    Object.freeze(button('pause', 'pause', Primary, { emoji: '⏸️', disabled: true })),
  unpause:
    Object.freeze(button('unpause', 'resume', Primary, { emoji: '▶️' })),
  unpause_disabled:
    Object.freeze(button('unpause', 'resume', Primary, { emoji: '▶️', disabled: true })),
  skip:
    Object.freeze(button('skip', 'skip', Secondary, { emoji: '⏭️' })),
  skip_disabled:
    Object.freeze(button('skip', 'skip', Secondary, { emoji: '⏭️', disabled: true })),
  loop_off:
    Object.freeze(button('loop', 'loop', Secondary, { emoji: '🔂' })),
  loop_off_disabled:
    Object.freeze(button('loop', 'loop', Secondary, { emoji: '🔂', disabled: true })),
  loop_on:
    Object.freeze(button('loop', 'loop', Success, { emoji: '🔂' })),
  enqueue:
    Object.freeze(button('enqueue', 'add to queue', Success, { emoji: '➕' })),
  shuffle:
    Object.freeze(button('shuffle', 'shuffle', Primary, { emoji: '🔀' })),
  shuffle_disabled:
    Object.freeze(button('shuffle', 'shuffle', Primary, { emoji: '🔀', disabled: true })),
  skip_to:
    Object.freeze(button('skip_to', 'skip to...', Secondary, { emoji: '⏭️' })),
  skip_to_disabled:
    Object.freeze(button('skip_to', 'skip to...', Secondary, { emoji: '⏭️', disabled: true })),
  end:
    Object.freeze(button('end', 'end session', Danger))
});

const action_rows = Object.freeze({
  disabled_mp:
    Object.freeze(button_row(buttons.pause_disabled, buttons.skip_disabled, buttons.loop_off_disabled)),
  mp_playing_loop_on:
    Object.freeze(button_row(buttons.pause, buttons.skip, buttons.loop_on)),
  mp_playing_loop_off:
    Object.freeze(button_row(buttons.pause, buttons.skip, buttons.loop_off)),
  mp_paused_loop_on:
    Object.freeze(button_row(buttons.unpause, buttons.skip, buttons.loop_on)),
  mp_paused_loop_off:
    Object.freeze(button_row(buttons.unpause, buttons.skip, buttons.loop_off)),
  session_log:
    Object.freeze(button_row(buttons.end))
});

export default class MusicSession {
  // private properties
  /** @type {Track[]} */ #queue = [];
  /** @type {string[]} */ #session_log = [];
  /** @type {?string} */ #skipped = null;
  #loop = false;
  #button_lock = false;
  #queue_lock = false;
  #ready_lock = false;
  #loop_count = 0;
  #idle_timeout = null;

  // thread messages, can be undefined since they are created
  // asynchronously after construction
  /** @type {Message=} */ #log_msg;
  /** @type {Message=} */ #queue_msg;
  /** @type {Message=} */ #music_player;

  // required from constructor, immediately available
  /** @type {AudioPlayer} */ #audio_player;
  /** @type {VoiceConnection} */ #voice_connection;
  /** @type {VoiceChannel} */ #channel;
  /** @type {Message} */ #start_msg;
  /** @type {TGuild} */ #tguild;
  /** @type {(id: string) => any} */ #delete_session;
  /** @type {(err: Error) => any} */ #handle_error;

  /**
   * @param {VoiceConnection} vc
   * @param {VoiceChannel} channel
   * @param {Message} start_msg
   * @param {TGuild} tguild
   * @param {(id: string) => any} delete_session
   * @param {(err: Error) => any} handle_error
   */
  constructor(vc, channel, start_msg, tguild, delete_session, handle_error) {
    this.#channel = channel;
    this.#start_msg = start_msg;
    this.#tguild = tguild;
    this.#delete_session = delete_session;
    this.#handle_error = handle_error;

    // lock down channel so only i can send messages
    const everyone = this.#channel.guild.roles.everyone;
    if(this.#channel.permissionsFor(everyone).has('SendMessages')) {
      this.#channel.permissionOverwrites.create(everyone, { SendMessages: false });
    }

    this.#voice_connection = vc.on('stateChange', async (_, { status }) => {
      this.#button_lock = true;

      if(status === Disconnected) {
        this.end('i was manually disconnected from the voice channel... the session has ended');
        return;
      }
      
      else if(!this.#ready_lock && (status === Connecting || status === Signalling)) {
        this.#ready_lock = true;
        try { await entersState(this.#voice_connection, Ready, 20_000) }
        catch {
          this.#handle_error(new Error(`voice connection took too long to get ready!`));
          this.end(`i couldn't connect to the voice channel due to an internal error...`);
          return;
        }
        this.#ready_lock = false;
      }

      this.#button_lock = false;
    });

    this.#audio_player = createAudioPlayer().on('stateChange', async (old_state, new_state) => {
      this.#button_lock = true;
      switch(new_state.status) {
        case Idle: {
          this.#start_idle_timeout();

          if(this.#loop) {
            /** @type {Track} */
            const loop_track = old_state.resource.metadata;

            this.#audio_player.play(await loop_track.createAudioResource());
            ++this.#loop_count;

            const embed = EmbedBuilder.from(this.#music_player.embeds[0]);
            embed.setFooter(this.#mp_playing_embed_footer);
            this.#music_player.edit({ embeds: [embed] }).catch(this.#handle_error);
          }
          
          else {
            this.#music_player.edit({
              embeds: [this.#mp_idle_embed],
              components: [action_rows.disabled_mp]
            }).catch(this.#handle_error);

            /** @type {Track} */
            const track = old_state.resource.metadata;
            
            if(this.#skipped) {
              this.#log(this.#skipped);
              this.#skipped = null;
            } else this.#log(`finished playing ${track}`);

            this.#process_queue();
          }
        } break;
        
        case Playing: {
          // keep the same song
          if(this.#loop || old_state.status === Paused) break;

          this.#stop_idle_timeout();

          /** @type {Track} */
          const track = new_state.resource.metadata;
          this.#log(`started playing ${track}`);

          this.#music_player.edit({
            embeds: [this.#mp_playing_embed],
            components: [this.#mp_row]
          }).catch(this.#handle_error);
        } break;
      }
      this.#button_lock = false;
    });

    // create and store messages
    (async () => {
      this.#log_msg = await this.#channel.send({
        embeds: [this.#log_embed],
        components: [action_rows.session_log]
      }).catch(this.#handle_error);

      this.#queue_msg = await this.#channel.send({
        embeds: [this.#queue_embed],
        components: [this.#queue_row]
      }).catch(this.#handle_error);

      this.#music_player = await this.#channel.send({
        embeds: [this.#mp_idle_embed],
        components: [action_rows.disabled_mp]
      }).catch(this.#handle_error);
    })();

    this.#voice_connection.subscribe(this.#audio_player);
  }

  get button_lock() {
    return this.#button_lock;
  }

  get channel() {
    return this.#channel;
  }

  get #mp_row() {
    switch(this.#audio_player.state.status) {
      case Playing: return this.#loop ? action_rows.mp_playing_loop_on : action_rows.mp_playing_loop_off;
      case Paused: return this.#loop ? action_rows.mp_paused_loop_on : action_rows.mp_paused_loop_off;
    }
  }

  get #queue_row() {
    const { enqueue, shuffle, shuffle_disabled, skip_to, skip_to_disabled } = buttons;
    if(this.#queue.length <= 1)
      return button_row(enqueue, shuffle_disabled, skip_to_disabled);
    return button_row(enqueue, shuffle, skip_to);
  }

  /** @type {APIEmbed} */
  get #log_embed() {
    const description = (() => {
      const n = this.#session_log.length;
      if(n === 0) return 'empty';
      let str = '';
      for(const log_entry of this.#session_log) {
        str += `${log_entry}\n`;
      }
      return str;
    })();

    return {
      color: resolveColor(this.#tguild.embed_color),
      title: 'Session log',
      description
    };
  }

  /** @type {APIEmbed} */
  get #queue_embed() {
    const description = (() => {
      const l = this.#queue.length;
      if(l === 0) return 'queue is empty\npress "add to queue" to play songs!';
      let str = '';
      let i;
      for(i = 0; i < l; ++i) {
        const { title, url, requestor } = this.#queue[i];
        const next = `\`${i+1}:\` [${title}](${url}) ${requestor}\n`;
        if(str.length + next.length > 4096) break;
        str += next;
      }
      if(i < l) str += `...${l-i} more tracks... press \`show full queue\` to see all tracks`;
      return str;
    })();

    return {
      color: resolveColor(this.#tguild.embed_color),
      title: 'Track queue',
      description
    };
  }

  /** @type {APIEmbed} */
  get #mp_idle_embed() {
    return {
      author: { name: 'Idle', iconURL: this.#channel.guild.iconURL() },
      title: 'Music player',
      description: 'no tracks are playing!\nadd songs to the queue to start playing music.'
    };
  }

  /** @type {APIEmbed} */
  get #mp_playing_embed() {
    /** @type {Track} */
    const { artist, thumbnail, source, length, hyperlink } = this.#audio_player.state.resource.metadata;

    return {
      color: resolveColor(this.#tguild.embed_color),
      author: { name: 'Playing', iconURL: this.#channel.guild.iconURL() },
      title: 'Music player',
      fields: [
        { name: 'Song & artist', value: `**${hyperlink}**\n${artist}`, inline: true },
        { name: 'Details', value: `Source: ${source}\nLength: \`${length}\``, inline: true }
      ],
      image: { url: thumbnail },
      footer: this.#mp_playing_embed_footer
    };
  }

  /** @type {APIEmbedFooter} */
  get #mp_playing_embed_footer() {
    /** @type {Track} */
    const { requestor } = this.#audio_player.state.resource.metadata;
    let text = `Requested by ${requestor.displayName}`;
    if(this.#loop) text += ` | Loop Count: ${this.#loop_count}`;
    return { text, icon_url: requestor.displayAvatarURL() };
  }

  #start_idle_timeout() {
    this.#idle_timeout = setTimeout(() => {
      this.end(`ended music session due to inactivity`);
    }, 300_000);
  }

  #stop_idle_timeout() {
    clearTimeout(this.#idle_timeout);
  }

  /** @param {string} entry */
  #log(entry) {
    this.#session_log.push(`<t:${Date.now()}:T> ${entry}`);
    if(this.#session_log.length > 10)
      this.#session_log.shift();
    this.#update_log_embed();
  }

  #update_log_embed() {
    this.#log_msg.edit({ embeds: [this.#log_embed] }).catch(this.#handle_error);
  }

  #update_queue_embed() {
    this.#queue_msg.edit({ embeds: [this.#queue_embed], components: [this.#queue_row] }).catch(this.#handle_error);
  }

  /**
   * @param {Track | Track[]} x
   * @param {GuildMember} member 
   */
  enqueue(x, member) {
    if(x instanceof Track) {
      const track = x;
      this.#queue.push(track);
      this.#log(`${member} queued ${track}`);
    }
    
    else {
      const tracks = x;
      for(const track of tracks)
        this.#queue.push(track);
      this.#log(`${member} queued ${tracks.length} tracks`);
    }

    this.#stop_idle_timeout();
    this.#update_queue_embed();
    this.#process_queue();
  }

  /**
   * @param {ButtonInteraction} interaction 
   */
  pause(interaction) {
    const { message, member } = interaction;

    this.#audio_player.pause();

    const embed = EmbedBuilder.from(message.embeds[0]);
    embed.setAuthor({ name: 'Paused' });
    embed.setColor(null);

    interaction.update({ embeds: [embed.data], components: [this.#mp_row] }).catch(this.#handle_error);
    this.#log(`${member} paused playback`);
  }

  /**
   * @param {ButtonInteraction} interaction 
   */
  unpause(interaction) {
    const { message, member } = interaction;

    this.#audio_player.unpause();

    const embed = EmbedBuilder.from(message.embeds[0]);
    embed.setAuthor({ name: 'Playing' });
    embed.setColor(this.#tguild.embed_color);

    interaction.update({ embeds: [embed.data], components: [this.#mp_row] }).catch(this.#handle_error);
    this.#log(`${member} resumed playback`);
  }

  /**
   * @param {ButtonInteraction} interaction 
   */
  skip(interaction) {
    const { member } = interaction;

    this.#loop = null;

    /** @type {Track} */
    const track = this.#audio_player.state.resource.metadata;

    this.#skipped = `${member} skipped ${track}`;
    this.#audio_player.stop(true);
    interaction.update({});
  }

  /**
   * @param {number} idx 
   * @param {GuildMember} member 
   */
  skip_to(idx, member) {
    this.#loop = null;
    this.#skipped = `${member} skipped ${idx} tracks`;
    this.#queue.splice(0, idx);
    this.#audio_player.stop(true);
  }

  /**
   * @param {ButtonInteraction} interaction 
   */
  toggle_loop(interaction) {
    const { member, message } = interaction;
    let str;

    if(this.#loop) {
      this.#loop = false;
      this.#loop_count = 0;
      str = 'disabled loop';
    }

    else {
      this.#loop = true;
      str = 'enabled loop'
    }

    const embed = EmbedBuilder.from(message.embeds[0]);
    embed.setFooter(this.#mp_playing_embed_footer);

    interaction.update({ embeds: [embed.data], components: [this.#mp_row] }).catch(this.#handle_error);

    this.#log(`${member} ${str}`);
  }

  /**
   * @param {ButtonInteraction} interaction 
   */
  shuffle(interaction) {
    console.log(this.#queue);
    for(let i = this.#queue.length-1; i > 0; --i) {
      this.#queue.swap(i, randomInt(i+1));
    }
    console.log(this.#queue);
    interaction.update({ embeds: [this.#queue_embed] }).catch(this.#handle_error);
    this.#log(`${interaction.member} shuffled the queue`);
  }

  /**
   * @param {string} reason 
   */
  end(reason) {
    // leave the voice channel
    this.#voice_connection.destroy();

    // delete the messages
    this.#music_player.delete().catch(this.#handle_error);
    this.#log_msg.delete().catch(this.#handle_error);
    this.#queue_msg.delete().catch(this.#handle_error);

    // edit the original interaction reply with the end reason
    this.#start_msg.edit(reason).catch(this.#handle_error);

    // delete our reference from the sessions map
    // so we can get garbage collected
    this.#delete_session(this.#channel.guildId);
  }

  /**
   * @returns {Promise<boolean>} `true` if the next track was successfully processed, `false` otherwise
   */
  async #process_queue() {
    if(this.#queue.length === 0) {
      this.#start_idle_timeout();
      return false;
    }

    if(this.#queue_lock || this.#audio_player.state.status !== Idle) {
      return false;
    }

    this.#queue_lock = true;

    const next_track = this.#queue.shift();
    this.#update_queue_embed();

    try {
      this.#audio_player.play(await next_track.createAudioResource())
    } catch(err) {
      this.#handle_error(err);
      return this.#process_queue();
    }

    this.#queue_lock = false;
    return true;
  }
}