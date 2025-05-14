// src/agents/AgentManager.ts
import OllamaPlugin from "@/main"; // Адаптуйте шлях
import { IAgent, IToolFunction } from "./IAgent";
import { SimpleFileAgent } from "@/examples/SimpleFileAgent"; // Приклад агента
import { WeatherAgent } from "@/examples/WeatherAgent";

import { TimeAgent } from "@/examples/TimeAgent";

export class AgentManager {
  private agents: Map<string, IAgent> = new Map();
  private plugin: OllamaPlugin;

  constructor(plugin: OllamaPlugin) {
    this.plugin = plugin;
    this.registerDefaultAgents();
  }

  private registerDefaultAgents(): void {
    const fileAgent = new SimpleFileAgent();
    this.registerAgent(fileAgent);
    const weatherAgent = new WeatherAgent();
    this.registerAgent(weatherAgent);
    const timeAgent = new TimeAgent(); // Приклад агента
    this.registerAgent(timeAgent);
    // тут можна додати інших агентів
  }

  public registerAgent(agent: IAgent): void {
    if (this.agents.has(agent.id)) {
    }
    this.agents.set(agent.id, agent);
  }

  public getAgent(id: string): IAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * Збирає визначення всіх інструментів від усіх зареєстрованих агентів.
   */
  public getAllToolDefinitions(): IToolFunction[] {
    let allTools: IToolFunction[] = [];
    this.agents.forEach(agent => {
      try {
        const agentTools = agent.getTools();
        if (Array.isArray(agentTools)) {
          allTools = allTools.concat(agentTools);
        } else {
        }
      } catch (error) {}
    });
    // Перевірка на унікальність імен інструментів
    const toolNames = new Set<string>();
    const uniqueTools = allTools.filter(tool => {
      if (toolNames.has(tool.name)) {
        return false;
      }
      toolNames.add(tool.name);
      return true;
    });
    return uniqueTools;
  }

  /**
   * Виконує інструмент, знаходячи відповідний агент.
   * @param toolName Назва інструменту.
   * @param args Аргументи для інструменту (вже розпарсені з JSON-рядка).
   */
  public async executeTool(toolName: string, args: any): Promise<{ success: boolean; result: string; error?: string }> {
    for (const agent of this.agents.values()) {
      const agentTool = agent.getTools().find(t => t.name === toolName);
      if (agentTool) {
        try {
          const result = await agent.executeTool(toolName, args, this.plugin);
          return { success: true, result: typeof result === "string" ? result : JSON.stringify(result) };
        } catch (e: any) {
          return { success: false, result: "", error: e.message || "Unknown error during tool execution." };
        }
      }
    }
    return { success: false, result: "", error: `Tool "${toolName}" not found.` };
  }
}
