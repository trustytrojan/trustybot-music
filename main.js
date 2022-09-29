/**
 * I REQUIRE THE FOLLOWING NPM PACKAGES:
 * - discord.js
 * - @discordjs/voice
 * - play-dl
 * - tweetnacl
 */

const { randomUUID } = require('crypto')
const { inspect } = require('util')
const { existsSync, writeFileSync } = require('fs')
const Discord = require('discord.js')
const Voice = require('@discordjs/voice')
const play = require('play-dl')
const { TMGuild, MusicSession, Track } = require('./classes')
const { toSnowflake } = require('./utils')
const { guild_commands, global_commands } = require('./commands')

require('./prototypes')

;(async () => play.setToken({ soundcloud: { client_id: await play.getFreeClientID() } }))()

const sessions = new Discord.Collection()
const tmguilds = new Discord.Collection()
if(existsSync('./tmguilds.json')) {
  for(const o of require('./tmguilds.json'))
    tmguilds.set(o.guild, new TMGuild(o))
}

const { ActionRow, Button, TextInput } = Discord.ComponentType
const { Success, Danger } = Discord.ButtonStyle
const { Short } = Discord.TextInputStyle

const client = new Discord.Client({
  intents: [
    'Guilds',
    'GuildVoiceStates',
    'GuildMessages'
  ]
})

let owner; // hold the bot owner's User object for messaging

////////////////////////// event listeners begin //////////////////////////
client.on('ready', async client => {
  console.log(`Logged in as ${client.user.tag}!`)
  ;({ owner } = await client.application.fetch())
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
        if(user.id !== owner.id) { await interaction.reply('only my owner can use this command!'); break; }
        let code = options.getString('code')
        if(code.includes('await')) { code = `(async () => { ${code} })().catch(handleError)`; }
        let output
        try { output = inspect(await eval(code), { depth: 0, showHidden: true }); }
        catch(err) { handleError(err); return; }
        let x
        if(output.length <= 2000)
          x = '```js\n'+output+'```'
        else if(output.length > 2000 && output.length <= 4096)
          x = { embeds: [{ description: '```js\n'+output+'```' }] }
        else if(output.length > 4096)
          x = { files: [{ attachment: Buffer.from(output), name: 'output.js'}] }
        await interaction.reply(x)
      } break
      case 'start_session': {
        if(!(channel instanceof Discord.GuildChannel)) { somethingWentWrong(); break; }
        let permissions = channel.permissionsFor(client.user.id)
        for(const x of ['ReadMessageHistory', 'CreatePublicThreads', 'SendMessagesInThreads', 'ManageThreads', 'ManageMessages']) {
          if(!permissions.has(x)) {
            iNeedPerms()
            return
          }
        }
        if(!(member instanceof Discord.GuildMember)) { somethingWentWrong(); break; }
        const voiceChannel = member.voice.channel
        if(!voiceChannel) { await interaction.reply(`join a voice channel first`); break; }
        permissions = voiceChannel.permissionsFor(client.user.id)
        for(const x of ['Connect', 'Speak']) {
          if(!permissions.has(x)) {
            iNeedPerms()
            return
          }
        }
        let session = sessions.get(guildId)
        if(session instanceof MusicSession) { await interaction.reply(`a music player session already exists in ${session.channel}!`); break; }

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
    const { customId, message } = interaction
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
          await commands.set(guild_commands)
        await interaction.reply(`set guild commands!`)
      } break
      case 'globalcmds': {
        await client.application.commands.set(global_commands)
        await interaction.reply(`set global commands!`)
      } break
    }
  }
} catch(err) { handleError(err) } })

client.on('threadDelete', ({ guildId }) => sessions.get(guildId)?.stop('my thread was deleted! the party is over.'))

client.on('messageCreate', async message => {
  const { author, channelId, guildId } = message
  try {
    if(author.bot) return
    if(sessions.get(guildId)?.channel.id === channelId)
      if(author.id !== client.user.id)
        { await message.delete(); return }
  } catch(err) { handleError(err) }
})

client.on('guildCreate', guild => guild.commands.set(guild_commands))

client.on('error', handleError)

process.on('uncaughtException', (err) => { console.error('uncaughtException'); handleError(err); kill() })
process.on('SIGTERM', () => { console.error('SIGTERM'); kill() })
process.on('SIGINT', () => { console.error('SIGINT'); kill() })
////////////////////////// event listeners end //////////////////////////

////////////////////////// functions begin //////////////////////////
function deleteMusicSession(id) {
  if(sessions.delete(id))
    updateStatus()
}

function updateStatus() {
  client.user.setPresence({
    activities: [
      {
        type: Discord.ActivityType.Playing,
        name: `music in ${sessions.size} ${(sessions.size == 1) ? 'server' : 'servers'}`
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


////////////////////////// functions end //////////////////////////

client.login(require('./token.json').token)