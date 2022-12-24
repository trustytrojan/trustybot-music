import { Collection } from 'discord.js';
import { import_json } from './utils.js';
import { writeFileSync } from 'fs';

const file = './tguilds.json';

/**
 * An object representing which roles are allowed to press the 
 * specified buttons. If null, everyone can press the button.
 * @typedef {object} ButtonRestrictions
 * @prop {?string} pause_resume
 * @prop {?string} skip
 * @prop {?string} loop
 * @prop {?string} enqueue
 * @prop {?string} shuffle
 * @prop {?string} skip_to
 * @prop {?string} end
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
    this.embed_color = tg.embed_color ?? 'ff00ff';
    this.button_restrictions = tg.button_restrictions ?? {
      pause_resume: null,
      skip: null,
      loop: null,
      enqueue: null,
      shuffle: null,
      skip_to: null,
      end: null
    };
  }
}