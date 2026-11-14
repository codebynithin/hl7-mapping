const { MongoClient } = require('mongodb');

const COLLECTIONS = Object.freeze({
  mappings: 'hl7-mapping',
  messages: 'hl7-test-message',
  orgMessageConfig: 'org-message-config',
});

let client;
let db;

function mongoTarget(uri) {
  try {
    const parsed = new URL(uri);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return 'mongodb';
  }
}

async function connect(uri = process.env.MONGO_URI, dbName = process.env.DB_NAME) {
  if (db) return db;
  if (!uri || !dbName) {
    throw new Error('MONGO_URI and DB_NAME must be set (see .env.example at the repository root)');
  }
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  db = client.db(dbName);
  console.log(`[db] connected to ${mongoTarget(uri)} / ${dbName}`);
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not connected. Call connect() first.');
  return db;
}

function collection(name) {
  return getDb().collection(name);
}

async function disconnect() {
  if (client) await client.close();
  client = undefined;
  db = undefined;
}

module.exports = { COLLECTIONS, connect, getDb, collection, disconnect };
