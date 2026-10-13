FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY . .
# Dev dependencies are needed to build the storefront bundle and the React Router server.
RUN npm ci && npm run build && npm prune --omit=dev && npm cache clean --force

FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3000
CMD ["npm", "run", "docker-start"]
