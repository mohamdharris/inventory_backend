require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const productsRouter = require('./src/routes/products');
const usersRouter = require('./src/routes/users');
const authRouter = require('./src/routes/auth');
const catalogRouter = require('./src/routes/catalog');
const paymentsRouter = require('./src/routes/payments');
const requireAuth = require('./src/middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Products API is running.' });
});

app.use('/api/auth', authRouter);
app.use('/api', catalogRouter);
app.use('/api/products', requireAuth, productsRouter);
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/payments', requireAuth, paymentsRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// Basic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Products API running at http://localhost:${PORT}`);
  });
});
