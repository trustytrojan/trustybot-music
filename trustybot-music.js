////////////////////////// imports begin //////////////////////////
const Discord = require('discord.js')
const Voice = require('@discordjs/voice')
const play = require('play-dl')
const { randomUUID } = require('crypto')
const { inspect } = require('util')
const { existsSync, writeFileSync } = require('fs');
////////////////////////// imports end //////////////////////////

(async () => play.setToken({ soundcloud: { client_id: await play.getFreeClientID() } }))()

////////////////////////// variables begin //////////////////////////
const sessions = new Discord.Collection()
const tmguilds = new Discord.Collection()

const { ActionRow, Button, TextInput } = Discord.ComponentType
const { Primary, Secondary, Success, Danger } = Discord.ButtonStyle
const { Short } = Discord.TextInputStyle
const { String } = Discord.ApplicationCommandOptionType

const client = new Discord.Client({
  intents: [
    'Guilds',
    'GuildVoiceStates',
    'GuildMessages'
  ]
})
let owner
////////////////////////// variables end //////////////////////////


////////////////////////// file read begin //////////////////////////
if(existsSync('./tmguilds.json')) {
  for(const o of require('./tmguilds.json'))
    tmguilds.set(o.guild, new TMGuild(o))
}
////////////////////////// file read end //////////////////////////


////////////////////////// event listeners begin //////////////////////////
client.on('ready', async client => {
  console.log(`Logged in as ${client.user.tag}!`);
  ({ owner } = await client.application.fetch())
  updateStatus()
  await owner.clearDM()
  await sendOwnerButtons()
})

client.on('interactionCreate', async interaction => { try {
  function somethingWentWrong() {
    const msg = 'something went wrong, please try again'
    interaction.deferReply().then(() => interaction.followUp(msg).catch(handleError))
  }
  function iNeedPerms() {
    const msg = 'i need the following perms: `Read Message History`, `Create Public Threads`, `Send Messages in Threads`, `Manage Threads`, `Manage Messages`, `Connect`, `Speak`'
    interaction.deferReply().then(() => interaction.followUp(msg).catch(handleError))
  }
  const { user, member, guild, guildId, channel } = interaction

  let tmg
  if(interaction.inGuild()) {
    tmg = tmguilds.ensure(guildId, () => new TMGuild({ guild: guildId }))
  }

  if(interaction.isChatInputCommand()) {
    const { commandName, options } = interaction
    switch(commandName) {
      case 'ping': await interaction.reply(`\`${client.ws.ping}\``); break
      case 'eval': {
        if(user.id !== owner.id) { await interaction.reply('only my owner can use this command!'); break }
        let code = options.getString('code')
        if(code.includes('await')) { code = `(async () => { ${code} })().catch(handleError)` }
        let output
        try { output = inspect(await eval(code), { depth: 0, showHidden: true }) }
        catch(err) { handleError(err); return }
        let x
        if(output.length <= 2000) x = '```js\n'+output+'```'
        else if(output.length > 2000 && output.length <= 4096) x = { embeds: [{ description: '```js\n'+output+'```' }] }
        else if(output.length > 4096) x = { files: [{ attachment: Buffer.from(output), name: 'output.js'}] }
        await interaction.reply(x)
      } break
      case 'start_session': {
        if(!(channel instanceof Discord.GuildChannel)) { somethingWentWrong(); break }
        let permissions = channel.permissionsFor(client.user.id)
        for(const x of ['ReadMessageHistory', 'CreatePublicThreads', 'SendMessagesInThreads', 'ManageThreads', 'ManageMessages'])
          if(!permissions.has(x))
            { iNeedPerms(); return }

        if(!(member instanceof Discord.GuildMember)) { somethingWentWrong(); break }
        const voiceChannel = member.voice.channel
        if(!voiceChannel) { await interaction.reply(`join a voice channel first`); break }
        permissions = voiceChannel.permissionsFor(client.user.id)
        for(const x of ['Connect', 'Speak'])
          if(!permissions.has(x))
            { iNeedPerms(); return }

        let session = sessions.get(guildId)
        if(session instanceof MusicSession) { await interaction.reply(`a music player session already exists in ${session.channel}!`); break }

        const msg = await interaction.reply({ content: 'creating session...', fetchReply: true })
        let sessionChannel
        try { sessionChannel = await msg.startThread({ name: 'music!!!!' }) }
        catch(err) { await msg.edit(`thread creation failed... \`${err}\`\ni need more perms`); break }

        const voiceConnection = Voice.joinVoiceChannel({ channelId: voiceChannel.id, guildId, adapterCreator: guild.voiceAdapterCreator })
        sessions.set(guildId, new MusicSession(voiceConnection, sessionChannel, interaction, tmg, deleteMusicSession, handleError))
        await msg.edit(`session created by ${user}! open the thread below to control the music player!`)
        updateStatus()
      } break
      case 'permissions': {
        function permissionName(x) {
          switch(x) {
            case 'end_session': return 'End session'
            case 'pause_or_resume': return 'Pause or resume'
            case 'toggle_loop': return 'Toggle loop'
            case 'skip': return 'Skip'
            case 'add_to_queue': return 'Add to queue'
            case 'shuffle': return 'Shuffle'
          }
        }
        const embed = new Discord.Embed({ color: member.displayColor })
        if(options.data.length === 0) {
          embed.setTitle('Viewing button permissions')
          embed.setDescription(`The following buttons can **only** be used by their corresponding roles.
To make changes, include an option when sending a \`/permissions\` command.`)
          for(const x in tmg.permissions) {
            let str
            for(const r of tmg.permissions[x]) str += `<@&${r}> `
            embed.addField(permissionName(x), str)
          }
        } else {
          embed.setTitle('Setting button permissions')
          embed.setDescription('The following buttons can now **only** be used by their corresponding roles.')
          for(const { name, value } of options.data) {
            if(typeof value !== 'string') continue
            const roles = []
            for(const x of value.split(' ')) roles.push(toSnowflake(x))
            tmg.permissions[name] = roles
            embed.addField(permissionName(name), value)
          }
        }
        await interaction.reply({ embeds: [embed] })
      } break
      case 'set_embed_color': {
        const yes = randomUUID(), no = randomUUID()
        const color = Discord.resolveColor(options.getString('color'))
        const msg = await interaction.reply({
          embeds: [{
            title: 'Setting embed color',
            color,
            description: 'The color you specified is shown on this embed.\nWould you like to set this color as the default embed color for this server?'
          }],
          components: [
            { type: ActionRow, components: [
              { type: Button, customId: yes, label: 'yes', style: Success },
              { type: Button, customId: no, label: 'no', style: Danger }
            ] }
          ]
        })
        if(!(msg instanceof Discord.Message)) { somethingWentWrong(); break }
        let btn_int
        try { btn_int = await msg.awaitMessageComponent({ filter: i => i.customId === yes || i.customId === no, time: 10_000 }) }
        catch(err) { await msg.edit({ content: 'cancelled setting the embed color due to no user input' }); break }
        if(!(btn_int instanceof Discord.ButtonInteraction)) { somethingWentWrong(); break }
        switch(btn_int.customId) {
          case yes:
            tmg.embed_color = color
            await btn_int.update({ content: 'successfully set color', components: [] })
            break
          case no:
            await btn_int.update({ content: 'color change canceled', components: [] })
            break
        }
      } break
    }
  } else if(interaction.isButton()) {
    const { customId, message } = interaction;
    const session = sessions.get(guildId)

    if(session instanceof MusicSession) switch(customId) {
      case 'add_to_queue': {
        const customId = randomUUID()
        await interaction.showModal({ title: 'Add songs to the queue', customId, components: [
          { type: ActionRow, components: [{ type: TextInput, customId: 'youtube', label: 'youtube: search/video/playlist', style: Short, required: false }] },
          { type: ActionRow, components: [{ type: TextInput, customId: 'soundcloud', label: 'soundcloud: search/track/playlist', style: Short, required: false }] },
          { type: ActionRow, components: [{ type: TextInput, customId: 'spotify', label: 'spotify: playlist/album', style: Short, required: false }] }
        ] })
        let modal_int
        try { modal_int = await interaction.awaitModalSubmit({ filter: i => i.customId === customId, time: 120_000 }) }
        catch(err) { break }

        const youtube = modal_int.fields.getTextInputValue('youtube')
        const soundcloud = modal_int.fields.getTextInputValue('soundcloud')
        let playlist, track
        if(youtube) {
          const query = youtube
          const type = await play.validate(query)
          if(type) switch(type) {
            case 'yt_playlist': playlist = await play.playlist_info(query, { incomplete: true }); break
            case 'yt_video': track = (await play.video_basic_info(query)).video_details; break
            case 'search': ([track] = await play.search(query, { source: { youtube: 'video' }, limit: 1 }))
          }
        } else if(soundcloud) {
          const query = soundcloud
          const type = await play.so_validate(query)
          if(type) switch(type) {
            case 'playlist': playlist = await play.soundcloud(query); break
            case 'track': track = await play.soundcloud(query); break
            case 'search': ([track] = await play.search(query, { source: { soundcloud: 'tracks' }, limit: 1 }))
          }
        }

        if(playlist instanceof play.YouTubePlayList)
          session.enqueue(playlist.videos.map(v => new Track(v, member)), user.id)
        else if(playlist instanceof play.SoundCloudPlaylist)
          session.enqueue(playlist.tracks.map(v => new Track(v, member)), user.id)
        else if(track instanceof play.YouTubeVideo || track instanceof play.SoundCloudTrack)
          session.enqueue(new Track(track, member), user.id)
        else
          { await modal_int.replyEphemeral(`i couldn't find the requested video/track!`); break }
        await modal_int.replyEphemeral('success!')
      } break
      case 'shuffle': session.shuffle(interaction); break
      case 'unpause': session.unpause(interaction); break
      case 'pause': session.pause(interaction); break
      case 'skip': await interaction.update({}); session.skip(user.id); break
      case 'stop': session.stop(`music player session stopped by <@${user.id}>`); break
      case 'loop': session.toggleLoop(interaction); break
      case 'skip_to': {
        const customId = randomUUID()
        await interaction.showModal({ title: 'Skip to specified track', customId, components: [
          { type: ActionRow, components: [{ type: TextInput, customId: 'skip_to', label: 'track number in queue', style: Short }] },
        ] })
        let modal_int
        try { modal_int = await interaction.awaitModalSubmit({ filter: i => i.customId === customId, time: 10_000 }) }
        catch(err) { void err; break }
        const index = Number.parseInt(modal_int.fields.getTextInputValue('skip_to'))
        session.skipTo(index-1, user.id)
        await modal_int.replyEphemeral('success!')
      } break
    } else switch(customId) {
      case 'kill': await message.delete(); kill()
      case 'guildcmds': {
        for(const { commands } of client.guilds.cache.values())
          await commands.set([
            { name: 'start_session', description: 'start a music session' },
            { name: 'permissions', description: 'restrict usage of certain buttons to members with the roles you specify', options: [
              { name: 'end_session', type: String, description: 'separate role mentions by space' },
              { name: 'pause_or_resume', type: String, description: 'separate role mentions by space' },
              { name: 'toggle_loop', type: String, description: 'separate role mentions by space' },
              { name: 'skip', type: String, description: 'separate role mentions by space' },
              { name: 'add_to_queue', type: String, description: 'separate role mentions by space' },
              { name: 'shuffle', type: String, description: 'separate role mentions by space' }
            ] }
          ])
        await interaction.reply(`set guild commands!`)
      } break
      case 'globalcmds': {
        await client.application.commands.set([
          { name: 'ping', description: 'check ping' },
          { name: 'eval', description: 'owner only command', options: [
            { name: 'code', type: String, description: 'code to evaluate', required: true }
          ] }
        ])
        await interaction.reply(`set global commands!`)
      } break
    }
  }
} catch(err) { handleError(err) } })

client.on('threadDelete', ({ guildId }) => sessions.get(guildId)?.stop('my thread was deleted! the party is over.'))

const eval_cmd = 't> ';
client.on('messageCreate', async message => {
  const { author, channelId, guildId } = message
  try {
    if(author.bot) return
    if(sessions.get(guildId)?.channel.id === channelId)
      if(author.id !== client.user.id)
        { await message.delete(); return }
  } catch(err) { handleError(err) }
})

client.on('error', handleError)

process.on('uncaughtException', (err) => { console.error('uncaughtException'); handleError(err); kill() })
process.on('SIGTERM', () => { console.error('SIGTERM'); kill() })
process.on('SIGINT', () => { console.error('SIGINT'); kill() })
////////////////////////// event listeners end //////////////////////////


////////////////////////// prototype additions begin //////////////////////////
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
////////////////////////// prototype additions end //////////////////////////


////////////////////////// functions begin //////////////////////////
function deleteMusicSession(id) { if(sessions.delete(id)) updateStatus() }

function updateStatus() {
  client.user.setPresence({
    activities: [
      {
        type: Discord.ActivityType.Playing,
        name: `music in ${sessions.size} servers`
      }
    ]
  })
}

function handleError(err, x) {
  if(!(err instanceof Error)) return
  console.error(err)
  owner?.send(`${x ?? ''}\`\`\`js\n${err.stack ?? err}\`\`\``).catch(() => {})
}

async function sendOwnerButtons() {
  if(!(owner instanceof Discord.User)) { return }
  const { ActionRow, Button } = Discord.ComponentType
  const { Danger, Primary } = Discord.ButtonStyle
  await owner.send({
    content: 'owner buttons',
    components: [
      { type: ActionRow, components: [
        { type: Button, label: 'kill bot process', customId: 'kill', style: Danger },
        { type: Button, label: 'set guild commands', customId: 'guildcmds', style: Primary },
        { type: Button, label: 'set global commands', customId: 'globalcmds', style: Primary },
      ] }
    ]
  })
}

function writeData() {
  if(tmguilds.size !== 0) writeFileSync('./tmguilds.json', JSON.stringify(tmguilds, null, '  '))
}

function kill() {
  client.destroy(); writeData(); process.exit()
}

/**
 * Creates a Discord markdown timestamp.
 * @param {number} t Time value
 * @param {string} x Timestamp style - see all styles here: https://discord.com/developers/docs/reference#message-formatting-timestamp-styles
 * @returns {string} Discord timestamp string
 */
 function timestamp(t,x) {
  let str = ''; t = t.toString().substring(0,10);
  for(var i = 0; i < x.length; i++) {
    const s = `<t:${t}:${x[i]}>`;
    if(str.length === 0) str += s;
    else str += `\n${s}`;
  }
  return str;
}

/**
   * Turns a time value `t` into a `hours:minutes:seconds` formatted time string.
   * @param {number} s Time value in seconds
   * @returns Formatted `h:m:s` string
   */
function secondsToHMS(s) {
  if(s.toString().length > 10) s = Math.floor(s/1000);
  const hours = Math.floor(s/3600);
  const minutes = Math.floor(s/60);
  let m_rem = minutes%60;
  if(m_rem < 10) m_rem = `0${m_rem}`;
  let s_rem = s%60;
  if(s_rem < 10) s_rem = `0${s_rem}`
  if(hours > 0) return `${hours}:${m_rem}:${s_rem}`;
  return `${minutes}:${s_rem}`;
}

/**
 * Turns a Discord mention into a Discord id
 * @param {string} x Discord mention
 * @returns Discord id
 */
function toSnowflake(x) {
  x = x.toLowerCase();
  for(const c of ['<','@','!','#','&',':','>','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z'])
    while(x.includes(c))
      x = x.replace(c, '');
  return x;
}
////////////////////////// functions end //////////////////////////

////////////////////////// classes begin //////////////////////////
function TMGuild(o) {
  this.guild = o.guild
  this.embed_color = o.embed_color ?? Discord.resolveColor('00ff00')
  this.permissions = o.permissions ?? {
    end_session: [],
    pause_or_resume: [],
    toggle_loop: [],
    skip: [],
    add_to_queue: [],
    shuffle: []
  }
}

class MusicSession {
  static buttons = {
    pause: { type: Button, emoji: '⏸️', customId: 'pause', label: 'pause', style: Primary },
    pauseDisabled: { type: Button, emoji: '⏸️', customId: 'pause', label: 'pause', style: Primary, disabled: true },
    unpause: { type: Button, emoji: '▶️', customId: 'unpause', label: 'resume', style: Primary },
    skip: { type: Button, emoji: '⏭️', customId: 'skip', label: 'skip', style: Secondary },
    skipDisabled: { type: Button, emoji: '⏭️', customId: 'skip', label: 'skip', style: Secondary, disabled: true },
    loopOff: { type: Button, emoji: '🔂', customId: 'loop', label: 'loop', style: Secondary },
    loopOffDisabled: { type: Button, emoji: '🔂', customId: 'loop', label: 'loop', style: Secondary, disabled: true },
    loopOn: { type: Button, emoji: '🔂', customId: 'loop', label: 'loop', style: Success },
    addToQueue: { type: Button, emoji: '➕', customId: 'add_to_queue', label: 'add to queue', style: Success },
    shuffle:  { type: Button, emoji: '🔀', customId: 'shuffle', label: 'shuffle',  style: Primary },
    shuffleDisabled:  { type: Button, emoji: '🔀', customId: 'shuffle', label: 'shuffle',  style: Primary, disabled: true },
    skipTo: { type: Button, emoji: '⏭️', customId: 'skip_to', label: 'skip to', style: Secondary },
    skipToDisabled: { type: Button, emoji: '⏭️', customId: 'skip_to', label: 'skip to', style: Secondary, disabled: true },
    endSession: { type: Button, customId: 'stop', label: 'end session', style: Danger }
  }
  static actionRows = {
    disabledMPBtns: {
      type: ActionRow,
      components: [
        MusicSession.buttons.pauseDisabled,
        MusicSession.buttons.skipDisabled,
        MusicSession.buttons.loopOffDisabled
      ] 
    },
    sessionLog: { type: ActionRow, components: [MusicSession.buttons.endSession] }
  }
  get currentMPActionRow() {
    const { Playing, Paused } = Voice.AudioPlayerStatus
    const { status } = this.audioPlayer.state
    const { pause, unpause, skip, loopOff, loopOn } = MusicSession.buttons
    switch(status) {
      case Playing:
        if(this.loop) return { type: ActionRow, components: [pause, skip, loopOn] }
        else return { type: ActionRow, components: [pause, skip, loopOff] }
      case Paused:
        if(this.loop) return { type: ActionRow, components: [unpause, skip, loopOn] }
        else return { type: ActionRow, components: [unpause, skip, loopOff] }
    }
  }
  get currentQueueActionRow() {
    const { addToQueue, shuffle, shuffleDisabled, skipTo, skipToDisabled } = MusicSession.buttons
    let components
    if(this.queue.length <= 1) components = [addToQueue, shuffleDisabled, skipToDisabled]
    else components = [addToQueue, shuffle, skipTo]
    return { type: ActionRow, components }
  }

  queueLock = false
  readyLock = false
  buttonLock = false
  loop = null
  skipped = null
  loopCount = 0
  actionLog = []
  queue = []

  constructor(voiceConnection, channel, interaction, tmguild, delSession, handleError) {
    if(!(voiceConnection instanceof Voice.VoiceConnection)) throw new TypeError()
    if(!(channel instanceof Discord.ThreadChannel)) throw new TypeError()
    if(!(interaction instanceof Discord.CommandInteraction)) throw new TypeError()
    if(!(tmguild instanceof TMGuild)) throw new TypeError()
    if(typeof delSession !== 'function') throw new TypeError()
    if(typeof handleError !== 'function') throw new TypeError()

    this.channel = channel
    this.originalChannel = interaction.channel
    this.guild = interaction.guild
    this.initiator = interaction.user
    this.tmguild = tmguild
    this.delSession = delSession
    this.handleError = handleError

    this.voiceConnection = voiceConnection.on('stateChange', async (_, { status }) => {
      const { Disconnected, Connecting, Signalling, Destroyed, Ready } = Voice.VoiceConnectionStatus
      this.buttonLock = true
      if(status === Disconnected) {
        this.stop('i was manually disconnected from the voice channel... the session has ended')
      } else if(!this.readyLock && (status === Connecting || status === Signalling)) {
        this.readyLock = true
        try { await Voice.entersState(this.voiceConnection, Ready, 20_000) }
        catch { if(this.voiceConnection.state.status !== Destroyed) this.stop('something went wrong, please try again') }
        this.readyLock = false
      }
      this.buttonLock = false
    }).on('error', this.handleError)

    this.audioPlayer = Voice.createAudioPlayer().on('stateChange', async (oldState, newState) => {
      const { Idle, Playing, Paused } = Voice.AudioPlayerStatus
      this.buttonLock = true
      switch(newState.status) {
        case Idle: {
          if(this.loop) {
            this.audioPlayer.play(await oldState.resource.metadata.createAudioResource())
            this.loopCount++
            await this.music_player.edit({ embeds: [this.music_player.embeds[0].setFooter(this.currentMPEmbedFooter)] }).catch(this.handleError)
          } else {
            await this.music_player.edit({ embeds: [this.idleMPEmbed], components: [MusicSession.actionRows.disabledMPBtns] }).catch(this.handleError)
            const { title, url } = oldState.resource.metadata
            if(this.skipped) {
              this.log(this.skipped)
              this.skipped = null
            } else this.log(`finished playing [${title}](${url})`)
            this.processQueue()
          }
        } break
        case Playing: {
          if(this.loop || oldState.status === Paused) break
          clearTimeout(this.idleTimeout)
          const { title, url } = newState.resource.metadata
          this.log(`started playing [${title}](${url})`)
          await this.music_player.edit({
            content: this.currentTrackRequestorContent,
            embeds: [this.playingMPEmbed],
            components: [this.currentMPActionRow]
          }).catch(this.handleError)
        } break
      }
      this.buttonLock = false
    }).on('error', this.handleError)

    this.voiceConnection.subscribe(this.audioPlayer)
    this.createMessages().catch(this.handleError)
  }
  startInactivityTimer() {
    const callback = () => {
      try { this.stop(`ended music session due to 5 minutes of inactivity`) }
      catch(err) { void err }
    }
    this.idleTimeout = setTimeout(callback, 300_000)
  }
  async createMessages() {
    this.log_msg = await this.channel.send({ embeds: [this.logEmbed], components: [MusicSession.actionRows.sessionLog] }).catch(this.handleError)
    this.queue_msg = await this.channel.send({ embeds: [this.queueEmbed], components: [this.currentQueueActionRow] }).catch(this.handleError)
    this.music_player = await this.channel.send({ embeds: [this.idleMPEmbed], components: [MusicSession.actionRows.disabledMPBtns] }).catch(this.handleError)
  }
  log(x) {
    this.actionLog.push(`${timestamp(Date.now(), 'T')} ${x}`)
    if(this.actionLog.length > 10) this.actionLog.shift()
    this.updateLogMessage()
  }
  updateLogMessage() {
    this.log_msg.edit({ embeds: [this.logEmbed] }).catch(this.handleError)
  }
  updateQueueMessage() {
    this.queue_msg.edit({ embeds: [this.queueEmbed], components: [this.currentQueueActionRow] }).catch(this.handleError)
  }
  get logString() {
    const n = this.actionLog.length
    if(n === 0) return 'empty'
    let str = ''
    for(const x of this.actionLog) {
      str += x+'\n'
    }
    return str
  }
  get logEmbed() {
    return new Discord.Embed({
      color: this.embed_color,
      title: 'Session log',
      description: this.logString
    })
  }
  get queueString() {
    const l = this.queue.length
    if(l === 0) return 'queue is empty\npress "add to queue" to play songs!'
    let str = ''
    let i = 0
    for(; i < l; i++) {
      const { title, url, requestor } = this.queue[i]
      const newStr = str + `\`${i+1}:\` [${title}](${url}) <@${requestor.id}>\n`
      if(newStr.length > 4096) break
      str = newStr
    }
    if(i < l) str += `...${l-i} more tracks... press \`show full queue\` to see all tracks`
    return str
  }
  get queueEmbed() {
    return new Discord.Embed({
      color: this.embed_color,
      title: 'Track queue',
      description: this.queueString
    })
  }
  get currentMPEmbedFooter() {
    let requestor
    try { ({ requestor } = this.audioPlayer.state.resource.metadata) }
    catch(err) { return null }
    if(!(requestor instanceof Discord.GuildMember)) throw new Error('???')
    let text = `Requested by ${requestor.displayName}`
    if(this.loop) text += ` | Loop Count: ${this.loopCount}`
    return { text, iconURL: requestor.dynamic() }
  }
  get idleMPEmbed() {
    return new Discord.Embed({
      author: { name: 'Idle', iconURL: this.guild.dynamic() },
      title: 'Music player',
      description: 'no tracks are playing!\nadd songs to the queue to start playing music.'
    })
  }
  get playingMPEmbed() {
    const track = this.audioPlayer.state.resource?.metadata
    if(!(track instanceof Track)) throw Error('big problem')
    const { title, url, artist, thumbnail, source, length } = track
    return new Discord.Embed({
      color: this.currentMPEmbedColor,
      author: { name: 'Playing', iconURL: this.guild.dynamic() },
      title: 'Music player',
      fields: [
        { name: 'Song & artist', value: `**[${title}](${url})**\n[${artist.name}](${artist.url})`, inline: true },
        { name: 'Details', value: `Source: ${source}\nLength: \`${length}\``, inline: true }
      ],
      image: { url: thumbnail },
      footer: this.currentMPEmbedFooter
    })
  }
  get currentMPEmbedColor() {
    if(this.audioPlayer.state.status === Voice.AudioPlayerStatus.Playing)
      return this.tmguild.embed_color
    return null
  }
  get currentTrackRequestorContent() {
    let requestor
    try { ({ requestor } = this.audioPlayer.state.resource.metadata) }
    catch(err) { return null }
    return `${requestor} your requested track is playing!`
  }
  enqueue(x, user) {
    if(x instanceof Track) {
      this.queue.push(x)
      this.log(`<@${user}> queued [${x.title}](${x.url})`)
    } else if(x instanceof Array) {
      for(const t of x)
        if(t instanceof Track)
          this.queue.push(t)
      this.log(`<@${user}> queued ${x.length} tracks`)
    } else throw new TypeError('parameter is of type other than (Track | Track[])')
    clearTimeout(this.idleTimeout)
    this.updateQueueMessage()
    this.processQueue()
  }
  pause(interaction) {
    if(!(interaction instanceof Discord.ButtonInteraction)) throw new TypeError()
    this.audioPlayer.pause()
    interaction.update({
      embeds: [Discord.EmbedBuilder.from(interaction.message.embeds[0]).setAuthor({ name: 'Paused' }).setColor(null).data],
      components: [this.currentMPActionRow]
    }).catch(this.handleError)
    this.log(`<@${interaction.user.id}> paused playback`)
  }
  unpause(interaction) {
    if(!(interaction instanceof Discord.ButtonInteraction)) throw new TypeError()
    this.audioPlayer.unpause()
    interaction.update({
      embeds: [Discord.EmbedBuilder.from(interaction.message.embeds[0]).setAuthor({ name: 'Playing' }).setColor(this.tmguild.embed_color).data],
      components: [this.currentMPActionRow]
    }).catch(this.handleError)
    this.log(`<@${interaction.user.id}> resumed playback`)
  }
  skip(user) {
    this.loop = null
    const { title, url } = this.audioPlayer.state.resource.metadata
    this.skipped = `<@${user}> skipped [${title}](${url})`
    this.audioPlayer.stop(true)
  }
  skipTo(idx, user) {
    this.loop = null
    this.skipped = `<@${user}> skipped ${idx} tracks`
    this.queue.splice(0, idx)
    this.audioPlayer.stop(true)
  }
  toggleLoop(interaction) {
    if(!(interaction instanceof Discord.ButtonInteraction)) throw new TypeError()
    let str
    if(this.loop) { this.loop = null; this.loopCount = 0; str = 'disabled loop' }
    else { this.loop = this.audioPlayer.state.resource.metadata; str = 'enabled loop' }
    interaction.update({
      embeds: [Discord.EmbedBuilder.from(interaction.message.embeds[0]).setFooter(this.currentMPEmbedFooter).data],
      components: [this.currentMPActionRow]
    }).catch(this.handleError)
    this.log(`<@${interaction.user.id}> ${str}`)
  }
  shuffle(interaction) {
    if(!(interaction instanceof Discord.ButtonInteraction)) throw new TypeError()
    for(let i = this.queue.length-1; i >= 0; i--) {
      const j = Math.floor(Math.random() * i);
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]]
    }
    interaction.update({ embeds: [this.queueEmbed] }).catch(this.handleError)
    this.log(`<@${interaction.user.id}> shuffled the queue`)
  }
  stop(x) {
    clearTimeout(this.idleTimeout)
    this.voiceConnection.destroy()
    this.channel.delete().catch(this.handleError)
    this.originalChannel.messages.edit(this.channel.id, x).catch(this.handleError)
    this.delSession(this.guild.id)
  }
  async processQueue() {
    if(this.queue.length === 0) { this.startInactivityTimer(); return false }
    if(this.queueLock || this.audioPlayer.state.status !== Voice.AudioPlayerStatus.Idle) return false
    this.queueLock = true
    const nextTrack = this.queue.shift()
    if(!(nextTrack instanceof Track)) throw new TypeError('???? bro what')
    this.updateQueueMessage()
    try {
      this.audioPlayer.play(await nextTrack.createAudioResource())
    } catch(err) {
      this.handleError(err)
      return this.processQueue()
    }
    this.queueLock = false
    return true
  }
}

class Track {
  constructor(track, requestor) {
    if(!(requestor instanceof Discord.GuildMember)) throw new TypeError()
    this.requestor = requestor
    if(track instanceof play.YouTubeVideo) {
      this.source = 'YouTube'
      this.title = track.title
      this.artist = { name: track.channel.name, url: track.channel.url }
      this.thumbnail = track.thumbnails.pop()?.url
      this.url = track.url
      this.length = secondsToHMS(track.durationInSec)
    } else if(track instanceof play.SoundCloudTrack) {
      this.source = 'SoundCloud'
      this.title = track.name
      this.artist = { name: track.user.name, url: track.user.url }
      this.thumbnail = track.thumbnail
      this.url = track.permalink
      this.length = secondsToHMS(track.durationInSec)
    } else throw new TypeError('did not receive expected type: YouTubeVideo | SoundCloudTrack')
  }
  async createAudioResource() {
    const { stream, type } = await play.stream(this.url)
    return Voice.createAudioResource(stream, { inputType: type, metadata: this })
  }
}
////////////////////////// classes end //////////////////////////

client.login('token')
