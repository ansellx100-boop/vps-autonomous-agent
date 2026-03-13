FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src
COPY tasks ./tasks

ENV NODE_ENV=production
EXPOSE 3030

CMD ["node", "src/index.js"]
