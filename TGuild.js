import { Collection } from 'discord.js';
import { import_json } from './utils.js';
import { writeFileSync } from 'fs';

const file = './tguilds.json';

/**
 * An object representing which roles are allowed to press the 
 * specified buttons. If null, everyone can press the button.
 * @typedef {object} ButtonRestrictions
 * @prop {?string} end_session
 * @prop {?string} pause_resume
 * @prop {?string} loop
 * @prop {?string} skip
 * @prop {?string} enqueue
 * @prop {?string} shuffle
 */

/**
 * @typedef {object} RawTGuild
 * @prop {string} guild
 * @prop {string} embed_color
 * @prop {ButtonRestrictions} button_restrictions
 */

export default class TGuild {
  static async readFromFile() {
    /** @type {Collection<string, TGuild>} */
    const tguilds = new Collection();

    try {
      for(const tg of (await import_json(file))) {
        tguilds.set(tg.guild, new TGuild(tg));
      }
    } catch(err) { void err; }
      
    return tguilds;
  }

  /** 
   * @param {Collection<string, TGuild>} tguilds
   */
  static writeToFile(tguilds) {
    writeFileSync(file, JSON.stringify(tguilds, null, '  '));
  }

  /** 
   * @param {RawTGuild} tg
   */
  constructor(tg) {
    this.guild = tg.guild;
    this.embed_color = tg.embed_color ?? null;
    this.button_restrictions = tg.button_restrictions ?? {
      end_session: null,
      pause_resume: null,
      toggle_loop: null,
      skip: null,
      add_to_queue: null,
      shuffle: null
    }
  }
}