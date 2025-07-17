#!/bin/bash

# Update system packages
sudo yum update -y

# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install Python and pip
sudo yum install -y python3 python3-pip

# Install development tools (needed for some npm packages)
sudo yum groupinstall "Development Tools" -y

# Install OTS
pip3 install opentimestamps-client

# Install PM2 globally
sudo npm install -g pm2

# Create necessary directories
sudo mkdir -p /var/www/stamping-app
sudo mkdir -p /var/www/stamping-app/work-uploads
sudo mkdir -p /var/www/stamping-app/certificates

# Set proper permissions
sudo chown -R ec2-user:ec2-user /var/www/stamping-app

# Install Nginx
sudo yum install -y nginx

# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Create Nginx configuration
sudo tee /etc/nginx/conf.d/stamping-app.conf << EOF
server {
    listen 80;
    server_name _;  # Replace with your domain name if you have one

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # Configure max file upload size
    client_max_body_size 50M;
}
EOF

# Reload Nginx configuration
sudo systemctl reload nginx 