FROM node:20-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app

FROM base AS development-dependencies-env
COPY . /app
RUN pnpm install --frozen-lockfile

FROM base AS production-dependencies-env
COPY ./package.json pnpm-lock.yaml /app/
RUN pnpm install --frozen-lockfile --prod

FROM base AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
RUN pnpm run build

FROM node:20-alpine AS runtime
COPY ./package.json pnpm-lock.yaml /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5847
EXPOSE 5847
CMD ["npm", "run", "start"]
