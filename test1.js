import http from 'k6/http';
import { sleep, check } from 'k6';
import { Trend } from 'k6/metrics';

// Custom Trend metric to measure response time for the pizza API endpoint
const pizzaResponseTime = new Trend('pizza_response_time');

export const options = {
    thresholds: {
        // Global thresholds
        'http_req_duration': ['p(95)<400'],
        'http_req_failed': ['rate<0.01'],

        // Segregated thresholds targeting tagged endpoints specifically
        'http_req_duration{name:homepage}': ['p(95)<250'],
        'http_req_duration{name:get_pizza}': ['p(95)<350'],

        // Threshold for the custom Trend metric
        'pizza_response_time': ['p(95)<350']
    },
    stages: [
        { duration: '4s', target: 2 },
        { duration: '6s', target: 5 },
        { duration: '3s', target: 0 }
    ]
};

export default function () {
    // 1. Homepage request (GET) with name tag
    const homepageRes = http.get('https://quickpizza.grafana.com/', {
        tags: { name: 'homepage' }
    });

    check(homepageRes, {
        'homepage status is 200': (r) => r.status === 200,
    });

    // 2. Simple GET request with name tag (no POST payload)
    const pizzaRes = http.get('https://quickpizza.grafana.com/api/pizza', {
        tags: { name: 'get_pizza' }
    });

    check(pizzaRes, {
        'pizza status is 200': (r) => r.status === 200,
    });

    // 3. Tracking response time using the custom Trend metric
    pizzaResponseTime.add(pizzaRes.timings.waiting);

    sleep(1);
}