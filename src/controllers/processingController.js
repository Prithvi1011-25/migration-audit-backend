import MigrationProject from '../models/MigrationProject.js';
import { parseSitemap, extractUrls } from '../services/sitemapParser.js';
import { parseGSCExport, parseRedirectMapping, extractGSCUrls } from '../services/csvParser.js';
import { compareUrls, detectPatternChanges } from '../services/urlComparisonService.js';
import { checkMultipleUrls, categorizeResults, findBrokenLinks, analyzeRedirects } from '../services/statusChecker.js';
import { crawlUrl } from '../services/crawlerService.js';
import { compareSEOData, generateSummary } from '../services/seoComparisonService.js';
import { runBatchAudits, getCoreWebVitalsAssessment } from '../services/lighthouseService.js';
import { comparePerformance } from '../services/performanceComparisonService.js';
import { testMultipleUrls, compareMobileResponsiveness, generateMobileSummary } from '../services/mobileResponsivenessService.js';
import { generateCSVReport, generateJSONReport } from '../services/exportService.js';

/**
 * Process a migration project: parse files, compare URLs, check status
 * @route POST /api/migration-projects/:id/process
 */
export const startProcessing = async (req, res) => {
    try {
        const { id } = req.params;

        const project = await MigrationProject.findById(id);
        if (!project) {
            return res.status(404).json({ error: 'Migration project not found' });
        }

        // Update status to processing
        project.status = 'processing';
        project.processingStatus = {
            stage: 'starting',
            progress: 0,
            startedAt: new Date(),
        };
        await project.save();

        // Start background processing (don't await - run async)
        processProject(id).catch(error => {
            console.error(`Error processing project ${id}:`, error);
        });

        res.json({
            success: true,
            message: 'Processing started',
            projectId: id,
            status: project.status,
        });
    } catch (error) {
        console.error('Error starting processing:', error);
        res.status(500).json({
            error: 'Failed to start processing',
            message: error.message,
        });
    }
};

/**
 * Select important URLs for performance testing
 * @param {Object} comparison - URL comparison results
 * @param {Array} gscData - GSC data if available
 * @returns {Array} Selected URLs to test
 */
const selectImportantUrls = (comparison, gscData) => {
    const urlsToTest = [];
    const maxUrls = 10;

    // Always include homepage if present
    const homepageUrls = [...comparison.matched, ...comparison.redirected].filter(u =>
        u.oldUrl.endsWith('/') || u.newUrl.endsWith('/')
    );

    homepageUrls.slice(0, 1).forEach(u => urlsToTest.push(u));

    // Add high-traffic URLs from GSC if available
    if (gscData && gscData.length > 0) {
        const urlPaths = new Set(urlsToTest.map(u => u.oldUrl));

        // Sort by traffic (clicks + impressions)
        const sortedGSC = [...gscData].sort((a, b) => {
            const aTraffic = (a.clicks || 0) + (a.impressions || 0);
            const bTraffic = (b.clicks || 0) + (b.impressions || 0);
            return bTraffic - aTraffic;
        });

        // Find matching URLs in our comparison
        for (const gscEntry of sortedGSC) {
            if (urlsToTest.length >= maxUrls) break;

            const matchedUrl = [...comparison.matched, ...comparison.redirected].find(u =>
                u.oldUrl === gscEntry.url
            );

            if (matchedUrl && !urlPaths.has(matchedUrl.oldUrl)) {
                urlsToTest.push(matchedUrl);
                urlPaths.add(matchedUrl.oldUrl);
            }
        }
    }

    // Fill remaining with matched/redirected URLs
    const urlPaths = new Set(urlsToTest.map(u => u.oldUrl));
    const remainingUrls = [...comparison.matched, ...comparison.redirected].filter(u =>
        !urlPaths.has(u.oldUrl)
    );

    remainingUrls.slice(0, maxUrls - urlsToTest.length).forEach(u => urlsToTest.push(u));

    return urlsToTest.slice(0, maxUrls);
};

/**
 * Background processing function
 */
const processProject = async (projectId) => {
    const project = await MigrationProject.findById(projectId);
    if (!project) {
        throw new Error('Project not found');
    }

    try {
        // Step 1: Parse sitemaps
        console.log(`[${projectId}] Step 1: Parsing sitemaps...`);
        project.processingStatus = {
            stage: 'parsing_site maps',
            progress: 10,
            startedAt: project.processingStatus.startedAt,
        };
        await project.save();

        let oldUrls = [];
        let newUrls = [];

        if (project.files?.oldSitemap?.path) {
            const oldSitemapData = await parseSitemap(project.files.oldSitemap.path, true);
            oldUrls = extractUrls(oldSitemapData);
            console.log(`Extracted ${oldUrls.length} URLs from old sitemap`);
        }

        if (project.files?.newSitemap?.path) {
            const newSitemapData = await parseSitemap(project.files.newSitemap.path, true);
            newUrls = extractUrls(newSitemapData);
            console.log(`Extracted ${newUrls.length} URLs from new sitemap`);
        }

        // Step 2: Parse GSC export (optional)
        console.log(`[${projectId}] Step 2: Parsing GSC export...`);
        project.processingStatus.stage = 'parsing_gsc';
        project.processingStatus.progress = 25;
        await project.save();

        if (project.files?.gscExport?.path) {
            const gscData = await parseGSCExport(project.files.gscExport.path);
            const gscUrls = extractGSCUrls(gscData);

            // Merge with old URLs (avoid duplicates)
            const oldUrlSet = new Set(oldUrls);
            gscUrls.forEach(url => oldUrlSet.add(url));
            oldUrls = Array.from(oldUrlSet);

            console.log(`Added ${gscUrls.length} URLs from GSC export`);

            // Store GSC data
            project.results = project.results || {};
            project.results.gscData = gscData;
        }

        // Step 3: Parse redirect mapping (optional)
        console.log(`[${projectId}] Step 3: Parsing redirect mapping...`);
        project.processingStatus.stage = 'parsing_redirects';
        project.processingStatus.progress = 35;
        await project.save();

        let redirectMap = null;
        if (project.files?.redirectMapping?.path) {
            redirectMap = await parseRedirectMapping(project.files.redirectMapping.path);
            console.log(`Loaded ${redirectMap.size} redirect mappings`);
        }

        // Store URLs
        project.urls = {
            old: oldUrls,
            new: newUrls,
        };
        await project.save();

        // Step 4: Compare URLs
        console.log(`[${projectId}] Step 4: Comparing URLs...`);
        project.processingStatus.stage = 'comparing_urls';
        project.processingStatus.progress = 50;
        await project.save();

        const comparison = compareUrls(oldUrls, newUrls, redirectMap);
        const patterns = detectPatternChanges(oldUrls, newUrls);

        project.results.urlComparison = comparison;
        project.results.patternAnalysis = patterns;
        await project.save();

        console.log(`URL comparison complete: ${comparison.summary.matchedCount} matched, ${comparison.summary.missingCount} missing`);

        // Step 5: Check HTTP status for old URLs
        console.log(`[${projectId}] Step 5: Checking status of old URLs...`);
        project.processingStatus.stage = 'checking_old_urls';
        project.processingStatus.progress = 60;
        await project.save();

        const oldUrlsToCheck = oldUrls.slice(0, 100); // Limit for now
        const oldStatusResults = await checkMultipleUrls(oldUrlsToCheck, {
            concurrency: 5,
            delay: 200,
            onProgress: (progress) => {
                // Just log progress, don't save to avoid ParallelSaveError
                console.log(`  Old URLs: ${progress.completed}/${progress.total} (${progress.percentage}%)`);
            },
        });

        const oldCategorized = categorizeResults(oldStatusResults);
        project.results.oldSiteStatus = oldCategorized;
        await project.save();

        // Step 6: Check HTTP status for new URLs
        console.log(`[${projectId}] Step 6: Checking status of new URLs...`);
        project.processingStatus.stage = 'checking_new_urls';
        project.processingStatus.progress = 75;
        await project.save();

        const newUrlsToCheck = newUrls.slice(0, 100); // Limit for now
        const newStatusResults = await checkMultipleUrls(newUrlsToCheck, {
            concurrency: 5,
            delay: 200,
            onProgress: (progress) => {
                // Just log progress, don't save to avoid ParallelSaveError
                console.log(`  New URLs: ${progress.completed}/${progress.total} (${progress.percentage}%)`);
            },
        });

        const newCategorized = categorizeResults(newStatusResults);
        project.results.newSiteStatus = newCategorized;
        await project.save();

        // Step 7: Validate SEO Elements
        console.log(`[${projectId}] Step 7: Validating SEO elements...`);
        project.processingStatus.stage = 'validating_seo';
        project.processingStatus.progress = 85;
        await project.save();

        // Get matched and redirected URLs for SEO validation
        const urlsToValidate = [
            ...comparison.matched.map(m => ({ oldUrl: m.oldUrl, newUrl: m.newUrl })),
            ...comparison.redirected.map(r => ({ oldUrl: r.oldUrl, newUrl: r.newUrl }))
        ].slice(0, 20); // Limit to 20 URLs for SEO validation

        console.log(`Validating SEO for ${urlsToValidate.length} URL pairs...`);

        const oldPagesSEO = [];
        const newPagesSEO = [];
        const seoComparisons = [];

        for (const pair of urlsToValidate) {
            try {
                // Scrape old page SEO
                const oldSEO = await crawlUrl(pair.oldUrl);
                oldPagesSEO.push({
                    url: pair.oldUrl,
                    title: oldSEO.seoData?.title || '',
                    description: oldSEO.seoData?.description || '',
                    h1: oldSEO.seoData?.headingsStructure?.h1Text || [],
                    canonical: oldSEO.seoData?.canonicalUrl || '',
                    ogTags: oldSEO.seoData?.ogTags || {},
                    extractedAt: new Date(),
                });

                // Scrape new page SEO
                const newSEO = await crawlUrl(pair.newUrl);
                newPagesSEO.push({
                    url: pair.newUrl,
                    title: newSEO.seoData?.title || '',
                    description: newSEO.seoData?.description || '',
                    h1: newSEO.seoData?.headingsStructure?.h1Text || [],
                    canonical: newSEO.seoData?.canonicalUrl || '',
                    ogTags: newSEO.seoData?.ogTags || {},
                    extractedAt: new Date(),
                });

                // Compare SEO elements
                const comparison = compareSEOData(
                    {
                        title: oldSEO.seoData?.title,
                        description: oldSEO.seoData?.description,
                        h1: oldSEO.seoData?.headingsStructure?.h1Text || [],
                        canonicalUrl: oldSEO.seoData?.canonicalUrl,
                    },
                    {
                        title: newSEO.seoData?.title,
                        description: newSEO.seoData?.description,
                        h1: newSEO.seoData?.headingsStructure?.h1Text || [],
                        canonicalUrl: newSEO.seoData?.canonicalUrl,
                    },
                    pair.newUrl
                );

                seoComparisons.push({
                    oldUrl: pair.oldUrl,
                    newUrl: pair.newUrl,
                    ...comparison,
                });

                console.log(`  SEO validated: ${pair.oldUrl} → ${pair.newUrl} (Score: ${comparison.matchScore})`);

                // Delay to avoid overwhelming servers
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`Error validating SEO for ${pair.oldUrl}:`, error.message);
            }
        }

        // Generate summary
        const seoSummary = generateSummary(seoComparisons);

        project.results.seoValidation = {
            oldPagesSEO,
            newPagesSEO,
            comparisons: seoComparisons,
            summary: seoSummary,
        };
        await project.save();

        console.log(`SEO validation complete: ${seoSummary.totalCompared} pages, avg score ${seoSummary.avgMatchScore}`);

        // Step 8: Find broken links and finalize
        console.log(`[${projectId}] Step 8: Analyzing results...`);
        project.processingStatus.stage = 'finalizing';
        project.processingStatus.progress = 90;
        await project.save();

        const oldBrokenLinks = findBrokenLinks(oldStatusResults);
        const newBrokenLinks = findBrokenLinks(newStatusResults);
        const redirectAnalysis = analyzeRedirects([...oldStatusResults, ...newStatusResults]);

        project.results.brokenLinks = {
            oldSite: oldBrokenLinks,
            newSite: newBrokenLinks,
        };
        project.results.redirectAnalysis = redirectAnalysis;

        // Step 9: Performance Testing with Lighthouse
        console.log(`[${projectId}] Step 9: Running performance tests...`);
        project.processingStatus.stage = 'testing_performance';
        project.processingStatus.progress = 92;
        await project.save();

        // Select important URLs to test (max 10)
        const urlsToTest = selectImportantUrls(comparison, project.results.gscData);

        console.log(`Selected ${urlsToTest.length} URLs for performance testing`);

        // Test old site performance
        const oldPerformance = await runBatchAudits(
            urlsToTest.map(u => u.oldUrl),
            {
                delay: 2000,
                onProgress: (p) => console.log(`  Old site: ${p.completed}/${p.total} (${p.percentage}%)`)
            }
        );

        // Test new site performance
        const newPerformance = await runBatchAudits(
            urlsToTest.map(u => u.newUrl),
            {
                delay: 2000,
                onProgress: (p) => console.log(`  New site: ${p.completed}/${p.total} (${p.percentage}%)`)
            }
        );

        // Compare performance
        const performanceComparison = comparePerformance(oldPerformance, newPerformance);

        project.results.performanceValidation = {
            oldSitePerformance: oldPerformance,
            newSitePerformance: newPerformance,
            comparisons: performanceComparison.comparisons,
            summary: performanceComparison.summary,
        };
        await project.save();

        console.log(`Performance testing complete: ${performanceComparison.summary.totalTested} pages tested`);
        console.log(`  Improved: ${performanceComparison.summary.improved}, Regressed: ${performanceComparison.summary.regressed}`);
        console.log(`  Avg score change: ${performanceComparison.summary.avgScoreDelta > 0 ? '+' : ''}${performanceComparison.summary.avgScoreDelta}`);

        // Step 10: Mobile Responsiveness Testing
        console.log(`[${projectId}] Step 10: Testing mobile responsiveness...`);
        project.processingStatus.stage = 'testing_mobile';
        project.processingStatus.progress = 96;
        await project.save();

        // Select important URLs to test (max 5 for mobile - it's resource intensive)
        const mobileUrlsToTest = urlsToTest.slice(0, 5);

        console.log(`Selected ${mobileUrlsToTest.length} URLs for mobile responsiveness testing`);

        // Test old site mobile responsiveness
        const oldMobileResults = await testMultipleUrls(
            mobileUrlsToTest.map(u => u.oldUrl),
            {
                projectId,
                site: 'old',
                onProgress: (p) => console.log(`  Old site: ${p.completed}/${p.total} (${p.percentage}%)`)
            }
        );

        // Test new site mobile responsiveness
        const newMobileResults = await testMultipleUrls(
            mobileUrlsToTest.map(u => u.newUrl),
            {
                projectId,
                site: 'new',
                onProgress: (p) => console.log(`  New site: ${p.completed}/${p.total} (${p.percentage}%)`)
            }
        );

        // Compare mobile responsiveness
        const mobileComparison = compareMobileResponsiveness(oldMobileResults, newMobileResults);
        const oldMobileSummary = generateMobileSummary(oldMobileResults);
        const newMobileSummary = generateMobileSummary(newMobileResults);

        project.results.mobileResponsiveness = {
            oldSite: oldMobileResults,
            newSite: newMobileResults,
            comparison: mobileComparison,
            summary: {
                old: oldMobileSummary,
                new: newMobileSummary,
                ...mobileComparison,
            },
        };
        await project.save();

        console.log(`Mobile testing complete: ${oldMobileResults.length} pages tested`);
        console.log(`  Old site: ${oldMobileSummary.fullyResponsive}/${oldMobileSummary.totalTested} fully responsive`);
        console.log(`  New site: ${newMobileSummary.fullyResponsive}/${newMobileSummary.totalTested} fully responsive`);
        console.log(`  Comparison: ${mobileComparison.improved} improved, ${mobileComparison.regressed} regressed`);

        // Mark as completed
        project.status = 'completed';
        project.processingStatus = {
            stage: 'completed',
            progress: 100,
            startedAt: project.processingStatus.startedAt,
            completedAt: new Date(),
        };
        await project.save();

        console.log(`[${projectId}] Processing completed successfully`);
    } catch (error) {
        console.error(`[${projectId}] Processing failed:`, error);

        project.status = 'failed';
        project.processingStatus = {
            stage: 'failed',
            progress: project.processingStatus?.progress || 0,
            startedAt: project.processingStatus?.startedAt,
            error: error.message,
        };
        await project.save();
    }
};

/**
 * Get processing status
 * @route GET /api/migration-projects/:id/status
 */
export const getProcessingStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const project = await MigrationProject.findById(id)
            .select('status processingStatus');

        if (!project) {
            return res.status(404).json({ error: 'Migration project not found' });
        }

        res.json({
            success: true,
            status: project.status,
            processingStatus: project.processingStatus,
        });
    } catch (error) {
        console.error('Error getting status:', error);
        res.status(500).json({
            error: 'Failed to get processing status',
            message: error.message,
        });
    }
};

/**
 * Get processing results
 * @route GET /api/migration-projects/:id/results
 */
export const getResults = async (req, res) => {
    try {
        const { id } = req.params;

        const project = await MigrationProject.findById(id);

        if (!project) {
            return res.status(404).json({ error: 'Migration project not found' });
        }

        if (project.status !== 'completed') {
            return res.status(400).json({
                error: 'Processing not completed yet',
                status: project.status,
                processingStatus: project.processingStatus,
            });
        }

        res.json({
            success: true,
            project: {
                id: project._id,
                oldBaseUrl: project.oldBaseUrl,
                newBaseUrl: project.newBaseUrl,
                projectName: project.projectName,
                createdAt: project.createdAt,
            },
            results: project.results,
            urls: project.urls,
        });
    } catch (error) {
        console.error('Error getting results:', error);
        res.status(500).json({
            error: 'Failed to get results',
            message: error.message,
        });
    }
};

/**
 * Get SEO validation results
 * @route GET /api/migration-projects/:id/seo-validation
 */
export const getSEOValidation = async (req, res) => {
    try {
        const { id } = req.params;

        const project = await MigrationProject.findById(id)
            .select('results.seoValidation oldBaseUrl newBaseUrl projectName');

        if (!project) {
            return res.status(404).json({ error: 'Migration project not found' });
        }

        if (!project.results?.seoValidation) {
            return res.status(404).json({
                error: 'SEO validation not available',
                message: 'SEO validation has not been run for this project yet',
            });
        }

        res.json({
            success: true,
            project: {
                id: project._id,
                oldBaseUrl: project.oldBaseUrl,
                newBaseUrl: project.newBaseUrl,
                projectName: project.projectName,
            },
            seoValidation: project.results.seoValidation,
        });
    } catch (error) {
        console.error('Error getting SEO validation:', error);
        res.status(500).json({
            error: 'Failed to get SEO validation results',
            message: error.message,
        });
    }
};

/**
 * Get performance validation results
 * @route GET /api/migration-projects/:id/performance
 */
export const getPerformanceValidation = async (req, res) => {
    try {
        const { id } = req.params;

        const project = await MigrationProject.findById(id)
            .select('results.performanceValidation oldBaseUrl newBaseUrl projectName');

        if (!project) {
            return res.status(404).json({ error: 'Migration project not found' });
        }

        if (!project.results?.performanceValidation) {
            return res.status(404).json({
                error: 'Performance validation not available',
                message: 'Performance validation has not been run for this project yet',
            });
        }

        res.json({
            success: true,
            project: {
                id: project._id,
                oldBaseUrl: project.oldBaseUrl,
                newBaseUrl: project.newBaseUrl,
                projectName: project.projectName,
            },
            performanceValidation: project.results.performanceValidation,
        });
    } catch (error) {
        console.error('Error getting performance validation:', error);
        res.status(500).json({
            error: 'Failed to get performance validation results',
            message: error.message,
        });
    }
};

/**
 * Get mobile responsiveness test results
 * @route GET /api/migration-projects/:id/mobile
 */
export const getMobileResponsiveness = async (req, res) => {
    try {
        const { id } = req.params;

        const project = await MigrationProject.findById(id)
            .select('results.mobileResponsiveness oldBaseUrl newBaseUrl projectName');

        if (!project) {
            return res.status(404).json({ error: 'Migration project not found' });
        }

        if (!project.results?.mobileResponsiveness) {
            return res.status(404).json({
                error: 'Mobile responsiveness data not available',
                message: 'Mobile responsiveness testing has not been run for this project yet',
            });
        }

        res.json({
            success: true,
            project: {
                id: project._id,
                oldBaseUrl: project.oldBaseUrl,
                newBaseUrl: project.newBaseUrl,
                projectName: project.projectName,
            },
            mobileResponsiveness: project.results.mobileResponsiveness,
        });
    } catch (error) {
        console.error('Error getting mobile responsiveness:', error);
        res.status(500).json({
            error: 'Failed to get mobile responsiveness results',
            message: error.message,
        });
    }
};

/**
 * Export migration audit report
 * @route GET /api/migration-projects/:id/export
 */
export const exportReport = async (req, res) => {
    try {
        const { id } = req.params;
        const { format = 'json', section = 'all' } = req.query;

        const project = await MigrationProject.findById(id);

        if (!project) {
            return res.status(404).json({ error: 'Migration project not found' });
        }

        if (project.status !== 'completed') {
            return res.status(400).json({
                error: 'Project not completed',
                message: 'Can only export completed audits',
            });
        }

        const timestamp = Date.now();
        const filename = `${project.projectName.replace(/[^a-z0-9]/gi, '_')}_${section}_${timestamp}`;

        if (format === 'csv') {
            const csv = generateCSVReport(project, section);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
            return res.send(csv);
        }

        // JSON export
        const json = generateJSONReport(project, section);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
        res.json(json);
    } catch (error) {
        console.error('Error exporting report:', error);
        res.status(500).json({
            error: 'Failed to export report',
            message: error.message,
        });
    }
};

export default {
    startProcessing,
    getProcessingStatus,
    getResults,
    getSEOValidation,
    getPerformanceValidation,
    getMobileResponsiveness,
    exportReport,
};
