import http from 'k6/http';
import { sleep, check } from 'k6';


export const options = {
    vus: 3,
    duration: '10s',
    thresholds: {
        'http_req_duration': ['p(95)<400'],
        'http_req_failed': ['rate<0.01'],
        'checks': ['rate>0.85']
    }
};

export default function () {
    const res = http.get('https://quickpizza.grafana.com/');

    check(res, {
        'is status 200': (r) => r.status === 200,
        'response body has pizza': (r) => r.body.includes('Pizza')
    });
    sleep(1);
};