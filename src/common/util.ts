export function isPrime(n: number) {
  if (n <= 1 || n % 2 === 0) return false; // 1 and even numbers are not prime (except for 2).

  let i = 3;
  while (i * i <= n) {
    if (n % i === 0) return false;
    i += 2;
  }

  return true;
}
