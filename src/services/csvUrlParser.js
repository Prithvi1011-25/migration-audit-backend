import fs from 'fs';
import { parse } from 'csv-parse/sync';

/**
 * Parse CSV file and extract URLs
 * @param {string} filePath - Path to CSV file
 * @returns {Promise<Array>} - Array of URL objects
 */
export const parseCsvUrls = async (filePath) => {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');

        // Parse CSV
        const records = parse(fileContent, {
            columns: false, // Don't assume headers initially to handle simple lists
            skip_empty_lines: true,
            trim: true
        });

        const urls = [];

        // Heuristic to find URL column or process list
        for (const record of records) {
            // Check each column for a valid URL
            for (const cell of record) {
                if (isValidUrl(cell)) {
                    urls.push({
                        url: cell,
                        lastmod: new Date().toISOString(), // Default
                        changefreq: 'daily',
                        priority: 0.5
                    });
                    break; // Found one URL in this row, move to next
                }
            }
        }

        console.log(`Extracted ${urls.length} URLs from CSV`);
        return urls;
    } catch (error) {
        console.error('Error parsing CSV URLs:', error.message);
        throw new Error(`Failed to parse CSV: ${error.message}`);
    }
};

/**
 * Check if string is valid URL
 * @param {string} string 
 * @returns {boolean}
 */
const isValidUrl = (string) => {
    try {
        new URL(string);
        return string.startsWith('http');
    } catch (_) {
        return false;
    }
};

export default {
    parseCsvUrls
};
