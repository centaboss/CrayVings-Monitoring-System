const http = require("http");

const API_BASE = process.env.API_BASE || "http://localhost:3000";

function testLogin(username, password) {
  const data = JSON.stringify({ username, password });

  const options = {
    hostname: new URL(API_BASE).hostname,
    port: new URL(API_BASE).port,
    path: "/auth/login",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
    },
  };

  const req = http.request(options, (res) => {
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => {
      const response = JSON.parse(body);
      if (res.statusCode === 200) {
        console.log(`✅ Login successful!`);
        console.log(`   User: ${response.user.name} (${response.user.role})`);
        console.log(`   Token: ${response.token.substring(0, 16)}...`);
      } else {
        console.log(`❌ Login failed (HTTP ${res.statusCode})`);
        console.log(`   Error: ${response.message}`);
      }
    });
  });

  req.on("error", (err) => {
    console.log(`❌ Connection failed: ${err.message}`);
    console.log(`   Make sure the server is running on ${API_BASE}`);
  });

  req.write(data);
  req.end();
}

console.log("Testing admin login...\n");
testLogin("admin", "Admin@123");
