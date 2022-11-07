import { Decimal } from 'decimal.js';
import { IComputeEngine } from '../public';
import { primeFactors as machinePrimeFactors } from './numeric';

export function gcd(a: Decimal, b: Decimal): Decimal {
  //@todo: https://github.com/Yaffle/bigint-gcd/blob/main/gcd.js
  console.assert(a.isInteger() && b.isInteger());
  while (!b.isZero()) [a, b] = [b, a.modulo(b)];
  return a.abs();
}

export function lcm(a: Decimal, b: Decimal): Decimal {
  return a.mul(b).div(gcd(a, b));
}

// Difference between primes from 7 to 31
const PRIME_WHEEL_INC = [4, 2, 4, 2, 4, 6, 2, 6];

export function primeFactors(
  ce: IComputeEngine,
  n: Decimal
): Map<Decimal, number> {
  if (n.lt(Number.MAX_SAFE_INTEGER)) {
    const factors = machinePrimeFactors(n.toNumber());
    const result = new Map<Decimal, number>();
    for (const f of Object.keys(factors)) result.set(ce.bignum(f), factors[f]);
    return result;
  }

  //https:rosettacode.org/wiki/Prime_decomposition#JavaScript

  const result = new Map<string, number>();
  // Wheel factorization
  // @todo: see https://github.com/Fairglow/prime-factor/blob/main/src/lib.rs
  // @todo: rewrite using Bignum
  let count = 0;
  while (n.mod(2).isZero()) {
    count += 1;
    n = n.div(2);
  }
  if (count > 0) result.set('2', count);
  count = 0;
  while (n.mod(3).isZero()) {
    count += 1;
    n = n.div(3);
  }
  if (count > 0) result.set('3', count);
  while (n.mod(5).isZero()) {
    count += 1;
    n = n.div(5);
  }
  if (count > 0) result.set('5', count);

  let k = ce.bignum(7);
  let kIndex = k.toString();
  let i = 0;
  while (k.mul(k).lt(n)) {
    if (n.mod(k).isZero()) {
      result.set(kIndex, (result.get(kIndex) ?? 0) + 1);
      n = n.div(k);
    } else {
      k = k.add(PRIME_WHEEL_INC[i]);
      kIndex = k.toString();
      i = i < 7 ? i + 1 : 0;
    }
  }

  if (!n.eq(1)) result.set(n.toString(), 1);

  const r = new Map<Decimal, number>();
  for (const [k, v] of result) r.set(ce.bignum(k), v);
  return r;
}

/** Return `[factor, root]` such that
 * pow(n, 1/exponent) = factor * pow(root, 1/exponent)
 *
 * factorPower(75, 2) -> [5, 3] = 5^2 * 3
 *
 */
export function factorPower(
  ce: IComputeEngine,
  n: Decimal,
  exponent: number
): [factor: Decimal, root: Decimal] {
  // @todo: handle negative n
  console.assert(n.isInteger() && n.isPositive());
  const factors = primeFactors(ce, n);
  let f = ce.bignum(1);
  let r = ce.bignum(1);
  for (const [k, v] of factors) {
    const v2 = ce.bignum(v);
    f = f.mul(k.pow(v2.div(exponent).floor()));
    r = r.mul(k.pow(v2.mod(exponent)));
  }
  return [f, r];
}

export function factorial(ce: IComputeEngine, n: Decimal): Decimal {
  if (!n.isInteger() || n.isNegative()) return ce._BIGNUM_NAN;
  if (n.lessThan(10))
    return ce.bignum(
      [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800][n.toNumber()]
    );

  if (n.gt(Number.MAX_SAFE_INTEGER)) {
    let val = ce._BIGNUM_ONE;
    let i = ce._BIGNUM_TWO;
    while (i.lessThan(n)) {
      val = val.mul(i);
      i = i.add(1);
    }
    return val;
  }

  if (n.modulo(2).eq(1)) {
    return n.times(factorial(ce, n.minus(1)));
  }

  let loop = n.toNumber();
  let sum = n;
  let val = n;

  while (loop > 2) {
    loop -= 2;
    sum = sum.add(loop);
    val = val.mul(sum);
  }
  return val;
}

const gammaG = 7;

// Spouge approximation (suitable for large arguments)
export function lngamma(ce: IComputeEngine, z: Decimal): Decimal {
  if (z.isNegative()) return ce._BIGNUM_NAN;

  const GAMMA_P_LN = ce.cache<Decimal[]>('gamma-p-ln', () => {
    return [
      '0.99999999999999709182',
      '57.156235665862923517',
      '-59.597960355475491248',
      '14.136097974741747174',
      '-0.49191381609762019978',
      '0.33994649984811888699e-4',
      '0.46523628927048575665e-4',
      '-0.98374475304879564677e-4',
      '0.15808870322491248884e-3',
      '-0.21026444172410488319e-3',
      '0.2174396181152126432e-3',
      '-0.16431810653676389022e-3',
      '0.84418223983852743293e-4',
      '-0.2619083840158140867e-4',
      '0.36899182659531622704e-5',
    ].map((x) => ce.bignum(x));
  });

  let x = GAMMA_P_LN[0];
  for (let i = GAMMA_P_LN.length - 1; i > 0; --i) {
    x = x.add(GAMMA_P_LN[i].div(z.add(i)));
  }

  const GAMMA_G_LN = ce.cache('gamma-g-ln', () => ce.bignum(607).div(128));

  const t = z.add(GAMMA_G_LN).add(ce._BIGNUM_HALF);
  return ce._BIGNUM_NEGATIVE_ONE
    .acos()
    .mul(ce._BIGNUM_TWO)
    .log()
    .mul(ce._BIGNUM_HALF)
    .add(
      t.log().mul(z.add(ce._BIGNUM_HALF)).minus(t).add(x.log()).minus(z.log())
    );
}

// From https://github.com/substack/gamma.js/blob/master/index.js
export function gamma(ce: IComputeEngine, z: Decimal): Decimal {
  if (z.lessThan(ce._BIGNUM_HALF)) {
    const pi = ce._BIGNUM_NEGATIVE_ONE.acos();
    return pi.div(
      pi
        .mul(z)
        .sin()
        .mul(gamma(ce, ce._BIGNUM_ONE.sub(z)))
    );
  }

  if (z.greaterThan(100)) return lngamma(ce, z).exp();

  z = z.sub(1);

  // coefficients for gamma=7, kmax=8  Lanczos method
  // Source: GSL/specfunc/gamma.c
  const LANCZOS_7_C = ce.cache<Decimal[]>('lanczos-7-c', () => {
    return [
      '0.99999999999980993227684700473478',
      '676.520368121885098567009190444019',
      '-1259.13921672240287047156078755283',
      '771.3234287776530788486528258894',
      '-176.61502916214059906584551354',
      '12.507343278686904814458936853',
      '-0.13857109526572011689554707',
      '9.984369578019570859563e-6',
      '1.50563273514931155834e-7',
    ].map(ce.bignum);
  });

  let x = LANCZOS_7_C[0];
  for (let i = 1; i < gammaG + 2; i++) x = x.add(LANCZOS_7_C[i].div(z.add(i)));

  const t = z.add(gammaG).add(ce._BIGNUM_HALF);
  return ce._BIGNUM_NEGATIVE_ONE
    .acos()
    .times(ce._BIGNUM_TWO)
    .sqrt()
    .mul(x.mul(t.neg().exp()).mul(t.pow(z.add(ce._BIGNUM_HALF))));
}

/**
 * If the exponent of the bignum is in the range of the exponents
 * for machine numbers,return true.
 */
export function isInMachineRange(d: Decimal): boolean {
  if (!d.isFinite()) return true; // Infinity and NaN are in machine range

  // Are there too many significant digits?
  // Maximum Safe Integer is 9007199254740991
  // Digits in Decimal are stored by blocks of 7.
  // Three blocks, with the first block = 90 is close to the maximum
  if (d.d.length > 3 || (d.d.length === 3 && d.d[0] >= 90)) return false;

  console.assert(d.precision() <= 16);

  // Is the exponent within range?
  // With a binary 64 IEEE 754 number:
  // significant bits: 53 -> 15 digits
  // exponent bits: 11. emax = 307, emin = -306)
  return d.e < 308 && d.e > -306;
}

// export function asMachineNumber(d: Decimal): number | null {
//   if (d.precision() < 15 && d.e < 308 && d.e > -306) return d.toNumber();
//   return null;
// }