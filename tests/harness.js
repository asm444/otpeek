const lines = [];
let passed = 0;
let failed = 0;

export function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    lines.push(`ok - ${name}`);
  } else {
    failed++;
    lines.push(`not ok - ${name}: esperado ${e}, obtido ${a}`);
  }
}

export async function run(suites) {
  for (const suite of suites) {
    try {
      await suite();
    } catch (e) {
      failed++;
      lines.push(`not ok - ${suite.name} lançou: ${e.stack || e}`);
    }
  }
  lines.push(`SUMMARY passed=${passed} failed=${failed}`);
  const pre = document.createElement('pre');
  pre.id = 'result';
  pre.textContent = lines.join('\n');
  document.body.append(pre);
}
