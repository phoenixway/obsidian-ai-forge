import { __awaiter } from "tslib";
import { normalizePath, TFile, Notice, TFolder } from "obsidian";
export class SimpleFileAgent {
    constructor() {
        this.id = "simple-file-agent";
        this.name = "Simple File Agent";
        this.description = "An agent that can read and list files in the vault.";
    }
    getTools() {
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
    executeTool(toolName, args, plugin) {
        return __awaiter(this, void 0, void 0, function* () {
            switch (toolName) {
                case "readFileContent":
                    if (!args.filePath || typeof args.filePath !== 'string') {
                        return "Error: 'filePath' argument is missing or not a string.";
                    }
                    try {
                        const normalized = normalizePath(args.filePath);
                        const file = plugin.app.vault.getAbstractFileByPath(normalized);
                        if (file instanceof TFile) {
                            const content = yield plugin.app.vault.read(file);
                            new Notice(`Agent read file: ${file.basename}`);
                            return `Content of "${args.filePath}":\n${content}`;
                        }
                        else {
                            return `Error: File not found or is not a regular file at path: ${args.filePath}`;
                        }
                    }
                    catch (e) {
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
                        }
                        else if (pathToList === "/") { // Root listing
                            const files = plugin.app.vault.getFiles().map(f => f.path); // List all files with full paths for root
                            return `Files in vault root:\n${files.join('\n')}`;
                        }
                        else {
                            return `Error: Folder not found at path: ${args.folderPath || '(root)'}`;
                        }
                    }
                    catch (e) {
                        plugin.logger.error(`[SimpleFileAgent] Error listing files in ${args.folderPath || '(root)'}:`, e);
                        return `Error listing files: ${e.message}`;
                    }
                default:
                    return `Error: Unknown tool "${toolName}" for SimpleFileAgent.`;
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2ltcGxlRmlsZUFnZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiU2ltcGxlRmlsZUFnZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFHQSxPQUFPLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRWpFLE1BQU0sT0FBTyxlQUFlO0lBQTVCO1FBQ0UsT0FBRSxHQUFHLG1CQUFtQixDQUFDO1FBQ3pCLFNBQUksR0FBRyxtQkFBbUIsQ0FBQztRQUMzQixnQkFBVyxHQUFHLHFEQUFxRCxDQUFDO0lBOEV0RSxDQUFDO0lBNUVDLFFBQVE7UUFDTixPQUFPO1lBQ0w7Z0JBQ0UsSUFBSSxFQUFFLGlCQUFpQjtnQkFDdkIsV0FBVyxFQUFFLDhEQUE4RDtnQkFDM0UsVUFBVSxFQUFFO29CQUNWLElBQUksRUFBRSxRQUFRO29CQUNkLFVBQVUsRUFBRTt3QkFDVixRQUFRLEVBQUU7NEJBQ1IsSUFBSSxFQUFFLFFBQVE7NEJBQ2QsV0FBVyxFQUFFLGdGQUFnRjt5QkFDOUY7cUJBQ0Y7b0JBQ0QsUUFBUSxFQUFFLENBQUMsVUFBVSxDQUFDO2lCQUN2QjthQUNGO1lBQ0Q7Z0JBQ0UsSUFBSSxFQUFFLFdBQVc7Z0JBQ2pCLFdBQVcsRUFBRSwyRkFBMkY7Z0JBQ3hHLFVBQVUsRUFBRTtvQkFDUixJQUFJLEVBQUUsUUFBUTtvQkFDZCxVQUFVLEVBQUU7d0JBQ1IsVUFBVSxFQUFFOzRCQUNSLElBQUksRUFBRSxRQUFROzRCQUNkLFdBQVcsRUFBRSx3RkFBd0Y7eUJBQ3hHO3FCQUNKO2lCQUNKO2FBQ0Y7U0FDRixDQUFDO0lBQ0osQ0FBQztJQUVLLFdBQVcsQ0FBQyxRQUFnQixFQUFFLElBQVMsRUFBRSxNQUFvQjs7WUFDakUsUUFBUSxRQUFRLEVBQUUsQ0FBQztnQkFDakIsS0FBSyxpQkFBaUI7b0JBQ3BCLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLE9BQU8sSUFBSSxDQUFDLFFBQVEsS0FBSyxRQUFRLEVBQUUsQ0FBQzt3QkFDeEQsT0FBTyx3REFBd0QsQ0FBQztvQkFDbEUsQ0FBQztvQkFDRCxJQUFJLENBQUM7d0JBQ0gsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQzt3QkFDaEQsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUMsVUFBVSxDQUFDLENBQUM7d0JBQ2hFLElBQUksSUFBSSxZQUFZLEtBQUssRUFBRSxDQUFDOzRCQUMxQixNQUFNLE9BQU8sR0FBRyxNQUFNLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQzs0QkFDbEQsSUFBSSxNQUFNLENBQUMsb0JBQW9CLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDOzRCQUNoRCxPQUFPLGVBQWUsSUFBSSxDQUFDLFFBQVEsT0FBTyxPQUFPLEVBQUUsQ0FBQzt3QkFDdEQsQ0FBQzs2QkFBTSxDQUFDOzRCQUNOLE9BQU8sMkRBQTJELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQzt3QkFDcEYsQ0FBQztvQkFDSCxDQUFDO29CQUFDLE9BQU8sQ0FBTSxFQUFFLENBQUM7d0JBQ2hCLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLHdDQUF3QyxJQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7d0JBQ2pGLE9BQU8sdUJBQXVCLElBQUksQ0FBQyxRQUFRLE1BQU0sQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUMvRCxDQUFDO2dCQUVILEtBQUssV0FBVztvQkFDZCxJQUFJLENBQUM7d0JBQ0QsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO3dCQUMxRSxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxVQUFVLENBQUMsQ0FBQzt3QkFDbEUsSUFBSSxNQUFNLElBQUksTUFBTSxZQUFZLE9BQU8sRUFBRSxDQUFDOzRCQUN0QyxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsWUFBWSxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7NEJBQy9FLE9BQU8sYUFBYSxVQUFVLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO3dCQUM1RCxDQUFDOzZCQUFNLElBQUksVUFBVSxLQUFLLEdBQUcsRUFBRSxDQUFDLENBQUMsZUFBZTs0QkFDM0MsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsMENBQTBDOzRCQUN0RyxPQUFPLHlCQUF5QixLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7d0JBQ3hELENBQUM7NkJBQ0ksQ0FBQzs0QkFDRixPQUFPLG9DQUFvQyxJQUFJLENBQUMsVUFBVSxJQUFJLFFBQVEsRUFBRSxDQUFDO3dCQUM3RSxDQUFDO29CQUNMLENBQUM7b0JBQUMsT0FBTyxDQUFNLEVBQUUsQ0FBQzt3QkFDZCxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyw0Q0FBNEMsSUFBSSxDQUFDLFVBQVUsSUFBSSxRQUFRLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQzt3QkFDbkcsT0FBTyx3QkFBd0IsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO29CQUMvQyxDQUFDO2dCQUVIO29CQUNFLE9BQU8sd0JBQXdCLFFBQVEsd0JBQXdCLENBQUM7WUFDcEUsQ0FBQztRQUNILENBQUM7S0FBQTtDQUNGIiwic291cmNlc0NvbnRlbnQiOlsiLy8gc3JjL2FnZW50cy9leGFtcGxlcy9TaW1wbGVGaWxlQWdlbnQudHNcbmltcG9ydCBPbGxhbWFQbHVnaW4gZnJvbSBcIkAvbWFpblwiOyAvLyDQkNC00LDQv9GC0YPQudGC0LUg0YjQu9GP0YVcbmltcG9ydCB7IElBZ2VudCwgSVRvb2xGdW5jdGlvbiB9IGZyb20gXCJAL2FnZW50cy9JQWdlbnRcIjtcbmltcG9ydCB7IG5vcm1hbGl6ZVBhdGgsIFRGaWxlLCBOb3RpY2UsIFRGb2xkZXIgfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuZXhwb3J0IGNsYXNzIFNpbXBsZUZpbGVBZ2VudCBpbXBsZW1lbnRzIElBZ2VudCB7XG4gIGlkID0gXCJzaW1wbGUtZmlsZS1hZ2VudFwiO1xuICBuYW1lID0gXCJTaW1wbGUgRmlsZSBBZ2VudFwiO1xuICBkZXNjcmlwdGlvbiA9IFwiQW4gYWdlbnQgdGhhdCBjYW4gcmVhZCBhbmQgbGlzdCBmaWxlcyBpbiB0aGUgdmF1bHQuXCI7XG5cbiAgZ2V0VG9vbHMoKTogSVRvb2xGdW5jdGlvbltdIHtcbiAgICByZXR1cm4gW1xuICAgICAge1xuICAgICAgICBuYW1lOiBcInJlYWRGaWxlQ29udGVudFwiLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJSZWFkcyB0aGUgY29udGVudCBvZiBhIHNwZWNpZmllZCBmaWxlIGluIHRoZSBPYnNpZGlhbiB2YXVsdC5cIixcbiAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgIHR5cGU6IFwib2JqZWN0XCIsXG4gICAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgICAgZmlsZVBhdGg6IHtcbiAgICAgICAgICAgICAgdHlwZTogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiVGhlIGZ1bGwgcGF0aCB0byB0aGUgZmlsZSB3aXRoaW4gdGhlIE9ic2lkaWFuIHZhdWx0IChlLmcuLCAnTm90ZXMvTXlGaWxlLm1kJykuXCIsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgcmVxdWlyZWQ6IFtcImZpbGVQYXRoXCJdLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgbmFtZTogXCJsaXN0RmlsZXNcIixcbiAgICAgICAgZGVzY3JpcHRpb246IFwiTGlzdHMgZmlsZXMgaW4gYSBzcGVjaWZpZWQgZm9sZGVyIG9mIHRoZSBPYnNpZGlhbiB2YXVsdC4gTGlzdHMgcm9vdCBpZiBubyBwYXRoIHNwZWNpZmllZC5cIixcbiAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgICAgdHlwZTogXCJvYmplY3RcIixcbiAgICAgICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgICAgICBmb2xkZXJQYXRoOiB7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIk9wdGlvbmFsLiBUaGUgcGF0aCB0byB0aGUgZm9sZGVyIChlLmcuLCAnQXR0YWNobWVudHMvSW1hZ2VzJykuIElmIG9taXR0ZWQsIGxpc3RzIHJvb3QuXCJcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICBdO1xuICB9XG5cbiAgYXN5bmMgZXhlY3V0ZVRvb2wodG9vbE5hbWU6IHN0cmluZywgYXJnczogYW55LCBwbHVnaW46IE9sbGFtYVBsdWdpbik6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgc3dpdGNoICh0b29sTmFtZSkge1xuICAgICAgY2FzZSBcInJlYWRGaWxlQ29udGVudFwiOlxuICAgICAgICBpZiAoIWFyZ3MuZmlsZVBhdGggfHwgdHlwZW9mIGFyZ3MuZmlsZVBhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgcmV0dXJuIFwiRXJyb3I6ICdmaWxlUGF0aCcgYXJndW1lbnQgaXMgbWlzc2luZyBvciBub3QgYSBzdHJpbmcuXCI7XG4gICAgICAgIH1cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplUGF0aChhcmdzLmZpbGVQYXRoKTtcbiAgICAgICAgICBjb25zdCBmaWxlID0gcGx1Z2luLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgobm9ybWFsaXplZCk7XG4gICAgICAgICAgaWYgKGZpbGUgaW5zdGFuY2VvZiBURmlsZSkge1xuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHBsdWdpbi5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYEFnZW50IHJlYWQgZmlsZTogJHtmaWxlLmJhc2VuYW1lfWApO1xuICAgICAgICAgICAgcmV0dXJuIGBDb250ZW50IG9mIFwiJHthcmdzLmZpbGVQYXRofVwiOlxcbiR7Y29udGVudH1gO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gYEVycm9yOiBGaWxlIG5vdCBmb3VuZCBvciBpcyBub3QgYSByZWd1bGFyIGZpbGUgYXQgcGF0aDogJHthcmdzLmZpbGVQYXRofWA7XG4gICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAgICAgICBwbHVnaW4ubG9nZ2VyLmVycm9yKGBbU2ltcGxlRmlsZUFnZW50XSBFcnJvciByZWFkaW5nIGZpbGUgJHthcmdzLmZpbGVQYXRofTpgLCBlKTtcbiAgICAgICAgICByZXR1cm4gYEVycm9yIHJlYWRpbmcgZmlsZSBcIiR7YXJncy5maWxlUGF0aH1cIjogJHtlLm1lc3NhZ2V9YDtcbiAgICAgICAgfVxuXG4gICAgICBjYXNlIFwibGlzdEZpbGVzXCI6XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBwYXRoVG9MaXN0ID0gYXJncy5mb2xkZXJQYXRoID8gbm9ybWFsaXplUGF0aChhcmdzLmZvbGRlclBhdGgpIDogXCIvXCI7XG4gICAgICAgICAgICBjb25zdCBmb2xkZXIgPSBwbHVnaW4uYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoVG9MaXN0KTtcbiAgICAgICAgICAgIGlmIChmb2xkZXIgJiYgZm9sZGVyIGluc3RhbmNlb2YgVEZvbGRlcikge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVzID0gZm9sZGVyLmNoaWxkcmVuLmZpbHRlcihmID0+IGYgaW5zdGFuY2VvZiBURmlsZSkubWFwKGYgPT4gZi5uYW1lKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYEZpbGVzIGluIFwiJHtwYXRoVG9MaXN0fVwiOlxcbiR7ZmlsZXMuam9pbignXFxuJyl9YDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocGF0aFRvTGlzdCA9PT0gXCIvXCIpIHsgLy8gUm9vdCBsaXN0aW5nXG4gICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVzID0gcGx1Z2luLmFwcC52YXVsdC5nZXRGaWxlcygpLm1hcChmID0+IGYucGF0aCk7IC8vIExpc3QgYWxsIGZpbGVzIHdpdGggZnVsbCBwYXRocyBmb3Igcm9vdFxuICAgICAgICAgICAgICAgICByZXR1cm4gYEZpbGVzIGluIHZhdWx0IHJvb3Q6XFxuJHtmaWxlcy5qb2luKCdcXG4nKX1gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBFcnJvcjogRm9sZGVyIG5vdCBmb3VuZCBhdCBwYXRoOiAke2FyZ3MuZm9sZGVyUGF0aCB8fCAnKHJvb3QpJ31gO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlOiBhbnkpIHtcbiAgICAgICAgICAgIHBsdWdpbi5sb2dnZXIuZXJyb3IoYFtTaW1wbGVGaWxlQWdlbnRdIEVycm9yIGxpc3RpbmcgZmlsZXMgaW4gJHthcmdzLmZvbGRlclBhdGggfHwgJyhyb290KSd9OmAsIGUpO1xuICAgICAgICAgICAgcmV0dXJuIGBFcnJvciBsaXN0aW5nIGZpbGVzOiAke2UubWVzc2FnZX1gO1xuICAgICAgICB9XG5cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiBgRXJyb3I6IFVua25vd24gdG9vbCBcIiR7dG9vbE5hbWV9XCIgZm9yIFNpbXBsZUZpbGVBZ2VudC5gO1xuICAgIH1cbiAgfVxufSJdfQ==