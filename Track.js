import {
  createAudioResource,
} from '@discordjs/voice';

import {
  stream,
  YouTubeVideo,
  SoundCloudTrack
} from 'play-dl';

import { hours_minutes_seconds } from './music-utils';

/**
 * Typing for VSCode
 * @typedef {import('discord.js').GuildMember} GuildMember
 */

export default class Track {
  /**
   * @param {YouTubeVideo | SoundCloudTrack} track 
   * @param {GuildMember} requestor 
   */
  constructor(track, requestor) {
    this.requestor = requestor;
    
    if(track instanceof YouTubeVideo) {
      this.source = 'YouTube';
      this.title = track.title;
      this.artist = { name: track.channel.name, url: track.channel.url };
      this.thumbnail = track.thumbnails.pop()?.url;
      this.url = track.url;
      this.length = hours_minutes_seconds(track.durationInSec);
    }
    
    else if(track instanceof SoundCloudTrack) {
      this.source = 'SoundCloud';
      this.title = track.name;
      this.artist = { name: track.user.name, url: track.user.url };
      this.thumbnail = track.thumbnail;
      this.url = track.permalink;
      this.length = hours_minutes_seconds(track.durationInSec);
    }

    this.artist.toString = function() {
      return `[${this.name}](${this.url})`;
    };
  }

  toString() {
    return this.hyperlink;
  }

  get hyperlink() {
    return `[${this.title}](${this.url})`;
  }

  async createAudioResource() {
    const { stream: _stream, type } = await stream(this.url);
    return createAudioResource(_stream, { inputType: type, metadata: this });
  }
}