// src/Logger.ts
import { DataAdapter, normalizePath, Plugin } from 'obsidian';

// Рівні логування
export enum LogLevel {
    DEBUG = 1,
    INFO = 2,
    WARN = 3,
    ERROR = 4,
    TRACE = 6, // Для трасування
    NONE = 5 // Для повного вимкнення
}

// Тип для початкових налаштувань логера
export interface LoggerSettings {
    consoleLogLevel: keyof typeof LogLevel;
    fileLoggingEnabled: boolean;
    fileLogLevel: keyof typeof LogLevel;
    logCallerInfo: boolean; // <--- Нове налаштування
    logFilePath?: string;
    logFileMaxSizeMB?: number;
}

export class Logger {
    private adapter: DataAdapter;
    private logFilePath: string;
    private consoleLogLevel: LogLevel = LogLevel.INFO;
    private fileLogLevel: LogLevel = LogLevel.WARN;
    private fileLoggingEnabled: boolean = false;
    private logCallerInfo: boolean = false;
    private logFileMaxSizeMB: number = 5;
    private plugin: Plugin;
    private logQueue: string[] = [];
    private isWritingToFile: boolean = false;
    private writeDebounceTimeout: NodeJS.Timeout | null = null;

    constructor(plugin: Plugin, initialSettings: LoggerSettings) {
        this.plugin = plugin;
        this.adapter = plugin.app.vault.adapter;
        // --- ВИПРАВЛЕНО: Використовуємо normalizePath тут ---
        this.logFilePath = normalizePath(initialSettings.logFilePath || `${this.plugin.manifest.dir}/ai-forge.log`);
        this.logFileMaxSizeMB = initialSettings.logFileMaxSizeMB || 5;

        this.updateSettings(initialSettings);

        // console.log(`[Logger] Initialized. Console Level: ${this.getLogLevelName(this.consoleLogLevel)}, File Logging: ${this.fileLoggingEnabled}, File Level: ${this.getLogLevelName(this.fileLogLevel)}, Log Caller: ${this.logCallerInfo}, Path: ${this.logFilePath}`);

        if (this.fileLoggingEnabled) {
            this.rotateLogFileIfNeeded().then(() => {
                this.info('Logger initialized & file rotation checked.');
            });
        } else {
             this.info('Logger initialized.');
        }
    }

    // --- ДОДАНО: Публічний метод для отримання шляху ---
    public getLogFilePath(): string {
        return this.logFilePath;
    }
    // --- КІНЕЦЬ ДОДАНОГО МЕТОДУ ---

    private getLogLevelName(level: LogLevel): string { /* ... */ return LogLevel[level] || 'UNKNOWN'; }
    private getLogLevelFromString(levelString: string | undefined, defaultLevel: LogLevel = LogLevel.INFO): LogLevel { /* ... */ return LogLevel[levelString?.toUpperCase() as keyof typeof LogLevel] || defaultLevel; }

    updateSettings(settings: Partial<LoggerSettings>) {
        if (settings.consoleLogLevel !== undefined) {
            this.consoleLogLevel = this.getLogLevelFromString(settings.consoleLogLevel, LogLevel.INFO);
            console.log(`[Logger] Console log level set to: ${this.getLogLevelName(this.consoleLogLevel)}`);
        }
        if (settings.fileLogLevel !== undefined) {
            this.fileLogLevel = this.getLogLevelFromString(settings.fileLogLevel, LogLevel.WARN);
            console.log(`[Logger] File log level set to: ${this.getLogLevelName(this.fileLogLevel)}`);
        }
        if (settings.fileLoggingEnabled !== undefined) {
            const wasEnabled = this.fileLoggingEnabled;
            this.fileLoggingEnabled = settings.fileLoggingEnabled;
             console.log(`[Logger] File logging enabled: ${this.fileLoggingEnabled}`);
             if (!wasEnabled && this.fileLoggingEnabled) {
                this.rotateLogFileIfNeeded();
            }
        }
         if (settings.logCallerInfo !== undefined) {
             this.logCallerInfo = settings.logCallerInfo;
             console.log(`[Logger] Log Caller Info enabled: ${this.logCallerInfo}`);
         }
         // Оновлення шляху та розміру, якщо вони передані
         if (settings.logFilePath !== undefined) {
             this.logFilePath = normalizePath(settings.logFilePath || `${this.plugin.manifest.dir}/ai-forge.log`);
            //  console.log(`[Logger] Log file path updated to: ${this.logFilePaInitialized. Console Levelh}`);
         }
         if (settings.logFileMaxSizeMB !== undefined) {
             this.logFileMaxSizeMB = settings.logFileMaxSizeMB || 5;
             console.log(`[Logger] Log file max size updated to: ${this.logFileMaxSizeMB} MB`);
         }
    }

    private getCallerInfo(): string { /* ... (код як раніше) ... */ return 'unknown'; }

    debug(...args: any[]) { this.log(LogLevel.DEBUG, console.debug, ...args); }
    info(...args: any[]) { this.log(LogLevel.INFO, console.info, ...args); }
    warn(...args: any[]) { this.log(LogLevel.WARN, console.warn, ...args); }
    error(...args: any[]) { this.log(LogLevel.ERROR, console.error, ...args); }
    trace(...args: any[]) { this.log(LogLevel.TRACE, console.error, ...args); }

    private log(level: LogLevel, consoleMethod: (...args: any[]) => void, ...args: any[]) {
        const caller = this.getCallerInfo();
        if (level >= this.consoleLogLevel) {
            const prefix = this.logCallerInfo && caller !== 'unknown'
                         ? `[${this.getLogLevelName(level)}] [${caller}]`
                         : `[${this.getLogLevelName(level)}]`;
            consoleMethod(prefix, ...args);
        }
        if (this.fileLoggingEnabled && level >= this.fileLogLevel) {
            this.queueOrWriteToFile(level, caller, args);
        }
    }

    private queueOrWriteToFile(level: LogLevel, caller: string, args: any[]) { /* ... (код як раніше) ... */ }
    private triggerWriteToFile() { /* ... (код як раніше) ... */ }
    private async rotateLogFileIfNeeded() { /* ... (код як раніше) ... */ }

} // Кінець класу Logger