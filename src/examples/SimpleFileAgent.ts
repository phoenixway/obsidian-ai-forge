// src/agents/examples/SimpleFileAgent.ts
import OllamaPlugin from "@/main"; // Адаптуйте шлях
import { IAgent, IToolFunction } from "@/agents/IAgent";
import { normalizePath, TFile, Notice, TFolder } from "obsidian";

export class SimpleFileAgent implements IAgent {
  id = "simple-file-agent";
  name = "Simple File Agent";
  description = "An agent that can read and list files in the vault.";

  getTools(): IToolFunction[] {
    return [
      {
        name: "readFileContent",
        description: "Reads the content of a specified file in the Obsidian vault.",
        parameters: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "The full path to the file within the Obsidian vault (e.g., 'Notes/MyFile.md').",
            },
          },
          required: ["filePath"],
        },
      },
      {
        name: "listFiles",
        description: "Lists files in a specified folder of the Obsidian vault. Lists root if no path specified.",
        parameters: {
            type: "object",
            properties: {
                folderPath: {
                    type: "string",
                    description: "Optional. The path to the folder (e.g., 'Attachments/Images'). If omitted, lists root."
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