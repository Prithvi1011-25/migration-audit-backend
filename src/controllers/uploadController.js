import { validationResult } from 'express-validator';
import MigrationProject from '../models/MigrationProject.js';

/**
 * Create a new migration project with file uploads
 * @route POST /api/migration-projects
 */
export const createMigrationProject = async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { oldBaseUrl, newBaseUrl, projectName, description } = req.body;
        const files = req.files;

        // Validate required fields
        if (!oldBaseUrl || !newBaseUrl) {
            return res.status(400).json({
                error: 'Both oldBaseUrl and newBaseUrl are required',
            });
        }

        // Prepare file metadata
        const fileData = {};
        if (files) {
            if (files.oldSitemap?.[0]) {
                fileData.oldSitemap = {
                    filename: files.oldSitemap[0].filename,
                    path: files.oldSitemap[0].path,
                    uploadedAt: new Date(),
                };
            }
            if (files.newSitemap?.[0]) {
                fileData.newSitemap = {
                    filename: files.newSitemap[0].filename,
                    path: files.newSitemap[0].path,
                    uploadedAt: new Date(),
                };
            }
            if (files.gscExport?.[0]) {
                fileData.gscExport = {
                    filename: files.gscExport[0].filename,
                    path: files.gscExport[0].path,
                    uploadedAt: new Date(),
                };
            }
            if (files.redirectMapping?.[0]) {
                fileData.redirectMapping = {
                    filename: files.redirectMapping[0].filename,
                    path: files.redirectMapping[0].path,
                    uploadedAt: new Date(),
                };
            }
        }

        // Create new migration project
        const migrationProject = new MigrationProject({
            oldBaseUrl,
            newBaseUrl,
            projectName: projectName || `Migration: ${oldBaseUrl} → ${newBaseUrl}`,
            description,
            files: fileData,
        });

        await migrationProject.save();

        res.status(201).json({
            success: true,
            message: 'Migration project created successfully',
            data: migrationProject,
        });
    } catch (error) {
        console.error('Error creating migration project:', error);
        res.status(500).json({
            error: 'Failed to create migration project',
            message: error.message,
        });
    }
};

/**
 * Get a single migration project by ID
 * @route GET /api/migration-projects/:id
 */
export const getMigrationProject = async (req, res) => {
    try {
        const { id } = req.params;

        const project = await MigrationProject.findById(id);

        if (!project) {
            return res.status(404).json({
                error: 'Migration project not found',
            });
        }

        res.json({
            success: true,
            data: project,
        });
    } catch (error) {
        console.error('Error fetching migration project:', error);
        res.status(500).json({
            error: 'Failed to fetch migration project',
            message: error.message,
        });
    }
};

/**
 * Get all migration projects with pagination
 * @route GET /api/migration-projects
 */
export const listMigrationProjects = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const [projects, total] = await Promise.all([
            MigrationProject.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .select('-results'), // Exclude large results field
            MigrationProject.countDocuments(),
        ]);

        res.json({
            success: true,
            data: {
                projects,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit),
                },
            },
        });
    } catch (error) {
        console.error('Error listing migration projects:', error);
        res.status(500).json({
            error: 'Failed to list migration projects',
            message: error.message,
        });
    }
};

/**
 * Delete a migration project
 * @route DELETE /api/migration-projects/:id
 */
export const deleteMigrationProject = async (req, res) => {
    try {
        const { id } = req.params;

        const project = await MigrationProject.findByIdAndDelete(id);

        if (!project) {
            return res.status(404).json({
                error: 'Migration project not found',
            });
        }

        // TODO: Delete associated uploaded files from filesystem

        res.json({
            success: true,
            message: 'Migration project deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting migration project:', error);
        res.status(500).json({
            error: 'Failed to delete migration project',
            message: error.message,
        });
    }
};
