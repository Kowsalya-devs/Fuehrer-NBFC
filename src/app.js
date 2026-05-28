const express = require('express');
const cors = require('cors');
const userRoutes = require('./routes/userRoutes');
const kycRoutes = require('./routes/kycRoutes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));

app.use('/api/users', userRoutes);
app.use('/api/kyc', kycRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Service is healthy.',
    data: { status: 'OK' },
  });
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
