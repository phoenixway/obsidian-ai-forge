// Добавьте этот файл в ваш проект как stateManager.ts

export interface AssistantState {
    currentPhase: "next goal choosing" | "specific goal realization" | "day management";
    currentGoal: string;
    userActivity: string;
    hasUrgentTasks: boolean | "unknown";
    urgentTasksList: string[];
    currentUrgentTask: string | null;
    planExists: boolean | "unknown";
    lastUpdateTime: Date;
}

export class StateManager {
    private state: AssistantState;
    private static instance: StateManager;

    private constructor() {
        this.state = {
            currentPhase: "next goal choosing",
            currentGoal: "Identify if there are any urgent tasks",
            userActivity: "talking with AI",
            hasUrgentTasks: "unknown",
            urgentTasksList: [],
            currentUrgentTask: null,
            planExists: "unknown",
            lastUpdateTime: new Date()
        };
    }

    // Singleton паттерн для доступа к состоянию
    public static getInstance(): StateManager {
        if (!StateManager.instance) {
            StateManager.instance = new StateManager();
        }
        return StateManager.instance;
    }

    // Получить текущее состояние
    public getState(): AssistantState {
        // Обновляем время перед возвратом
        this.state.lastUpdateTime = new Date();
        return { ...this.state };
    }

    // Обновить состояние
    public updateState(newState: Partial<AssistantState>): void {
        this.state = {
            ...this.state,
            ...newState,
            lastUpdateTime: new Date()
        };
    }

    // Добавление задачи в список срочных задач
    public addUrgentTask(task: string): void {
        if (!this.state.urgentTasksList.includes(task)) {
            this.state.urgentTasksList.push(task);

            // Если нет текущей задачи, устанавливаем первую из списка
            if (!this.state.currentUrgentTask && this.state.urgentTasksList.length > 0) {
                this.state.currentUrgentTask = this.state.urgentTasksList[0];
            }

            this.state.hasUrgentTasks = true;
        }
    }

    // Удаление задачи из списка и обновление текущей задачи
    public completeUrgentTask(task: string): void {
        const index = this.state.urgentTasksList.indexOf(task);
        if (index !== -1) {
            this.state.urgentTasksList.splice(index, 1);

            // Если список не пуст, обновляем текущую задачу
            if (this.state.urgentTasksList.length > 0) {
                this.state.currentUrgentTask = this.state.urgentTasksList[0];
            } else {
                this.state.currentUrgentTask = null;
                this.state.hasUrgentTasks = false;
            }
        }
    }

    // Получить состояние в формате для вставки в сообщение
    public getStateFormatted(): string {
        const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return `- **[day phase]** ${this.state.currentPhase}
  - **[next goal]** ${this.state.currentGoal}
  - **[user activity]** ${this.state.userActivity}
  - **[AI time]** ${currentTime}`;
    }

    // Анализ сообщения пользователя для обновления состояния
    public processUserMessage(message: string): void {

    }


    // Сохранение состояния в локальное хранилище
    public saveStateToStorage(): void {
        localStorage.setItem('assistantState', JSON.stringify(this.state));
    }

    // Загрузка состояния из локального хранилища
    public loadStateFromStorage(): boolean {
        const savedState = localStorage.getItem('assistantState');
        if (savedState) {
            try {
                const parsedState = JSON.parse(savedState);
                // Восстанавливаем дату
                parsedState.lastUpdateTime = new Date(parsedState.lastUpdateTime);
                this.state = parsedState;
                return true;
            } catch (e) {
                console.error('Error parsing saved state:', e);
            }
        }
        return false;
    }
}