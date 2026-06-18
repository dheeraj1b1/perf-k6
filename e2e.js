import http from 'k6/http';
import { sleep, check, group } from 'k6';

// 1. k6 options configuration
// We configure 1 Virtual User (VU) to run for 5 seconds as requested.
export const options = {
    vus: 1,
    duration: '5s',
};

// Base URL for the Quick Pizza demo application
const BASE_URL = 'https://quickpizza.grafana.com';

/**
 * 2. Helper function to generate a dynamic username
 * Ensures uniqueness across VUs and iterations.
 */
function generateDynamicUsername() {
    const uniqueId = Math.floor(Math.random() * 1000000);
    return `user_${__VU}_${__ITER}_${uniqueId}@example.com`;
}

// Fixed password to use for registration and login
const PASSWORD = 'Password123!';

export default function () {
    // Generate a fresh dynamic username for this execution
    const username = generateDynamicUsername();
    let authToken = '';
    let orderId = '';

    // Group 1: User Registration
    group('01 - Register User', function () {
        const url = `${BASE_URL}/api/users`;
        const payload = JSON.stringify({
            username: username,
            password: PASSWORD,
        });
        const params = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const res = http.post(url, payload, params);

        // Assert that the user was successfully created (status code 200 or 201)
        check(res, {
            'registration status is 200 or 201': (r) => r.status === 200 || r.status === 201,
        });
    });

    // Group 2: User Login & Token Extraction
    group('02 - User Login', function () {
        const url = `${BASE_URL}/api/users/token/login`;
        const payload = JSON.stringify({
            username: username,
            password: PASSWORD,
        });
        const params = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const res = http.post(url, payload, params);

        // Assert login was successful
        const isLoginSuccessful = check(res, {
            'login status is 200': (r) => r.status === 200,
            'login response has token': (r) => r.json().token !== undefined,
        });

        if (isLoginSuccessful) {
            // Extract the authentication token from the JSON response
            authToken = res.json().token;
        }
    });

    // Group 3: Create Pizza Rating (Authenticated)
    group('03 - Create Pizza Rating', function () {
        // Only proceed if we have a valid token
        if (!authToken) {
            console.warn('Skipping Rating Creation: Auth token is missing');
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
                // QuickPizza OpenAPI specifies header format "Token {token}"
                'Authorization': `Token ${authToken}`,
            },
        };

        const res = http.post(url, payload, params);

        // Assert rating was successfully created
        const isRatingSuccessful = check(res, {
            'rating status is 201': (r) => r.status === 201,
            'rating response has id': (r) => r.json().id !== undefined,
        });

        if (isRatingSuccessful) {
            // Extract rating ID to use in the get rating call
            orderId = res.json().id;
        }
    });

    // Group 4: Retrieve Pizza Rating Details (Authenticated)
    group('04 - Get Pizza Rating Details', function () {
        // Only proceed if we have a valid rating ID and authToken
        if (!orderId || !authToken) {
            console.warn('Skipping Get Rating Details: Rating ID or Auth token is missing');
            return;
        }

        const url = `${BASE_URL}/api/ratings/${orderId}`;
        const params = {
            headers: {
                'Authorization': `Token ${authToken}`,
            },
        };

        const res = http.get(url, params);

        // Assert rating details are retrieved successfully
        check(res, {
            'get rating status is 200': (r) => r.status === 200,
            'retrieved rating ID matches': (r) => r.json().id === orderId,
        });
    });

    // Sleep for a short duration between iterations (simulating user think time)
    sleep(1);
}
