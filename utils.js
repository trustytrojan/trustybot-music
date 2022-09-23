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

module.exports = { timestamp, secondsToHMS, toSnowflake }