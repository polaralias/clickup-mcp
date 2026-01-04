
const REDIRECT_URI_ALLOWLIST = "https://chatgpt.com/,https://chat.openai.com/,https://clickup-mcp.polaralias.com/,http://localhost:3000/callback,http://localhost:3011/callback";
const REDIRECT_URI_ALLOWLIST_MODE = "prefix";

const validate = (uri, client_name, path, ip) => {
    const allowlist = (REDIRECT_URI_ALLOWLIST || "").split(",").map(s => s.trim()).filter(s => s.length > 0);
    const mode = REDIRECT_URI_ALLOWLIST_MODE === "prefix" ? "prefix" : "exact";

    let allowed = false;
    if (mode === "exact") {
        allowed = allowlist.includes(uri);
    } else {
        allowed = allowlist.some(allowedUri => uri.startsWith(allowedUri));
    }

    if (!allowed) {
        console.warn(`[OAuth Rejection] Redirect URI not in allowlist: uri=${uri}, client_name=${client_name}, ip=${ip}, path=${path}`);
        return { error: "invalid_redirect_uri", error_description: "This client isn't in the redirect allow list - raise an issue on GitHub for it to be added" };
    }
    return { success: true };
};

// Test 1: Valid prefix (ChatGPT)
console.log("Test 1: ChatGPT prefix");
console.log(validate("https://chatgpt.com/g/g-somebot/callback", "ChatGPT", "/register", "127.0.0.1"));

// Test 2: Invalid domain
console.log("\nTest 2: Invalid domain");
console.log(validate("https://attacker.com/callback", "Malicious", "/register", "192.168.1.1"));

// Test 3: Localhost exact/prefix
console.log("\nTest 3: Localhost prefix");
console.log(validate("http://localhost:3011/callback?code=123", "Local Dev", "/register", "::1"));

// Test 4: OpenAI
console.log("\nTest 4: OpenAI prefix");
console.log(validate("https://chat.openai.com/a/b/c", "ChatGPT", "/register", "1.2.3.4"));
