/**
 * Mobile Responsiveness Testing Service
 * Tests pages across different viewport sizes and detects layout issues
 */

import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs/promises';

/**
 * Viewport configurations for testing
 */
const VIEWPORT_SIZES = {
    mobile: {
        width: 375,
        height: 667,
        deviceScaleFactor: 2,
        name: 'iPhone SE',
        isMobile: true,
        hasTouch: true,
    },
    tablet: {
        width: 768,
        height: 1024,
        deviceScaleFactor: 2,
        name: 'iPad',
        isMobile: true,
        hasTouch: true,
    },
    desktop: {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        name: 'Desktop',
        isMobile: false,
        hasTouch: false,
    },
};

/**
 * Ensure screenshots directory exists
 */
const ensureScreenshotDir = async (projectId, site) => {
    const dir = path.join(process.cwd(), 'uploads', 'screenshots', projectId, site);
    await fs.mkdir(dir, { recursive: true });
    return dir;
};

/**
 * Test a single viewport for a URL
 * @param {Object} page - Puppeteer page instance
 * @param {string} url - URL to test
 * @param {string} deviceType - Device type (mobile, tablet, desktop)
 * @param {Object} viewport - Viewport configuration
 * @param {string} screenshotDir - Directory to save screenshots
 * @returns {Promise<Object>} Test results for this viewport
 */
const testViewport = async (page, url, deviceType, viewport, screenshotDir) => {
    try {
        // Set viewport
        await page.setViewport({
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: viewport.deviceScaleFactor,
            isMobile: viewport.isMobile,
            hasTouch: viewport.hasTouch,
        });

        // Navigate to URL
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 30000,
        });

        // Wait a bit for any animations to settle
        await page.waitForTimeout(1000);

        // Take screenshot
        const timestamp = Date.now();
        const screenshotFilename = `${deviceType}_${timestamp}.png`;
        const screenshotPath = path.join(screenshotDir, screenshotFilename);

        await page.screenshot({
            path: screenshotPath,
            fullPage: true,
        });

        // Detect layout issues
        const issues = await detectLayoutIssues(page, deviceType);

        // Get page metrics
        const metrics = await page.metrics();

        return {
            device: deviceType,
            viewport: {
                width: viewport.width,
                height: viewport.height,
                name: viewport.name,
            },
            screenshot: screenshotPath,
            issues: issues.issues,
            hasOverflow: issues.hasOverflow,
            metrics: {
                layoutDuration: metrics.LayoutDuration,
                scriptDuration: metrics.ScriptDuration,
            },
            timestamp: new Date(),
        };
    } catch (error) {
        console.error(`Error testing ${deviceType} viewport for ${url}:`, error.message);
        return {
            device: deviceType,
            error: error.message,
            timestamp: new Date(),
        };
    }
};

/**
 * Detect layout issues on the page
 * @param {Object} page - Puppeteer page instance
 * @param {string} deviceType - Device type
 * @returns {Promise<Object>} Detected issues
 */
const detectLayoutIssues = async (page, deviceType) => {
    const issues = [];

    try {
        // Check for horizontal overflow
        const hasOverflow = await page.evaluate(() => {
            return document.documentElement.scrollWidth > window.innerWidth;
        });

        if (hasOverflow) {
            issues.push('Horizontal scrollbar detected - content wider than viewport');
        }

        // Check for small touch targets (only on mobile/tablet)
        if (deviceType !== 'desktop') {
            const smallTouchTargets = await page.evaluate(() => {
                const interactiveElements = document.querySelectorAll('button, a, input, select, textarea');
                const small = [];

                interactiveElements.forEach(el => {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        if (rect.width < 44 || rect.height < 44) {
                            small.push({
                                tag: el.tagName,
                                width: Math.round(rect.width),
                                height: Math.round(rect.height),
                            });
                        }
                    }
                });

                return small.length;
            });

            if (smallTouchTargets > 0) {
                issues.push(`${smallTouchTargets} touch targets smaller than 44x44px`);
            }
        }

        // Check for tiny fonts
        const tinyFonts = await page.evaluate(() => {
            const allText = document.querySelectorAll('p, span, div, a, button, li, td, th, h1, h2, h3, h4, h5, h6');
            let count = 0;

            allText.forEach(el => {
                const fontSize = parseFloat(window.getComputedStyle(el).fontSize);
                if (fontSize < 12 && el.textContent.trim().length > 0) {
                    count++;
                }
            });

            return count;
        });

        if (tinyFonts > 0) {
            issues.push(`${tinyFonts} elements with font size smaller than 12px`);
        }

        // Check for fixed positioning issues on mobile
        if (deviceType === 'mobile') {
            const fixedElements = await page.evaluate(() => {
                const fixed = document.querySelectorAll('*');
                let count = 0;

                fixed.forEach(el => {
                    const position = window.getComputedStyle(el).position;
                    if (position === 'fixed') {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > window.innerWidth * 0.9) {
                            count++;
                        }
                    }
                });

                return count;
            });

            if (fixedElements > 0) {
                issues.push(`${fixedElements} fixed elements spanning full width (may block content)`);
            }
        }

        return {
            hasOverflow,
            issues,
        };
    } catch (error) {
        console.error('Error detecting layout issues:', error.message);
        return {
            hasOverflow: false,
            issues: ['Error detecting issues: ' + error.message],
        };
    }
};

/**
 * Test mobile responsiveness for a single URL
 * @param {string} url - URL to test
 * @param {Object} options - Test options
 * @returns {Promise<Object>} Test results
 */
export const testMobileResponsiveness = async (url, options = {}) => {
    const { projectId = 'default', site = 'test' } = options;

    let browser;

    try {
        // Ensure screenshot directory exists
        const screenshotDir = await ensureScreenshotDir(projectId, site);

        // Launch browser
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
            ],
        });

        const page = await browser.newPage();

        // Test all viewport sizes
        const viewportResults = {};

        for (const [deviceType, viewport] of Object.entries(VIEWPORT_SIZES)) {
            console.log(`  Testing ${deviceType} (${viewport.width}x${viewport.height})...`);
            const result = await testViewport(page, url, deviceType, viewport, screenshotDir);
            viewportResults[deviceType] = result;
        }

        // Determine if page is responsive
        const allIssues = Object.values(viewportResults)
            .filter(r => !r.error)
            .flatMap(r => r.issues);

        const responsive = allIssues.length === 0;

        return {
            url,
            viewports: viewportResults,
            overallIssues: allIssues,
            responsive,
            timestamp: new Date(),
        };
    } catch (error) {
        console.error(`Error testing mobile responsiveness for ${url}:`, error.message);
        return {
            url,
            error: error.message,
            timestamp: new Date(),
        };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

/**
 * Test multiple URLs for mobile responsiveness
 * @param {Array<string>} urls - URLs to test
 * @param {Object} options - Test options
 * @returns {Promise<Array>} Array of test results
 */
export const testMultipleUrls = async (urls, options = {}) => {
    const results = [];
    const { onProgress } = options;

    console.log(`Testing mobile responsiveness for ${urls.length} URLs...`);

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];

        console.log(`[${i + 1}/${urls.length}] Testing: ${url}`);

        try {
            const result = await testMobileResponsiveness(url, options);
            results.push(result);

            if (onProgress) {
                onProgress({
                    completed: i + 1,
                    total: urls.length,
                    percentage: ((i + 1) / urls.length * 100).toFixed(2),
                    currentUrl: url,
                });
            }
        } catch (error) {
            console.error(`  ✗ Failed: ${error.message}`);
            results.push({
                url,
                error: error.message,
                timestamp: new Date(),
            });
        }

        // Small delay between tests
        if (i < urls.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    const successful = results.filter(r => !r.error).length;
    console.log(`Mobile testing complete: ${successful}/${urls.length} successful`);

    return results;
};

/**
 * Compare mobile responsiveness between old and new sites
 * @param {Array} oldResults - Old site test results
 * @param {Array} newResults - New site test results
 * @returns {Object} Comparison results
 */
export const compareMobileResponsiveness = (oldResults, newResults) => {
    const comparison = {
        improved: 0,
        regressed: 0,
        unchanged: 0,
        commonIssues: [],
    };

    const getUrlPath = (url) => {
        try {
            const urlObj = new URL(url);
            return urlObj.pathname;
        } catch {
            return url;
        }
    };

    for (const oldResult of oldResults) {
        if (oldResult.error) continue;

        const oldPath = getUrlPath(oldResult.url);
        const newResult = newResults.find(r => !r.error && getUrlPath(r.url) === oldPath);

        if (newResult) {
            const oldIssueCount = oldResult.overallIssues?.length || 0;
            const newIssueCount = newResult.overallIssues?.length || 0;

            if (newIssueCount < oldIssueCount) {
                comparison.improved++;
            } else if (newIssueCount > oldIssueCount) {
                comparison.regressed++;
            } else {
                comparison.unchanged++;
            }

            // Find common issues
            const oldIssues = new Set(oldResult.overallIssues || []);
            const newIssues = new Set(newResult.overallIssues || []);

            oldIssues.forEach(issue => {
                if (newIssues.has(issue) && !comparison.commonIssues.includes(issue)) {
                    comparison.commonIssues.push(issue);
                }
            });
        }
    }

    return comparison;
};

/**
 * Generate mobile responsiveness summary
 * @param {Array} results - Test results
 * @returns {Object} Summary statistics
 */
export const generateMobileSummary = (results) => {
    const summary = {
        totalTested: results.filter(r => !r.error).length,
        fullyResponsive: 0,
        hasMinorIssues: 0,
        hasMajorIssues: 0,
    };

    results.forEach(result => {
        if (result.error) return;

        const issueCount = result.overallIssues?.length || 0;

        if (issueCount === 0) {
            summary.fullyResponsive++;
        } else if (issueCount <= 2) {
            summary.hasMinorIssues++;
        } else {
            summary.hasMajorIssues++;
        }
    });

    return summary;
};

export default {
    testMobileResponsiveness,
    testMultipleUrls,
    compareMobileResponsiveness,
    generateMobileSummary,
};
