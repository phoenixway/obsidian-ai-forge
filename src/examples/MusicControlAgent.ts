// src/agents/examples/MusicControlAgent.ts
import OllamaPlugin from "@/main"; // Адаптуйте шлях
import { IAgent, IToolFunction } from "@/agents/IAgent";
import { Notice, requestUrl, RequestUrlParam } from "obsidian"; // requestUrl для HTTP запитів

const LOCAL_MUSIC_SERVER_URL = "http://127.0.0.1:5678/control"; // URL нашого Python сервера

export class MusicControlAgent implements IAgent {
  id = "python-music-agent";
  name = "Python Server Music Agent";
  description = "Controls music playback on Linux via a local Python web server using playerctl.";

  private async sendPlayerCommand(action: string, params?: Record<string, any>, plugin?: OllamaPlugin): Promise<string> {
    const payload: Record<string, any> = { action, ...params };

    try {
      const requestParams: RequestUrlParam = {
        url: LOCAL_MUSIC_SERVER_URL,
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify(payload),
      };
      
      plugin?.logger.debug(`[PythonServerMusicAgent] Sending command: ${JSON.stringify(payload)}`);
      const response = await requestUrl(requestParams);
      plugin?.logger.debug(`[PythonServerMusicAgent] Received response: ${response.text}`);

      const responseData = response.json; // obsidian.requestUrl автоматично парсить JSON

      if (response.status >= 200 && response.status < 300) {
        let message = responseData.message || "Action processed.";
        if (responseData.output) {
          message += ` Output: ${responseData.output}`;
        }
        if (action === "status" && responseData) { // Спеціальна обробка для статусу
            message = `Status: ${responseData.status}\nTrack: ${responseData.title}\nArtist: ${responseData.artist}\nAlbum: ${responseData.album}`;
            if (responseData.errors && responseData.errors.length > 0) {
                message += `\nErrors: ${responseData.errors.join(', ')}`;
            }
        } else if (action === "list_players" && responseData.output) {
            message = `Available players:\n${responseData.output}`;
        }
        new Notice(message.substring(0,150)); // Коротке сповіщення
        return message;
      } else {
        const errorMsg = responseData.error || responseData.stderr || `Server responded with status ${response.status}`;
        plugin?.logger.error(`[PythonServerMusicAgent] Error from server: ${errorMsg}`);
        new Notice(`Music control error: ${errorMsg}`, 7000);
        return `Error: ${errorMsg}`;
      }
    } catch (error: any) {
      plugin?.logger.error(`[PythonServerMusicAgent] Network or parsing error:`, error);
      const errorMessage = error.message || "Failed to connect to the local music server. Is it running?";
      new Notice(errorMessage, 7000);
      return `Error: ${errorMessage}`;
    }
  }

  getTools(): IToolFunction[] {
    return [
      {
        name: "musicPlayPause",
        description: "Toggles play/pause for the music player. Optionally specify a player.",
        parameters: { 
            type: "object", 
            properties: {
                player: { type: "string", description: "Optional. Name of the player (e.g., 'spotify')."}
            } 
        },
      },
      {
        name: "musicNextTrack",
        description: "Skips to the next track. Optionally specify a player.",
        parameters: { 
            type: "object", 
            properties: {
                player: { type: "string", description: "Optional. Name of the player."}
            } 
        },
      },
      {
        name: "musicPreviousTrack",
        description: "Goes to the previous track. Optionally specify a player.",
         parameters: { 
            type: "object", 
            properties: {
                player: { type: "string", description: "Optional. Name of the player."}
            } 
        },
      },
      {
        name: "musicStop",
        description: "Stops playback. Optionally specify a player.",
        parameters: { 
            type: "object", 
            properties: {
                player: { type: "string", description: "Optional. Name of the player."}
            } 
        },
      },
      {
        name: "musicGetStatus",
        description: "Gets the current playback status and track metadata. Optionally specify a player.",
        parameters: { 
            type: "object", 
            properties: {
                player: { type: "string", description: "Optional. Name of the player."}
            } 
        },
      },
      {
        name: "musicSetVolume",
        description: "Sets the volume. Provide a level string understood by playerctl (e.g., '50%', '0.7', '+10%', '-0.05'). Optionally specify a player.",
        parameters: {
          type: "object",
          properties: {
            volume: {
              type: "string",
              description: "Volume level string (e.g., '50%', '0.7', '+10%', '-0.05').",
            },
            player: { type: "string", description: "Optional. Name of the player."}
          },
          required: ["volume"],
        },
      },
      {
        name: "musicListPlayers",
        description: "Lists available media players that can be controlled by playerctl.",
        parameters: { type: "object", properties: {} },
      }
      // musicSwitchPlayer не потрібен у такому вигляді, оскільки плеєр передається з кожним запитом
    ];
  }

  async executeTool(toolName: string, args: any, plugin: OllamaPlugin): Promise<string> {
    let action = "";
    const params: Record<string, any> = {};

    if (args?.player) {
        params.player = args.player;
    }

    switch (toolName) {
      case "musicPlayPause":
        action = "play-pause";
        break;
      case "musicNextTrack":
        action = "next";
        break;
      case "musicPreviousTrack":
        action = "previous";
        break;
      case "musicStop":
        action = "stop";
        break;
      case "musicGetStatus":
        action = "status";
        break;
      case "musicSetVolume":
        if (!args.volume || typeof args.volume !== 'string') {
          return "Error: 'volume' argument is missing or not a string.";
        }
        action = "set_volume";
        params.volume = args.volume; // Передаємо рядок гучності як є, Python сервер його обробить
        break;
      case "musicListPlayers":
        action = "list_players";
        break;
      default:
        return `Error: Unknown tool "${toolName}" for PythonServerMusicAgent.`;
    }
    return this.sendPlayerCommand(action, params, plugin);
  }
}