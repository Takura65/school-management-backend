const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const ask = (prompt) => new Promise((resolve) => {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  terminal.question(prompt, (answer) => {
    terminal.close();
    resolve(answer.trim());
  });
});

const askSecret = (prompt) => new Promise((resolve, reject) => {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    reject(new Error('Run this command in an interactive terminal to enter the password safely.'));
    return;
  }

  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  let value = '';

  const onData = (character) => {
    if (character === '\u0003') {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      reject(new Error('Password reset cancelled.'));
    } else if (character === '\r' || character === '\n') {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
      resolve(value);
    } else if (character === '\u007f' || character === '\b') {
      if (value.length) {
        value = value.slice(0, -1);
        process.stdout.write('\b \b');
      }
    } else if (character >= ' ') {
      value += character;
      process.stdout.write('*');
    }
  };

  process.stdin.on('data', onData);
});

async function resetAdminPassword() {
  try {
    const email = (await ask('Administrator email: ')).toLowerCase();
    const password = await askSecret('New password (minimum 12 characters): ');

    if (!email || !email.includes('@') || password.length < 12) {
      throw new Error('Enter a valid administrator email and a password of at least 12 characters.');
    }

    const result = await db.query(
      "UPDATE users SET password_hash = $1 WHERE email = $2 AND role = 'ADMIN' RETURNING email",
      [await bcrypt.hash(password, 12), email]
    );
    if (!result.rowCount) throw new Error('No administrator account found with that email.');

    console.log(`Password reset for administrator: ${result.rows[0].email}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
}

resetAdminPassword();