import nodemailer from 'nodemailer';
import { IncomingWebhook } from '@slack/webhook';
import dotenv from 'dotenv';

dotenv.config();

// Email transporter
let emailTransporter;

if (process.env.EMAIL_HOST) {
    emailTransporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT),
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD,
        },
    });
}

// Slack webhook
let slackWebhook;

if (process.env.SLACK_WEBHOOK_URL) {
    slackWebhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);
}

/**
 * Send email notification
 * @param {object} options - Email options
 * @returns {Promise<object>} Email result
 */
export const sendEmail = async ({ to, subject, html, text }) => {
    if (!emailTransporter) {
        console.warn('Email transporter not configured. Skipping email notification.');
        return { success: false, message: 'Email not configured' };
    }

    try {
        const info = await emailTransporter.sendMail({
            from: process.env.EMAIL_FROM,
            to,
            subject,
            text,
            html,
        });

        console.log('✅ Email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Email send error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send Slack notification
 * @param {object} options - Slack message options
 * @returns {Promise<object>} Slack result
 */
export const sendSlackNotification = async ({ text, blocks }) => {
    if (!slackWebhook) {
        console.warn('Slack webhook not configured. Skipping Slack notification.');
        return { success: false, message: 'Slack not configured' };
    }

    try {
        await slackWebhook.send({
            text,
            blocks,
        });

        console.log('✅ Slack notification sent');
        return { success: true };
    } catch (error) {
        console.error('❌ Slack send error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send audit completion notification
 * @param {object} audit - Audit object
 * @returns {Promise<void>}
 */
export const notifyAuditComplete = async (audit) => {
    const performanceScore = audit.performanceMetrics?.performanceScore || 0;
    const seoScore = audit.seoMetrics?.score || 0;
    const grade = audit.getPerformanceGrade();

    // Determine emoji based on performance
    const emoji = grade === 'A' ? '🟢' : grade === 'B' ? '🟡' : '🔴';

    // Email notification
    const emailHtml = `
    <h2>${emoji} Audit Complete for ${audit.url}</h2>
    <p><strong>Status:</strong> ${audit.status}</p>
    <p><strong>Performance Score:</strong> ${performanceScore}/100 (Grade: ${grade})</p>
    <p><strong>SEO Score:</strong> ${seoScore}/100</p>
    ${audit.performanceMetrics ? `
      <h3>Core Web Vitals:</h3>
      <ul>
        <li><strong>LCP:</strong> ${(audit.performanceMetrics.largestContentfulPaint / 1000).toFixed(2)}s</li>
        <li><strong>FID:</strong> ${audit.performanceMetrics.firstInputDelay}ms</li>
        <li><strong>CLS:</strong> ${audit.performanceMetrics.cumulativeLayoutShift.toFixed(3)}</li>
      </ul>
    ` : ''}
    <p><strong>Duration:</strong> ${audit.duration}s</p>
    <p><strong>Completed:</strong> ${new Date(audit.createdAt).toLocaleString()}</p>
    <hr>
    <p><small>Migration Audit Platform</small></p>
  `;

    await sendEmail({
        to: process.env.EMAIL_USER, // Send to admin
        subject: `${emoji} Audit Complete: ${audit.url} (${grade})`,
        html: emailHtml,
        text: `Audit complete for ${audit.url}. Performance: ${performanceScore}/100`,
    });

    // Slack notification
    const slackBlocks = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: `${emoji} Audit Complete`,
                emoji: true,
            },
        },
        {
            type: 'section',
            fields: [
                {
                    type: 'mrkdwn',
                    text: `*URL:*\n${audit.url}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*Status:*\n${audit.status}`,
                },
                {
                    type: 'mrkdwn',
                    text: `*Performance:*\n${performanceScore}/100 (${grade})`,
                },
                {
                    type: 'mrkdwn',
                    text: `*SEO Score:*\n${seoScore}/100`,
                },
            ],
        },
    ];

    if (audit.performanceMetrics) {
        slackBlocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*Core Web Vitals:*\n• LCP: ${(audit.performanceMetrics.largestContentfulPaint / 1000).toFixed(2)}s\n• FID: ${audit.performanceMetrics.firstInputDelay}ms\n• CLS: ${audit.performanceMetrics.cumulativeLayoutShift.toFixed(3)}`,
            },
        });
    }

    slackBlocks.push({
        type: 'context',
        elements: [
            {
                type: 'mrkdwn',
                text: `Completed at ${new Date(audit.createdAt).toLocaleString()} | Duration: ${audit.duration}s`,
            },
        ],
    });

    await sendSlackNotification({
        text: `Audit complete for ${audit.url}`,
        blocks: slackBlocks,
    });
};

/**
 * Send audit failure notification
 * @param {object} audit - Audit object
 * @returns {Promise<void>}
 */
export const notifyAuditFailure = async (audit) => {
    const emailHtml = `
    <h2>🔴 Audit Failed for ${audit.url}</h2>
    <p><strong>Status:</strong> ${audit.status}</p>
    <p><strong>Error:</strong> ${audit.errorMessage}</p>
    <p><strong>Failed at:</strong> ${new Date(audit.updatedAt).toLocaleString()}</p>
    <hr>
    <p><small>Migration Audit Platform</small></p>
  `;

    await sendEmail({
        to: process.env.EMAIL_USER,
        subject: `🔴 Audit Failed: ${audit.url}`,
        html: emailHtml,
        text: `Audit failed for ${audit.url}: ${audit.errorMessage}`,
    });

    await sendSlackNotification({
        text: `🔴 Audit failed for ${audit.url}: ${audit.errorMessage}`,
        blocks: [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: '🔴 Audit Failed',
                    emoji: true,
                },
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `*URL:*\n${audit.url}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Error:*\n${audit.errorMessage}`,
                    },
                ],
            },
        ],
    });
};
