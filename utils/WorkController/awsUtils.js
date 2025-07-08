// helpers/awsUtils.js
import { Upload } from '@aws-sdk/lib-storage';
import { s3Client } from '../../config/s3Client.js';
import fs from 'fs';
import mime from 'mime-types';

export const uploadFileToS3 = async (localFilePath, s3Key) => {
  const fileStream = fs.createReadStream(localFilePath);
  const contentType = mime.lookup(localFilePath) || 'application/octet-stream';

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS credentials are missing in environment variables.");
  }

  const uploadParams = {
    Bucket: process.env.AWS_BUCKET_NAME, // Your S3 bucket name
    Key: s3Key, // e.g., 'files/USER1232406250001'
    Body: fileStream,
    ContentType: contentType,
  };

  const upload = new Upload({
    client: s3Client,
    params: uploadParams,
  });

  try {
    await upload.done();
    return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
  } catch (err) {
    throw new Error("S3 Upload Error" + err);
  }
};
