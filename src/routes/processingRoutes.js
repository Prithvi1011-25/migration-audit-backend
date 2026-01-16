import express from 'express';
import {
    startProcessing,
    getProcessingStatus,
    getResults,
    getSEOValidation,
    getPerformanceValidation,
    getMobileResponsiveness,
    exportReport,
} from '../controllers/processingController.js';

const router = express.Router();

/**
 * @route   POST /api/migration-projects/:id/process
 * @desc    Start processing a migration project
 * @access  Public
 */
router.post('/:id/process', startProcessing);

/**
 * @route   GET /api/migration-projects/:id/status
 * @desc    Get processing status for a migration project
 * @access  Public
 */
router.get('/:id/status', getProcessingStatus);

/**
 * @route   GET /api/migration-projects/:id/results
 * @desc    Get processing results for a completed migration project
 * @access  Public
 */
router.get('/:id/results', getResults);

/**
 * @route   GET /api/migration-projects/:id/seo-validation
 * @desc    Get SEO validation results for a migration project
 * @access  Public
 */
router.get('/:id/seo-validation', getSEOValidation);

/**
 * @route   GET /api/migration-projects/:id/performance
 * @desc    Get performance validation results for a migration project
 * @access  Public
 */
router.get('/:id/performance', getPerformanceValidation);

/**
 * @route   GET /api/migration-projects/:id/mobile
 * @desc    Get mobile responsiveness test results for a migration project
 * @access  Public
 */
router.get('/:id/mobile', getMobileResponsiveness);

/**
 * @route   GET /api/migration-projects/:id/export
 * @desc    Export migration audit report (CSV or JSON)
 * @access  Public
 * @query   format - 'csv' or 'json' (default: json)
 * @query   section - 'all', 'urls', 'seo', 'performance', 'mobile' (default: all)
 */
router.get('/:id/export', exportReport);

export default router;
