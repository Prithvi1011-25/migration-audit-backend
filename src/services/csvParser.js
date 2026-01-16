import fs from 'fs';
import csv from 'csv-parser';

/**
 * Parse Google Search Console export CSV
 * @param {string} filePath - Path to GSC CSV file
 * @returns {Promise<Array>} - Array of URL data with metrics
 */
export const parseGSCExport = (filePath) => {
    return new Promise((resolve, reject) => {
        const results = [];
        const urlSet = new Set();

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                // GSC export typically has columns like: URL, Clicks, Impressions, CTR, Position
                const url = row.URL || row.url || row.Page || row.page;

                if (url && !urlSet.has(url)) {
                    urlSet.add(url);
                    results.push({
                        url,
                        clicks: parseInt(row.Clicks || row.clicks || 0),
                        impressions: parseInt(row.Impressions || row.impressions || 0),
                        ctr: parseFloat(row.CTR || row.ctr || 0),
                        position: parseFloat(row.Position || row.position || row['Avg. Position'] || 0),
                    });
                }
            })
            .on('end', () => {
                console.log(`Parsed ${results.length} URLs from GSC export`);
                resolve(results);
            })
            .on('error', (error) => {
                console.error('Error parsing GSC CSV:', error.message);
                reject(error);
            });
    });
};

/**
 * Parse redirect mapping CSV
 * @param {string} filePath - Path to redirect mapping CSV
 * @returns {Promise<Map>} - Map of old URL to new URL
 */
export const parseRedirectMapping = (filePath) => {
    return new Promise((resolve, reject) => {
        const redirectMap = new Map();

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                // Expected columns: OldURL, NewURL (or similar variations)
                const oldUrl = row.OldURL || row['Old URL'] || row.oldUrl || row.old_url || row.from;
                const newUrl = row.NewURL || row['New URL'] || row.newUrl || row.new_url || row.to;

                if (oldUrl && newUrl) {
                    redirectMap.set(oldUrl.trim(), newUrl.trim());
                }
            })
            .on('end', () => {
                console.log(`Parsed ${redirectMap.size} redirect mappings`);
                resolve(redirectMap);
            })
            .on('error', (error) => {
                console.error('Error parsing redirect mapping CSV:', error.message);
                reject(error);
            });
    });
};

/**
 * Extract URLs from GSC data
 * @param {Array} gscData - Array from parseGSCExport
 * @returns {Array<string>} - Array of URL strings
 */
export const extractGSCUrls = (gscData) => {
    return gscData.map(item => item.url);
};

/**
 * Parse generic CSV and extract URLs from specified column
 * @param {string} filePath - Path to CSV file
 * @param {string} urlColumn - Name of the column containing URLs
 * @returns {Promise<Array<string>>} - Array of URLs
 */
export const parseGenericCSV = (filePath, urlColumn = 'URL') => {
    return new Promise((resolve, reject) => {
        const urls = [];

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                const url = row[urlColumn];
                if (url) {
                    urls.push(url.trim());
                }
            })
            .on('end', () => {
                console.log(`Extracted ${urls.length} URLs from CSV`);
                resolve(urls);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
};

export default {
    parseGSCExport,
    parseRedirectMapping,
    extractGSCUrls,
    parseGenericCSV,
};
