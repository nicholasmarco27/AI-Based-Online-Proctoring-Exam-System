# Use Node.js as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the React app
RUN npm run build

# Install serve to serve the built app
RUN npm install -g serve

# Expose port 3000
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production

# Serve the built app
CMD ["serve", "-s", "build", "-l", "3000"]