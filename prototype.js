import { BaseInteraction, EmbedBuilder } from 'discord.js';
import { format_error } from './utils.js';

BaseInteraction.prototype.replyEphemeral = function(x) {
  if(typeof x === 'string')
    this.reply({ content: x, ephemeral: true });
  else if(typeof x === 'object') {
    x.ephemeral = true;
    this.reply(x);
  }
};

/**
 * @param {Error} err 
 */
BaseInteraction.prototype.replyError = function(err) {
  this.reply(format_error(err));
};

/**
 * @param {string} name 
 * @param {string} value 
 * @param {boolean=} inline 
 */
EmbedBuilder.prototype.addField = function(name, value, inline) {
  this.addFields({ name, value, inline });
};


/**
 * Swap two elements of this array.
 * @param {number} i 
 * @param {number} j 
 */
Array.prototype.swap = function(i, j) {
  [this[i], this[j]] = [this[j], this[i]];
};
