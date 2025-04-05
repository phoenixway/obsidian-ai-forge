# Obsidian Ollama Personas: Your Private AI Team in Your Vault

**Tired of cloud AI with its limitations and privacy concerns? This is the Obsidian plugin repository that integrates the power of private AI with your knowledge and notes, transforming Obsidian into a versatile knowledge powerhouse.**

Obsidian Ollama Personas is more than just a client for local language models. It's your studio and laboratory for easily and powerfully creating, managing, and utilizing multifunctional AI personas.

**Expand Your Horizons:**

* Create and simultaneously engage in dozens of **interactive stories**, where each character (AI role) has its own distinct voice and personality.
* Brainstorm ideas with virtual colleagues tailored for specific domains.
* Write and edit texts with an AI assistant fine-tuned to your desired style.
* Quickly summarize long notes or articles.
* Get answers to questions based on information from **your own notes** (RAG).
* Simulate dialogues for learning or exploring topics from different perspectives.
* Use it for any other classic language model tasks, but within the familiar environment of Obsidian!

## Features

* 💾 **100% Private & Local:** Local processing means your data stays with you. Your prompts and conversations never leave your machine or local network*.
* 💻📱 **Accessible on All Devices:** Run Ollama on one PC (or server) and interact with your AI via Obsidian on any other device – laptop or phone – through your local network.
* ♾️ **No Limits:** No message caps or context window restrictions beyond what your own hardware can handle. And no censorship, if you use appropriate uncensored models.
* 🎭 **Personalized:** Create and manage a unique **collection of personalized AI personas** using simple Markdown files. Build your team of experts, characters, or assistants!
* 💡 **Integrated with Your Notes:** "Connect" your AI personas directly to your notes for deep context, processing, and retrieval (RAG).
* 💬 **Integrated Chat UI:** A convenient and functional chat interface directly within Obsidian – AI is always at your fingertips.
* ✨ **Seamless & Convenient:** Enjoy a smooth experience with Markdown rendering, easy code/message copying, AI thinking indicators, and more.
* 🎤 **Voice Input (Speak, Don't Type):** Dictate your prompts using your voice (Requires Google STT API Key).
* 🌐 **On-the-Fly Translation:** Instantly translate messages or input field text to English or another chosen language (Requires Google Translate API Key).
* 💰 **Free & Open Source:** Completely free to use and modify under the MIT License.

## Work in Progress

**Enhanced Features for Decision Support and Goal Achievement (Future Roadmap):**

* Intelligent, context-aware note search.
* Task automation and workflow streamlining.
* Content generation and structured organization.
* Deep integration with the Obsidian API.
* **📊 Priority Intelligence:**
    * Advanced analysis of tasks and goals based on customizable criteria (urgency, importance, impact).
    * Automated prioritization of daily, weekly, and monthly tasks.
    * Dynamic priority adjustments based on real-time events.
* **🎯 Goal Decomposition and Planning:**
    * Assistance in breaking down large goals into actionable steps.
    * Creation of detailed action plans with deadlines and milestones.
    * Visual representation of goal progression.
* **📈 Progress Tracking and Motivation:**
    * Visual progress tracking through interactive charts and graphs.
    * Personalized motivational messages and reminders.
    * Time-tracking analysis to optimize goal-oriented activities.
* **⏰ Contextual Reminders:**
    * Location-aware reminders for tasks and goals.
    * Smart reminders triggered by specific events or keywords.
    * Periodic reviews and adjustments of current goals.
* **🧘 Focus Mode and Priority Enforcement:**
    * Distraction-free environment for high-priority tasks.
    * Alerts for deviations from planned priorities.
    * Functionality to temporarily block non-priority applications.
* **🗂️ Goal Repository and Refinement:**
    * Centralized goal database with editing and refinement capabilities.
    * Regular goal review and updating based on changing circumstances.
    * Goal versioning to track the evolution of objectives.
* **🛑 "Stop" Functionality:**
    * Quick interruption of non-priority activities.
    * Analysis of tasks that deviate from core objectives.
    * Functionality to register why the user stopped the activity.
* **📄 Personalized Productivity Reports:**
    * Customized reports on productivity and goal achievement.
    * Time allocation analysis and identification of time-wasting habits.
    * Reports showcasing the progression of each goal.
* **🤔 Decision Support:**
    * Analysis of pros and cons for various decision options.
    * Providing information that is relevant to the decision that has to be made.
    * Functionality to save the decision that was made and the reasoning behind that decision.

These upcoming features aim to position your assistant as an even more powerful tool for users seeking to optimize productivity and achieve their goals within Obsidian.

## ⬇️ Installation

1.  **Prerequisites:** Ensure you have [Ollama](https://ollama.com/) installed and running on your machine or accessible on your network. Download the models you want to use (e.g., `ollama run llama3`).
2.  **Download:** Download the latest release (`main.js`, `manifest.json`, `styles.css`) from the [Releases](https://github.com/phoenixway/obsidian-ollama-personas/releases) page of this repository. *(Note: Updated repo name)*
3.  **Install:** Create a new folder named `obsidian-ollama-personas` inside your vault's plugin folder (`YourVault/.obsidian/plugins/`). Place the downloaded `main.js`, `manifest.json`, and `styles.css` files into this new folder.
4.  **Enable:** Restart Obsidian, go to `Settings` → `Community plugins`, find "Obsidian Ollama Personas" in the list of installed plugins, and toggle it on.

## 🚀 Usage

1.  **Configure:** Go to plugin settings (`Settings` → `Ollama Personas`) and set your Ollama Server URL (e.g., `http://localhost:11434` if running locally). Select a default model. Configure API keys if using voice or translation. Set up paths for history and roles.
2.  **Open Chat:** Use the command palette (`Ctrl+P` or `Cmd+P`) and search for "Ollama Personas: Open Chat" (or the ribbon icon).
3.  **Interact:** Type your message, use the menu to switch models/roles/chats, or use voice/translation buttons.
4.  **Create Personas:** Create `.md` files in the folder specified in the settings. The file content will be used as the system prompt when that role is selected.

## ⚙️ Configuration

Access the plugin settings via **Settings → Community Plugins → Ollama Personas → Options (cog icon)** or via **Settings → Ollama Personas** (usually appears at the bottom of the left sidebar in settings).

Here you can configure:

* Ollama Server URL
* Default Model & Parameters (Temperature, Context Window)
* Paths for Chat History, Roles, RAG documents, and Exports
* Avatar Appearance
* Enable/Configure Voice Input & Translation (API Keys, Language)
* Advanced Context & Summarization settings
* And more...

## 🤝 Support & Contribution

* **Questions & Ideas:** Create an [Issue](https://github.com/phoenixway/obsidian-ollama-personas/issues) or join the [Discussions](https://github.com/phoenixway/obsidian-ollama-personas/discussions). *(Note: Updated repo name)*
* **Contributions:** Pull requests are welcome! Please discuss significant changes in an issue first.

## 📜 License

This project is licensed under the [MIT License](LICENSE).

---

✍️ Author: [Roman Kozak (Pylypchuk)](https://github.com/phoenixway)

---
*\* Optional features like voice input and translation rely on external Google Cloud APIs and require separate API keys. Your interactions with these specific services are subject to Google's terms and privacy policy.*