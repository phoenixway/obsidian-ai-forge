// src/agents/AgentManager.ts
import  OllamaPlugin from "@/main"; // Адаптуйте шлях
import { IAgent, IToolFunction } from "./IAgent";
import { SimpleFileAgent } from "@/examples/SimpleFileAgent"; // Приклад агента

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
    // тут можна додати інших агентів
}

  public registerAgent(agent: IAgent): void {
    if (this.agents.has(agent.id)) {
      this.plugin.logger.warn(`[AgentManager] Agent with ID "${agent.id}" is already registered. Overwriting.`);
    }
    this.agents.set(agent.id, agent);
    this.plugin.logger.info(`[AgentManager] Registered agent: ${agent.name} (ID: ${agent.id})`);
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
          this.plugin.logger.warn(`[AgentManager] Agent "${agent.name}" did not return a valid array from getTools().`);
        }
      } catch (error) {
        this.plugin.logger.error(`[AgentManager] Error getting tools from agent "${agent.name}":`, error);
      }
    });
    // Перевірка на унікальність імен інструментів
    const toolNames = new Set<string>();
    const uniqueTools = allTools.filter(tool => {
      if (toolNames.has(tool.name)) {
        this.plugin.logger.warn(`[AgentManager] Duplicate tool name found: "${tool.name}". Only the first instance will be used.`);
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
  public async executeTool(toolName: string, args: any): Promise<{ success: boolean, result: string, error?: string }> {
    for (const agent of this.agents.values()) {
      const agentTool = agent.getTools().find(t => t.name === toolName);
      if (agentTool) {
        try {
          this.plugin.logger.info(`[AgentManager] Executing tool "<span class="math-inline">\{toolName\}" from agent "</span>{agent.name}" with args:`, args);
          const result = await agent.executeTool(toolName, args, this.plugin);
          this.plugin.logger.info(`[AgentManager] Tool "${toolName}" executed successfully. Result: ${typeof result === 'string' ? result.substring(0,100) : '[non-string result]' }...`);
          return { success: true, result: typeof result === 'string' ? result : JSON.stringify(result) };
        } catch (e: any) {
          this.plugin.logger.error(`[AgentManager] Error executing tool "<span class="math-inline">\{toolName\}" in agent "</span>{agent.name}":`, e);
          return { success: false, result: "", error: e.message || "Unknown error during tool execution." };
        }
      }
    }
    this.plugin.logger.warn(`[AgentManager] Tool "${toolName}" not found across all registered agents.`);
    return { success: false, result: "", error: `Tool "${toolName}" not found.` };
  }
}