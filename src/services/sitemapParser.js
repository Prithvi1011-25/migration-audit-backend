import fs from 'fs';
import xml2js from 'xml2js';
import axios from 'axios';

/**
 * Parse XML sitemap and extract URLs
 * @param {string} filePath - Path to sitemap XML file or URL
 * @param {boolean} isFile - Whether the path is a file (true) or URL (false)
 * @returns {Promise<Array>} - Array of URL objects
 */
export const parseSitemap = async (filePath, isFile = true) => {
    try {
        let xmlContent;

        if (isFile) {
            // Read from file
            xmlContent = fs.readFileSync(filePath, 'utf8');
        } else {
            // Fetch from URL
            const response = await axios.get(filePath, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; MigrationAuditBot/1.0)',
                }
            });
            xmlContent = response.data;
        }

        // Parse XML
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(xmlContent);

        let urls = [];

        // Check if it's a sitemap index (contains other sitemaps)
        if (result.sitemapindex) {
            console.log('Detected sitemap index, parsing nested sitemaps...');
            const sitemaps = result.sitemapindex.sitemap || [];

            for (const sitemap of sitemaps) {
                const sitemapUrl = sitemap.loc[0];
                console.log(`Fetching nested sitemap: ${sitemapUrl}`);

                try {
                    const nestedUrls = await parseSitemap(sitemapUrl, false);
                    urls = urls.concat(nestedUrls);
                } catch (error) {
                    console.error(`Error parsing nested sitemap ${sitemapUrl}:`, error.message);
                }
            }
        }
        // Regular sitemap with URLs
        else if (result.urlset) {
            const urlElements = result.urlset.url || [];

            urls = urlElements.map(urlElement => {
                return {
                    url: urlElement.loc[0],
                    lastmod: urlElement.lastmod ? urlElement.lastmod[0] : null,
                    changefreq: urlElement.changefreq ? urlElement.changefreq[0] : null,
                    priority: urlElement.priority ? parseFloat(urlElement.priority[0]) : null,
                };
            });

            console.log(`Extracted ${urls.length} URLs from sitemap`);
        } else {
            throw new Error('Invalid sitemap format: no urlset or sitemapindex found');
        }

        return urls;
    } catch (error) {
        console.error('Error parsing sitemap:', error.message);
        throw new Error(`Failed to parse sitemap: ${error.message}`);
    }
};

/**
 * Extract unique URLs from sitemap data
 * @param {Array} sitemapData - Array of URL objects from parseSitemap
 * @returns {Array<string>} - Array of unique URL strings
 */
export const extractUrls = (sitemapData) => {
    const urlSet = new Set();

    sitemapData.forEach(item => {
        if (item.url) {
            urlSet.add(item.url);
        }
    });

    return Array.from(urlSet);
};

/**
 * Normalize URL for comparison
 * @param {string} url - URL to normalize
 * @returns {string} - Normalized URL
 */
export const normalizeUrl = (url) => {
    try {
        const urlObj = new URL(url);

        // Remove trailing slash
        let pathname = urlObj.pathname;
        if (pathname.endsWith('/') && pathname.length > 1) {
            pathname = pathname.slice(0, -1);
        }

        // Remove www. from hostname
        let hostname = urlObj.hostname.replace(/^www\./, '');

        // Reconstruct URL without query params and hash
        return `${urlObj.protocol}//${hostname}${pathname}`;
    } catch (error) {
        console.error('Error normalizing URL:', error.message);
        return url;
    }
};

export default {
    parseSitemap,
    extractUrls,
    normalizeUrl,
};
