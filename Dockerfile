# Build and test
FROM node:10-alpine3.11 as build

# Copy source code
WORKDIR /home/node/app
COPY package.json /home/node/app/
COPY package-lock.json /home/node/app/

# Install all dependencies.
RUN npm ci

COPY tsconfig.json /home/node/app/
COPY tslint.json /home/node/app/
COPY src /home/node/app/src
COPY test /home/node/app/test

# Test and build
RUN npm run build

# Install production dependencies
WORKDIR /var/www/html/api
RUN mv /home/node/app/package.json /var/www/html/api/ &&\
    mv /home/node/app/package-lock.json /var/www/html/api/ &&\
    npm ci --only=production

# Audit production dependencies
# RUN npm audit --production

# Deployment
FROM node:10-alpine3.11

# Build
WORKDIR /var/www/html/api

# Setting UTC time
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/UTC /etc/localtime && \
    echo UTC > /etc/timezone

# COPY production dependencies and code
COPY --from=build /var/www/html/api /var/www/html/api
COPY --from=build /home/node/app/dist /var/www/html/api/dist

# Using the default port
EXPOSE 8080

ENV NODE_ENV=test
CMD [ "node", "--max-old-space-size=2048", "dist/index.js" ]
