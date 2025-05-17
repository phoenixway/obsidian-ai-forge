// src/agents/examples/SimpleFileAgent.ts
import OllamaPlugin from "@/main"; // Адаптуйте шлях
import { IAgent, IToolFunction } from "@/agents/IAgent";
import { normalizePath, TFile, Notice, TFolder } from "obsidian";

export class SimpleFileAgent implements IAgent {
  id = "simple-file-agent";
  name = "Simple File Agent";
  description = "An agent designed to interact with the user's Obsidian vault file system. It can read content from specific files if the user provides the path, and list files/folders in specified locations within the vault. This agent helps with accessing and navigating *existing user notes and files*.";

  getTools(): IToolFunction[] {
    return [
      {
        name: "readFileContent",
        description: "Reads the content of a *specific, user-mentioned* file path within the Obsidian vault. Use this tool ONLY when the user explicitly provides a file path or asks to read a specific document they have saved. Do not use this to guess file paths for general information like recipes.",
        parameters: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "The *exact and full* path to the file within the Obsidian vault (e.g., 'Recipes/ChickenCurry.md', 'Meeting Notes/2024-05-16.md'). This path should typically be provided by the user or a previous tool call.",
            },
          },
          required: ["filePath"],
        },
      },
      {
        name: "listFiles",
        description: "Lists files and folders within a *specific, user-mentioned folder path* in the Obsidian vault. If no folder path is provided by the user, it lists items in the vault's root. Use this to help the user navigate their vault structure or find files when they are unsure of the exact name but know the location. Do not use this for broad, unguided searches for general information.",
        parameters: {
            type: "object",
            properties: {
                folderPath: {
                    type: "string",
                    description: "Optional. The path to the folder (e.g., 'Projects/Alpha', 'Personal/Journal'). This path should ideally be based on user input or to explore a known section of their vault. If omitted, lists contents of the vault root."
                }
            }
        }
      }
    ];
  }

  async executeTool(toolName: string, args: any, plugin: OllamaPlugin): Promise<string> {
    switch (toolName) {
      case "readFileContent":
        if (!args.filePath || typeof args.filePath !== 'string') {
          return "Error: 'filePath' argument is missing or not a string.";
        }
        try {
          const normalized = normalizePath(args.filePath);
          const file = plugin.app.vault.getAbstractFileByPath(normalized);
          if (file instanceof TFile) {
            const content = await plugin.app.vault.read(file);
            new Notice(`Agent read file: ${file.basename}`);
            return `Content of "${args.filePath}":\n${content}`;
          } else {
            return `Error: File not found or is not a regular file at path: ${args.filePath}`;
          }
        } catch (e: any) {
          plugin.logger.error(`[SimpleFileAgent] Error reading file ${args.filePath}:`, e);
          return `Error reading file "${args.filePath}": ${e.message}`;
        }

      case "listFiles":
        try {
            const pathToList = args.folderPath ? normalizePath(args.folderPath) : "/";
            const folder = plugin.app.vault.getAbstractFileByPath(pathToList);
            if (folder && folder instanceof TFolder) {
                const files = folder.children.filter(f => f instanceof TFile).map(f => f.name);
                return `Files in "${pathToList}":\n${files.join('\n')}`;
            } else if (pathToList === "/") { // Root listing
                 const files = plugin.app.vault.getFiles().map(f => f.path); // List all files with full paths for root
                 return `Files in vault root:\n${files.join('\n')}`;
            }
            else {
                return `Error: Folder not found at path: ${args.folderPath || '(root)'}`;
            }
        } catch (e: any) {
            plugin.logger.error(`[SimpleFileAgent] Error listing files in ${args.folderPath || '(root)'}:`, e);
            return `Error listing files: ${e.message}`;
        }

      default:
        return `Error: Unknown tool "${toolName}" for SimpleFileAgent.`;
    }
  }
}