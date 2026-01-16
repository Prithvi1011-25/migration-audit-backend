/**
 * SEO Comparison Service
 * Compares SEO metadata between old and new pages
 */

/**
 * Calculate text similarity using Levenshtein distance
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (0-1)
 */
const calculateTextSimilarity = (str1, str2) => {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
};

/**
 * Calculate Levenshtein distance
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
 * Compare title tags
 * @param {string} oldTitle - Old page title
 * @param {string} newTitle - New page title
 * @returns {Object} Comparison result
 */
export const compareTitles = (oldTitle, newTitle) => {
    if (!oldTitle && !newTitle) {
        return {
            match: true,
            similarity: 1,
            issue: null,
        };
    }

    if (!oldTitle) {
        return {
            match: false,
            similarity: 0,
            issue: 'Old page missing title tag',
        };
    }

    if (!newTitle) {
        return {
            match: false,
            similarity: 0,
            issue: 'New page missing title tag',
        };
    }

    const similarity = calculateTextSimilarity(oldTitle.toLowerCase(), newTitle.toLowerCase());
    const lengthDiff = Math.abs(oldTitle.length - newTitle.length);

    let issue = null;
    if (similarity < 0.5) {
        issue = 'Title significantly changed';
    } else if (lengthDiff > 20) {
        issue = 'Title length differs significantly';
    } else if (similarity < 0.8) {
        issue = 'Title partially changed';
    }

    return {
        match: similarity >= 0.8,
        similarity: Math.round(similarity * 100) / 100,
        issue,
    };
};

/**
 * Compare meta descriptions
 * @param {string} oldDesc - Old page description
 * @param {string} newDesc - New page description
 * @returns {Object} Comparison result
 */
export const compareDescriptions = (oldDesc, newDesc) => {
    if (!oldDesc && !newDesc) {
        return {
            match: true,
            similarity: 1,
            issue: null,
        };
    }

    if (!oldDesc) {
        return {
            match: false,
            similarity: 0,
            issue: 'Old page missing meta description',
        };
    }

    if (!newDesc) {
        return {
            match: false,
            similarity: 0,
            issue: 'New page missing meta description',
        };
    }

    const similarity = calculateTextSimilarity(oldDesc.toLowerCase(), newDesc.toLowerCase());
    const lengthDiff = Math.abs(oldDesc.length - newDesc.length);

    let issue = null;
    if (similarity < 0.5) {
        issue = 'Description significantly changed';
    } else if (lengthDiff > 30) {
        issue = 'Description length differs significantly';
    } else if (similarity < 0.8) {
        issue = 'Description partially changed';
    }

    return {
        match: similarity >= 0.8,
        similarity: Math.round(similarity * 100) / 100,
        issue,
    };
};

/**
 * Validate H1 tags
 * @param {Array<string>} h1Array - Array of H1 tags
 * @returns {Object} Validation result
 */
export const validateH1 = (h1Array) => {
    if (!h1Array || h1Array.length === 0) {
        return {
            valid: false,
            count: 0,
            issue: 'Missing H1 tag',
        };
    }

    if (h1Array.length > 1) {
        return {
            valid: false,
            count: h1Array.length,
            issue: `Multiple H1 tags found (${h1Array.length})`,
        };
    }

    return {
        valid: true,
        count: 1,
        issue: null,
    };
};

/**
 * Compare H1 tags
 * @param {Array<string>} oldH1 - Old page H1 tags
 * @param {Array<string>} newH1 - New page H1 tags
 * @returns {Object} Comparison result
 */
export const compareH1Tags = (oldH1, newH1) => {
    const oldValidation = validateH1(oldH1);
    const newValidation = validateH1(newH1);

    const issues = [];
    if (oldValidation.issue) issues.push(`Old: ${oldValidation.issue}`);
    if (newValidation.issue) issues.push(`New: ${newValidation.issue}`);

    let similarity = 0;
    if (oldH1?.[0] && newH1?.[0]) {
        similarity = calculateTextSimilarity(oldH1[0].toLowerCase(), newH1[0].toLowerCase());
    }

    return {
        match: oldValidation.valid && newValidation.valid && similarity >= 0.8,
        similarity: Math.round(similarity * 100) / 100,
        oldValid: oldValidation.valid,
        newValid: newValidation.valid,
        issues: issues.length > 0 ? issues : null,
    };
};

/**
 * Compare canonical URLs
 * @param {string} oldCanonical - Old page canonical URL
 * @param {string} newCanonical - New page canonical URL
 * @param {string} newUrl - Expected new URL
 * @returns {Object} Comparison result
 */
export const compareCanonical = (oldCanonical, newCanonical, newUrl) => {
    const issues = [];

    if (!oldCanonical) {
        issues.push('Old page missing canonical tag');
    }

    if (!newCanonical) {
        issues.push('New page missing canonical tag');
    }

    // Check if new canonical matches the new URL
    let canonicalMatchesUrl = false;
    if (newCanonical && newUrl) {
        const normalizedCanonical = newCanonical.replace(/\/$/, '');
        const normalizedUrl = newUrl.replace(/\/$/, '');
        canonicalMatchesUrl = normalizedCanonical === normalizedUrl;

        if (!canonicalMatchesUrl) {
            issues.push('Canonical URL does not match page URL');
        }
    }

    return {
        match: canonicalMatchesUrl,
        oldCanonical,
        newCanonical,
        issues: issues.length > 0 ? issues : null,
    };
};

/**
 * Calculate overall SEO match score
 * @param {Object} comparison - Comparison results
 * @returns {number} Match score (0-100)
 */
export const calculateMatchScore = (comparison) => {
    let score = 0;
    let maxScore = 0;

    // Title (30 points)
    maxScore += 30;
    if (comparison.title.match) {
        score += 30;
    } else {
        score += comparison.title.similarity * 30;
    }

    // Description (25 points)
    maxScore += 25;
    if (comparison.description.match) {
        score += 25;
    } else {
        score += comparison.description.similarity * 25;
    }

    // H1 (25 points)
    maxScore += 25;
    if (comparison.h1.match) {
        score += 25;
    } else if (comparison.h1.oldValid && comparison.h1.newValid) {
        score += comparison.h1.similarity * 25;
    } else if (comparison.h1.oldValid || comparison.h1.newValid) {
        score += 12.5;
    }

    // Canonical (20 points)
    maxScore += 20;
    if (comparison.canonical.match) {
        score += 20;
    }

    return Math.round((score / maxScore) * 100);
};

/**
 * Compare SEO metadata between two pages
 * @param {Object} oldSEO - Old page SEO data
 * @param {Object} newSEO - New page SEO data
 * @param {string} newUrl - New page URL for canonical check
 * @returns {Object} Comprehensive comparison
 */
export const compareSEOData = (oldSEO, newSEO, newUrl) => {
    const comparison = {
        title: compareTitles(oldSEO.title, newSEO.title),
        description: compareDescriptions(oldSEO.description, newSEO.description),
        h1: compareH1Tags(oldSEO.h1, newSEO.h1),
        canonical: compareCanonical(oldSEO.canonicalUrl, newSEO.canonicalUrl, newUrl),
    };

    // Collect all issues
    const allIssues = [];
    if (comparison.title.issue) allIssues.push(comparison.title.issue);
    if (comparison.description.issue) allIssues.push(comparison.description.issue);
    if (comparison.h1.issues) allIssues.push(...comparison.h1.issues);
    if (comparison.canonical.issues) allIssues.push(...comparison.canonical.issues);

    // Calculate overall match score
    const matchScore = calculateMatchScore(comparison);

    return {
        ...comparison,
        matchScore,
        issues: allIssues,
        severity: matchScore >= 90 ? 'none' :
            matchScore >= 75 ? 'minor' :
                matchScore >= 50 ? 'moderate' :
                    'major',
    };
};

/**
 * Generate SEO validation summary
 * @param {Array} comparisons - Array of comparison results
 * @returns {Object} Summary statistics
 */
export const generateSummary = (comparisons) => {
    if (!comparisons || comparisons.length === 0) {
        return {
            totalCompared: 0,
            perfectMatches: 0,
            minorIssues: 0,
            moderateIssues: 0,
            majorIssues: 0,
            avgMatchScore: 0,
        };
    }

    const summary = {
        totalCompared: comparisons.length,
        perfectMatches: 0,
        minorIssues: 0,
        moderateIssues: 0,
        majorIssues: 0,
        missingTitles: 0,
        missingDescriptions: 0,
        missingH1s: 0,
        multipleH1s: 0,
        canonicalMismatches: 0,
        avgMatchScore: 0,
    };

    let totalScore = 0;

    comparisons.forEach(comp => {
        totalScore += comp.matchScore;

        if (comp.matchScore >= 95) {
            summary.perfectMatches++;
        } else if (comp.severity === 'minor') {
            summary.minorIssues++;
        } else if (comp.severity === 'moderate') {
            summary.moderateIssues++;
        } else if (comp.severity === 'major') {
            summary.majorIssues++;
        }

        // Count specific issues
        if (comp.title.issue?.includes('missing')) summary.missingTitles++;
        if (comp.description.issue?.includes('missing')) summary.missingDescriptions++;
        if (comp.h1.issues?.some(i => i.includes('Missing'))) summary.missingH1s++;
        if (comp.h1.issues?.some(i => i.includes('Multiple'))) summary.multipleH1s++;
        if (comp.canonical.issues?.some(i => i.includes('Canonical'))) summary.canonicalMismatches++;
    });

    summary.avgMatchScore = Math.round(totalScore / comparisons.length);

    return summary;
};

export default {
    compareTitles,
    compareDescriptions,
    compareH1Tags,
    compareCanonical,
    compareSEOData,
    calculateMatchScore,
    generateSummary,
};
