// __mocks__/obsidian.ts

import { jest } from '@jest/globals';

// --- Базові класи ---
export class TFile {
  constructor(
    public path: string = "mock/default.md",
    public name: string = path.split('/').pop() || "default.md",
    public basename: string = name.includes('.') ? name.substring(0, name.lastIndexOf('.')) : name,
    public extension: string = name.includes('.') ? name.substring(name.lastIndexOf('.') + 1) : "md"
  ) {}
}

export class TFolder {
  constructor(
    public path: string = "mock/folder",
    public name: string = path.split('/').pop() || "folder",
    public children: (TFile | TFolder)[] = []
  ) {}
}

// --- Інтерфейси для Моку App (тільки сигнатури) ---
export interface MockAppVaultAdapter {
  exists: (path: string, caseSensitive?: boolean) => Promise<boolean>;
  read: (path: string) => Promise<string>;
  write: (path: string, data: string, options?: any) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  getResourcePath: (file: TFile) => string;
  normalizePath: (path: string) => string;
}
export interface MockAppVault {
  adapter: MockAppVaultAdapter;
  getAbstractFileByPath: (path: string) => TFile | TFolder | null;
  getRoot: () => TFolder;
  create: (path: string, data: string, options?: any) => Promise<TFile>;
  createFolder: (path: string) => Promise<TFolder>;
  read: (file: TFile) => Promise<string>;
  modify: (file: TFile, data: string, options?: any) => Promise<void>;
}

export interface MockAppWorkspace {
  on: (name: string, callback: (...data: any[]) => any, ctx?: any) => void;
  getActiveViewOfType: <T extends ItemView>(type: new (...args: any[]) => T) => T | null;
  getActiveFile: () => TFile | null;
  detachLeavesOfType: (type: string) => void;
}

export interface MockAppSetting {
    open: () => void;
    openTabById: (id: string) => void;
}

export interface MockApp {
  vault: MockAppVault;
  workspace: MockAppWorkspace;
  setting: MockAppSetting;
}

export class WorkspaceLeaf {
  constructor(public app: MockApp) {}
  view: ItemView | null = null;
}

export class ItemView {
  contentEl: HTMLElement;
  app: MockApp;
  leaf: WorkspaceLeaf;

  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf;
    this.app = leaf.app;
    this.contentEl = typeof document !== 'undefined' ? document.createElement('div') : ({ style: {} } as HTMLElement);
  }
  getViewType(): string { return 'mock-item-view'; }
  getDisplayText(): string { return 'Mock Item View'; }
  getIcon(): string { return 'document'; }
  // Використовуємо jest.Mock<СигнатураФункції>
  registerDomEvent = jest.fn() as jest.Mock< (el: HTMLElement, type: string, callback: (event: any) => void) => void >;
  register = jest.fn() as jest.Mock< (cb: () => any) => void >;
}


// --- Експорт Моків Функцій та Класів ---

export const setIcon = jest.fn() as jest.MockedFunction<typeof import('obsidian').setIcon>;

export const MarkdownRenderer = {
  render: jest.fn(
    async (app: MockApp, markdown: string, el: HTMLElement, sourcePath: string, component: ItemView) => {
      el.innerHTML = markdown; 
    }
  ) as jest.MockedFunction<(app: MockApp, markdown: string, el: HTMLElement, sourcePath: string, component: ItemView) => Promise<void>>,
};

export class Notice {
  constructor(public message: string | DocumentFragment, public duration?: number) {}
  // Використовуємо jest.Mock<СигнатураФункції>
  hide = jest.fn() as jest.Mock<() => void>;
}

export const normalizePath = jest.fn((path: string): string => path) as jest.MockedFunction<typeof import('obsidian').normalizePath>;

type OriginalDebounce = <T extends (...args: any[]) => any>(
    fn: T, 
    timeout?: number, 
    resetTimer?: boolean 
) => T & { cancel: () => void }; 

export const debounce = jest.fn(
  (fn: (...args: any[]) => any, timeout?: number, _resetTimer?: boolean): ((...args: any[]) => void) & { cancel?: () => void } => {
    let timeoutId: NodeJS.Timeout | null = null;
    const debounced = (...args: any[]) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fn(...args);
      }, timeout ?? 0);
    };
    return debounced;
  }
) as jest.MockedFunction<OriginalDebounce>;


export class Menu {
    constructor() {}
    addItem = jest.fn().mockReturnThis() as jest.MockedFunction<Menu['addItem']>;
    addSeparator = jest.fn().mockReturnThis() as jest.MockedFunction<Menu['addSeparator']>;
    showAtMouseEvent = jest.fn() as jest.MockedFunction<Menu['showAtMouseEvent']>;
}

// --- Мок-клас App ---
export class App implements MockApp {
    vault: MockAppVault;
    workspace: MockAppWorkspace;
    setting: MockAppSetting;

    constructor() {
        this.vault = {
            adapter: {
                exists: jest.fn<(path: string, cs?: boolean) => Promise<boolean>>().mockResolvedValue(false),
                read: jest.fn<(path: string) => Promise<string>>().mockResolvedValue(""),
                write: jest.fn<(path: string, data: string, opts?: any) => Promise<void>>().mockResolvedValue(undefined),
                mkdir: jest.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined),
                remove: jest.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined),
                getResourcePath: jest.fn<(file: TFile) => string>().mockImplementation((file: TFile): string => `app://local/${file.path}`),
                normalizePath: jest.fn<(path: string) => string>().mockImplementation((path: string): string => path),
            },
            getAbstractFileByPath: jest.fn<(path: string) => TFile | TFolder | null>().mockReturnValue(null),
            getRoot: jest.fn<() => TFolder>(() => new TFolder("/")),
            create: jest.fn<(path: string, data: string, opts?: any) => Promise<TFile>>().mockResolvedValue(new TFile("mockCreatedFile.md")),
            createFolder: jest.fn<(path: string) => Promise<TFolder>>().mockResolvedValue(new TFolder("mockCreatedFolder")),
            read: jest.fn<(file: TFile) => Promise<string>>().mockResolvedValue("mock file content"),
            modify: jest.fn<(file: TFile, data: string, opts?: any) => Promise<void>>().mockResolvedValue(undefined),
        };
        this.workspace = {
            on: jest.fn<(name: string, callback: (...data: any[]) => any, ctx?: any) => void>(),
            // Типізуємо дженерік-метод getActiveViewOfType
            getActiveViewOfType: jest.fn().mockReturnValue(null) as any, 
            getActiveFile: jest.fn<() => TFile | null>().mockReturnValue(null),
            detachLeavesOfType: jest.fn<(type: string) => void>(),
        };
        this.setting = {
            open: jest.fn<() => void>(),
            openTabById: jest.fn<(id: string) => void>(),
        };
    }
}

export const Platform = {
    isDesktop: true,
    isMobile: false,
};