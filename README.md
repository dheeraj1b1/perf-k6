# Learning k6 Performance Testing 🚀

A structured workspace for learning, building, and running performance tests using **Grafana k6** (both local and cloud execution).

---

## 📁 Project Structure

The repository has been organized to keep scripts, configurations, and specifications clean:

```
├── .vscode/                 # Workspace-specific VS Code settings
├── specs/                   
│   └── openapi.yaml         # API specification for the target application
├── tests/
│   ├── browserTest.js       # Local UI load test using k6 browser (Chromium)
│   ├── cloudTest.js         # Grafana Cloud execution test with dynamic configs
│   ├── e2e.js               # End-to-end API scenario (user registration, login, rating)
│   ├── e2e1.js              # Additional end-to-end API scenario
│   ├── test1.js             # General k6 playground test script
│   └── test2.js             # Playground k6 script
├── .gitignore               # Ignored dependencies (node_modules/)
├── notes.txt                # Reference metrics and execution results
├── package.json             # NPM package definition
├── README.md                # Project documentation
└── test-configs.json        # Test load profiles (smoke, load scenarios, VUs, thresholds)
```

---

## ⚡ Running Tests

You can run the scripts in this project using the **k6 CLI**. 

### 1. Run Local API Tests
To run an API-based load test script locally:
```bash
k6 run tests/e2e.js
```

### 2. Run Local Browser (UI) Tests
To run a frontend performance test simulating a real browser:
```bash
k6 run tests/browserTest.js
```

### 3. Run with Specific Config Profiles (Smoke/Load)
To run using configuration settings and custom execution variables defined in `test-configs.json`:
```bash
# Run with 'smoke' profile (default)
k6 run -e TEST_TYPE=smoke tests/cloudTest.js

# Run with 'load' profile
k6 run -e TEST_TYPE=load tests/cloudTest.js
```

### 4. Run Cloud Tests
To run the test scripts on Grafana Cloud (requires a Grafana Cloud account and login via `k6 login`):
```bash
k6 cloud -e TEST_TYPE=load tests/cloudTest.js
```
