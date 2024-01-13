const axios = require('axios');
const fs = require('fs').promises;
const express = require('express');
const { isUUID } = require('librechat-data-provider');
const { processFileUpload, processDeleteRequest } = require('~/server/services/Files/process');
const { getFiles } = require('~/models/File');
const { logger } = require('~/config');
const upload = require('./multer');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const files = await getFiles({ user: req.user.id });
    res.status(200).send(files);
  } catch (error) {
    logger.error('[/files] Error getting files:', error);
    res.status(400).json({ message: 'Error in request', error: error.message });
  }
});

router.delete('/', async (req, res) => {
  try {
    const { files: _files } = req.body;

    /** @type {MongoFile[]} */
    const files = _files.filter((file) => {
      if (!file.file_id) {
        return false;
      }
      if (!file.filepath) {
        return false;
      }

      if (/^file-/.test(file.file_id)) {
        return true;
      }

      return isUUID.safeParse(file.file_id).success;
    });

    if (files.length === 0) {
      res.status(204).json({ message: 'Nothing provided to delete' });
      return;
    }

    await processDeleteRequest({ req, files });

    res.status(200).json({ message: 'Files deleted successfully' });
  } catch (error) {
    logger.error('[/files] Error deleting files:', error);
    res.status(400).json({ message: 'Error in request', error: error.message });
  }
});

router.get('/download/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;

    const options = {
      headers: {
        // TODO: Client initialization for OpenAI API Authentication
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      responseType: 'stream',
    };

    const fileResponse = await axios.get(`https://api.openai.com/v1/files/${fileId}`, {
      headers: options.headers,
    });
    const { filename } = fileResponse.data;

    const response = await axios.get(`https://api.openai.com/v1/files/${fileId}/content`, options);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.data.pipe(res);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).send('Error downloading file');
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  const file = req.file;
  const metadata = req.body;

  try {
    if (!file) {
      throw new Error('No file provided');
    }

    if (!metadata.endpoint) {
      throw new Error('No endpoint provided');
    }

    if (!metadata.file_id) {
      throw new Error('No file_id provided');
    }

    /* parse to validate api call */
    isUUID.parse(metadata.file_id);
    metadata.temp_file_id = metadata.file_id;
    metadata.file_id = req.file_id;

    await processFileUpload({ req, res, file, metadata });
  } catch (error) {
    logger.error('[/files/images] Error processing file:', error);
    try {
      await fs.unlink(file.path);
    } catch (error) {
      logger.error('[/files/images] Error deleting file:', error);
    }
    res.status(500).json({ message: 'Error processing file' });
  }

  // do this if strategy is not local
  // finally {
  //   try {
  //     // await fs.unlink(file.path);
  //   } catch (error) {
  //     logger.error('[/files/images] Error deleting file:', error);

  //   }
  // }
});

module.exports = router;
