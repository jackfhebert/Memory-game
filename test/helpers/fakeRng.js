// A deterministic stand-in for Math.random(). Each call returns the next
// value from `sequence`, looping back to the start once exhausted.
export function fakeRng(sequence) {
  let i = 0;
  return () => sequence[i++ % sequence.length];
}
