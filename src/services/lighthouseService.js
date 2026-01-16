import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

/**
 * Run Lighthouse audit on a given URL
 * @param {string} url - URL to audit
 * @param {object} options - Lighthouse options
 * @returns {Promise<object>} Lighthouse results
 */
export const runLighthouseAudit = async (url, options = {}) => {
    let chrome;

    try {
        // Launch Chrome
        chrome = await chromeLauncher.launch({
            chromeFlags: ['--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage'],
        });

        const lighthouseOptions = {
            logLevel: 'error',
            output: 'json',
            port: chrome.port,
            ...options,
        };

        const config = {
            extends: 'lighthouse:default',
            settings: {
                onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
            },
        };

        // Run Lighthouse
        const runnerResult = await lighthouse(url, lighthouseOptions, config);

        // Parse results
        const results = parseResults(runnerResult);

        return results;
    } catch (error) {
        console.error('Lighthouse audit error:', error);
        throw new Error(`Lighthouse audit failed: ${error.message}`);
    } finally {
        // Always kill Chrome process
        if (chrome) {
            await chrome.kill();
        }
    }
};

/**
 * Parse Lighthouse results into a structured format
 * @param {object} runnerResult - Raw Lighthouse results
 * @returns {object} Parsed results
 */
const parseResults = (runnerResult) => {
    const { lhr } = runnerResult;
    const { audits, categories } = lhr;

    // Performance metrics
    const performanceMetrics = {
        performanceScore: Math.round(categories.performance.score * 100),

        // Core Web Vitals
        largestContentfulPaint: audits['largest-contentful-paint']?.numericValue || 0,
        firstInputDelay: audits['max-potential-fid']?.numericValue || 0,
        interactionToNextPaint: audits['interaction-to-next-paint']?.numericValue || 0, // INP
        cumulativeLayoutShift: audits['cumulative-layout-shift']?.numericValue || 0,
        firstContentfulPaint: audits['first-contentful-paint']?.numericValue || 0,
        timeToInteractive: audits['interactive']?.numericValue || 0,
        speedIndex: audits['speed-index']?.numericValue || 0,
        totalBlockingTime: audits['total-blocking-time']?.numericValue || 0,
        timeToFirstByte: audits['server-response-time']?.numericValue || 0, // TTFB

        // Network metrics
        totalSize: audits['total-byte-weight']?.numericValue || 0,
        requestCount: audits['network-requests']?.details?.items?.length || 0,
    };

    // SEO metrics
    const seoMetrics = {
        score: Math.round(categories.seo.score * 100),
        title: audits['document-title']?.displayValue || '',
        description: audits['meta-description']?.displayValue || '',
        hasRobotsTxt: audits['robots-txt']?.score === 1,
        canonicalUrl: audits['canonical']?.displayValue || '',
        structuredData: audits['structured-data']?.score === 1,
    };

    // Accessibility metrics
    const accessibilityMetrics = {
        score: Math.round(categories.accessibility.score * 100),
        violations: parseAccessibilityViolations(audits),
    };

    // Best practices
    const bestPractices = {
        score: Math.round(categories['best-practices'].score * 100),
    };

    // Screenshots
    const screenshots = {
        desktop: lhr.audits['final-screenshot']?.details?.data || null,
    };

    return {
        performanceMetrics,
        seoMetrics,
        accessibilityMetrics,
        bestPractices,
        screenshots,
        rawData: lhr, // Store full Lighthouse report for detailed analysis
    };
};

/**
 * Parse accessibility violations from audits
 * @param {object} audits - Lighthouse audits
 * @returns {Array} Array of violations
 */
const parseAccessibilityViolations = (audits) => {
    const violations = [];

    // Common accessibility audits
    const accessibilityAudits = [
        'accesskeys',
        'aria-allowed-attr',
        'aria-required-children',
        'button-name',
        'color-contrast',
        'image-alt',
        'label',
        'link-name',
    ];

    accessibilityAudits.forEach((auditId) => {
        const audit = audits[auditId];
        if (audit && audit.score !== 1) {
            violations.push({
                id: auditId,
                impact: audit.details?.impact || 'unknown',
                description: audit.title,
                nodes: audit.details?.items?.length || 0,
            });
        }
    });

    return violations;
};

/**
 * Get Core Web Vitals assessment
 * @param {object} metrics - Performance metrics
 * @returns {object} Core Web Vitals assessment
 */
export const getCoreWebVitalsAssessment = (metrics) => {
    const assessLCP = (lcp) => {
        if (lcp <= 2500) return 'good';
        if (lcp <= 4000) return 'needs-improvement';
        return 'poor';
    };

    const assessFID = (fid) => {
        if (fid <= 100) return 'good';
        if (fid <= 300) return 'needs-improvement';
        return 'poor';
    };

    const assessCLS = (cls) => {
        if (cls <= 0.1) return 'good';
        if (cls <= 0.25) return 'needs-improvement';
        return 'poor';
    };

    const assessINP = (inp) => {
        if (inp <= 200) return 'good';
        if (inp <= 500) return 'needs-improvement';
        return 'poor';
    };

    return {
        lcp: assessLCP(metrics.largestContentfulPaint),
        fid: assessFID(metrics.firstInputDelay),
        inp: assessINP(metrics.interactionToNextPaint),
        cls: assessCLS(metrics.cumulativeLayoutShift),
    };
};

/**
 * Run Lighthouse audits on multiple URLs
 * @param {Array<string>} urls - URLs to audit
 * @param {Object} options - Options with onProgress callback
 * @returns {Promise<Array>} Array of audit results
 */
export const runBatchAudits = async (urls, options = {}) => {
    const results = [];
    const { onProgress, delay = 2000 } = options;

    console.log(`Starting batch Lighthouse audits for ${urls.length} URLs...`);

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];

        try {
            console.log(`[${i + 1}/${urls.length}] Testing: ${url}`);
            const result = await runLighthouseAudit(url);

            results.push({
                url,
                success: true,
                ...result,
                timestamp: new Date(),
            });

            console.log(`  ✓ Score: ${result.performanceMetrics.performanceScore}`);

            if (onProgress) {
                onProgress({
                    completed: i + 1,
                    total: urls.length,
                    percentage: ((i + 1) / urls.length * 100).toFixed(2),
                    currentUrl: url,
                });
            }

            // Delay between tests to avoid overwhelming the system
            if (i < urls.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        } catch (error) {
            console.error(`  ✗ Lighthouse failed for ${url}:`, error.message);

            results.push({
                url,
                success: false,
                error: error.message,
                timestamp: new Date(),
            });

            if (onProgress) {
                onProgress({
                    completed: i + 1,
                    total: urls.length,
                    percentage: ((i + 1) / urls.length * 100).toFixed(2),
                    currentUrl: url,
                });
            }
        }
    }

    console.log(`Batch audits complete: ${results.filter(r => r.success).length}/${urls.length} successful`);

    return results;
};

export default {
    runLighthouseAudit,
    runBatchAudits,
    getCoreWebVitalsAssessment,
};
