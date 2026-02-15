/*
 * tests/mocks/shellMocks.js
 * Basic mocks for GNOME Shell environment
 */

// Mock GLib/Gio if not running in GJS (for local Node.js testing if needed)
// But since we use jasmine-gjs, we already have access to real GI

// Mock for resource:/// imports
// Note: This is more complex in a real environment, but for unit testing
// the business logic in lib/, we can mostly rely on real GI.
