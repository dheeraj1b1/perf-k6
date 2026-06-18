import { browser } from 'k6/browser';
import http from 'k6/http';
import { sleep, check } from 'k6';

/**
 * ============================================================================
 * LEARNING NOTE: K6 CONFIGURATION & SEGREGATION
 * ============================================================================
 * 
 * 1. Options:
 *    - thresholds: We specify performance expectations (SLAs). Here, we verify 
 *      backend request durations (p(95) < 500ms), failures (< 1%), and that 
 *      our functional assertions (checks) succeed (> 95%).
 *    - scenarios: We run two different workloads concurrently (simultaneously).
 *      - Scenario 'ui': Runs a real browser using Chromium in headed mode (headless: false).
 *        It runs 4 iterations total, shared among 2 VUs, with a timeout limit of 1 minute.
 *      - Scenario 'backEndStress': Runs standard HTTP protocol requests using 5 VUs
 *        continuously for 1 minute.
 * 
 * 2. Executors:
 *    - 'shared-iterations': Iterations are shared between all VUs; the scenario stops 
 *      once the total iteration count is reached.
 *    - 'constant-vus': A fixed number of VUs run as many iterations as possible for 
 *      the specified duration.
 */

export const options = {
    // 1. Thresholds (Pass/Fail criteria for the load test)
    thresholds: {
        'http_req_failed': ['rate<0.01'],    // Under 1% of API calls should fail
        'http_req_duration': ['p(95)<500'],  // 95% of API requests should finish under 500ms
        'checks': ['rate>0.95'],             // 95%+ of our checks/assertions should pass

        // Web Vitals Thresholds for Browser Performance
        'browser_web_vital_cls': ['p(95)<0.1'],     // Cumulative Layout Shift under 0.1
        'browser_web_vital_fcp': ['p(95)<1000'],    // First Contentful Paint under 1000ms
        'browser_web_vital_inp': ['p(95)<200'],     // Interaction to Next Paint under 200ms
        'browser_web_vital_lcp': ['p(95)<1500'],    // Largest Contentful Paint under 1500ms
        'browser_web_vital_ttfb': ['p(95)<500'],    // Time to First Byte under 500ms
    },

    // 2. Scenarios (Segregated workloads running in parallel)
    scenarios: {
        // UI Scenario using k6 browser
        ui: {
            executor: 'shared-iterations',
            exec: 'browserTest',            // Name of the function to execute for this scenario
            vus: 2,                         // 2 Virtual Users
            maxDuration: '1m',              // Limit test execution duration to 1 minute
            iterations: 4,                  // Total iterations across all VUs
            options: {
                browser: {
                    type: 'chromium',
                    headless: false,         // Run with visible browser window so you can watch execution
                },
            },
        },
        // Backend API Load Scenario
        backEndStress: {
            executor: 'constant-vus',
            exec: 'backEndStress',          // Name of the function to execute for this scenario
            vus: 5,                         // 5 VUs executing requests continuously
            duration: '1m',                 // Run backend load for exactly 1 minute
        },
    },
};

/**
 * ============================================================================
 * Scenario 1: UI Browser Automation Test
 * ============================================================================
 */
export async function browserTest() {
    // Initialize browser context and open a new page
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log('[UI Scenario] Navigating to rahulshettyacademy locators practice page...');
        await page.goto("https://rahulshettyacademy.com/locatorspractice/");

        // Assertion: Verify input field loaded successfully
        check(page, {
            'Login page loaded': (p) => p.locator('#inputUsername').isVisible(),
        });

        // Type username 'rahul'
        console.log('[UI Scenario] Filling username...');
        await page.locator("#inputUsername").type("rahul");

        // Type password 'rahulshettyacademy'
        console.log('[UI Scenario] Filling password...');
        // Note: 'rahulshettyacademy' will cause a login failure error on this site,
        // which is expected if simulating negative tests or matching specific criteria.
        await page.locator("input[placeholder='Password']").type("rahulshettyacademy");

        // Click submit button
        console.log('[UI Scenario] Attempting to submit form...');
        await page.locator("button[type='submit']").click();

        // Wait for 2 seconds to let the application respond/render
        await page.waitForTimeout(2000);
        console.log('[UI Scenario] Form submission finished.');

        // Assertion: Verify that form processing completed (either error visible or dashboard URL reached)
        check(page, {
            'Form submission processed': (p) => p.locator('p.error').isVisible() || p.url().includes('dashboard'),
        });

    } catch (err) {
        console.error(`[UI Scenario ERROR] Browser action failed: ${err.message}`);
    } finally {
        // Ensure browser page and context are closed to prevent memory leaks
        await page.close();
        await context.close();
    }
}

/**
 * ============================================================================
 * Scenario 2: Backend API HTTP Load Test
 * ============================================================================
 */
export function backEndStress() {
    console.log('[Backend Scenario] Sending GET request to Grafana Quick Pizza Homepage...');

    // HTTP GET call to the correct homepage endpoint
    const res = http.get("https://quickpizza.grafana.com/");

    // Assertion: Verify HTTP status and presence of expected HTML text
    check(res, {
        'Backend status is 200': (r) => r.status === 200,
        'Response body has Pizza': (r) => r.body && r.body.includes('Pizza'),
    });

    // Pacing/Think Time: pause VU for 1 second before starting the next iteration
    sleep(1);
}
