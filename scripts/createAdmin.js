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
      reject(new Error('Admin setup cancelled.'));
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

async function createFirstAdmin() {
  try {
    const name = await ask('Administrator name: ');
    const email = (await ask('Administrator email: ')).toLowerCase();
    const password = await askSecret('Password (minimum 12 characters): ');

    if (!name || !email || !email.includes('@') || password.length < 12) {
      throw new Error('Enter a name, valid email, and password of at least 12 characters.');
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(24489901)');
      const existing = await client.query("SELECT 1 FROM users WHERE role = 'ADMIN' LIMIT 1");
      if (existing.rowCount) {
        await client.query('ROLLBACK');
        throw new Error('An administrator already exists. Use the authenticated registration endpoint for additional users.');
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const result = await client.query(`
        INSERT INTO users (name, email, password_hash, role)
        VALUES ($1, $2, $3, 'ADMIN')
        RETURNING id, name, email, role
      `, [name, email, passwordHash]);
      await client.query('COMMIT');
      console.log(`Administrator created: ${result.rows[0].email}`);
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
}

createFirstAdmin();