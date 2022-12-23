import { inspect } from 'util';
import {
  Client,
  User,
  ComponentType,
  ButtonStyle,
  TextInputStyle
} from 'discord.js';

/**
 * Typing for VSCode
 * @typedef {import('discord.js').APIApplicationCommand} Command
 * @typedef {import('discord.js').ClientOptions} ClientOptions
 */

import {
  format_error,
  modal_row,
  modal_sender,
  extract_text,
  do_nothing,
  import_json
} from './utils.js';

import './prototype.js';

const { ActionRow, Button } = ComponentType;
const { Danger, Primary } = ButtonStyle;
const { Paragraph } = TextInputStyle;

const wait = (x) => new Promise((resolve) => setTimeout(resolve, x));

/**
 * @typedef {object} trustybot_options
 * @prop {() => any=} on_kill
 * @prop {Command[]=} guild_commands
 * @prop {Command[]=} global_commands
 */

export default class trustybot extends Client {
  // from discord
  /** @type {User} */ owner = null;
  /** @type {Message} */ owner_buttons = null;

  // from options
  /** @type {() => any} */ on_kill = do_nothing;
  /** @type {Command[]} */ guild_commands = [];
  /** @type {Command[]} */ global_commands = [];

  /**
   * @param {ClientOptions} discord_options
   * @param {trustybot_options=} trustybot_options
   */
  constructor(discord_options, trustybot_options) {
    super(discord_options);

    if(trustybot_options) {
      for(const k in trustybot_options)
        if(trustybot_options[k] !== undefined)
          this[k] = trustybot_options[k];
    }

    this.on('ready', async ({ user }) => {
      console.log(`Logged in as ${user.tag}!`);
      await this.fetchOwner();
      await this.clearOwnerDM();
      this.sendOwnerButtons();
    });

    this.on('guildCreate', ({ commands }) => commands.set(this.guild_commands));

    this.on('error', this.handleError.bind(this));

    process.on('SIGINT', this.kill.bind(this));
    process.on('SIGTERM', this.kill.bind(this));
    process.on('unhandledRejection', this.handleError.bind(this));
    process.on('uncaughtException', (err) => { this.handleError(err); this.kill(); });

    this.on('interactionCreate', async (interaction) => {
      if(!interaction.isButton()) return;
      const { customId } = interaction;
      switch(customId) {
        case 'kill': this.kill();
        case 'guildcmds': {
          const total = this.guilds.cache.size;
          let success = total;
          for(const { commands } of this.guilds.cache.values())
            try { await commands.set(this.guild_commands); }
            catch(err) { --success; }
          interaction.replyEphemeral(`set guild commands for ${success} of ${total} guilds!`);
        } break;
        case 'globalcmds': {
          try { await this.application.commands.set(this.global_commands); }
          catch(err) { interaction.replyEphemeral(format_error(err)); return; }
          interaction.replyEphemeral('set global commands!');
        } break;
        case 'eval': {
          const { user } = interaction;

          // obviously...
          if(user.id !== this.owner.id) { interaction.reply('only my owner can use this command!'); return; }
    
          const modal_int = await modal_sender(interaction, 'eval', 60_000, [
            modal_row('expr', 'expression', Paragraph, true)
          ]);
          if(!modal_int) return;
    
          let [code] = extract_text(modal_int);
          if(code.includes('await')) code = `(async () => { ${code} })().catch(handleError)`;
    
          // eval time
          let output;
          try { output = inspect(await eval(code), { depth: 0, showHidden: true }); }
          catch(err) { modal_int.replyError(err); return; }
    
          // format time
          let x;
          if(output.length <= 2000)
            x = '```js\n'+output+'```';
          else if(output.length > 2000 && output.length <= 4096)
            x = { embeds: [{ description: '```js\n'+output+'```' }] };
          else if(output.length > 4096)
            x = { files: [{ attachment: Buffer.from(output), name: 'output.js'}] };
          
          // send time
          modal_int.replyEphemeral(x);
        }
      }
    });
  }

  async fetchOwner() {
    if(!this.application) {
      await wait(2_000);
      this.fetchOwner();
      return;
    }
    const { owner } = await this.application.fetch();
    if(!(owner instanceof User)) throw 'kill yourself';
    return (this.owner = owner);
  }

  /** @param {Error} err */
  async handleError(err) {
    console.error(err);
    this.owner?.send(format_error(err)).catch(do_nothing);
  }

  async clearOwnerDM() {
    const user = await this.user?.fetch();
    if(!user) throw new TypeError('client user object could not be fetched!');
    const owner = this.owner ?? await this.fetchOwner();

    const toDelete = (await (await owner.createDM()).messages.fetch()).filter(m => m.author.id === user.id).values();
    setInterval(async () => {
      try { await toDelete.next().value.delete(); }
      catch(err) { clearInterval(void 0); }
    }, 1_000);
  }

  async sendOwnerButtons() {
    const owner = this.owner ?? await this.fetchOwner();

    const buttons = [
      { type: Button, label: 'kill bot process', custom_id: 'kill', style: Danger },
      { type: Button, label: 'set guild commands', custom_id: 'guildcmds', style: Primary },
      { type: Button, label: 'set global commands', custom_id: 'globalcmds', style: Primary },
      { type: Button, label: 'eval', custom_id: 'eval', style: Primary },
    ];

    this.owner_buttons = await owner.send({
      content: 'owner buttons',
      components: [{ type: ActionRow, components: buttons }]
    });
  }

  async kill() {
    await this.owner_buttons?.delete().catch(do_nothing);
    await this.on_kill()?.catch(do_nothing);
    this.destroy();
    process.exit();
  }

  /**
   * @param {ActivityType} type 
   * @param {string} name 
   * @param {string=} url 
   */
  setStatus(type, name, url) {
    this.user.setPresence({ activities: [{ type, name, url }] });
  }

  async login() {
    return super.login(await import_json('./token.json'));
  }
}