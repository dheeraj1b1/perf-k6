import http from 'k6/http';
import { sleep, check, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ============================================================================
// LEARNING NOTE: K6 CUSTOM METRICS EXPLAINED
// ============================================================================
// 1. Counter: A metric that aggregates/accumulates values. Used to count total
//    events (e.g., total registered users, total rating actions).
// 2. Rate: A metric that tracks the percentage of non-zero (true) values.
//    Used to track success/failure ratio (e.g., login success rate).
// 3. Trend: A metric that calculates stats (min, max, average, percentiles)
//    for numeric values. Used for duration/latency analysis.
// ============================================================================

// Defining Custom Metrics
const userRegistrationCounter = new Counter('custom_user_registrations_total');
const pizzaRatingCounter = new Counter('custom_pizza_ratings_total');

const loginSuccessRate = new Rate('custom_login_success_rate');
const requestSuccessRate = new Rate('custom_request_success_rate');

const registrationTrend = new Trend('custom_registration_duration_ms');
const ratingTrend = new Trend('custom_rating_duration_ms');

// 1. Options configuration with Stage-based load profile (Ramp-up -> Steady State -> Ramp-down)
export const options = {
    stages: [
        { duration: '5s', target: 2 }, // Ramp-up: 5 seconds, up to 2 users (VUs)
        { duration: '5s', target: 3 }, // Steady state: hold/ramp to 3 users (VUs) for next 5 seconds
        { duration: '3s', target: 0 }, // Ramp-down: ramp down to 0 users over next 3 seconds
    ],
    thresholds: {
        // We set pass/fail criteria on both built-in and custom metrics
        'http_req_failed': ['rate<0.05'], // General request failure rate must be under 5%
        'custom_login_success_rate': ['rate>0.95'], // Login success rate must be greater than 95%
        'custom_registration_duration_ms': ['p(95)<400'], // 95% of registrations must complete under 400ms
        'custom_rating_duration_ms': ['p(95)<400'], // 95% of ratings must complete under 400ms

        // Individual group P95 latency thresholds:
        // Group 1 & 2: Adequate thresholds (p(95)<400) - will pass
        'http_req_duration{group:::01 - Register User}': ['p(95)<400'],
        'http_req_duration{group:::02 - User Login}': ['p(95)<400'],
        // Group 3 & 4: Unreasonable thresholds (p(95)<10) - will fail on purpose for learning/experience
        'http_req_duration{group:::03 - Create Pizza Rating}': ['p(95)<10'],
        'http_req_duration{group:::04 - Get Pizza Rating Details}': ['p(95)<10'],
    }
};

const BASE_URL = 'https://quickpizza.grafana.com';
const PASSWORD = 'Password123!';

// Helper function to generate unique dynamic usernames across VUs and Iterations
function generateDynamicUsername() {
    const uniqueId = Math.floor(Math.random() * 1000000);
    return `user_${__VU}_${__ITER}_${uniqueId}@example.com`;
}

export default function () {
    const username = generateDynamicUsername();
    let authToken = '';
    let ratingId = '';

    console.log(`[Start Iteration] VU: ${__VU}, Iteration: ${__ITER} | Using Username: ${username}`);

    // Group 1: User Registration
    group('01 - Register User', function () {
        const url = `${BASE_URL}/api/users`;
        const payload = JSON.stringify({
            username: username,
            password: PASSWORD,
        });
        const params = {
            headers: { 'Content-Type': 'application/json' },
        };

        const res = http.post(url, payload, params);

        // Record metrics
        registrationTrend.add(res.timings.duration); // Trend metric tracking latency
        const isRegistered = res.status === 200 || res.status === 201;
        requestSuccessRate.add(isRegistered);        // Track total request rate

        // Log response body and status
        console.log(`[Registration Response] Status: ${res.status} | Body: ${res.body}`);

        if (isRegistered) {
            userRegistrationCounter.add(1);         // Increment registration count
            console.log(`[Registration Success] Status: ${res.status} for user: ${username}`);
        } else {
            console.error(`[Registration Failed] Status: ${res.status}. Body: ${res.body}`);
        }

        check(res, {
            'registration status is 200 or 201': (r) => r.status === 200 || r.status === 201,
        });
    });

    // Group 2: User Login
    group('02 - User Login', function () {
        const url = `${BASE_URL}/api/users/token/login`;
        const payload = JSON.stringify({
            username: username,
            password: PASSWORD,
        });
        const params = {
            headers: { 'Content-Type': 'application/json' },
        };

        const res = http.post(url, payload, params);

        const isLoginOk = res.status === 200;
        loginSuccessRate.add(isLoginOk);          // Track login rate
        requestSuccessRate.add(isLoginOk);        // Track general request rate

        const isLoginSuccessful = check(res, {
            'login status is 200': (r) => r.status === 200,
            'login response has token': (r) => r.json().token !== undefined,
        });

        // Log response body and status
        console.log(`[Login Response] Status: ${res.status} | Body: ${res.body}`);

        if (isLoginSuccessful) {
            authToken = res.json().token;
            console.log(`[Login Success] Extracted Auth Token: ${authToken.substring(0, 5)}...`);
        } else {
            console.error(`[Login Failed] Status: ${res.status}`);
        }
    });

    // Group 3: Create Pizza Rating
    group('03 - Create Pizza Rating', function () {
        if (!authToken) {
            console.warn('[Skipping Rating] Missing authentication token');
            return;
        }

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

        ratingTrend.add(res.timings.duration);    // Track latency trend for rating
        const isRatingCreated = res.status === 201;
        requestSuccessRate.add(isRatingCreated);   // Track general request rate

        const isRatingSuccessful = check(res, {
            'rating status is 201': (r) => r.status === 201,
            'rating response has id': (r) => r.json().id !== undefined,
        });

        // Log response body and status
        console.log(`[Rating Response] Status: ${res.status} | Body: ${res.body}`);

        if (isRatingSuccessful) {
            ratingId = res.json().id;
            pizzaRatingCounter.add(1);             // Increment pizza rating counter
            console.log(`[Rating Success] Created Rating ID: ${ratingId} for Pizza: 1`);
        } else {
            console.error(`[Rating Failed] Status: ${res.status}`);
        }
    });

    // Group 4: Get Pizza Rating Details
    group('04 - Get Pizza Rating Details', function () {
        if (!ratingId || !authToken) {
            console.warn('[Skipping Get Rating] Missing Rating ID or Auth Token');
            return;
        }

        const url = `${BASE_URL}/api/ratings/${ratingId}`;
        const params = {
            headers: {
                'Authorization': `Token ${authToken}`,
            },
        };

        const res = http.get(url, params);

        const isGetOk = res.status === 200;
        requestSuccessRate.add(isGetOk);          // Track general request rate

        check(res, {
            'get rating status is 200': (r) => r.status === 200,
            'retrieved rating ID matches': (r) => r.json().id === ratingId,
        });

        // Log response body and status
        console.log(`[Get Rating Response] Status: ${res.status} | Body: ${res.body}`);

        if (isGetOk) {
            console.log(`[Retrieve Success] Successfully fetched rating details for ID: ${ratingId}`);
        } else {
            console.error(`[Retrieve Failed] Status: ${res.status}`);
        }
    });

    // Sleep 1 second before the next iteration
    sleep(1);
}
