import { isPrime } from '../common/util.ts';

export function bar(a: number, b: number) {
  return a + b;
}

export function buildstr() {
  let result = '';
  for (let i = 1; i < 20; ++i) {
    result += isPrime(i) ? i.toString() : '';
  }
  return result;
}

export function request(url: string): Promise<Response> {
  return fetch(url);
}
