/**
 * @param {number} s 
 * @param {boolean=} milliseconds
 */
export function hours_minutes_seconds(s, milliseconds) {
  if(milliseconds) s = Math.floor(s/1000);

  const hours = Math.floor(s/3600);
  const minutes = Math.floor(s/60);

  let m_rem = minutes%60;
  if(m_rem < 10) m_rem = `0${m_rem}`;
  
  let s_rem = s%60;
  if(s_rem < 10) s_rem = `0${s_rem}`

  if(hours > 0) return `${hours}:${m_rem}:${s_rem}`;
  return `${minutes}:${s_rem}`;
}
