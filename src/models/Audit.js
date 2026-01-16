import mongoose from 'mongoose';

const auditSchema = new mongoose.Schema(
    {
        url: {
            type: String,
            required: true,
            trim: true,
        },
        status: {
            type: String,
            enum: ['pending', 'running', 'completed', 'failed'],
            default: 'pending',
        },
        performanceMetrics: {
            // Lighthouse performance score (0-100)
            performanceScore: Number,

            // Core Web Vitals
            largestContentfulPaint: Number, // LCP in ms
            firstInputDelay: Number, // FID in ms
            cumulativeLayoutShift: Number, // CLS score
            firstContentfulPaint: Number, // FCP in ms
            timeToInteractive: Number, // TTI in ms
            speedIndex: Number,
            totalBlockingTime: Number, // TBT in ms

            // Other metrics
            totalSize: Number, // Total page size in bytes
            requestCount: Number,
            domContentLoaded: Number, // DCL in ms
            loadTime: Number, // Full load time in ms
        },
        seoMetrics: {
            title: String,
            description: String,
            metaTagsCount: Number,
            headingsStructure: {
                h1Count: Number,
                h2Count: Number,
                h3Count: Number,
            },
            hasRobotsTxt: Boolean,
            hasSitemap: Boolean,
            canonicalUrl: String,
            ogTags: mongoose.Schema.Types.Mixed,
            structuredData: Boolean,
        },
        accessibilityMetrics: {
            score: Number,
            violations: [
                {
                    id: String,
                    impact: String,
                    description: String,
                    nodes: Number,
                },
            ],
        },
        crawlData: {
            httpStatus: Number,
            redirectChain: [String],
            internalLinks: Number,
            externalLinks: Number,
            brokenLinks: [String],
            responseTime: Number, // in ms
        },
        screenshots: {
            desktop: String, // URL or base64
            mobile: String,
        },
        errorMessage: String,
        duration: Number, // Audit duration in seconds
        triggeredBy: {
            type: String,
            enum: ['manual', 'scheduled', 'api'],
            default: 'manual',
        },
    },
    {
        timestamps: true,
    }
);

// Indexes for better query performance
auditSchema.index({ url: 1, createdAt: -1 });
auditSchema.index({ status: 1 });
auditSchema.index({ createdAt: -1 });

// Virtual for audit age
auditSchema.virtual('age').get(function () {
    return Math.floor((Date.now() - this.createdAt) / 1000 / 60); // in minutes
});

// Method to get performance grade
auditSchema.methods.getPerformanceGrade = function () {
    const score = this.performanceMetrics?.performanceScore || 0;
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
};

const Audit = mongoose.model('Audit', auditSchema);

export default Audit;
