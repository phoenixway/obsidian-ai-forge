import { Message } from './types';

export interface MessageRenderer {
    render(): HTMLElement;
}