import { browser } from 'k6/browser';
import http from 'k6/http';
import { sleep, check } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

/**
 * ============================================================================
 * DYNAMIC CONFIGURATION LOADING
 * ============================================================================
 * Loads the test profiles (smoke, load, etc.) from the external JSON config file.
 * We can toggle profiles by passing the environment variable:
 *   k6 run -e TEST_TYPE=load cloudTest.js
 * Or for cloud execution:
 *   k6 cloud -e TEST_TYPE=load cloudTest.js
 */
const configsObj = JSON.parse(open('../test-configs.json'));

function getTestConfig() {
    // Default to 'smoke' profile if no TEST_TYPE environment variable is provided
    const testType = __ENV.TEST_TYPE || 'smoke';
    const config = configsObj[testType];
    
    if (!config) {
        throw new Error(`Test configuration profile '${testType}' not found in test-configs.json`);
    }
    return config;
}

const activeConfig = getTestConfig();

// Custom metrics to track specific backend operations and performance SLA/SLOs
const backendLatencyTrend = new Trend('custom_backend_latency_ms');
const userRegistrationCounter = new Counter('custom_user_registrations_total');
const pizzaRatingCounter = new Counter('custom_pizza_ratings_total');
const loginSuccessRate = new Rate('custom_login_success_rate');
const registrationTrend = new Trend('custom_registration_duration_ms');
const ratingTrend = new Trend('custom_rating_duration_ms');

// Helper function to generate unique dynamic usernames across VUs and Iterations
function generateDynamicUsername() {
    const uniqueId = Math.floor(Math.random() * 1000000);
    return `user_${__VU}_${__ITER}_${uniqueId}@example.com`;
}

export const options = {
    insecureSkipTLSVerify: true,

    // Cloud Execution Options
    cloud: {
        // Project ID on Grafana Cloud
        projectID: 7765585,
        // Test runs with the same name group test runs together.
        name: 'Test (08/06/2026-14:45:04)'
    },

    // Dynamically loaded configuration metrics and test scenarios
    thresholds: activeConfig.thresholds,
    scenarios: activeConfig.scenarios,
};

/**
 * ============================================================================
 * Scenario 1: UI Browser Automation Test
 * ============================================================================
 */
export async function browserTest() {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log('[UI Cloud Test] Navigating to rahulshettyacademy practice locators...');
        await page.goto("https://rahulshettyacademy.com/locatorspractice/");

        // Assertion: Verify input field loaded successfully
        check(page, {
            'UI: Login page loaded': (p) => p.locator('#inputUsername').isVisible(),
        });

        // Type username 'rahul'
        await page.locator("#inputUsername").type("rahul");

        // Type password 'rahulshettyacademy'
        console.log('[UI Cloud Test] Entering password...');
        await page.locator("input[placeholder='Password']").type("rahulshettyacademy");

        // Click submit button
        console.log('[UI Cloud Test] Clicking Submit...');
        await page.locator("button[type='submit']").click();

        // Wait to process
        await page.waitForTimeout(2000);
        console.log('[UI Cloud Test] Page transition checked.');

        // Assertion: Verify redirect or error block
        check(page, {
            'UI: Login form processed': (p) => p.locator('p.error').isVisible() || p.url().includes('dashboard'),
        });

    } catch (err) {
        console.error(`[UI Cloud Test ERROR] Browser execution failed: ${err.message}`);
    } finally {
        await page.close();
        await context.close();
    }
}

/**
 * ============================================================================
 * Scenario 2: Backend API HTTP Load Test
 * ============================================================================
 * Implements a complete API flow: User Registration -> User Login -> Create
 * Rating (authenticated) -> Retrieve Rating Details (authenticated).
 */
export function backEndStress() {
    const BASE_URL = 'https://quickpizza.grafana.com';
    const PASSWORD = 'Password123!';
    const username = generateDynamicUsername();
    let authToken = '';
    let ratingId = '';

    console.log(`[Backend API Scenario] Starting flow for user: ${username}`);

    // 1. User Registration
    {
        const url = `${BASE_URL}/api/users`;
        const payload = JSON.stringify({
            username: username,
            password: PASSWORD,
        });
        const params = {
            headers: { 'Content-Type': 'application/json' },
        };

        const res = http.post(url, payload, params);

        registrationTrend.add(res.timings.duration);
        backendLatencyTrend.add(res.timings.duration);

        const isRegistered = res.status === 200 || res.status === 201;
        check(res, {
            'BE: Registration status is 200 or 201': (r) => r.status === 200 || r.status === 201,
        });

        if (isRegistered) {
            userRegistrationCounter.add(1);
        } else {
            console.error(`[Backend API] Registration failed for ${username}: ${res.body}`);
        }
    }

    // 2. User Login
    {
        const url = `${BASE_URL}/api/users/token/login`;
        const payload = JSON.stringify({
            username: username,
            password: PASSWORD,
        });
        const params = {
            headers: { 'Content-Type': 'application/json' },
        };

        const res = http.post(url, payload, params);
        backendLatencyTrend.add(res.timings.duration);

        const isLoginOk = res.status === 200;
        loginSuccessRate.add(isLoginOk);

        const isLoginSuccessful = check(res, {
            'BE: Login status is 200': (r) => r.status === 200,
            'BE: Login response has token': (r) => r.json().token !== undefined,
        });

        if (isLoginSuccessful) {
            authToken = res.json().token;
        } else {
            console.error(`[Backend API] Login failed for ${username}: ${res.body}`);
        }
    }

    // 3. Create Pizza Rating (Authenticated)
    if (authToken) {
        const url = `${BASE_URL}/api/ratings`;
        const payload = JSON.stringify({
            stars: 5,
            pizza_id: 1,
        });
        const params = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${authToken}`,
            },
        };

        const res = http.post(url, payload, params);
        ratingTrend.add(res.timings.duration);
        backendLatencyTrend.add(res.timings.duration);

        const isRatingSuccessful = check(res, {
            'BE: Rating status is 201': (r) => r.status === 201,
            'BE: Rating response has id': (r) => r.json().id !== undefined,
        });

        if (isRatingSuccessful) {
            ratingId = res.json().id;
            pizzaRatingCounter.add(1);
        } else {
            console.error(`[Backend API] Rating creation failed: ${res.body}`);
        }
    }

    // 4. Retrieve Pizza Rating Details (Authenticated)
    if (ratingId && authToken) {
        const url = `${BASE_URL}/api/ratings/${ratingId}`;
        const params = {
            headers: {
                'Authorization': `Token ${authToken}`,
            },
        };

        const res = http.get(url, params);
        backendLatencyTrend.add(res.timings.duration);

        check(res, {
            'BE: Get rating status is 200': (r) => r.status === 200,
            'BE: Retrieved rating ID matches': (r) => r.json().id === ratingId,
        });
    }

    // Pacing/Think Time
    sleep(1);
}
