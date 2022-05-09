FROM node:16-slim

ARG PORT=5452

WORKDIR /usr/src/app

# Copy project files and install dependencies
COPY . .
RUN npm install

EXPOSE $PORT

ENV NODE_ENV=production
CMD [ "npm", "run", "docker" ]
