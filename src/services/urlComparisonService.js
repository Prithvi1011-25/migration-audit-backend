import { normalizeUrl } from './sitemapParser.js';

/**
 * Compare old and new site URLs
 * @param {Array<string>} oldUrls - URLs from old site
 * @param {Array<string>} newUrls - URLs from new site
 * @param {Map} redirectMap - Optional redirect mapping
 * @returns {Object} Comparison results
 */
export const compareUrls = (oldUrls, newUrls, redirectMap = null) => {
    // Normalize all URLs
    const normalizedOldUrls = new Map(oldUrls.map(url => [normalizeUrl(url), url]));
    const normalizedNewUrls = new Set(newUrls.map(url => normalizeUrl(url)));

    const results = {
        matched: [],
        missing: [],
        new: [],
        redirected: [],
        summary: {
            totalOldUrls: oldUrls.length,
            totalNewUrls: newUrls.length,
            matchedCount: 0,
            missingCount: 0,
            newCount: 0,
            redirectedCount: 0,
            matchRate: 0,
        },
    };

    // Check each old URL
    for (const [normalizedOld, originalOld] of normalizedOldUrls) {
        let matched = false;

        // Direct match
        if (normalizedNewUrls.has(normalizedOld)) {
            results.matched.push({
                oldUrl: originalOld,
                newUrl: originalOld,
                matchType: 'direct',
            });
            matched = true;
        }
        // Check redirect mapping
        else if (redirectMap && redirectMap.has(originalOld)) {
            const mappedUrl = redirectMap.get(originalOld);
            const normalizedMapped = normalizeUrl(mappedUrl);

            if (normalizedNewUrls.has(normalizedMapped)) {
                results.redirected.push({
                    oldUrl: originalOld,
                    newUrl: mappedUrl,
                    matchType: 'mapped',
                });
                matched = true;
            }
        }

        // No match found
        if (!matched) {
            results.missing.push({
                oldUrl: originalOld,
                suggestion: findSimilarUrl(normalizedOld, Array.from(normalizedNewUrls)),
            });
        }
    }

    // Find new URLs (in new site but not in old)
    for (const newUrl of newUrls) {
        const normalized = normalizeUrl(newUrl);
        if (!normalizedOldUrls.has(normalized)) {
            // Check if it's a redirect target
            let isRedirectTarget = false;
            if (redirectMap) {
                for (const mappedUrl of redirectMap.values()) {
                    if (normalizeUrl(mappedUrl) === normalized) {
                        isRedirectTarget = true;
                        break;
                    }
                }
            }

            if (!isRedirectTarget) {
                results.new.push({
                    newUrl,
                    type: 'new_content',
                });
            }
        }
    }

    // Calculate summary statistics
    results.summary.matchedCount = results.matched.length;
    results.summary.missingCount = results.missing.length;
    results.summary.newCount = results.new.length;
    results.summary.redirectedCount = results.redirected.length;
    results.summary.matchRate = oldUrls.length > 0
        ? ((results.matched.length + results.redirected.length) / oldUrls.length * 100).toFixed(2)
        : 0;

    return results;
};

/**
 * Find similar URL using simple string similarity
 * @param {string} targetUrl - URL to match
 * @param {Array<string>} candidateUrls - List of URLs to search
 * @returns {string|null} Most similar URL or null
 */
const findSimilarUrl = (targetUrl, candidateUrls) => {
    if (candidateUrls.length === 0) return null;

    let maxSimilarity = 0;
    let mostSimilar = null;

    try {
        const targetPath = new URL(targetUrl).pathname;

        for (const candidateUrl of candidateUrls) {
            try {
                const candidatePath = new URL(candidateUrl).pathname;
                const similarity = calculateSimilarity(targetPath, candidatePath);

                if (similarity > maxSimilarity && similarity > 0.5) {
                    maxSimilarity = similarity;
                    mostSimilar = candidateUrl;
                }
            } catch {
                continue;
            }
        }
    } catch {
        return null;
    }

    return mostSimilar;
};

/**
 * Calculate string similarity (simple Levenshtein-based)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (0-1)
 */
const calculateSimilarity = (str1, str2) => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
};

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Edit distance
 */
const levenshteinDistance = (str1, str2) => {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    return matrix[str2.length][str1.length];
};

/**
 * Detect URL pattern changes
 * @param {Array<string>} oldUrls - Old site URLs
 * @param {Array<string>} newUrls - New site URLs
 * @returns {Object} Pattern analysis
 */
export const detectPatternChanges = (oldUrls, newUrls) => {
    const oldPatterns = extractPatterns(oldUrls);
    const newPatterns = extractPatterns(newUrls);

    const changes = [];

    for (const [oldPattern, oldCount] of Object.entries(oldPatterns)) {
        const similarNewPattern = findSimilarPattern(oldPattern, Object.keys(newPatterns));

        if (similarNewPattern && similarNewPattern !== oldPattern) {
            changes.push({
                oldPattern,
                newPattern: similarNewPattern,
                oldCount,
                newCount: newPatterns[similarNewPattern],
                confidence: calculateSimilarity(oldPattern, similarNewPattern),
            });
        }
    }

    return {
        changes,
        oldPatterns,
        newPatterns,
    };
};

/**
 * Extract URL patterns from a list of URLs
 * @param {Array<string>} urls - List of URLs
 * @returns {Object} Pattern counts
 */
const extractPatterns = (urls) => {
    const patterns = {};

    for (const url of urls) {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);

            if (pathParts.length > 0) {
                const pattern = `/${pathParts[0]}/`;
                patterns[pattern] = (patterns[pattern] || 0) + 1;
            }
        } catch {
            continue;
        }
    }

    return patterns;
};

/**
 * Find similar pattern
 * @param {string} targetPattern - Pattern to match
 * @param {Array<string>} patterns - List of patterns
 * @returns {string|null} Most similar pattern
 */
const findSimilarPattern = (targetPattern, patterns) => {
    let maxSimilarity = 0;
    let mostSimilar = null;

    for (const pattern of patterns) {
        const similarity = calculateSimilarity(targetPattern, pattern);
        if (similarity > maxSimilarity) {
            maxSimilarity = similarity;
            mostSimilar = pattern;
        }
    }

    return maxSimilarity > 0.6 ? mostSimilar : null;
};

export default {
    compareUrls,
    detectPatternChanges,
};
