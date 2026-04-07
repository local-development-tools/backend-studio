FROM node:20-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm install
RUN apk add --no-cache bash postgresql-client
COPY . .
CMD ["npm", "run", "start:dev"]

FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm i

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN apk add --no-cache bash postgresql-client
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3000
CMD ["node", "dist/main.js"]
