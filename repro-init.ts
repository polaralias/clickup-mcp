import axios from 'axios';

async function test() {
    try {
        const res = await axios.post('http://localhost:3000/mcp', {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: "2025-03-26",
                capabilities: {},
                clientInfo: { name: "TestClient", version: "1.0.0" }
            }
        }, {
            headers: {
                'Accept': 'application/json, text/event-stream'
            }
        });
        console.log('Response Status:', res.status);
        console.log('Response Headers:', res.headers);
        console.log('Response Body:', JSON.stringify(res.data, null, 2));
    } catch (e: any) {
        if (e.response) {
            console.log('Error status:', e.response.status);
            console.log('Error body:', e.response.data);
        } else {
            console.error('Error:', e.message);
        }
    }
}

test();
