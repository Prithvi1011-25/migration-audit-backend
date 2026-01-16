import mongoose from 'mongoose';

const migrationProjectSchema = new mongoose.Schema(
    {
        // Base URLs
        oldBaseUrl: {
            type: String,
            required: true,
            trim: true,
        },
        newBaseUrl: {
            type: String,
            required: true,
            trim: true,
        },

        // File paths for uploaded files
        files: {
            oldSitemap: {
                filename: String,
                path: String,
                uploadedAt: Date,
            },
            newSitemap: {
                filename: String,
                path: String,
                uploadedAt: Date,
            },
            gscExport: {
                filename: String,
                path: String,
                uploadedAt: Date,
            },
            redirectMapping: {
                filename: String,
                path: String,
                uploadedAt: Date,
            },
        },

        // Project metadata
        status: {
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed'],
            default: 'pending',
        },
        projectName: {
            type: String,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },

        // URLs extracted from sitemaps and crawls
        urls: {
            old: [String],
            new: [String],
        },

        // Processing status tracking
        processingStatus: {
            stage: String,
            progress: Number,
            startedAt: Date,
            completedAt: Date,
            error: String,
        },

        // Processing results
        results: {
            // GSC data
            gscData: mongoose.Schema.Types.Mixed,

            // URL comparison results
            urlComparison: mongoose.Schema.Types.Mixed,
            patternAnalysis: mongoose.Schema.Types.Mixed,

            // HTTP status check results
            oldSiteStatus: mongoose.Schema.Types.Mixed,
            newSiteStatus: mongoose.Schema.Types.Mixed,

            // Broken links and redirects
            brokenLinks: mongoose.Schema.Types.Mixed,
            redirectAnalysis: mongoose.Schema.Types.Mixed,

            // SEO Validation
            seoValidation: {
                oldPagesSEO: mongoose.Schema.Types.Mixed,
                newPagesSEO: mongoose.Schema.Types.Mixed,
                comparisons: mongoose.Schema.Types.Mixed,
                summary: mongoose.Schema.Types.Mixed,
            },

            // Performance Validation
            performanceValidation: {
                oldSitePerformance: mongoose.Schema.Types.Mixed,
                newSitePerformance: mongoose.Schema.Types.Mixed,
                comparisons: mongoose.Schema.Types.Mixed,
                summary: mongoose.Schema.Types.Mixed,
            },

            // Mobile Responsiveness
            mobileResponsiveness: {
                oldSite: mongoose.Schema.Types.Mixed,
                newSite: mongoose.Schema.Types.Mixed,
                comparison: mongoose.Schema.Types.Mixed,
                summary: mongoose.Schema.Types.Mixed,
            },

            // Legacy fields
            crawlStats: mongoose.Schema.Types.Mixed,
            performanceMetrics: mongoose.Schema.Types.Mixed,
            issuesFound: [String],
        },

        // Audit tracking
        createdBy: {
            type: String,
            default: 'system',
        },
        lastModified: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true, // Automatically adds createdAt and updatedAt
    }
);

// Indexes for better query performance
migrationProjectSchema.index({ createdAt: -1 });
migrationProjectSchema.index({ status: 1 });
migrationProjectSchema.index({ oldBaseUrl: 1 });

// Instance method to check if all required files are uploaded
migrationProjectSchema.methods.hasAllFiles = function () {
    const { files } = this;
    return !!(
        files?.oldSitemap?.path &&
        files?.newSitemap?.path &&
        files?.gscExport?.path &&
        files?.redirectMapping?.path
    );
};

// Static method to get recent projects
migrationProjectSchema.statics.getRecent = function (limit = 10) {
    return this.find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('-results'); // Exclude large results field
};

const MigrationProject = mongoose.model('MigrationProject', migrationProjectSchema);

export default MigrationProject;
