# Stamping Machine Backend - Setup Guide

## Prerequisites
- Node.js 20.x (✅ Already installed)
- MongoDB (Local or Cloud)
- AWS S3 Account (for file storage)
- Gmail Account (for email notifications)

## Environment Variables Setup

Create a `.env` file in the root directory with the following variables:

```bash
# Server Configuration
PORT=5000

# MongoDB Connection
MONGO_URI=mongodb://localhost:27017/stamping-machine

# JWT Configuration
JWT_SECRET_KEY=your-super-secret-jwt-key-change-this-in-production

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_REGION=us-east-1

# Email Configuration (Gmail)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Optional: NODE_ENV for production/development
NODE_ENV=development
```

## Setup Steps

### 1. Create .env file
```bash
cp .env.example .env
# Then edit the .env file with your actual values
```

### 2. Install MongoDB (if using local)
```bash
# Install MongoDB on Ubuntu
sudo apt update
sudo apt install -y mongodb

# Start MongoDB service
sudo systemctl start mongodb
sudo systemctl enable mongodb

# Verify MongoDB is running
sudo systemctl status mongodb
```

### 3. AWS S3 Setup
1. Create an AWS account if you don't have one
2. Create an S3 bucket for file storage
3. Create an IAM user with S3 access
4. Get the Access Key ID and Secret Access Key
5. Update the AWS variables in your .env file

### 4. Gmail Setup (for email notifications)
1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a password for "Mail"
3. Use your Gmail address and the generated app password in .env

### 5. Install Dependencies
```bash
npm install
```

### 6. Start the Development Server
```bash
npm run dev
```

## API Endpoints

The server will run on `http://localhost:5000` with the following endpoints:

- `GET /` - Welcome message
- `POST /api/user/register` - User registration
- `POST /api/user/login` - User login
- `GET /api/user/profile` - Get user profile (protected)
- `POST /api/work/upload` - Upload work for stamping (protected)
- `GET /api/work/my-works` - Get user's works (protected)

## Features

- **User Authentication**: JWT-based authentication
- **File Upload**: Upload files to AWS S3
- **PDF Processing**: Generate certificates and process PDFs
- **Email Notifications**: Send confirmation emails via Gmail
- **Database**: MongoDB for data persistence

## Troubleshooting

### MongoDB Connection Issues
- Ensure MongoDB is running: `sudo systemctl status mongodb`
- Check if MongoDB is listening on port 27017: `netstat -tlnp | grep 27017`

### AWS S3 Issues
- Verify your AWS credentials are correct
- Ensure your IAM user has S3 permissions
- Check if your S3 bucket exists and is accessible

### Email Issues
- Verify your Gmail app password is correct
- Ensure 2-factor authentication is enabled
- Check if your Gmail account allows less secure app access

### Port Issues
- If port 5000 is in use, change the PORT in .env file
- Check if the port is available: `netstat -tlnp | grep 5000` 