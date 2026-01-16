import Audit from '../models/Audit.js';
import { runLighthouseAudit, getCoreWebVitalsAssessment } from '../services/lighthouseService.js';
import { crawlUrl, checkRobotsTxt, checkSitemap } from '../services/crawlerService.js';
import { notifyAuditComplete, notifyAuditFailure } from '../services/notificationService.js';
import { getRedisClient } from '../config/database.js';

/**
 * Create a new audit
 * POST /api/audits
 */
export const createAudit = async (req, res) => {
    try {
        const { url, triggeredBy = 'manual', useHeadless = false } = req.body;

        // Validate URL
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Create initial audit record
        const audit = new Audit({
            url,
            status: 'pending',
            triggeredBy,
        });

        await audit.save();

        // Run audit asynchronously (don't wait for completion)
        runAuditProcess(audit._id, url, useHeadless).catch((error) => {
            console.error('Audit process error:', error);
        });

        res.status(201).json({
            message: 'Audit created and started',
            auditId: audit._id,
            status: audit.status,
        });
    } catch (error) {
        console.error('Create audit error:', error);
        res.status(500).json({ error: 'Failed to create audit' });
    }
};

/**
 * Run the complete audit process
 * @param {string} auditId - Audit ID
 * @param {string} url - URL to audit
 * @param {boolean} useHeadless - Use Puppeteer for crawling
 */
const runAuditProcess = async (auditId, url, useHeadless) => {
    const startTime = Date.now();

    try {
        // Update status to running
        await Audit.findByIdAndUpdate(auditId, { status: 'running' });

        // Run Lighthouse audit
        console.log(`Running Lighthouse audit for ${url}...`);
        const lighthouseResults = await runLighthouseAudit(url);

        // Run crawler
        console.log(`Crawling ${url}...`);
        const crawlResults = await crawlUrl(url, { useHeadless });

        // Check robots.txt and sitemap
        const [hasRobotsTxt, hasSitemap] = await Promise.all([
            checkRobotsTxt(url),
            checkSitemap(url),
        ]);

        // Calculate duration
        const duration = Math.floor((Date.now() - startTime) / 1000);

        // Merge all results and update audit
        const updateData = {
            status: 'completed',
            performanceMetrics: lighthouseResults.performanceMetrics,
            seoMetrics: {
                ...lighthouseResults.seoMetrics,
                ...crawlResults.seoData,
                hasRobotsTxt,
                hasSitemap,
            },
            accessibilityMetrics: lighthouseResults.accessibilityMetrics,
            crawlData: {
                httpStatus: crawlResults.httpStatus,
                redirectChain: crawlResults.redirectChain,
                internalLinks: crawlResults.links?.internalLinks || 0,
                externalLinks: crawlResults.links?.externalLinks || 0,
                brokenLinks: crawlResults.links?.brokenLinks || [],
                responseTime: crawlResults.responseTime,
            },
            screenshots: lighthouseResults.screenshots,
            duration,
        };

        const completedAudit = await Audit.findByIdAndUpdate(auditId, updateData, { new: true });

        // Send success notification
        await notifyAuditComplete(completedAudit);

        // Cache the result
        await cacheAuditResult(url, completedAudit);

        console.log(`✅ Audit completed for ${url} in ${duration}s`);
    } catch (error) {
        console.error('Audit process failed:', error);

        const duration = Math.floor((Date.now() - startTime) / 1000);

        // Update audit with error
        const failedAudit = await Audit.findByIdAndUpdate(
            auditId,
            {
                status: 'failed',
                errorMessage: error.message,
                duration,
            },
            { new: true }
        );

        // Send failure notification
        await notifyAuditFailure(failedAudit);
    }
};

/**
 * Get audit by ID
 * GET /api/audits/:id
 */
export const getAudit = async (req, res) => {
    try {
        const { id } = req.params;

        const audit = await Audit.findById(id);

        if (!audit) {
            return res.status(404).json({ error: 'Audit not found' });
        }

        // Add Core Web Vitals assessment
        const coreWebVitals = audit.performanceMetrics
            ? getCoreWebVitalsAssessment(audit.performanceMetrics)
            : null;

        res.json({
            audit,
            coreWebVitals,
            grade: audit.getPerformanceGrade(),
        });
    } catch (error) {
        console.error('Get audit error:', error);
        res.status(500).json({ error: 'Failed to get audit' });
    }
};

/**
 * Get all audits with pagination and filtering
 * GET /api/audits
 */
export const getAudits = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            status,
            url,
            sortBy = 'createdAt',
            order = 'desc',
        } = req.query;

        // Build query
        const query = {};
        if (status) query.status = status;
        if (url) query.url = new RegExp(url, 'i');

        // Execute query with pagination
        const audits = await Audit.find(query)
            .sort({ [sortBy]: order === 'desc' ? -1 : 1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .select('-__v');

        const total = await Audit.countDocuments(query);

        res.json({
            audits,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        console.error('Get audits error:', error);
        res.status(500).json({ error: 'Failed to get audits' });
    }
};

/**
 * Delete audit by ID
 * DELETE /api/audits/:id
 */
export const deleteAudit = async (req, res) => {
    try {
        const { id } = req.params;

        const audit = await Audit.findByIdAndDelete(id);

        if (!audit) {
            return res.status(404).json({ error: 'Audit not found' });
        }

        res.json({ message: 'Audit deleted successfully' });
    } catch (error) {
        console.error('Delete audit error:', error);
        res.status(500).json({ error: 'Failed to delete audit' });
    }
};

/**
 * Get audit statistics
 * GET /api/audits/stats
 */
export const getAuditStats = async (req, res) => {
    try {
        const { days = 7 } = req.query;

        const dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - parseInt(days));

        // Aggregate statistics
        const stats = await Audit.aggregate([
            {
                $match: {
                    createdAt: { $gte: dateFrom },
                    status: 'completed',
                },
            },
            {
                $group: {
                    _id: null,
                    totalAudits: { $sum: 1 },
                    avgPerformanceScore: { $avg: '$performanceMetrics.performanceScore' },
                    avgSeoScore: { $avg: '$seoMetrics.score' },
                    avgAccessibilityScore: { $avg: '$accessibilityMetrics.score' },
                    avgLCP: { $avg: '$performanceMetrics.largestContentfulPaint' },
                    avgFID: { $avg: '$performanceMetrics.firstInputDelay' },
                    avgCLS: { $avg: '$performanceMetrics.cumulativeLayoutShift' },
                },
            },
        ]);

        const statusCounts = await Audit.aggregate([
            {
                $match: {
                    createdAt: { $gte: dateFrom },
                },
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]);

        res.json({
            period: `Last ${days} days`,
            statistics: stats[0] || {},
            statusBreakdown: statusCounts,
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
};

/**
 * Get audit history for a specific URL
 * GET /api/audits/history/:url
 */
export const getAuditHistory = async (req, res) => {
    try {
        const { url } = req.params;
        const { limit = 10 } = req.query;

        const audits = await Audit.find({ url })
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .select('createdAt performanceMetrics.performanceScore seoMetrics.score status');

        res.json({
            url,
            history: audits,
        });
    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Failed to get audit history' });
    }
};

/**
 * Cache audit result in Redis
 * @param {string} url - URL
 * @param {object} audit - Audit object
 */
const cacheAuditResult = async (url, audit) => {
    try {
        const redis = getRedisClient();
        if (!redis) return;

        const cacheKey = `audit:${url}`;
        const cacheTTL = parseInt(process.env.CACHE_TTL) || 3600;

        await redis.setEx(cacheKey, cacheTTL, JSON.stringify(audit));
    } catch (error) {
        console.error('Cache error:', error);
    }
};
