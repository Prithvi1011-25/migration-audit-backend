import axios from 'axios';
import PQueue from 'p-queue';

/**
 * Check HTTP status for a single URL
 * @param {string} url - URL to check
 * @param {Object} options - Check options
 * @returns {Promise<Object>} Status check result
 */
export const checkUrlStatus = async (url, options = {}) => {
    const { followRedirects = true, timeout = 10000 } = options;
    const startTime = Date.now();

    try {
        const response = await axios.get(url, {
            timeout,
            maxRedirects: followRedirects ? 10 : 0,
            validateStatus: () => true, // Don't throw on any status
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; MigrationAuditBot/1.0)',
            },
        });

        const responseTime = Date.now() - startTime;

        // Track redirect chain
        const redirectChain = [];
        if (response.request._redirectable) {
            const redirects = response.request._redirectable._redirects || [];
            redirects.forEach((redirect, index) => {
                redirectChain.push({
                    url: redirect.url,
                    statusCode: redirect.statusCode,
                    index: index + 1,
                });
            });
        }

        return {
            url,
            statusCode: response.status,
            statusText: response.statusText,
            responseTime,
            finalUrl: response.request.res.responseUrl || url,
            isRedirect: response.status >= 300 && response.status < 400,
            redirectChain,
            contentType: response.headers['content-type'],
            contentLength: response.headers['content-length'],
            server: response.headers['server'],
            timestamp: new Date().toISOString(),
            error: null,
        };
    } catch (error) {
        const responseTime = Date.now() - startTime;

        return {
            url,
            statusCode: error.response?.status || 0,
            statusText: error.message,
            responseTime,
            finalUrl: url,
            isRedirect: false,
            redirectChain: [],
            contentType: null,
            contentLength: null,
            server: null,
            timestamp: new Date().toISOString(),
            error: {
                message: error.message,
                code: error.code,
                type: error.response ? 'http_error' : 'network_error',
            },
        };
    }
};

/**
 * Check HTTP status for multiple URLs with concurrency control
 * @param {Array<string>} urls - Array of URLs to check
 * @param {Object} options - Check options
 * @returns {Promise<Array>} Array of status check results
 */
export const checkMultipleUrls = async (urls, options = {}) => {
    const {
        concurrency = 5,
        delay = 100,
        onProgress = null,
        retryAttempts = 3,
    } = options;

    const queue = new PQueue({ concurrency });
    const results = [];
    let completed = 0;

    console.log(`Starting status checks for ${urls.length} URLs...`);

    for (const url of urls) {
        queue.add(async () => {
            let result = null;
            let attempts = 0;

            // Retry logic
            while (attempts < retryAttempts) {
                result = await checkUrlStatus(url, options);

                // Break if successful or 4xx error (no point retrying)
                if (result.statusCode === 0 || result.statusCode >= 500) {
                    attempts++;
                    if (attempts < retryAttempts) {
                        await new Promise(resolve => setTimeout(resolve, delay * attempts));
                        continue;
                    }
                }
                break;
            }

            results.push(result);
            completed++;

            // Progress callback
            if (onProgress) {
                onProgress({
                    completed,
                    total: urls.length,
                    percentage: (completed / urls.length * 100).toFixed(2),
                    currentUrl: url,
                });
            }

            // Delay between requests
            await new Promise(resolve => setTimeout(resolve, delay));
        });
    }

    await queue.onIdle();

    console.log(`Status checks complete: ${results.length} URLs processed`);

    return results;
};

/**
 * Categorize status check results
 * @param {Array} results - Array of status check results
 * @returns {Object} Categorized results
 */
export const categorizeResults = (results) => {
    const categorized = {
        ok: [],           // 200 OK
        redirects: [],     // 3xx
        clientErrors: [],  // 4xx
        serverErrors: [],  // 5xx
        networkErrors: [], // Network/timeout errors
        summary: {
            total: results.length,
            okCount: 0,
            redirectCount: 0,
            clientErrorCount: 0,
            serverErrorCount: 0,
            networkErrorCount: 0,
            avgResponseTime: 0,
        },
    };

    let totalResponseTime = 0;

    for (const result of results) {
        totalResponseTime += result.responseTime;

        if (result.statusCode === 200) {
            categorized.ok.push(result);
            categorized.summary.okCount++;
        } else if (result.statusCode >= 300 && result.statusCode < 400) {
            categorized.redirects.push(result);
            categorized.summary.redirectCount++;
        } else if (result.statusCode >= 400 && result.statusCode < 500) {
            categorized.clientErrors.push(result);
            categorized.summary.clientErrorCount++;
        } else if (result.statusCode >= 500) {
            categorized.serverErrors.push(result);
            categorized.summary.serverErrorCount++;
        } else {
            categorized.networkErrors.push(result);
            categorized.summary.networkErrorCount++;
        }
    }

    categorized.summary.avgResponseTime = results.length > 0
        ? Math.round(totalResponseTime / results.length)
        : 0;

    return categorized;
};

/**
 * Find broken links (404s and other client errors)
 * @param {Array} results - Status check results
 * @returns {Array} List of broken links
 */
export const findBrokenLinks = (results) => {
    return results.filter(result =>
        result.statusCode >= 400 && result.statusCode < 500
    ).map(result => ({
        url: result.url,
        statusCode: result.statusCode,
        statusText: result.statusText,
        error: result.error,
    }));
};

/**
 * Analyze redirect chains
 * @param {Array} results - Status check results
 * @returns {Object} Redirect analysis
 */
export const analyzeRedirects = (results) => {
    const redirectResults = results.filter(r => r.isRedirect);

    return {
        totalRedirects: redirectResults.length,
        redirectTypes: {
            301: redirectResults.filter(r => r.statusCode === 301).length,
            302: redirectResults.filter(r => r.statusCode === 302).length,
            307: redirectResults.filter(r => r.statusCode === 307).length,
            308: redirectResults.filter(r => r.statusCode === 308).length,
        },
        redirectChains: redirectResults.map(r => ({
            originalUrl: r.url,
            finalUrl: r.finalUrl,
            chainLength: r.redirectChain.length,
            chain: r.redirectChain,
        })),
        longChains: redirectResults.filter(r => r.redirectChain.length > 2),
    };
};

/**
 * Check redirects for internal links
 * @param {Array<string>} links - List of internal links to check
 * @param {string} baseUrl - New site base URL to resolve relative links
 * @returns {Promise<Array>} Validation results
 */
export const checkInternalLinkRedirects = async (links, baseUrl) => {
    // Deduplicate links
    const uniqueLinks = [...new Set(links)];

    // Resolve relative URLs to absolute
    // Note: We assume these are old site links that should redirect to the new site
    // But if we are checking "internal links on the old page", they are relative to the OLD site.
    // However, statusChecker needs absolute URLs.
    // Ideally, we follow them. If they are on the old site, they should 301 to the new site.

    // Logic: 
    // 1. Crawl Old Page -> Found link "/foo"
    // 2. We construct "http://oldsite.com/foo" (using the page's origin?)
    //    Actually, we need the origin of the page where the link was found.
    //    The 'baseUrl' param here should probably be the origin of the page being crawled (Old Site Base URL).

    // Let's rely on the caller to pass absolute URLs or handle resolution if possible.
    // But crawler returns relative paths often.

    // Updated Logic: We will attempt to resolve against the provided baseUrl.
    const absoluteLinks = uniqueLinks.map(link => {
        if (link.startsWith('http')) return link;
        try {
            return new URL(link, baseUrl).toString();
        } catch (e) {
            return null;
        }
    }).filter(l => l !== null);

    // Reuse existing status checker
    // We expect these old links to Redirect (301) to the New Site (200)
    const results = await checkMultipleUrls(absoluteLinks, {
        concurrency: 5,
        delay: 50,
        followRedirects: true
    });

    return results.map(result => ({
        originalLink: result.url,
        finalUrl: result.finalUrl,
        statusCode: result.statusCode,
        status: result.statusCode === 200 ? 'ok' :
            result.statusCode === 404 ? 'broken' : 'error',
        isRedirected: result.redirectChain.length > 0,
        redirectChain: result.redirectChain
    }));
};

export default {
    checkUrlStatus,
    checkMultipleUrls,
    categorizeResults,
    findBrokenLinks,
    analyzeRedirects,
    checkInternalLinkRedirects,
};
