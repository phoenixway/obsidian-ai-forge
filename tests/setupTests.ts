// tests/setupTests.ts

Object.defineProperty(global.HTMLElement.prototype, 'createDiv', {
    value: function(options?: string | { cls?: string | string[], text?: string, attr?: Record<string, string>, title?: string }) {
        const div = document.createElement('div');

        if (typeof options === 'string') {
            // If options is just a string, treat it as class(es)
            // Split by space and add each class individually
            options.split(' ').forEach(cls => {
                if (cls) div.classList.add(cls); // Add check for empty strings from multiple spaces
            });
        }
        else if (options) {
             // Handle object options
             if (options.cls) {
                if (Array.isArray(options.cls)) {
                    // If cls is an array, add all classes
                    div.classList.add(...options.cls);
                } else if (typeof options.cls === 'string') {
                    // *** FIX HERE ***
                    // If cls is a string, split by space and add each class individually
                    options.cls.split(' ').forEach(cls => {
                        if (cls) div.classList.add(cls); // Add check for empty strings
                    });
                }
            }
            // Text content
            if (options.text) {
                div.textContent = options.text;
            }
            // Attributes
            if (options.attr) {
                for (const key in options.attr) {
                    div.setAttribute(key, options.attr[key]);
                }
            }
            // Title
            if (options.title) {
                div.title = options.title;
            }
        }

        this.appendChild(div);
        return div;
    },
    writable: true,
    configurable: true
});

// === IMPORTANT ===
// If you also mocked .createEl() or other similar helpers,
// make sure to apply the same fix

// *** ADD MOCK FOR createSpan ***
Object.defineProperty(global.HTMLElement.prototype, 'createSpan', {
    value: function(options?: string | { cls?: string | string[], text?: string, attr?: Record<string, string>, title?: string }) {
        // Create a SPAN element instead of a DIV
        const span = document.createElement('span');

        // Apply options (logic is identical to createDiv)
        if (typeof options === 'string') {
            options.split(' ').forEach(cls => { if (cls) span.classList.add(cls); });
        } else if (options) {
             if (options.cls) {
                if (Array.isArray(options.cls)) {
                    span.classList.add(...options.cls);
                } else if (typeof options.cls === 'string') {
                    options.cls.split(' ').forEach(cls => { if (cls) span.classList.add(cls); });
                }
            }
            if (options.text) {
                span.textContent = options.text;
            }
            if (options.attr) {
                for (const key in options.attr) {
                    span.setAttribute(key, options.attr[key]);
                }
            }
            if (options.title) {
                span.title = options.title;
            }
        }

        this.appendChild(span); // Append the new span
        return span; // Return the created span
    },
    writable: true,
    configurable: true
});

// Remember: Add mocks for any other Obsidian helpers like
// createEl, setText, etc., if your component uses them.