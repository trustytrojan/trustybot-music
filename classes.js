const { timestamp, secondsToHMS } = require('./utils')

const Discord = require('discord.js')
const Voice = require('@discordjs/voice')
const play = require('play-dl')

const { ActionRow, Button } = Discord.ComponentType
const { Primary, Secondary, Success, Danger } = Discord.ButtonStyle

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

module.exports = { TMGuild, MusicSession, Track }