import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { connectMongoDB, connectRedis, closeDatabaseConnections } from './config/database.js';
import auditRoutes from './routes/auditRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import processingRoutes from './routes/processingRoutes.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
}));
app.use(morgan('dev')); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

// Serve uploaded files statically
app.use('/uploads', express.static('uploads'));

// API Routes
app.use('/api/audits', auditRoutes);
app.use('/api/migration-projects', uploadRoutes);
app.use('/api/migration-projects', processingRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'Migration Audit API',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            audits: '/api/audits',
            createAudit: 'POST /api/audits',
            getAudit: 'GET /api/audits/:id',
            listAudits: 'GET /api/audits',
            stats: 'GET /api/audits/stats',
            history: 'GET /api/audits/history/:url',
            deleteAudit: 'DELETE /api/audits/:id',
            migrationProjects: '/api/migration-projects',
            createMigrationProject: 'POST /api/migration-projects',
            getMigrationProject: 'GET /api/migration-projects/:id',
            listMigrationProjects: 'GET /api/migration-projects',
            deleteMigrationProject: 'DELETE /api/migration-projects/:id',
        },
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

// Start server
const startServer = async () => {
    try {
        // Connect to databases
        await connectMongoDB();
        await connectRedis();

        // Start listening
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🌐 API: http://localhost:${PORT}`);
            console.log(`❤️  Health check: http://localhost:${PORT}/health`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing server...');
    await closeDatabaseConnections();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, closing server...');
    await closeDatabaseConnections();
    process.exit(0);
});

// Start the server
startServer();

export default app;
