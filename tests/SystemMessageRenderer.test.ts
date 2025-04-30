// // tests/SystemMessageRenderer.test.ts
// import { App } from "obsidian"; // You can keep this import for type usage in your test file if needed
// import { Message } from "@/types";
// // ---- START MOCK ----
// // Mock the 'obsidian' module and provide dummy implementations
// // for the functions/classes your component uses.
// jest.mock(
//   "obsidian",
//   () => ({
//     // Mock App - adjust if your code needs specific App properties/methods
//     App: jest.fn().mockImplementation(() => ({
//       // Example: if your code uses app.vault...
//       // vault: {
//       //   // Mock vault properties/methods needed
//       // },
//     })),
//     // Mock setIcon as a Jest mock function
//     setIcon: jest.fn(),
//     // Add mocks for any other obsidian exports if SystemMessageRenderer uses them
//     // e.g., Notice: jest.fn(), ...
//   }),
//   { virtual: true }
// ); // virtual: true is often needed for modules like 'obsidian'
// // ---- END MOCK ----

// // Now import the component you are testing *after* the mock is defined
// import { SystemMessageRenderer } from "@/renderers/SystemMessageRenderer";
// a
// // --- Your existing test code ---
// describe("SystemMessageRenderer", () => {
//   const mockApp = {} as App; // Note: Your mockApp might need adjustment based on how it's used now
//   // Your mockFormatter setup might also need review depending on usage
//   const mockFormatter = { formatTime: jest.fn(() => "12:00 PM") };
//   // Додайте ': Message' тут:
//   const mockMessage: Message = {
//     role: "system", // Тепер TypeScript перевірить 'system' на відповідність типу MessageRole
//     content: "Test system message",
//     timestamp: new Date(),
//   };

//   it("should render a system message", () => {
//     const renderer = new SystemMessageRenderer(mockApp, mockMessage, mockFormatter, null);
//     const element = renderer.render();

//     expect(element).toBeInstanceOf(HTMLElement);
//     expect(element.querySelector(".system-message-text")?.textContent).toBe("Test system message");
//     // If SystemMessageRenderer calls setIcon, you could potentially add:
//     // expect(require('obsidian').setIcon).toHaveBeenCalled();
//   });
// });
