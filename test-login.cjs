const axios = require("axios");
require("dotenv").config();

const API_BASE = process.env.API_BASE || "http://localhost:3000";
const USERNAME = process.env.TEST_USERNAME || "admin";
const PASSWORD = process.env.TEST_PASSWORD || "Admin@123";

async function testLogin() {
  console.log("Testing login endpoint...");
  console.log(`API: ${API_BASE}/auth/login`);
  console.log(`Username: ${USERNAME}\n`);

  try {
    const response = await axios.post(`${API_BASE}/auth/login`, {
      username: USERNAME,
      password: PASSWORD,
    });

    console.log("✅ Login successful!\n");
    console.log("Response:");
    console.log(`  Message: ${response.data.message}`);
    console.log(`  Token: ${response.data.token.substring(0, 20)}...`);
    console.log(`  User: ${response.data.user.name} (${response.data.user.role})`);
    console.log(`  Username: ${response.data.user.username}`);
    console.log(`  Email: ${response.data.user.email}`);
  } catch (err) {
    console.log("❌ Login failed!\n");
    if (err.response) {
      console.log(`Status: ${err.response.status}`);
      console.log(`Error: ${JSON.stringify(err.response.data)}`);
    } else if (err.code === "ECONNREFUSED") {
      console.log("Error: Cannot connect to server. Make sure server is running on port 3000.");
    } else {
      console.log(`Error: ${err.message}`);
    }
  }
}

testLogin();
