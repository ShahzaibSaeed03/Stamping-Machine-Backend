#!/bin/bash

# Exit on error
set -e

# Update system packages
sudo apt update -y && sudo apt upgrade -y

# Install Node.js (v18)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Python 3 and pip
sudo apt install -y python3 python3-pip python3-venv

# Install development tools (build-essential = dev tools on Ubuntu)
sudo apt install -y build-essential

# Install PM2 globally
sudo npm install -g pm2

# Install OpenTimestamps CLI
sudo pip3 install opentimestamps-client

# Create necessary directories
sudo mkdir -p /var/www/stamping-app/work-uploads
sudo mkdir -p /var/www/stamping-app/certificates

# Set permissions (adjust user if needed)
sudo chown -R ubuntu:ubuntu /var/www/stamping-app

# Install and configure Nginx
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Create Nginx config
sudo tee /etc/nginx/sites-available/stamping-app > /dev/null << EOF
server {
    listen 80;
    server_name _;  # Replace with your domain or IP if needed

    location / {
        proxy_pass http://localhost:5000;  # Change to your backend port
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # Increase file upload size
    client_max_body_size 50M;
}
EOF

# Enable Nginx config
sudo ln -sf /etc/nginx/sites-available/stamping-app /etc/nginx/sites-enabled/

# Remove default config to avoid port conflicts
sudo rm -f /etc/nginx/sites-enabled/default

# Reload Nginx
sudo systemctl reload nginx
