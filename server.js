/**
 * Bank Management System - Server (Node.js + MongoDB)
 *
 * REFERENCE LINKS:
 * Node.js: https://nodejs.org/docs/latest/api/
 * Node.js HTTP Server: https://nodejs.org/docs/latest/api/http.html
 * Node.js File System: https://nodejs.org/docs/latest/api/fs.html
 * Node.js URL API: https://nodejs.org/docs/latest/api/url.html
 * MongoDB Node.js Driver: https://www.mongodb.com/docs/drivers/node/current/
 * MongoDB Manual: https://www.mongodb.com/docs/manual/
 * REST API Basics: https://developer.mozilla.org/en-US/docs/Glossary/REST
 * JavaScript Async/Await: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function
 *
 * Beginner-friendly implementation using native Node.js http module and official MongoDB driver.
 * All collection setup, indexes, seed data, and REST endpoints are here.
 */

// Environment variables:
// https://www.npmjs.com/package/dotenv
// https://nodejs.org/docs/latest/api/process.html#processenv
require('dotenv').config();

// Native Node.js modules:
// https://nodejs.org/docs/latest/api/http.html
// https://nodejs.org/docs/latest/api/fs.html
// https://nodejs.org/docs/latest/api/path.html
// https://nodejs.org/docs/latest/api/url.html
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Official MongoDB driver:
// https://www.mongodb.com/docs/drivers/node/current/
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bank_management_db';
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME types for static file serving
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

// Route registry: stores routes grouped by HTTP method
const routes = {
  GET: [],
  POST: [],
  PUT: [],
  DELETE: []
};

/**
 * Register a route with the given HTTP method, path pattern, and handler.
 * Supports path parameters like /api/customers/:id
 */
function registerRoute(method, routePath, handler) {
  if (routePath.includes(':')) {
    const paramNames = [];
    const pattern = routePath.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    const regex = new RegExp(`^${pattern}$`);
    routes[method].push({ regex, paramNames, handler });
  } else {
    routes[method].push({ path: routePath, handler });
  }
}

// Router helper object providing app.get, app.post, app.put, app.delete
const app = {
  get: (path, handler) => registerRoute('GET', path, handler),
  post: (path, handler) => registerRoute('POST', path, handler),
  put: (path, handler) => registerRoute('PUT', path, handler),
  delete: (path, handler) => registerRoute('DELETE', path, handler)
};

/**
 * Find matching route for a method and pathname.
 */
function findRoute(method, pathname) {
  const methodRoutes = routes[method];
  if (!methodRoutes) return null;

  for (const route of methodRoutes) {
    if (route.path) {
      if (route.path === pathname) {
        return { handler: route.handler, params: {} };
      }
    } else if (route.regex) {
      const match = pathname.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, i) => {
          params[name] = decodeURIComponent(match[i + 1]);
        });
        return { handler: route.handler, params };
      }
    }
  }
  return null;
}

/**
 * Parse incoming JSON request body.
 */
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Guard against payloads larger than 1MB
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body || body.trim() === '') {
        return resolve({});
      }
      try {
        const parsed = JSON.parse(body);
        resolve(parsed);
      } catch (err) {
        reject(new Error('Invalid JSON format in request body'));
      }
    });
    req.on('error', err => reject(err));
  });
}

/**
 * Serve static files from the public folder using native Node.js fs streams.
 */
function serveStaticFile(req, res, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch (e) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Bad Request');
  }

  let relativePath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  if (relativePath === '/' || relativePath === '\\' || relativePath === '') {
    relativePath = 'index.html';
  } else {
    relativePath = relativePath.replace(/^[/\\]+/, '');
  }

  const filePath = path.join(PUBLIC_DIR, relativePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.end('404 Not Found');
      }
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end('500 Internal Server Error');
    }

    let targetPath = filePath;
    if (stats.isDirectory()) {
      targetPath = path.join(filePath, 'index.html');
      if (!fs.existsSync(targetPath)) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.end('404 Not Found');
      }
    }

    const ext = path.extname(targetPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    const stream = fs.createReadStream(targetPath);
    stream.on('error', streamErr => {
      console.error('File stream error:', streamErr);
      if (!res.headersSent && !res.writableEnded) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('500 Internal Server Error');
      }
    });
    stream.pipe(res);
  });
}

/**
 * Native Node.js HTTP Server instance
 */
const server = http.createServer(async (req, res) => {
  // Enhance response with status and json helper methods
  res.status = function (code) {
    this.statusCode = code;
    return this;
  };

  res.json = function (data) {
    if (this.writableEnded) return this;
    this.setHeader('Content-Type', 'application/json; charset=utf-8');
    this.setHeader('Access-Control-Allow-Origin', '*');
    this.end(JSON.stringify(data));
    return this;
  };

  // Default CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  let parsedUrl;
  try {
    const baseURL = `http://${req.headers.host || 'localhost'}`;
    parsedUrl = new URL(req.url, baseURL);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const pathname = parsedUrl.pathname;

  // 1. Match registered REST API routes
  const matched = findRoute(req.method, pathname);
  if (matched) {
    req.params = matched.params;
    req.query = Object.fromEntries(parsedUrl.searchParams.entries());

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      try {
        req.body = await parseJsonBody(req);
      } catch (err) {
        return res.status(400).json({ error: err.message || 'Invalid JSON body' });
      }
    } else {
      req.body = {};
    }

    try {
      await matched.handler(req, res);
    } catch (err) {
      console.error('Unhandled route error:', err);
      if (!res.headersSent && !res.writableEnded) {
        res.status(500).json({ error: 'Internal Server Error' });
      }
    }
    return;
  }

  // 2. Unmatched API route -> JSON 404
  if (pathname.startsWith('/api')) {
    return res.status(404).json({ error: `API endpoint ${req.method} ${pathname} not found` });
  }

  // 3. Static files for GET and HEAD
  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStaticFile(req, res, pathname);
  }

  // 4. Default 404
  res.status(404).json({ error: 'Not Found' });
});

// Database references
// MongoDB collections: https://www.mongodb.com/docs/drivers/node/current/databases-collections/
let client;
let db;
let customersCol;
let accountsCol;
let transactionsCol;

// Minimum balance configuration for account types
const MINIMUM_BALANCE = {
  Savings: 500,
  Current: 1000
};

// ==========================================
// ID GENERATOR HELPERS
// ==========================================

// MongoDB find, sort, limit and toArray:
// https://www.mongodb.com/docs/drivers/node/current/crud/query/retrieve/
// JavaScript async functions:
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function

async function generateCustomerId() {
  const lastCustomer = await customersCol.find().sort({ customerId: -1 }).limit(1).toArray();
  if (lastCustomer.length === 0 || !lastCustomer[0].customerId) {
    return 'CUST1001';
  }
  const numericPart = parseInt(lastCustomer[0].customerId.replace('CUST', ''), 10);
  const nextNum = isNaN(numericPart) ? 1001 : numericPart + 1;
  return `CUST${nextNum}`;
}

async function generateAccountNumber() {
  const lastAccount = await accountsCol.find().sort({ accountNumber: -1 }).limit(1).toArray();
  if (lastAccount.length === 0 || !lastAccount[0].accountNumber) {
    return 'ACC1001';
  }
  const numericPart = parseInt(lastAccount[0].accountNumber.replace('ACC', ''), 10);
  const nextNum = isNaN(numericPart) ? 1001 : numericPart + 1;
  return `ACC${nextNum}`;
}

async function generateTransactionId() {
  const lastTxn = await transactionsCol.find().sort({ transactionId: -1 }).limit(1).toArray();
  if (lastTxn.length === 0 || !lastTxn[0].transactionId) {
    return 'TXN1001';
  }
  const numericPart = parseInt(lastTxn[0].transactionId.replace('TXN', ''), 10);
  const nextNum = isNaN(numericPart) ? 1001 : numericPart + 1;
  return `TXN${nextNum}`;
}

// NOTE: These ID generators are suitable for a basic practical project.
// For concurrent production requests, consider MongoDB counters or another
// atomic ID-generation strategy to avoid duplicate IDs.
// MongoDB atomicity: https://www.mongodb.com/docs/manual/core/write-operations-atomicity/

// ==========================================
// DATABASE INITIALIZATION & SEEDING
// ==========================================

// MongoDB connection:
// https://www.mongodb.com/docs/drivers/node/current/connect/
// MongoDB indexes:
// https://www.mongodb.com/docs/drivers/node/current/indexes/
// MongoDB insert operations:
// https://www.mongodb.com/docs/drivers/node/current/crud/insert/

async function initializeDatabase() {
  console.log('[Database] Connecting to MongoDB at:', MONGODB_URI);
  client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db();

  customersCol = db.collection('customers');
  accountsCol = db.collection('accounts');
  transactionsCol = db.collection('transactions');

  // Create unique indexes
  // Unique indexes: https://www.mongodb.com/docs/manual/core/index-unique/
  // createIndex: https://www.mongodb.com/docs/drivers/node/current/indexes/
  await customersCol.createIndex({ customerId: 1 }, { unique: true });
  await customersCol.createIndex({ email: 1 }, { unique: true });
  await accountsCol.createIndex({ accountNumber: 1 }, { unique: true });
  await transactionsCol.createIndex({ transactionId: 1 }, { unique: true });
  await transactionsCol.createIndex({ accountNumber: 1 });

  console.log('[Database] Unique indexes verified.');

  // Check if sample data insertion is required
  // countDocuments: https://www.mongodb.com/docs/drivers/node/current/crud/query/count/
  const customerCount = await customersCol.countDocuments();
  if (customerCount === 0) {
    console.log('[Database] Empty database detected. Seeding fictional sample data...');

    // JavaScript objects and arrays:
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Working_with_objects
    // JavaScript Date:
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date

    const sampleCustomers = [
      {
        customerId: 'CUST1001',
        name: 'Aarav Patel',
        email: 'aarav.patel@example.com',
        phone: '9876543210',
        address: '101 Navrangpura, Ahmedabad',
        dateOfBirth: '2002-05-12',
        gender: 'Male',
        createdAt: new Date('2026-01-15T10:00:00Z')
      },
      {
        customerId: 'CUST1002',
        name: 'Priya Sharma',
        email: 'priya.sharma@example.com',
        phone: '9876543211',
        address: '402 Bandra West, Mumbai',
        dateOfBirth: '2001-08-20',
        gender: 'Female',
        createdAt: new Date('2026-02-10T11:30:00Z')
      },
      {
        customerId: 'CUST1003',
        name: 'Rohan Mehta',
        email: 'rohan.mehta@example.com',
        phone: '9876543212',
        address: '503 FC Road, Pune',
        dateOfBirth: '2003-11-05',
        gender: 'Male',
        createdAt: new Date('2026-03-01T09:15:00Z')
      }
    ];

    // Insert multiple documents:
    // https://www.mongodb.com/docs/drivers/node/current/crud/insert/#insert-multiple-documents
    await customersCol.insertMany(sampleCustomers);

    const sampleAccounts = [
      {
        accountNumber: 'ACC1001',
        customerId: 'CUST1001',
        customerName: 'Aarav Patel',
        accountType: 'Savings',
        balance: 5000,
        status: 'Active',
        batch: 'Batch A',
        openedAt: new Date('2026-01-15T10:05:00Z')
      },
      {
        accountNumber: 'ACC1002',
        customerId: 'CUST1002',
        customerName: 'Priya Sharma',
        accountType: 'Current',
        balance: 15000,
        status: 'Active',
        batch: 'Batch B',
        openedAt: new Date('2026-02-10T11:35:00Z')
      },
      {
        accountNumber: 'ACC1003',
        customerId: 'CUST1003',
        customerName: 'Rohan Mehta',
        accountType: 'Savings',
        balance: 3500,
        status: 'Active',
        batch: 'Batch C',
        openedAt: new Date('2026-03-01T09:20:00Z')
      }
    ];

    await accountsCol.insertMany(sampleAccounts);

    const sampleTransactions = [
      {
        transactionId: 'TXN1001',
        accountNumber: 'ACC1001',
        type: 'Deposit',
        amount: 5000,
        description: 'Initial opening deposit',
        resultingBalance: 5000,
        createdAt: new Date('2026-01-15T10:05:00Z')
      },
      {
        transactionId: 'TXN1002',
        accountNumber: 'ACC1002',
        type: 'Deposit',
        amount: 15000,
        description: 'Initial opening deposit',
        resultingBalance: 15000,
        createdAt: new Date('2026-02-10T11:35:00Z')
      },
      {
        transactionId: 'TXN1003',
        accountNumber: 'ACC1003',
        type: 'Deposit',
        amount: 3500,
        description: 'Initial opening deposit',
        resultingBalance: 3500,
        createdAt: new Date('2026-03-01T09:20:00Z')
      }
    ];

    await transactionsCol.insertMany(sampleTransactions);
    console.log('[Database] Sample customers, accounts, and transactions seeded successfully.');
  }
}

// ==========================================
// REST API ROUTES
// ==========================================

// REST API Routing:
// HTTP request methods:
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
// HTTP status codes:
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Status

// --- 1. DASHBOARD SUMMARY ---

// GET route: retrieve dashboard information
// MongoDB countDocuments:
// https://www.mongodb.com/docs/drivers/node/current/crud/query/count/
// MongoDB aggregation:
// https://www.mongodb.com/docs/drivers/node/current/aggregation/
// $match stage: https://www.mongodb.com/docs/manual/reference/operator/aggregation/match/
// $group stage: https://www.mongodb.com/docs/manual/reference/operator/aggregation/group/
// $sum operator: https://www.mongodb.com/docs/manual/reference/operator/aggregation/sum/

app.get('/api/dashboard', async (req, res) => {
  try {
    const totalCustomers = await customersCol.countDocuments();
    const totalAccounts = await accountsCol.countDocuments();
    const totalTransactions = await transactionsCol.countDocuments();

    // Aggregate total deposits
    const depositAgg = await transactionsCol.aggregate([
      { $match: { type: 'Deposit' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]).toArray();
    const totalDeposits = depositAgg.length > 0 ? depositAgg[0].total : 0;

    // Aggregate total withdrawals
    const withdrawAgg = await transactionsCol.aggregate([
      { $match: { type: 'Withdrawal' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]).toArray();
    const totalWithdrawals = withdrawAgg.length > 0 ? withdrawAgg[0].total : 0;

    // 5 most recent transactions
    // Sorting and limiting query results:
    // https://www.mongodb.com/docs/drivers/node/current/crud/query/retrieve/
    const recentTransactions = await transactionsCol
      .find()
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    res.json({
      totalCustomers,
      totalAccounts,
      totalTransactions,
      totalDeposits,
      totalWithdrawals,
      recentTransactions
    });
  } catch (error) {
    // Error handling:
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/try...catch
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

// --- 2. CUSTOMER MANAGEMENT ---

// GET /api/customers - List all customers
// MongoDB find and sort:
// https://www.mongodb.com/docs/drivers/node/current/crud/query/retrieve/

app.get('/api/customers', async (req, res) => {
  try {
    const customers = await customersCol.find().sort({ createdAt: -1 }).toArray();
    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// GET /api/customers/:id - Fetch one customer
// Route parameter parsing
// MongoDB findOne:
// https://www.mongodb.com/docs/drivers/node/current/crud/query/retrieve/

app.get('/api/customers/:id', async (req, res) => {
  try {
    const customer = await customersCol.findOne({ customerId: req.params.id });
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(customer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch customer details' });
  }
});

// POST /api/customers - Create a new customer
// Request body parsing
// MongoDB insertOne: https://www.mongodb.com/docs/drivers/node/current/crud/insert/
// String trim: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/trim
// Regular expressions: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions

app.post('/api/customers', async (req, res) => {
  try {
    const { name, email, phone, address, dateOfBirth, gender } = req.body;

    if (!name || !email || !phone || !dateOfBirth) {
      return res.status(400).json({ error: 'Name, email, phone, and date of birth are required' });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    // Check email uniqueness
    const existing = await customersCol.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'A customer with this email address already exists' });
    }

    const customerId = await generateCustomerId();
    const newCustomer = {
      customerId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      address: address ? address.trim() : '',
      dateOfBirth,
      gender: gender || 'Other',
      createdAt: new Date()
    };

    await customersCol.insertOne(newCustomer);
    res.status(201).json(newCustomer);
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: error.message || 'Failed to create customer' });
  }
});

// PUT /api/customers/:id - Update customer details
// MongoDB updateOne and $set:
// https://www.mongodb.com/docs/drivers/node/current/crud/update/

app.put('/api/customers/:id', async (req, res) => {
  try {
    const { name, email, phone, address, dateOfBirth, gender } = req.body;
    const customerId = req.params.id;

    if (!name || !email || !phone || !dateOfBirth) {
      return res.status(400).json({ error: 'Name, email, phone, and date of birth are required' });
    }

    // Check if new email is already taken by another customer
    // MongoDB comparison operators ($ne):
    // https://www.mongodb.com/docs/manual/reference/operator/query/ne/
    const existing = await customersCol.findOne({
      email: email.toLowerCase(),
      customerId: { $ne: customerId }
    });
    if (existing) {
      return res.status(400).json({ error: 'Email is already taken by another customer' });
    }

    const updateData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      address: address ? address.trim() : '',
      dateOfBirth,
      gender: gender || 'Other'
    };

    const result = await customersCol.updateOne(
      { customerId },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Keep customerName in linked accounts synchronized
    // MongoDB updateMany:
    // https://www.mongodb.com/docs/drivers/node/current/crud/update/
    await accountsCol.updateMany(
      { customerId },
      { $set: { customerName: name.trim() } }
    );

    const updated = await customersCol.findOne({ customerId });
    res.json(updated);
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// DELETE /api/customers/:id - Delete customer (subject to account restrictions)
// MongoDB deleteOne:
// https://www.mongodb.com/docs/drivers/node/current/crud/delete/

app.delete('/api/customers/:id', async (req, res) => {
  try {
    const customerId = req.params.id;

    // Check if customer has any linked bank accounts
    const linkedAccounts = await accountsCol.countDocuments({ customerId });
    if (linkedAccounts > 0) {
      return res.status(400).json({
        error: `Cannot delete customer: ${linkedAccounts} bank account(s) are linked to this customer. Close or remove accounts first.`
      });
    }

    const result = await customersCol.deleteOne({ customerId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({ message: 'Customer deleted successfully', customerId });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// --- 3. BANK ACCOUNT MANAGEMENT ---

// GET /api/accounts - List all accounts
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await accountsCol.find().sort({ openedAt: -1 }).toArray();
    res.json(accounts);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// GET /api/accounts/:id - Fetch one account
app.get('/api/accounts/:id', async (req, res) => {
  try {
    const account = await accountsCol.findOne({ accountNumber: req.params.id });
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch account details' });
  }
});

// POST /api/accounts - Create a new bank account
// JavaScript arrays and includes:
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/includes
// Number conversion:
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number
// MongoDB insertOne:
// https://www.mongodb.com/docs/drivers/node/current/crud/insert/

app.post('/api/accounts', async (req, res) => {
  try {
    const { customerId, accountType, initialDeposit, batch } = req.body;

    if (!customerId || !accountType) {
      return res.status(400).json({ error: 'Customer and Account Type are required' });
    }

    if (!['Savings', 'Current'].includes(accountType)) {
      return res.status(400).json({ error: 'Account type must be Savings or Current' });
    }

    // Verify customer exists
    const customer = await customersCol.findOne({ customerId });
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found. Cannot create account without a valid customer.' });
    }

    const depositAmount = Number(initialDeposit) || 0;
    const minBalance = MINIMUM_BALANCE[accountType];

    if (depositAmount < minBalance) {
      return res.status(400).json({
        error: `Minimum opening balance for a ${accountType} account is ₹${minBalance}. Provided: ₹${depositAmount}`
      });
    }

    const accountNumber = await generateAccountNumber();
    const newAccount = {
      accountNumber,
      customerId,
      customerName: customer.name,
      accountType,
      balance: depositAmount,
      status: 'Active',
      batch: batch || 'Batch A',
      openedAt: new Date()
    };

    await accountsCol.insertOne(newAccount);

    // Record initial deposit in transaction history
    if (depositAmount > 0) {
      const transactionId = await generateTransactionId();
      await transactionsCol.insertOne({
        transactionId,
        accountNumber,
        type: 'Deposit',
        amount: depositAmount,
        description: 'Initial account opening deposit',
        resultingBalance: depositAmount,
        createdAt: new Date()
      });
    }

    res.status(201).json(newAccount);
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({ error: error.message || 'Failed to create account' });
  }
});

// PUT /api/accounts/:id - Update permitted account details (status, type, batch)
// MongoDB update operations:
// https://www.mongodb.com/docs/drivers/node/current/crud/update/

app.put('/api/accounts/:id', async (req, res) => {
  try {
    const accountNumber = req.params.id;
    const { status, accountType, batch } = req.body;

    const account = await accountsCol.findOne({ accountNumber });
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const updateFields = {};

    if (status) {
      if (!['Active', 'Frozen', 'Closed'].includes(status)) {
        return res.status(400).json({ error: 'Status must be Active, Frozen, or Closed' });
      }
      updateFields.status = status;
    }

    if (accountType) {
      if (!['Savings', 'Current'].includes(accountType)) {
        return res.status(400).json({ error: 'Account type must be Savings or Current' });
      }
      updateFields.accountType = accountType;
    }

    if (batch) {
      if (!['Batch A', 'Batch B', 'Batch C'].includes(batch)) {
        return res.status(400).json({ error: 'Batch must be Batch A, Batch B, or Batch C' });
      }
      updateFields.batch = batch;
    }

    // Object.keys:
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys
    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update' });
    }

    await accountsCol.updateOne({ accountNumber }, { $set: updateFields });
    const updated = await accountsCol.findOne({ accountNumber });
    res.json(updated);
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// PUT /api/accounts/:id/batch - Batch assignment shortcut

app.put('/api/accounts/:id/batch', async (req, res) => {
  try {
    const accountNumber = req.params.id;
    const { batch } = req.body;

    if (!['Batch A', 'Batch B', 'Batch C'].includes(batch)) {
      return res.status(400).json({ error: 'Batch must be Batch A, Batch B, or Batch C' });
    }

    const result = await accountsCol.updateOne(
      { accountNumber },
      { $set: { batch } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ message: 'Batch updated successfully', accountNumber, batch });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update account batch' });
  }
});

// DELETE /api/accounts/:id - Delete account (Prevented if transaction history exists)

app.delete('/api/accounts/:id', async (req, res) => {
  try {
    const accountNumber = req.params.id;

    // Check for transaction history
    const txnCount = await transactionsCol.countDocuments({ accountNumber });
    if (txnCount > 0) {
      return res.status(400).json({
        error: `Cannot delete account ${accountNumber} because it has ${txnCount} recorded transaction(s). Production and practical banking guidelines require auditing. Please change the account status to "Closed" instead.`
      });
    }

    const result = await accountsCol.deleteOne({ accountNumber });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ message: 'Account deleted successfully', accountNumber });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// --- 4. TRANSACTIONS (DEPOSIT, WITHDRAW, TRANSFER, HISTORY) ---

// GET /api/transactions - Fetch all transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const transactions = await transactionsCol.find().sort({ createdAt: -1 }).toArray();
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transaction history' });
  }
});

// POST /api/transactions/deposit - Deposit money
// MongoDB atomic updates and $inc:
// https://www.mongodb.com/docs/manual/reference/operator/update/inc/
// MongoDB findOneAndUpdate:
// https://www.mongodb.com/docs/drivers/node/current/crud/compound-operations/

app.post('/api/transactions/deposit', async (req, res) => {
  try {
    const { accountNumber, amount, description } = req.body;
    const depositAmount = Number(amount);

    if (!accountNumber || isNaN(depositAmount) || depositAmount <= 0) {
      return res.status(400).json({ error: 'Valid account number and positive amount (> 0) are required' });
    }

    // Verify account exists
    const account = await accountsCol.findOne({ accountNumber });
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Verify account is Active
    if (account.status !== 'Active') {
      return res.status(400).json({
        error: `Deposits are not allowed on accounts with status "${account.status}". Only Active accounts can transact.`
      });
    }

    // Update balance atomically using MongoDB $inc operator
    const updateResult = await accountsCol.findOneAndUpdate(
      { accountNumber, status: 'Active' },
      { $inc: { balance: depositAmount } },
      { returnDocument: 'after' }
    );

    const updatedAccount = updateResult.value || updateResult;
    const resultingBalance = updatedAccount.balance;

    // Record transaction
    const transactionId = await generateTransactionId();
    const newTxn = {
      transactionId,
      accountNumber,
      type: 'Deposit',
      amount: depositAmount,
      description: description ? description.trim() : 'Cash deposit',
      resultingBalance,
      createdAt: new Date()
    };

    await transactionsCol.insertOne(newTxn);

    res.status(201).json({
      message: `Successfully deposited ₹${depositAmount} into account ${accountNumber}`,
      transaction: newTxn,
      account: updatedAccount
    });
  } catch (error) {
    console.error('Error processing deposit:', error);
    res.status(500).json({ error: 'Failed to process deposit' });
  }
});

// POST /api/transactions/withdraw - Withdraw money
// MongoDB query comparison operators:
// https://www.mongodb.com/docs/manual/reference/operator/query-comparison/
// $gte operator:
// https://www.mongodb.com/docs/manual/reference/operator/query/gte/

app.post('/api/transactions/withdraw', async (req, res) => {
  try {
    const { accountNumber, amount, description } = req.body;
    const withdrawAmount = Number(amount);

    if (!accountNumber || isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return res.status(400).json({ error: 'Valid account number and positive amount (> 0) are required' });
    }

    // Verify account exists
    const account = await accountsCol.findOne({ accountNumber });
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Verify account is Active
    if (account.status !== 'Active') {
      return res.status(400).json({
        error: `Withdrawals are not allowed on accounts with status "${account.status}". Only Active accounts can transact.`
      });
    }

    // Conditional atomic update: balance must be >= withdrawAmount
    const updateResult = await accountsCol.findOneAndUpdate(
      {
        accountNumber,
        status: 'Active',
        balance: { $gte: withdrawAmount }
      },
      { $inc: { balance: -withdrawAmount } },
      { returnDocument: 'after' }
    );

    const updatedAccount = updateResult ? (updateResult.value || updateResult) : null;

    if (!updatedAccount || updatedAccount.accountNumber !== accountNumber) {
      return res.status(400).json({
        error: `Insufficient funds. Available balance: ₹${account.balance}. Requested: ₹${withdrawAmount}`
      });
    }

    const resultingBalance = updatedAccount.balance;

    // Record transaction
    const transactionId = await generateTransactionId();
    const newTxn = {
      transactionId,
      accountNumber,
      type: 'Withdrawal',
      amount: withdrawAmount,
      description: description ? description.trim() : 'Cash withdrawal',
      resultingBalance,
      createdAt: new Date()
    };

    await transactionsCol.insertOne(newTxn);

    res.status(201).json({
      message: `Successfully withdrawn ₹${withdrawAmount} from account ${accountNumber}`,
      transaction: newTxn,
      account: updatedAccount
    });
  } catch (error) {
    console.error('Error processing withdrawal:', error);
    res.status(500).json({ error: 'Failed to process withdrawal' });
  }
});

// POST /api/transactions/transfer - Money transfer between two accounts
// MongoDB sessions and transactions:
// https://www.mongodb.com/docs/drivers/node/current/crud/transactions/
// MongoDB transactions require a replica set or sharded cluster:
// https://www.mongodb.com/docs/manual/core/transactions-production-consideration/
// MongoDB update operators:
// https://www.mongodb.com/docs/manual/reference/operator/update/inc/

app.post('/api/transactions/transfer', async (req, res) => {
  const { fromAccount, toAccount, amount, description } = req.body;
  const transferAmount = Number(amount);

  if (!fromAccount || !toAccount || isNaN(transferAmount) || transferAmount <= 0) {
    return res.status(400).json({ error: 'Source account, destination account, and positive transfer amount (> 0) are required' });
  }

  if (fromAccount === toAccount) {
    return res.status(400).json({ error: 'Source and destination accounts must be different' });
  }

  try {
    // Check both accounts exist and are Active
    const source = await accountsCol.findOne({ accountNumber: fromAccount });
    const destination = await accountsCol.findOne({ accountNumber: toAccount });

    if (!source) {
      return res.status(404).json({ error: `Source account ${fromAccount} does not exist` });
    }
    if (!destination) {
      return res.status(404).json({ error: `Destination account ${toAccount} does not exist` });
    }

    if (source.status !== 'Active') {
      return res.status(400).json({ error: `Source account ${fromAccount} is ${source.status}. Only Active accounts can transfer money.` });
    }
    if (destination.status !== 'Active') {
      return res.status(400).json({ error: `Destination account ${toAccount} is ${destination.status}. Only Active accounts can receive funds.` });
    }

    if (source.balance < transferAmount) {
      return res.status(400).json({
        error: `Insufficient balance in source account. Available: ₹${source.balance}, Required: ₹${transferAmount}`
      });
    }

    // Try MongoDB multi-document transaction using Session (supported on Replica Sets and Atlas)
    let session = null;
    let usedReplicaSetTransaction = false;

    try {
      session = client.startSession();
      await session.withTransaction(async () => {
        // Step 1: Deduct from source
        const deductResult = await accountsCol.findOneAndUpdate(
          { accountNumber: fromAccount, status: 'Active', balance: { $gte: transferAmount } },
          { $inc: { balance: -transferAmount } },
          { returnDocument: 'after', session }
        );
        const updatedSource = deductResult.value || deductResult;
        if (!updatedSource || updatedSource.accountNumber !== fromAccount) {
          throw new Error('Insufficient funds in source account during atomic commit');
        }

        // Step 2: Add to destination
        const creditResult = await accountsCol.findOneAndUpdate(
          { accountNumber: toAccount, status: 'Active' },
          { $inc: { balance: transferAmount } },
          { returnDocument: 'after', session }
        );
        const updatedDest = creditResult.value || creditResult;
        if (!updatedDest || updatedDest.accountNumber !== toAccount) {
          throw new Error('Destination account inactive or not found during atomic commit');
        }

        // Step 3: Insert transaction records
        const baseTxnId = await generateTransactionId();
        const numPart = parseInt(baseTxnId.replace('TXN', ''), 10);
        const txnId1 = `TXN${numPart}`;
        const txnId2 = `TXN${numPart + 1}`;

        const descText = description ? description.trim() : 'Fund transfer';

        await transactionsCol.insertMany([
          {
            transactionId: txnId1,
            accountNumber: fromAccount,
            type: 'Transfer',
            amount: transferAmount,
            description: `Transfer to ${toAccount}: ${descText}`,
            resultingBalance: updatedSource.balance,
            transferPeer: toAccount,
            direction: 'Debit',
            createdAt: new Date()
          },
          {
            transactionId: txnId2,
            accountNumber: toAccount,
            type: 'Transfer',
            amount: transferAmount,
            description: `Transfer from ${fromAccount}: ${descText}`,
            resultingBalance: updatedDest.balance,
            transferPeer: fromAccount,
            direction: 'Credit',
            createdAt: new Date()
          }
        ], { session });
      });

      usedReplicaSetTransaction = true;
    } catch (txnError) {
      // If error is because standalone MongoDB instance does not support replica set sessions
      if (txnError.message && (txnError.message.includes('replica set') || txnError.message.includes('Transaction numbers'))) {
        console.warn('[Notice] Standalone MongoDB detected. Executing atomic two-phase updates with automatic compensation rollback.');

        // 1. Deduct from source conditionally
        const deductResult = await accountsCol.findOneAndUpdate(
          { accountNumber: fromAccount, status: 'Active', balance: { $gte: transferAmount } },
          { $inc: { balance: -transferAmount } },
          { returnDocument: 'after' }
        );
        const updatedSource = deductResult.value || deductResult;
        if (!updatedSource || updatedSource.accountNumber !== fromAccount) {
          return res.status(400).json({ error: 'Transfer failed: Insufficient funds in source account' });
        }

        // 2. Add to destination
        try {
          const creditResult = await accountsCol.findOneAndUpdate(
            { accountNumber: toAccount, status: 'Active' },
            { $inc: { balance: transferAmount } },
            { returnDocument: 'after' }
          );
          const updatedDest = creditResult.value || creditResult;
          if (!updatedDest || updatedDest.accountNumber !== toAccount) {
            // Compensating rollback for step 1
            await accountsCol.updateOne({ accountNumber: fromAccount }, { $inc: { balance: transferAmount } });
            return res.status(400).json({ error: 'Transfer failed: Destination account inactive. Amount refunded to source.' });
          }

          // 3. Record transactions
          const baseTxnId = await generateTransactionId();
          const numPart = parseInt(baseTxnId.replace('TXN', ''), 10);
          const txnId1 = `TXN${numPart}`;
          const txnId2 = `TXN${numPart + 1}`;
          const descText = description ? description.trim() : 'Fund transfer';

          await transactionsCol.insertMany([
            {
              transactionId: txnId1,
              accountNumber: fromAccount,
              type: 'Transfer',
              amount: transferAmount,
              description: `Transfer to ${toAccount}: ${descText}`,
              resultingBalance: updatedSource.balance,
              transferPeer: toAccount,
              direction: 'Debit',
              createdAt: new Date()
            },
            {
              transactionId: txnId2,
              accountNumber: toAccount,
              type: 'Transfer',
              amount: transferAmount,
              description: `Transfer from ${fromAccount}: ${descText}`,
              resultingBalance: updatedDest.balance,
              transferPeer: fromAccount,
              direction: 'Credit',
              createdAt: new Date()
            }
          ]);
        } catch (creditErr) {
          // Compensating rollback
          await accountsCol.updateOne({ accountNumber: fromAccount }, { $inc: { balance: transferAmount } });
          throw creditErr;
        }
      } else {
        throw txnError;
      }
    } finally {
      if (session) {
        await session.endSession();
      }
    }

    res.status(201).json({
      message: `Successfully transferred ₹${transferAmount} from ${fromAccount} to ${toAccount}`,
      details: {
        fromAccount,
        toAccount,
        amount: transferAmount,
        replicaSetACID: usedReplicaSetTransaction
      }
    });
  } catch (error) {
    console.error('Error processing transfer:', error);
    res.status(500).json({ error: error.message || 'Failed to process money transfer' });
  }
});

// ==========================================
// START SERVER
// ==========================================

// Starting an HTTP server:
// https://nodejs.org/docs/latest/api/http.html#serverlisten
// Process exit codes:
// https://nodejs.org/docs/latest/api/process.html#processexitcode
// MongoDB connection troubleshooting:
// https://www.mongodb.com/docs/drivers/node/current/connect/connection-troubleshooting/

async function startServer() {
  try {
    await initializeDatabase();
    server.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`  Bank Management System is running!`);
      console.log(`  URL: http://localhost:${PORT}`);
      console.log(`  Connected Database: ${MONGODB_URI}`);
      console.log(`=======================================================`);
    });
  } catch (error) {
    console.error('Fatal: Failed to connect to MongoDB and start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = { server, app, initializeDatabase, startServer };