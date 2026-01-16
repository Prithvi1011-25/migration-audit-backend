/**
 * Performance Comparison Service
 * Compares performance metrics between old and new sites
 */

/**
 * Extract URL path for matching
 * @param {string} url - Full URL
 * @returns {string} URL path
 */
const getUrlPath = (url) => {
    try {
        const urlObj = new URL(url);
        return urlObj.pathname + urlObj.search;
    } catch {
        return url;
    }
};

/**
 * Calculate percentage improvement/regression
 * @param {number} oldValue - Old metric value
 * @param {number} newValue - New metric value
 * @param {boolean} lowerIsBetter - Whether lower values are better
 * @returns {number} Percentage change
 */
const calculateImprovement = (oldValue, newValue, lowerIsBetter = true) => {
    if (oldValue === 0) return 0;

    const change = ((newValue - oldValue) / oldValue) * 100;

    // For metrics where lower is better (LCP, CLS, etc.), invert the sign
    return lowerIsBetter ? -change : change;
};

/**
 * Assess performance change
 * @param {number} improvement - Percentage improvement
 * @returns {string} Assessment
 */
const assessChange = (improvement) => {
    if (improvement >= 10) return 'significant improvement';
    if (improvement >= 5) return 'moderate improvement';
    if (improvement > -5) return 'minimal change';
    if (improvement > -10) return 'moderate regression';
    return 'significant regression';
};

/**
 * Compare Core Web Vitals
 * @param {Object} oldMetrics - Old site metrics
 * @param {Object} newMetrics - New site metrics
 * @returns {Object} Core Web Vitals comparison
 */
const compareCoreWebVitals = (oldMetrics, newMetrics) => {
    return {
        lcp: {
            old: Math.round(oldMetrics.largestContentfulPaint),
            new: Math.round(newMetrics.largestContentfulPaint),
            delta: Math.round(newMetrics.largestContentfulPaint - oldMetrics.largestContentfulPaint),
            improvement: calculateImprovement(oldMetrics.largestContentfulPaint, newMetrics.largestContentfulPaint),
            assessment: assessChange(calculateImprovement(oldMetrics.largestContentfulPaint, newMetrics.largestContentfulPaint)),
        },
        cls: {
            old: Math.round(oldMetrics.cumulativeLayoutShift * 1000) / 1000,
            new: Math.round(newMetrics.cumulativeLayoutShift * 1000) / 1000,
            delta: Math.round((newMetrics.cumulativeLayoutShift - oldMetrics.cumulativeLayoutShift) * 1000) / 1000,
            improvement: calculateImprovement(oldMetrics.cumulativeLayoutShift, newMetrics.cumulativeLayoutShift),
            assessment: assessChange(calculateImprovement(oldMetrics.cumulativeLayoutShift, newMetrics.cumulativeLayoutShift)),
        },
        inp: {
            old: Math.round(oldMetrics.interactionToNextPaint),
            new: Math.round(newMetrics.interactionToNextPaint),
            delta: Math.round(newMetrics.interactionToNextPaint - oldMetrics.interactionToNextPaint),
            improvement: calculateImprovement(oldMetrics.interactionToNextPaint, newMetrics.interactionToNextPaint),
            assessment: assessChange(calculateImprovement(oldMetrics.interactionToNextPaint, newMetrics.interactionToNextPaint)),
        },
        fcp: {
            old: Math.round(oldMetrics.firstContentfulPaint),
            new: Math.round(newMetrics.firstContentfulPaint),
            delta: Math.round(newMetrics.firstContentfulPaint - oldMetrics.firstContentfulPaint),
            improvement: calculateImprovement(oldMetrics.firstContentfulPaint, newMetrics.firstContentfulPaint),
        },
        ttfb: {
            old: Math.round(oldMetrics.timeToFirstByte),
            new: Math.round(newMetrics.timeToFirstByte),
            delta: Math.round(newMetrics.timeToFirstByte - oldMetrics.timeToFirstByte),
            improvement: calculateImprovement(oldMetrics.timeToFirstByte, newMetrics.timeToFirstByte),
        },
    };
};

/**
 * Compare performance between old and new sites
 * @param {Array} oldResults - Old site Lighthouse results
 * @param {Array} newResults - New site Lighthouse results
 * @returns {Object} Performance comparison
 */
export const comparePerformance = (oldResults, newResults) => {
    const comparisons = [];
    const successfulOld = oldResults.filter(r => r.success);
    const successfulNew = newResults.filter(r => r.success);

    console.log(`Comparing performance: ${successfulOld.length} old URLs vs ${successfulNew.length} new URLs`);

    for (const oldResult of successfulOld) {
        const oldPath = getUrlPath(oldResult.url);

        // Find matching new result by URL path
        const newResult = successfulNew.find(r => getUrlPath(r.url) === oldPath);

        if (newResult) {
            const oldScore = oldResult.performanceMetrics.performanceScore;
            const newScore = newResult.performanceMetrics.performanceScore;
            const scoreDelta = newScore - oldScore;

            const comparison = {
                url: oldPath,
                oldUrl: oldResult.url,
                newUrl: newResult.url,
                oldScore,
                newScore,
                scoreDelta,
                improved: scoreDelta > 0,
                coreWebVitals: compareCoreWebVitals(
                    oldResult.performanceMetrics,
                    newResult.performanceMetrics
                ),
                metrics: {
                    tti: {
                        old: Math.round(oldResult.performanceMetrics.timeToInteractive),
                        new: Math.round(newResult.performanceMetrics.timeToInteractive),
                        delta: Math.round(newResult.performanceMetrics.timeToInteractive - oldResult.performanceMetrics.timeToInteractive),
                    },
                    tbt: {
                        old: Math.round(oldResult.performanceMetrics.totalBlockingTime),
                        new: Math.round(newResult.performanceMetrics.totalBlockingTime),
                        delta: Math.round(newResult.performanceMetrics.totalBlockingTime - oldResult.performanceMetrics.totalBlockingTime),
                    },
                    si: {
                        old: Math.round(oldResult.performanceMetrics.speedIndex),
                        new: Math.round(newResult.performanceMetrics.speedIndex),
                        delta: Math.round(newResult.performanceMetrics.speedIndex - oldResult.performanceMetrics.speedIndex),
                    },
                },
            };

            comparisons.push(comparison);
        }
    }

    // Generate summary
    const summary = generateSummary(comparisons);

    return {
        comparisons,
        summary,
    };
};

/**
 * Generate performance summary statistics
 * @param {Array} comparisons - Performance comparisons
 * @returns {Object} Summary statistics
 */
const generateSummary = (comparisons) => {
    if (comparisons.length === 0) {
        return {
            totalTested: 0,
            improved: 0,
            regressed: 0,
            unchanged: 0,
            avgScoreOld: 0,
            avgScoreNew: 0,
            avgScoreDelta: 0,
            coreWebVitals: {
                lcpImproved: 0,
                clsImproved: 0,
                inpImproved: 0,
            },
        };
    }

    const totalOldScore = comparisons.reduce((sum, c) => sum + c.oldScore, 0);
    const totalNewScore = comparisons.reduce((sum, c) => sum + c.newScore, 0);

    const improved = comparisons.filter(c => c.scoreDelta > 5).length;
    const regressed = comparisons.filter(c => c.scoreDelta < -5).length;
    const unchanged = comparisons.length - improved - regressed;

    // Core Web Vitals improvements
    const lcpImproved = comparisons.filter(c => c.coreWebVitals.lcp.improvement > 0).length;
    const clsImproved = comparisons.filter(c => c.coreWebVitals.cls.improvement > 0).length;
    const inpImproved = comparisons.filter(c => c.coreWebVitals.inp.improvement > 0).length;

    return {
        totalTested: comparisons.length,
        improved,
        regressed,
        unchanged,
        avgScoreOld: Math.round(totalOldScore / comparisons.length),
        avgScoreNew: Math.round(totalNewScore / comparisons.length),
        avgScoreDelta: Math.round((totalNewScore - totalOldScore) / comparisons.length),
        coreWebVitals: {
            lcpImproved,
            clsImproved,
            inpImproved,
            lcpImprovedPct: Math.round((lcpImproved / comparisons.length) * 100),
            clsImprovedPct: Math.round((clsImproved / comparisons.length) * 100),
            inpImprovedPct: Math.round((inpImproved / comparisons.length) * 100),
        },
    };
};

export default {
    comparePerformance,
};
