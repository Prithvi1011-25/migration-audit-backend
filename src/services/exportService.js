/**
 * Export Service
 * Generates CSV and JSON reports from migration audit results
 */

/**
 * Escape CSV field
 */
const escapeCSV = (field) => {
    if (field === null || field === undefined) return '';
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

/**
 * Generate URL Comparison CSV
 */
const generateURLComparisonCSV = (urlComparison) => {
    if (!urlComparison) return '';

    const headers = ['Old URL', 'New URL', 'Match Type', 'Status', 'Notes'];
    const rows = [];

    // Matched URLs
    urlComparison.matched?.forEach(m => {
        rows.push([m.oldUrl, m.newUrl, 'Direct Match', 'OK', '']);
    });

    // Redirected URLs
    urlComparison.redirected?.forEach(r => {
        rows.push([r.oldUrl, r.newUrl, 'Redirected', 'Mapped', 'Via redirect mapping']);
    });

    // Missing URLs
    urlComparison.missing?.forEach(m => {
        rows.push([m.oldUrl, m.suggestion || '', 'Missing', 'Not Found', 'Potential 404']);
    });

    // New URLs
    urlComparison.newOnly?.forEach(n => {
        rows.push(['', n.url, 'New Content', 'New', 'Only in new site']);
    });

    const csv = [
        '# URL Comparison Report',
        headers.map(escapeCSV).join(','),
        ...rows.map(row => row.map(escapeCSV).join(','))
    ].join('\n');

    return csv;
};

/**
 * Generate SEO Validation CSV
 */
const generateSEOValidationCSV = (seoValidation) => {
    if (!seoValidation) return '';

    const headers = ['URL', 'Match Score', 'Title Match', 'Description Match', 'H1 Match', 'Canonical Match', 'Issues'];
    const rows = [];

    seoValidation.comparisons?.forEach(comp => {
        rows.push([
            comp.oldUrl,
            comp.matchScore,
            comp.title.match ? 'Yes' : 'No',
            comp.description.match ? 'Yes' : 'No',
            comp.h1.match ? 'Yes' : 'No',
            comp.canonical.match ? 'Yes' : 'No',
            (comp.issues || []).join('; ')
        ]);
    });

    const csv = [
        '\n# SEO Validation Report',
        headers.map(escapeCSV).join(','),
        ...rows.map(row => row.map(escapeCSV).join(','))
    ].join('\n');

    return csv;
};

/**
 * Generate Performance CSV
 */
const generatePerformanceCSV = (performanceValidation) => {
    if (!performanceValidation) return '';

    const headers = ['URL', 'Old Score', 'New Score', 'Delta', 'LCP Old', 'LCP New', 'CLS Old', 'CLS New', 'INP Old', 'INP New', 'Improved'];
    const rows = [];

    performanceValidation.comparisons?.forEach(comp => {
        rows.push([
            comp.url,
            comp.oldScore,
            comp.newScore,
            comp.scoreDelta,
            comp.coreWebVitals.lcp.old,
            comp.coreWebVitals.lcp.new,
            comp.coreWebVitals.cls.old,
            comp.coreWebVitals.cls.new,
            comp.coreWebVitals.inp.old,
            comp.coreWebVitals.inp.new,
            comp.improved ? 'Yes' : 'No'
        ]);
    });

    const csv = [
        '\n# Performance Report',
        headers.map(escapeCSV).join(','),
        ...rows.map(row => row.map(escapeCSV).join(','))
    ].join('\n');

    return csv;
};

/**
 * Generate Mobile Responsiveness CSV
 */
const generateMobileCSV = (mobileResponsiveness) => {
    if (!mobileResponsiveness) return '';

    const headers = ['URL', 'Old Mobile Issues', 'New Mobile Issues', 'Old Tablet Issues', 'New Tablet Issues', 'Old Responsive', 'New Responsive'];
    const rows = [];

    const oldSite = mobileResponsiveness.oldSite || [];
    const newSite = mobileResponsiveness.newSite || [];

    oldSite.forEach((oldResult, index) => {
        const newResult = newSite[index];
        if (!oldResult || !newResult) return;

        rows.push([
            oldResult.url,
            (oldResult.viewports?.mobile?.issues || []).join('; '),
            (newResult.viewports?.mobile?.issues || []).join('; '),
            (oldResult.viewports?.tablet?.issues || []).join('; '),
            (newResult.viewports?.tablet?.issues || []).join('; '),
            oldResult.responsive ? 'Yes' : 'No',
            newResult.responsive ? 'Yes' : 'No'
        ]);
    });

    const csv = [
        '\n# Mobile Responsiveness Report',
        headers.map(escapeCSV).join(','),
        ...rows.map(row => row.map(escapeCSV).join(','))
    ].join('\n');

    return csv;
};

/**
 * Generate complete CSV report
 */
export const generateCSVReport = (project, section = 'all') => {
    const { results } = project;
    const timestamp = new Date().toISOString();

    const header = [
        `# Migration Audit Report`,
        `# Project: ${project.projectName}`,
        `# Old Site: ${project.oldBaseUrl}`,
        `# New Site: ${project.newBaseUrl}`,
        `# Generated: ${timestamp}`,
        ''
    ].join('\n');

    if (section === 'all') {
        return [
            header,
            generateURLComparisonCSV(results.urlComparison),
            generateSEOValidationCSV(results.seoValidation),
            generatePerformanceCSV(results.performanceValidation),
            generateMobileCSV(results.mobileResponsiveness)
        ].join('\n\n');
    }

    // Section-specific export
    const sections = {
        'urls': () => header + generateURLComparisonCSV(results.urlComparison),
        'seo': () => header + generateSEOValidationCSV(results.seoValidation),
        'performance': () => header + generatePerformanceCSV(results.performanceValidation),
        'mobile': () => header + generateMobileCSV(results.mobileResponsiveness)
    };

    return sections[section] ? sections[section]() : header;
};

/**
 * Generate JSON report
 */
export const generateJSONReport = (project, section = 'all') => {
    const { results, processingStatus } = project;

    const summary = {
        project: {
            name: project.projectName,
            description: project.description,
            oldBaseUrl: project.oldBaseUrl,
            newBaseUrl: project.newBaseUrl,
            createdAt: project.createdAt,
            completedAt: processingStatus.completedAt,
            status: project.status
        },
        summary: {
            urls: {
                total: results.urlComparison?.summary?.totalOldUrls || 0,
                matched: results.urlComparison?.summary?.matchedCount || 0,
                redirected: results.urlComparison?.summary?.redirectedCount || 0,
                missing: results.urlComparison?.summary?.missingCount || 0,
                matchRate: results.urlComparison?.summary?.matchRate || 0
            },
            seo: {
                totalCompared: results.seoValidation?.summary?.totalCompared || 0,
                avgMatchScore: results.seoValidation?.summary?.avgMatchScore || 0,
                perfectMatches: results.seoValidation?.summary?.perfectMatches || 0,
                issues: results.seoValidation?.summary?.minorIssues + results.seoValidation?.summary?.majorIssues || 0
            },
            performance: {
                totalTested: results.performanceValidation?.summary?.totalTested || 0,
                avgScoreOld: results.performanceValidation?.summary?.avgScoreOld || 0,
                avgScoreNew: results.performanceValidation?.summary?.avgScoreNew || 0,
                avgDelta: results.performanceValidation?.summary?.avgScoreDelta || 0,
                improved: results.performanceValidation?.summary?.improved || 0,
                regressed: results.performanceValidation?.summary?.regressed || 0
            },
            mobile: {
                totalTested: results.mobileResponsiveness?.summary?.old?.totalTested || 0,
                oldFullyResponsive: results.mobileResponsiveness?.summary?.old?.fullyResponsive || 0,
                newFullyResponsive: results.mobileResponsiveness?.summary?.new?.fullyResponsive || 0,
                improved: results.mobileResponsiveness?.summary?.improved || 0
            }
        }
    };

    if (section === 'all') {
        return {
            ...summary,
            detailed: {
                urlComparison: results.urlComparison,
                seoValidation: results.seoValidation,
                performanceValidation: results.performanceValidation,
                mobileResponsiveness: results.mobileResponsiveness,
                brokenLinks: results.brokenLinks,
                redirectAnalysis: results.redirectAnalysis
            }
        };
    }

    // Section-specific export
    const sections = {
        'urls': results.urlComparison,
        'seo': results.seoValidation,
        'performance': results.performanceValidation,
        'mobile': results.mobileResponsiveness
    };

    return {
        ...summary,
        detailed: sections[section] || {}
    };
};

export default {
    generateCSVReport,
    generateJSONReport,
};
