import express from 'express';
import { body } from 'express-validator';
import { migrationProjectFields } from '../config/multer.js';
import {
    createMigrationProject,
    getMigrationProject,
    listMigrationProjects,
    deleteMigrationProject,
} from '../controllers/uploadController.js';

const router = express.Router();

/**
 * @route   POST /api/migration-projects
 * @desc    Create a new migration project with file uploads
 * @access  Public
 */
router.post(
    '/',
    migrationProjectFields,
    [
        body('oldBaseUrl')
            .trim()
            .isURL({ require_protocol: true })
            .withMessage('Valid old base URL with protocol is required'),
        body('newBaseUrl')
            .trim()
            .isURL({ require_protocol: true })
            .withMessage('Valid new base URL with protocol is required'),
        body('projectName')
            .optional()
            .trim()
            .isLength({ max: 200 })
            .withMessage('Project name must be less than 200 characters'),
        body('description')
            .optional()
            .trim()
            .isLength({ max: 1000 })
            .withMessage('Description must be less than 1000 characters'),
    ],
    createMigrationProject
);

/**
 * @route   GET /api/migration-projects
 * @desc    Get all migration projects with pagination
 * @access  Public
 */
router.get('/', listMigrationProjects);

/**
 * @route   GET /api/migration-projects/:id
 * @desc    Get migration project by ID
 * @access  Public
 */
router.get('/:id', getMigrationProject);

/**
 * @route   DELETE /api/migration-projects/:id
 * @desc    Delete migration project by ID
 * @access  Public
 */
router.delete('/:id', deleteMigrationProject);

export default router;
