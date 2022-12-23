import { randomUUID } from 'crypto';
import './prototype.js';

import {
  ComponentType,
} from 'discord.js';

const { ActionRow, TextInput, Button } = ComponentType;

export const do_nothing = () => {};

/**
 * Typing for VSCode
 * @typedef {import('discord.js').ButtonStyle} ButtonStyle
 * @typedef {import('discord.js').TextInputStyle} TextInputStyle
 * @typedef {import('discord.js').CommandInteraction} CommandInteraction
 * @typedef {import('discord.js').ModalSubmitInteraction} ModalSubmitInteraction
 * @typedef {import('discord.js').APIActionRowComponent<import('discord.js').APIButtonComponent>} ButtonRow
 * @typedef {import('discord.js').APIActionRowComponent<import('discord.js').APIModalActionRowComponent>} ModalRow
 * @typedef {import('discord.js').APIButtonComponent} Button
 * @typedef {import('discord.js').APIButtonComponentWithCustomId} CustomIdButton
 * @typedef {import('discord.js').APIButtonComponentWithURL} LinkButton
 */

/**
 * @param {Button[]} buttons
 */
export function button_row(...buttons) {
  /** @type {ButtonRow} */
  const row = { type: ActionRow, components: [] };
  for(const button of buttons) {
    row.components.push(button);
  }
  return row;
}

/**
 * @param {string} custom_id
 * @param {string} label
 * @param {ButtonStyle} style
 * @param {{ emoji: string, disabled: boolean }}
 * @returns {CustomIdButton}
 */
export const button = (custom_id, label, style, { emoji, disabled }) =>
  ({ type: Button, custom_id, label, style, emoji, disabled });

/**
 * @param {string} url
 * @param {string} label
 * @param {ButtonStyle} style
 * @param {string} emoji
 * @returns {LinkButton}
 */
export const link_button = (url, label, style, emoji) =>
  ({ type: Button, url, label, style, emoji });

/**
 * @param {Error} err 
 */
export const format_error = (err) => `\`\`\`js\n${err.stack ?? err}\`\`\``;

/**
 * @param {CommandInteraction} interaction 
 * @param {string} msg
 */
export const something_went_wrong = (interaction, msg) =>
  interaction.replyEphemeral(`something went wrong, please try again...\n\`\`\`${msg}\`\`\``);

/**
 * @param {string} custom_id 
 * @param {string} label 
 * @param {TextInputStyle} style 
 * @param {{ placeholder: string, required: boolean }} 
 * @returns {ModalRow}
 */
export const modal_row = (custom_id, label, style, { placeholder, required } = {}) =>
  ({ type: ActionRow, components: [{ type: TextInput, custom_id, label, style, placeholder, required }] });

/**
 * @param {CommandInteraction} interaction 
 * @param {string} title 
 * @param {number} time 
 * @param {ModalRow[]} rows 
 */
export async function modal_sender(interaction, title, time, rows) {
  const customId = randomUUID();
  interaction.showModal({ customId, title, components: rows });
  let modal_int;
  try { modal_int = await interaction.awaitModalSubmit({ filter: (m) => m.customId === customId, time }); }
  catch(err) { return; }
  return modal_int;
}

/** 
 * @param {ModalSubmitInteraction} modal_int
 */
export const extract_text = (modal_int) => modal_int.fields.fields.map((v) => v.value);

/**
 * @param {string} file 
 */
export const import_json = async (file) => (await import(file, { assert: { type: 'json' } })).default;
