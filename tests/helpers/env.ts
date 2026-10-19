// Imported first by tests that need deterministic env (ES module imports run before test code).
process.env.NEXT_PUBLIC_APP_URL = "https://ringriot.example";
process.env.DEMO_COOKIE_SECRET = "test-secret";
delete process.env.ELEVENLABS_API_KEY; // Polly <Say> path, so spoken text is visible in TwiML
export {};
