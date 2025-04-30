// src/renderers/IMessageRenderer.ts
import { Message } from "../types"; // Переконайтесь, що шлях правильний

/**
 * Interface for rendering a single message element or message group.
 */
export interface IMessageRenderer {
	/**
	 * Renders the complete message group HTML element.
	 * @param container - The parent container where the message should be appended (optional, might be handled by caller).
	 * @returns The rendered HTMLElement (typically the message group).
	 */
	render(): Promise<HTMLElement> | HTMLElement;
}