// tests/renderers/AssistantMessageRenderer.prepareDisplayContent.test.ts

import { AssistantMessageRenderer } from '../../src/renderers/AssistantMessageRenderer';
import { AssistantMessage, ToolCall, MessageRole } from '../../src/types'; // Імпортуємо MessageRole
import { OllamaView } from '../../src/OllamaView';
import OllamaPlugin from '../../src/main';
import * as RendererUtils from '../../src/MessageRendererUtils';

// Мок для OllamaView
const mockParseAllTextualToolCalls = jest.fn();
const mockView = {
  parseAllTextualToolCalls: mockParseAllTextualToolCalls,
  plugin: { // Додамо мок plugin всередині view для RendererUtils.renderMarkdownContent
      app: {
          vault: {
              getRoot: () => ({ path: "/" })
          }
      },
      settings: { // Додамо налаштування для RendererUtils.renderMarkdownContent
        fixBrokenEmojis: false // Приклад
      }
  }
} as any as OllamaView; // 'as any' для спрощення, в ідеалі - більш точний мок

// Мок для OllamaPlugin
const mockPluginLogger = {
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
};
const mockPlugin = {
  settings: { enableToolUse: true },
  logger: mockPluginLogger,
  app: mockView.plugin.app // Беремо app з моку view для консистентності
} as any as OllamaPlugin;

// Мокуємо RendererUtils
jest.mock('../../src/MessageRendererUtils', () => {
    const original = jest.requireActual('../../src/MessageRendererUtils');
    return {
        ...original,
        decodeHtmlEntities: jest.fn().mockImplementation((text: string) => text),
        detectThinkingTags: jest.fn().mockImplementation((text: string) => ({
            hasThinkingTags: false, contentWithoutTags: text, format: 'text'
        })),
        renderMarkdownContent: jest.fn().mockResolvedValue(undefined), // Мокуємо, щоб не виконувати реальний рендеринг
    };
});

describe('AssistantMessageRenderer.prepareDisplayContent', () => {
  // Базовий об'єкт тепер відповідає AssistantMessage
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

  it('should display (Attempting to use tool(s)...) if textual tags present but names not extracted', () => {
    const originalContent = "<think>Trying</think><tool_call>INVALID JSON</tool_call>Extra.";
    const contentWithoutThink = "<tool_call>INVALID JSON</tool_call>Extra.";
    const message = createTestMessage(originalContent);

    (RendererUtils.detectThinkingTags as jest.Mock).mockReturnValue({
        hasThinkingTags: true, contentWithoutTags: contentWithoutThink, format: 'text'
    });
    mockParseAllTextualToolCalls.mockReturnValue([]); 
    
    const expected = "( Attempting to use tool(s)... )\n\nExtra.";
    const result = AssistantMessageRenderer.prepareDisplayContent(originalContent, message, mockPlugin, mockView);
    expect(result).toBe(expected);
    expect(mockPluginLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Tool call indicators were present, but NO tool names were extracted. Displaying generic 'Attempting to use...' message.")
    );  });
  
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
    // message.content! - використовуємо non-null assertion, оскільки ми знаємо, що він є
    const result = AssistantMessageRenderer.prepareDisplayContent(message.content!, message, mockPlugin, mockView);
    expect(result).toBe(expected);
  });

  it('should correctly process native tool_calls with empty string content', () => {
    const message = createTestMessage(
        "", // Порожній рядок
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

  // Тест для content: null (якщо ви дозволили content: string | null у типах)
  it('should correctly process native tool_calls with null content', () => {
    const message = createTestMessage(
        "", // null
        [{type: "function", id: "call1", function: {name: "getSettings", arguments: "{}"}} as ToolCall] 
    );
     (RendererUtils.detectThinkingTags as jest.Mock).mockImplementation((text: string) => ({
        hasThinkingTags: false, contentWithoutTags: text || "", format: 'text' // text || "" дасть ""
    }));
    mockParseAllTextualToolCalls.mockReturnValue([]);

    const expected = "( Using tool: getSettings... )";
    const result = AssistantMessageRenderer.prepareDisplayContent(message.content || "", message, mockPlugin, mockView);
    expect(result).toBe(expected);
  });
});