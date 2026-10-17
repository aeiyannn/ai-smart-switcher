// Tiny zero-dependency terminal UI helpers: colors, tables, spinner, interactive select.
import readline from 'node:readline';

const TTY = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (open, close) => (s) => (TTY ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
  inverse: wrap(7, 27),
};

export const ok = (s) => console.log(`${c.green('✔')} ${s}`);
export const warn = (s) => console.log(`${c.yellow('▲')} ${s}`);
export const fail = (s) => console.log(`${c.red('✖')} ${s}`);
export const info = (s) => console.log(`${c.cyan('ℹ')} ${s}`);
export const heading = (s) => console.log(`\n${c.bold(c.cyan(s))}`);

// Strip ANSI codes to measure visible width.
const visible = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');
const pad = (s, w) => s + ' '.repeat(Math.max(0, w - visible(s).length));

export function table(rows, headers) {
  const all = headers ? [headers.map((h) => c.bold(h)), ...rows] : rows;
  const widths = [];
  for (const row of all) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] || 0, visible(cell).length);
    });
  }
  for (const row of all) {
    console.log('  ' + row.map((cell, i) => pad(String(cell), widths[i])).join('   '));
  }
}

// Interactive arrow-key selector. Falls back to numbered prompt when not a TTY.
export async function select(title, items, { hint } = {}) {
  // items: [{ label, value, note }]
  if (!process.stdin.isTTY) {
    console.log(title);
    items.forEach((it, i) => console.log(`  ${i + 1}) ${visible(it.label)}`));
    const answer = await ask('Enter number: ');
    const idx = parseInt(answer, 10) - 1;
    return items[idx]?.value;
  }

  return new Promise((resolve) => {
    let index = 0;
    const render = (first = false) => {
      if (!first) process.stdout.write(`\x1b[${items.length + 1}A`);
      process.stdout.write(`\x1b[0J`);
      console.log(c.bold(title) + (hint ? c.gray(`  (${hint})`) : ''));
      items.forEach((it, i) => {
        const cursor = i === index ? c.cyan('❯') : ' ';
        const label = i === index ? c.cyan(it.label) : it.label;
        const note = it.note ? '  ' + c.gray(it.note) : '';
        console.log(` ${cursor} ${label}${note}`);
      });
    };
    render(true);

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onKey = (_str, key) => {
      if (!key) return;
      if (key.name === 'up' || key.name === 'k') index = (index - 1 + items.length) % items.length;
      else if (key.name === 'down' || key.name === 'j') index = (index + 1) % items.length;
      else if (key.name === 'return') return done(items[index].value);
      else if (key.name === 'escape' || key.name === 'q' || (key.ctrl && key.name === 'c')) return done(undefined);
      render();
    };

    const done = (value) => {
      process.stdin.off('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve(value);
    };

    process.stdin.on('keypress', onKey);
  });
}

export function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

export async function confirm(question, def = true) {
  const suffix = def ? ' [Y/n] ' : ' [y/N] ';
  const a = (await ask(question + suffix)).toLowerCase();
  if (!a) return def;
  return a.startsWith('y');
}
