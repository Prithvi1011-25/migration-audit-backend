import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

/**
 * Crawl a URL and extract metadata and structure
 * @param {string} url - URL to crawl
 * @param {object} options - Crawl options
 * @returns {Promise<object>} Crawl results
 */
export const crawlUrl = async (url, options = {}) => {
    const { useHeadless = false } = options;

    try {
        // Use Puppeteer for JavaScript-heavy sites, Axios+Cheerio for simple sites
        if (useHeadless) {
            return await crawlWithPuppeteer(url);
        } else {
            return await crawlWithCheerio(url);
        }
    } catch (error) {
        console.error('Crawl error:', error);
        throw new Error(`Failed to crawl URL: ${error.message}`);
    }
};

/**
 * Crawl using Axios and Cheerio (faster, for static sites)
 * @param {string} url - URL to crawl
 * @returns {Promise<object>} Crawl data
 */
const crawlWithCheerio = async (url) => {
    const startTime = Date.now();

    try {
        const response = await axios.get(url, {
            timeout: 30000,
            maxRedirects: 5,
            validateStatus: (status) => status < 500, // Accept 4xx errors
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });

        const responseTime = Date.now() - startTime;
        const $ = cheerio.load(response.data);

        // Extract SEO metadata
        const seoData = extractSEOData($);

        // Extract links
        const links = extractLinks($, url);

        // Extract headings structure
        const headingsStructure = extractHeadings($);

        // Check for structured data
        const hasStructuredData = $('script[type="application/ld+json"]').length > 0;

        return {
            httpStatus: response.status,
            responseTime,
            redirectChain: response.request?._redirectable?._redirects || [],
            seoData: {
                ...seoData,
                headingsStructure,
                structuredData: hasStructuredData,
            },
            links,
            contentLength: response.data.length,
        };
    } catch (error) {
        throw new Error(`Cheerio crawl failed: ${error.message}`);
    }
};

/**
 * Crawl using Puppeteer (for JavaScript-rendered sites)
 * @param {string} url - URL to crawl
 * @returns {Promise<object>} Crawl data
 */
const crawlWithPuppeteer = async (url) => {
    let browser;
    const startTime = Date.now();

    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });

        const page = await browser.newPage();

        // Set viewport
        await page.setViewport({ width: 1920, height: 1080 });

        // Track response
        let httpStatus = 0;
        page.on('response', (response) => {
            if (response.url() === url) {
                httpStatus = response.status();
            }
        });

        // Navigate to URL
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 30000,
        });

        const responseTime = Date.now() - startTime;

        // Extract data from page
        const pageData = await page.evaluate(() => {
            // SEO metadata
            const title = document.querySelector('title')?.textContent || '';
            const description = document.querySelector('meta[name="description"]')?.content || '';
            const canonical = document.querySelector('link[rel="canonical"]')?.href || '';

            // Open Graph tags
            const ogTags = {};
            document.querySelectorAll('meta[property^="og:"]').forEach((tag) => {
                const property = tag.getAttribute('property');
                ogTags[property] = tag.getAttribute('content');
            });

            // Headings
            const h1Count = document.querySelectorAll('h1').length;
            const h2Count = document.querySelectorAll('h2').length;
            const h3Count = document.querySelectorAll('h3').length;

            // Links
            const allLinks = Array.from(document.querySelectorAll('a[href]')).map((a) => a.href);

            // Structured data
            const structuredData = document.querySelector('script[type="application/ld+json"]') !== null;

            return {
                title,
                description,
                canonical,
                ogTags,
                headingsStructure: { h1Count, h2Count, h3Count, h1Text: Array.from(document.querySelectorAll('h1')).map(h => h.textContent.trim()) },
                allLinks,
                structuredData,
            };
        });

        // Categorize links
        const internalLinkUrls = pageData.allLinks.filter((link) => link.startsWith(url));
        const internalLinks = internalLinkUrls.length;
        const externalLinks = pageData.allLinks.length - internalLinks;

        return {
            httpStatus,
            responseTime,
            redirectChain: [],
            seoData: {
                title: pageData.title,
                description: pageData.description,
                canonicalUrl: pageData.canonical,
                ogTags: pageData.ogTags,
                headingsStructure: pageData.headingsStructure,
                structuredData: pageData.structuredData,
            },
            links: {
                internalLinks,
                externalLinks,
                internalLinkUrls,
                brokenLinks: [], // Would need additional checks
            },
        };
    } catch (error) {
        throw new Error(`Puppeteer crawl failed: ${error.message}`);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

/**
 * Extract SEO data using Cheerio
 * @param {object} $ - Cheerio instance
 * @returns {object} SEO data
 */
const extractSEOData = ($) => {
    return {
        title: $('title').text() || '',
        description: $('meta[name="description"]').attr('content') || '',
        metaTagsCount: $('meta').length,
        canonicalUrl: $('link[rel="canonical"]').attr('href') || '',
        ogTags: {
            title: $('meta[property="og:title"]').attr('content') || '',
            description: $('meta[property="og:description"]').attr('content') || '',
            image: $('meta[property="og:image"]').attr('content') || '',
            url: $('meta[property="og:url"]').attr('content') || '',
        },
    };
};

/**
 * Extract links from page
 * @param {object} $ - Cheerio instance
 * @param {string} baseUrl - Base URL for categorization
 * @returns {object} Links data
 */
const extractLinks = ($, baseUrl) => {
    const allLinks = [];

    $('a[href]').each((i, elem) => {
        const href = $(elem).attr('href');
        if (href) {
            allLinks.push(href);
        }
    });

    const internalLinkUrls = allLinks.filter((link) =>
        link.startsWith('/') || link.startsWith(baseUrl)
    );

    return {
        internalLinks: internalLinkUrls.length,
        externalLinks: allLinks.length - internalLinkUrls.length,
        internalLinkUrls: internalLinkUrls, // Exposed for redirect checking
        brokenLinks: [], // Would require additional HTTP checks
    };
};

/**
 * Extract headings structure
 * @param {object} $ - Cheerio instance
 * @returns {object} Headings structure
 */
const extractHeadings = ($) => {
    const h1Text = [];
    $('h1').each((i, elem) => {
        h1Text.push($(elem).text().trim());
    });

    return {
        h1Count: $('h1').length,
        h2Count: $('h2').length,
        h3Count: $('h3').length,
        h1Text,
    };
};

/**
 * Check if robots.txt exists
 * @param {string} url - Base URL
 * @returns {Promise<boolean>} True if robots.txt exists
 */
export const checkRobotsTxt = async (url) => {
    try {
        const robotsUrl = new URL('/robots.txt', url).toString();
        const response = await axios.head(robotsUrl, {
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });
        return response.status === 200;
    } catch (error) {
        return false;
    }
};

/**
 * Check if sitemap exists
 * @param {string} url - Base URL
 * @returns {Promise<boolean>} True if sitemap exists
 */
export const checkSitemap = async (url) => {
    const sitemapUrls = ['/sitemap.xml', '/sitemap_index.xml'];

    for (const sitemapPath of sitemapUrls) {
        try {
            const sitemapUrl = new URL(sitemapPath, url).toString();
            const response = await axios.head(sitemapUrl, {
                timeout: 5000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
            });
            if (response.status === 200) {
                return true;
            }
        } catch (error) {
            continue;
        }
    }

    return false;
};
