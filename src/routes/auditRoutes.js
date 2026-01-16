import express from 'express';
import { body } from 'express-validator';
import {
    createAudit,
    getAudit,
    getAudits,
    deleteAudit,
    getAuditStats,
    getAuditHistory,
} from '../controllers/auditController.js';

const router = express.Router();

/**
 * @route   POST /api/audits
 * @desc    Create a new audit
 * @access  Public
 */
router.post(
    '/',
    [
        body('url').isURL().withMessage('Valid URL is required'),
        body('triggeredBy').optional().isIn(['manual', 'scheduled', 'api']),
        body('useHeadless').optional().isBoolean(),
    ],
    createAudit
);

/**
 * @route   GET /api/audits
 * @desc    Get all audits with pagination
 * @access  Public
 */
router.get('/', getAudits);

/**
 * @route   GET /api/audits/stats
 * @desc    Get audit statistics
 * @access  Public
 */
router.get('/stats', getAuditStats);

/**
 * @route   GET /api/audits/history/:url
 * @desc    Get audit history for a URL
 * @access  Public
 */
router.get('/history/:url', getAuditHistory);

/**
 * @route   GET /api/audits/:id
 * @desc    Get audit by ID
 * @access  Public
 */
router.get('/:id', getAudit);

/**
 * @route   DELETE /api/audits/:id
 * @desc    Delete audit by ID
 * @access  Public
 */
router.delete('/:id', deleteAudit);

export default router;
