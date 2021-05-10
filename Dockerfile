FROM node:16-alpine

ARG PORT=5452

WORKDIR /usr/src/app

# Copy package.json and package-lock.json, install dependencies
COPY package*.json ./
RUN npm install

# Copy project files and build frontend assets
COPY . .
RUN npm run build

EXPOSE $PORT

ENV NODE_ENV=production
CMD [ "npm", "start" ]
