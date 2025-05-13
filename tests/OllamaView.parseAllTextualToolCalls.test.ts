// tests/renderers/AssistantMessageRenderer.prepareDisplayContent.test.ts

import { AssistantMessageRenderer } from '@/renderers/AssistantMessageRenderer';
import { AssistantMessage, ToolCall, MessageRole } from '@/types'; // Переконайтеся, що MessageRole тут
import { OllamaView } from '@/OllamaView'; // Адаптуйте шлях
import OllamaPlugin from '@/main';        // Адаптуйте шлях
import * as RendererUtils from '@/MessageRendererUtils'; // Адаптуйте шлях

// Мок для OllamaView
const mockParseAllTextualToolCalls = jest.fn();

// Мінімальний мок для plugin.app, потрібний для RendererUtils.renderMarkdownContent
const mockAppForPlugin = {
    vault: {
        getRoot: () => ({ path: "/" })
    }
} as any;

const mockView = {
  parseAllTextualToolCalls: mockParseAllTextualToolCalls,
  // Додаємо мок plugin всередині mockView, оскільки renderMarkdownContent може його очікувати
  plugin: { 
      app: mockAppForPlugin,
      settings: { 
        fixBrokenEmojis: false // Приклад налаштування
      },
      logger: { // Додамо логер і сюди, якщо renderMarkdownContent його використовує
        debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
      }
  }
} as any as OllamaView; 

// Мок для OllamaPlugin
const mockPluginLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};
const mockPlugin = {
  settings: {
    enableToolUse: true,
  },
  logger: mockPluginLogger,
  app: mockAppForPlugin // Використовуємо той самий мок app
} as any as OllamaPlugin;

// Мокуємо RendererUtils
jest.mock('@/MessageRendererUtils', () => {
    const original = jest.requireActual('@/MessageRendererUtils');
    return {
        ...original,
        decodeHtmlEntities: jest.fn().mockImplementation((text: string) => text),
        detectThinkingTags: jest.fn().mockImplementation((text: string) => ({
            hasThinkingTags: false,
            contentWithoutTags: text,
            format: 'text'
        })),
        // Мокуємо renderMarkdownContent, щоб він нічого не робив і не викликав помилок DOM
        renderMarkdownContent: jest.fn().mockResolvedValue(undefined), 
    };
});


describe('AssistantMessageRenderer.prepareDisplayContent', () => {
  const createTestMessage = (content: string, tool_calls?: ToolCall[]): AssistantMessage => ({
    role: "assistant", // Явно "assistant"
    content: content,
    timestamp: new Date(), 
    tool_calls: tool_calls
  });

  beforeEach(() => {
    (RendererUtils.decodeHtmlEntities as jest.Mock).mockClear().mockImplementation((text: string) => text);
    (RendererUtils.detectThinkingTags as jest.Mock).mockClear().mockImplementation((text: string) => ({
        hasThinkingTags: false, contentWithoutTags: text, format: 'text'
    }));
    
    mockParseAllTextualToolCalls.mockClear();
    
    Object.values(mockPluginLogger).forEach(mockFn => mockFn.mockClear());
  });

  it('should return original content (after think stripping) if tool use is disabled', () => {
    const originalSettings = { ...mockPlugin.settings };
    mockPlugin.settings.enableToolUse = false;
    const content = "<think>thinking</think><tool_call>{\"name\":\"test\"}</tool_call> Some text.";
    const message = createTestMessage(content);
    
    (RendererUtils.detectThinkingTags as jest.Mock).mockReturnValue({
        hasThinkingTags: true, contentWithoutTags: "<tool_call>{\"name\":\"test\"}</tool_call> Some text.", format: 'text'
    });

    const result = AssistantMessageRenderer.prepareDisplayContent(content, message, mockPlugin, mockView);
    expect(result).toBe("<tool_call>{\"name\":\"test\"}</tool_call> Some text.");
    mockPlugin.settings.enableToolUse = originalSettings.enableToolUse; 
  });

  it('should return content without think tags if no tool indicators', () => {
    const content = "<think>Thinking...</think>Just a normal response.";
    const message = createTestMessage(content);
    (RendererUtils.detectThinkingTags as jest.Mock).mockReturnValue({
        hasThinkingTags: true, contentWithoutTags: "Just a normal response.", format: 'text'
    });
    mockParseAllTextualToolCalls.mockReturnValue([]);

    const result = AssistantMessageRenderer.prepareDisplayContent(content, message, mockPlugin, mockView);
    expect(result).toBe("Just a normal response.");
  });

  it('should replace single textual tool call and keep accompanying text', () => {
    const originalContent = "<think>Let me use a tool.</think><tool_call>{\"name\":\"listFiles\",\"arguments\":{}}</tool_call> Here are the files.";
    const contentWithoutThink = "<tool_call>{\"name\":\"listFiles\",\"arguments\":{}}</tool_call> Here are the files.";
    const message = createTestMessage(originalContent);

    (RendererUtils.detectThinkingTags as jest.Mock).mockReturnValue({
        hasThinkingTags: true, contentWithoutTags: contentWithoutThink, format: 'text'
    });
    mockParseAllTextualToolCalls.mockImplementation((text: string) => {
        if (text === contentWithoutThink) { 
            return [{ name: "listFiles", arguments: {} }];
        }
        return [];
    });

    const expected = "( Using tool: listFiles... )\n\nHere are the files.";
    const result = AssistantMessageRenderer.prepareDisplayContent(originalContent, message, mockPlugin, mockView);
    expect(result).toBe(expected);
  });

  it('should display (Using tool...) if only textual tool call is present', () => {
    const originalContent = "<tool_call>{\"name\":\"readFile\",\"arguments\":{\"path\":\"file.txt\"}}</tool_call>";
    const message = createTestMessage(originalContent);

    (RendererUtils.detectThinkingTags as jest.Mock).mockReturnValue({ 
        hasThinkingTags: false, contentWithoutTags: originalContent, format: 'text'
    });
    mockParseAllTextualToolCalls.mockReturnValue([{ name: "readFile", arguments: { path: "file.txt" } }]);
    
    const expected = "( Using tool: readFile... )";
    const result = AssistantMessageRenderer.prepareDisplayContent(originalContent, message, mockPlugin, mockView);
    expect(result).toBe(expected);
  });
  
  it('should handle multiple textual tool calls correctly', () => {
    const originalContent = "<tool_call>{\"name\":\"tool1\"}</tool_call><tool_call>{\"name\":\"tool2\"}</tool_call>Some final text.";
    const message = createTestMessage(originalContent);
    (RendererUtils.detectThinkingTags as jest.Mock).mockReturnValue({
        hasThinkingTags: false, contentWithoutTags: originalContent, format: 'text'
    });
    mockParseAllTextualToolCalls.mockReturnValue([
        { name: "tool1", arguments: {} },
        { name: "tool2", arguments: {} }
    ]);

    const expected = "( Using tools: tool1, tool2... )\n\nSome final text.";
    const result = AssistantMessageRenderer.prepareDisplayContent(originalContent, message, mockPlugin, mockView);
    expect(result).toBe(expected);
  });

  // Цей тест перевіряє логіку prepareDisplayContent
  it('should display (Attempting to use tool(s)...) and log warn from prepareDisplayContent when names not extracted', () => {
    const originalContent = "<think>Trying</think><tool_call>INVALID JSON</tool_call>Extra.";
    const contentWithoutThink = "<tool_call>INVALID JSON</tool_call>Extra.";
    const message = createTestMessage(originalContent);

    (RendererUtils.detectThinkingTags as jest.Mock).mockReturnValue({
        hasThinkingTags: true, contentWithoutTags: contentWithoutThink, format: 'text'
    });
    // Симулюємо, що parseAllTextualToolCalls (викликаний з prepareDisplayContent) нічого не знаходить
    mockParseAllTextualToolCalls.mockReturnValue([]); 
    
    const expectedDisplayContent = "( Attempting to use tool(s)... )\n\nExtra.";
    const result = AssistantMessageRenderer.prepareDisplayContent(originalContent, message, mockPlugin, mockView);
    expect(result).toBe(expectedDisplayContent);
    
    // Перевіряємо, що mockPluginLogger.warn був викликаний з ПОВІДОМЛЕННЯМ ВІД PREPAREDISPLAYCONTENT
    const warnCallsArgs = (mockPluginLogger.warn as jest.Mock).mock.calls;
    const prepareDisplayContentWarn = warnCallsArgs.find(args => 
        typeof args[0] === 'string' && 
        args[0].includes("[ARender STATIC PREP]") && // Ідентифікатор логу з prepareDisplayContent
        args[0].includes("Tool call indicators were present, but NO tool names were extracted. Displaying generic 'Attempting to use...' message.")
    );
    expect(prepareDisplayContentWarn).toBeDefined();
  });
  
  it('should correctly process native tool_calls with accompanying content', () => {
    const message = createTestMessage(
        "<think>Let me think.</think>Okay, I need to use a tool.",
        [{type: "function", id: "call1", function: {name: "getWeather", arguments: "{}"}} as ToolCall] 
    );
    (RendererUtils.detectThinkingTags as jest.Mock).mockReturnValue({
        hasThinkingTags: true, contentWithoutTags: "Okay, I need to use a tool.", format: 'text'
    });
    mockParseAllTextualToolCalls.mockReturnValue([]); 

    const expected = "( Using tool: getWeather... )\n\nOkay, I need to use a tool.";
    const result = AssistantMessageRenderer.prepareDisplayContent(message.content!, message, mockPlugin, mockView);
    expect(result).toBe(expected);
  });

  it('should correctly process native tool_calls with empty string content', () => {
    const message = createTestMessage(
        "", 
        [{type: "function", id: "call1", function: {name: "getSettings", arguments: "{}"}} as ToolCall] 
    );
    (RendererUtils.detectThinkingTags as jest.Mock).mockImplementation((text: string) => ({
        hasThinkingTags: false, contentWithoutTags: text || "", format: 'text'
    }));
    mockParseAllTextualToolCalls.mockReturnValue([]);

    const expected = "( Using tool: getSettings... )";
    const result = AssistantMessageRenderer.prepareDisplayContent(message.content || "", message, mockPlugin, mockView);
    expect(result).toBe(expected);
  });

  it('should correctly process native tool_calls with null content', () => {
    const message = createTestMessage(
        "", 
        [{type: "function", id: "call1", function: {name: "getSettings", arguments: "{}"}} as ToolCall] 
    );
     (RendererUtils.detectThinkingTags as jest.Mock).mockImplementation((text: string) => ({
        hasThinkingTags: false, contentWithoutTags: text || "", format: 'text' 
    }));
    mockParseAllTextualToolCalls.mockReturnValue([]);

    const expected = "( Using tool: getSettings... )";
    const result = AssistantMessageRenderer.prepareDisplayContent(message.content || "", message, mockPlugin, mockView);
    expect(result).toBe(expected);
  });
});