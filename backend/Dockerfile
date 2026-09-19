# Use the official Playwright image matching our Playwright version (1.63.0)
FROM mcr.microsoft.com/playwright:v1.63.0-jammy

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies (skips devDependencies)
RUN npm ci --omit=dev

# Copy backend source code
COPY src/ ./src/

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Expose port
EXPOSE 5000

# Create and use a non-root user for security (pwuser already exists in Playwright image)
RUN chown -R pwuser:pwuser /app
USER pwuser

# Start the application
CMD ["npm", "start"]
