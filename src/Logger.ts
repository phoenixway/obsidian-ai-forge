// src/Logger.ts
import { DataAdapter, normalizePath, Plugin } from 'obsidian';

// Рівні логування
export enum LogLevel {
    DEBUG = 1,
    INFO = 2,
    WARN = 3,
    ERROR = 4,
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
    private logCallerInfo: boolean = false; // <--- Прапорець для опції
    private logFileMaxSizeMB: number = 5;
    private plugin: Plugin;
    private logQueue: string[] = []; // Буфер для запису у файл
    private isWritingToFile: boolean = false;
    private writeDebounceTimeout: NodeJS.Timeout | null = null;


    constructor(plugin: Plugin, initialSettings: LoggerSettings) {
        this.plugin = plugin;
        this.adapter = plugin.app.vault.adapter;
        this.logFilePath = normalizePath(initialSettings.logFilePath || `${this.plugin.manifest.dir}/ai-forge.log`); // Використовуємо ID плагіна для шляху
        this.logFileMaxSizeMB = initialSettings.logFileMaxSizeMB || 5;

        this.updateSettings(initialSettings); // Встановлюємо всі початкові налаштування

        console.log(`[Logger] Initialized. Console Level: ${this.getLogLevelName(this.consoleLogLevel)}, File Logging: ${this.fileLoggingEnabled}, File Level: ${this.getLogLevelName(this.fileLogLevel)}, Log Caller: ${this.logCallerInfo}, Path: ${this.logFilePath}`);

        if (this.fileLoggingEnabled) {
            this.rotateLogFileIfNeeded().then(() => {
                this.info('Logger initialized & file rotation checked.'); // Логуємо після потенційної ротації
            });
        } else {
             this.info('Logger initialized.');
        }
    }

    private getLogLevelName(level: LogLevel): string {
        return LogLevel[level] || 'UNKNOWN';
    }

    private getLogLevelFromString(levelString: string | undefined, defaultLevel: LogLevel = LogLevel.INFO): LogLevel {
        switch (levelString?.toUpperCase()) {
            case 'DEBUG': return LogLevel.DEBUG;
            case 'INFO': return LogLevel.INFO;
            case 'WARN': return LogLevel.WARN;
            case 'ERROR': return LogLevel.ERROR;
            case 'NONE': return LogLevel.NONE;
            default: return defaultLevel;
        }
    }

    // --- Оновлення Налаштувань ---
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
             // Перевіряємо ротацію, якщо логування щойно увімкнули
             if (!wasEnabled && this.fileLoggingEnabled) {
                this.rotateLogFileIfNeeded();
            }
        }
         if (settings.logCallerInfo !== undefined) { // <--- Оновлюємо прапорець
             this.logCallerInfo = settings.logCallerInfo;
             console.log(`[Logger] Log Caller Info enabled: ${this.logCallerInfo}`);
         }
        // Можна додати оновлення logFilePath та logFileMaxSizeMB, якщо потрібно
    }

    // --- Отримання Інформації про Викликаючого ---
    /**
     * Намагається визначити ім'я/контекст функції, що викликала метод логера.
     * УВАГА: Має вплив на продуктивність! Використовуйте обережно.
     */
    private getCallerInfo(): string {
        // Повертаємо 'unknown' якщо опція вимкнена
        if (!this.logCallerInfo) {
            return 'unknown';
        }
        try {
            const err = new Error();
            const stackLines = err.stack?.split('\n');
            if (stackLines && stackLines.length > 3) {
                const callerLine = stackLines[3];
                const match = callerLine.match(/at (?:new )?([\w$.<>\[\] ]+)?(?: \[as \w+\])? ?\(?/);
                let callerName = match?.[1]?.trim();
                if (callerName) {
                    callerName = callerName.replace(/^Object\./, '');
                    callerName = callerName.replace(/<anonymous>/, 'anonymous');
                    if (callerName.includes('/') || callerName.includes('\\')) {
                         return '(file context)';
                    }
                    return callerName;
                }
            }
        } catch (e) { /* ignore */ }
        return 'unknown';
    }

    // --- Методи Логування ---
    debug(...args: any[]) { this.log(LogLevel.DEBUG, console.debug, ...args); }
    info(...args: any[]) { this.log(LogLevel.INFO, console.info, ...args); }
    warn(...args: any[]) { this.log(LogLevel.WARN, console.warn, ...args); }
    error(...args: any[]) { this.log(LogLevel.ERROR, console.error, ...args); }

    // --- Ядро Логування ---
    private log(level: LogLevel, consoleMethod: (...args: any[]) => void, ...args: any[]) {
        // Отримуємо інфо про викликаючого ТІЛЬКИ якщо опція увімкнена
        const caller = this.getCallerInfo(); // Поверне 'unknown', якщо вимкнено

        // Логування в консоль
        if (level >= this.consoleLogLevel) {
            const prefix = this.logCallerInfo && caller !== 'unknown'
                         ? `[${this.getLogLevelName(level)}] [${caller}]`
                         : `[${this.getLogLevelName(level)}]`; // Коротший префікс без caller
            consoleMethod(prefix, ...args);
        }

        // Логування у файл
        if (this.fileLoggingEnabled && level >= this.fileLogLevel) {
            this.queueOrWriteToFile(level, caller, args); // Передаємо caller
        }
    }

     // --- Робота з Файлом (з чергою/буфером) ---
    private queueOrWriteToFile(level: LogLevel, caller: string, args: any[]) {
        try {
            const timestamp = new Date().toISOString();
            const levelName = this.getLogLevelName(level);
            const message = args.map(arg => {
                if (typeof arg === 'string') return arg;
                if (arg instanceof Error) return arg.stack || arg.message;
                try { return JSON.stringify(arg); } catch { return String(arg); }
            }).join(' ');

            // Додаємо caller до рядка, якщо опція увімкнена
            const callerInfo = this.logCallerInfo && caller !== 'unknown' ? ` [${caller}]` : '';
            const logLine = `${timestamp} [${levelName}]${callerInfo} ${message}\n`;

            this.logQueue.push(logLine); // Додаємо в чергу

            // Якщо не пишемо і черга не порожня, запускаємо запис з debounce
            if (!this.isWritingToFile) {
                this.triggerWriteToFile();
            }
        } catch (error) {
            console.error('[Logger] Error formatting log line:', error);
        }
    }

     private triggerWriteToFile() {
        if (this.writeDebounceTimeout) {
            clearTimeout(this.writeDebounceTimeout);
        }
        // Записуємо не одразу, а через невеликий проміжок, щоб зібрати більше логів
        this.writeDebounceTimeout = setTimeout(async () => {
            if (this.isWritingToFile || this.logQueue.length === 0) {
                return; // Якщо вже пишемо або черга спорожніла
            }

            this.isWritingToFile = true;
            const linesToWrite = [...this.logQueue]; // Копіюємо чергу
            this.logQueue = []; // Очищуємо оригінальну чергу

            try {
                const contentToWrite = linesToWrite.join('');
                // console.log(`[Logger] Writing ${linesToWrite.length} lines to log file.`); // Debug log
                await this.adapter.append(this.logFilePath, contentToWrite);
            } catch (error) {
                console.error('[Logger] Failed to write batch to log file:', error);
                // Повернути логи назад в чергу? Або вимкнути логування?
                 this.logQueue.unshift(...linesToWrite); // Повертаємо назад на початок черги
                 // Можна додати лічильник помилок і вимикати логування після N помилок
            } finally {
                this.isWritingToFile = false;
                // Якщо за час запису щось додалося в чергу, плануємо наступний запис
                if (this.logQueue.length > 0) {
                    this.triggerWriteToFile();
                }
            }
        }, 500); // Затримка 500 мс перед записом (можна налаштувати)
    }


    private async rotateLogFileIfNeeded() {
        if (!this.fileLoggingEnabled) return;
        try {
            if (await this.adapter.exists(this.logFilePath)) {
                const stats = await this.adapter.stat(this.logFilePath);
                const maxSizeInBytes = (this.logFileMaxSizeMB || 5) * 1024 * 1024;
                if (stats && stats.type === 'file' && stats.size > maxSizeInBytes) {
                    const backupPath = this.logFilePath + '.bak';
                    console.log(`[Logger] Rotating log file (size ${stats.size} > ${maxSizeInBytes}). Backup: ${backupPath}`);
                    if (await this.adapter.exists(backupPath)) {
                        await this.adapter.remove(backupPath);
                    }
                    await this.adapter.rename(this.logFilePath, backupPath);
                }
            }
        } catch (error) {
            console.error('[Logger] Error rotating log file:', error);
        }
    }
} // Кінець класу Logger