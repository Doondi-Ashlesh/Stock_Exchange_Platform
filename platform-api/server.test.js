const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const { createServer } = require("./server");

test("platform API persists auth sessions and paper workspaces", async (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atlasmarket-platform-api-"));
    const dataFile = path.join(tempDir, "store.json");
    const server = createServer({ dataFile });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));

    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    let response = await fetch(`${baseUrl}/v1/auth/register`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            email: "trader@example.com",
            password: "StrongPass123",
            name: "Atlas Trader",
            timezone: "America/New_York"
        })
    });

    assert.equal(response.status, 201);
    const registration = await response.json();
    assert.ok(registration.token);
    assert.equal(registration.user.email, "trader@example.com");

    response = await fetch(`${baseUrl}/v1/workspaces/paper`);
    assert.equal(response.status, 401);

    response = await fetch(`${baseUrl}/v1/auth/me`, {
        headers: {
            Authorization: `Bearer ${registration.token}`
        }
    });

    assert.equal(response.status, 200);
    const me = await response.json();
    assert.equal(me.authenticated, true);
    assert.equal(me.user.displayName, "Atlas Trader");

    const workspace = {
        cashBalance: 125000,
        watchlistSymbols: ["NVDA", "MSFT"],
        notes: "Server-backed paper workspace"
    };

    response = await fetch(`${baseUrl}/v1/workspaces/paper`, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${registration.token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ workspace })
    });

    assert.equal(response.status, 200);
    const savedWorkspace = await response.json();
    assert.deepEqual(savedWorkspace.workspace, workspace);

    response = await fetch(`${baseUrl}/v1/workspaces/paper`, {
        headers: {
            Authorization: `Bearer ${registration.token}`
        }
    });

    assert.equal(response.status, 200);
    const loadedWorkspace = await response.json();
    assert.deepEqual(loadedWorkspace.workspace, workspace);

    response = await fetch(`${baseUrl}/v1/auth/logout`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${registration.token}`
        }
    });

    assert.equal(response.status, 200);

    response = await fetch(`${baseUrl}/v1/auth/me`, {
        headers: {
            Authorization: `Bearer ${registration.token}`
        }
    });

    const afterLogout = await response.json();
    assert.equal(afterLogout.authenticated, false);

    const stored = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    assert.equal(stored.users.length, 1);
    assert.equal(stored.sessions.length, 0);
    assert.equal(stored.workspaces.length, 1);
    assert.equal(stored.workspaces[0].workspace.cashBalance, 125000);
});
