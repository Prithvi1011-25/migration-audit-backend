import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // Create unique filename: timestamp-originalname
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        cb(null, `${basename}-${uniqueSuffix}${ext}`);
    },
});

// File filter for validation
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        'text/xml',
        'application/xml',
        'text/csv',
        'application/csv',
        'text/plain',
    ];

    const allowedExtensions = ['.xml', '.csv', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type. Only XML and CSV files are allowed. Received: ${file.mimetype}`), false);
    }
};

// Create multer upload instance
export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});

// Field configuration for migration project uploads
export const migrationProjectFields = upload.fields([
    { name: 'oldSitemap', maxCount: 1 },
    { name: 'newSitemap', maxCount: 1 },
    { name: 'gscExport', maxCount: 1 },
    { name: 'redirectMapping', maxCount: 1 },
]);
