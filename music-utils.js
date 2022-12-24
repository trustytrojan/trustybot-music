/**
 * Typing for VSCode
 * @typedef {import('discord.js').Guild} Guild
 * @typedef {import('./TGuild.js').ButtonRestrictions} ButtonRestrictions
 */

/**
 * @param {number} s 
 * @param {boolean=} milliseconds Whether the time value provided is a quantity of milliseconds, not seconds
 */
export function hours_minutes_seconds(s, milliseconds) {
  if(milliseconds) s = Math.floor(s / 1000);

  const hours = Math.floor(s / 3600);
  const minutes = Math.floor(s / 60);

  let m_rem = minutes % 60;
  if(m_rem < 10) m_rem = `0${m_rem}`;
  
  let s_rem = s%60;
  if(s_rem < 10) s_rem = `0${s_rem}`

  if(hours > 0) return `${hours}:${m_rem}:${s_rem}`;
  return `${minutes}:${s_rem}`;
}

/**
 * @param {Guild} guild 
 * @param {ButtonRestrictions} btn_rest 
 */
export function btn_rest_field_str(guild, btn_rest) {
  const everyone = guild.roles.everyone.toString();

  /** @param {keyof ButtonRestrictions} x */
  const r_str = (x) => `${btn_rest[x] ? `<@&${btn_rest[x]}>` : everyone}\n`;

  let str = '';
  for(const k in btn_rest) {
    str += r_str(k);
  }
  
  return str;
}

export const btn_readable_name = Object.freeze({
  pause_resume: 'pause / resume',
  skip: 'skip',
  loop: 'loop',
  enqueue: 'add to queue',
  shuffle: 'shuffle',
  skip_to: 'skip to...',
  end: 'end session'
});
